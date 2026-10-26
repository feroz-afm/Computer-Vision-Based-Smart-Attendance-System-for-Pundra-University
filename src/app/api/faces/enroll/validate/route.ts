import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { cvApi, CVApiClientError } from '@/lib/cv-api/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/faces/enroll/validate
 * --------------------------------
 * Protected server-side bridge for validating student face enrollment samples.
 *
 * Security Invariants:
 * 1. Derives student identity exclusively from verified Supabase session cookies (or dev test token).
 * 2. Never trusts student ID, role, or consent flags supplied by the client.
 * 3. Never logs raw image bytes, access tokens, or biometric vectors.
 * 4. Fails closed in production if no valid Supabase session exists.
 * 5. Returns validation quality scores only; never writes to database in this milestone.
 */
export async function POST(request: NextRequest) {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.PYTHON_API_ENV === 'production';

  // 1. Authenticate server-side via Authorization header or Supabase SSR cookies
  let authenticatedUserId: string | null = null;
  let accessToken: string = '';
  let isDevTestBypass = false;

  const authHeader = request.headers.get('authorization');
  let headerToken = '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    headerToken = authHeader.slice(7).trim();
  }

  if (isSupabaseConfigured()) {
    // 1a. Try Bearer token from Authorization header first if present
    if (headerToken) {
      try {
        const tokenClient = await createClient(headerToken);
        const {
          data: { user },
          error: userError,
        } = await tokenClient.auth.getUser(headerToken);

        if (user && !userError) {
          authenticatedUserId = user.id;
          accessToken = headerToken;
        }
      } catch {
        // Bearer token lookup failed, fall through to cookies
      }
    }

    // 1b. Fall back to cookie-based session
    if (!authenticatedUserId) {
      try {
        const cookieClient = await createClient();
        const {
          data: { user },
          error: userError,
        } = await cookieClient.auth.getUser();

        if (user && !userError) {
          authenticatedUserId = user.id;
          const {
            data: { session },
          } = await cookieClient.auth.getSession();
          accessToken = session?.access_token || '';
        }
      } catch {
        // Supabase unreachable or session lookup failure
      }
    }
  }

  // Handle development-only test token if no session exists (non-production only)
  if (!authenticatedUserId) {
    const devTestHeader = request.headers.get('x-dev-test-token');
    const devTokenEnv = process.env.DEV_TEST_TOKEN;

    // Development bypass is allowed only when explicitly configured with a matching token.
    if (!isProduction && devTokenEnv && (devTestHeader === devTokenEnv || headerToken === devTokenEnv)) {
      isDevTestBypass = true;
      accessToken = devTokenEnv;
      authenticatedUserId = 'dev-test-student';
    } else {
      return NextResponse.json(
        {
          error: 'Authentication required. Please log in with your institutional student account.',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'Authentication session token is missing or expired. Please log in again.',
        code: 'UNAUTHORIZED',
      },
      { status: 401 }
    );
  }

  // 2. Parse and validate multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid request body. Expected multipart/form-data.',
        code: 'INVALID_FORM_DATA',
      },
      { status: 400 }
    );
  }

  const samples = formData.getAll('samples') as (File | Blob)[];

  if (!samples || samples.length === 0 || samples.length > 5) {
    return NextResponse.json(
      {
        error: 'Please provide between 1 and 5 face sample images.',
        code: 'INVALID_SAMPLE_COUNT',
      },
      { status: 400 }
    );
  }

  // Validate each sample image before forwarding
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    if (!sample || sample.size === 0) {
      return NextResponse.json(
        {
          error: `Sample #${i + 1} is empty (0 bytes).`,
          code: 'EMPTY_SAMPLE',
        },
        { status: 400 }
      );
    }

    if (sample.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: `Sample #${i + 1} exceeds the 2 MB limit (${(sample.size / 1024 / 1024).toFixed(1)} MB).`,
          code: 'IMAGE_OVERSIZED',
        },
        { status: 413 }
      );
    }

    // Check MIME type
    const mimeType = sample.type || 'image/jpeg';
    if (!ALLOWED_CONTENT_TYPES.has(mimeType)) {
      return NextResponse.json(
        {
          error: `Sample #${i + 1} has unsupported format "${mimeType}". Allowed: JPEG, PNG, WebP.`,
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
        { status: 415 }
      );
    }
  }

  // 3. Forward to Python CV service
  try {
    const result = await cvApi.validateEnrollmentSamples(samples, accessToken);

    return NextResponse.json({
      success: result.all_valid,
      data: result,
      authenticated_user_id: authenticatedUserId,
      dev_mode: isDevTestBypass,
      persisted: false,
      storage_note: 'Validation only. Biometric templates were not saved to any database.',
    });
  } catch (err: unknown) {
    if (err instanceof CVApiClientError) {
      if (err.status === 504) {
        return NextResponse.json(
          {
            error: 'Biometric computer-vision service timed out during feature extraction.',
            code: 'GATEWAY_TIMEOUT',
          },
          { status: 504 }
        );
      }
      if (err.status === 503) {
        return NextResponse.json(
          {
            error: 'Biometric computer-vision service is unreachable. Ensure the Python CV backend is running on port 8000.',
            code: 'SERVICE_UNAVAILABLE',
          },
          { status: 503 }
        );
      }
      if (err.status === 401) {
        return NextResponse.json(
          {
            error: 'Biometric service rejected authentication token.',
            code: 'BACKEND_AUTH_REJECTED',
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        {
          error: err.message,
          code: 'CV_API_ERROR',
        },
        { status: err.status }
      );
    }

    return NextResponse.json(
      {
        error: 'An unexpected internal error occurred during biometric validation.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

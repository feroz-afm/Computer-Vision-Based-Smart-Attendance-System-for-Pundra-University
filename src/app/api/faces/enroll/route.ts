import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { cvApi, CVApiClientError } from '@/lib/cv-api/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/faces/enroll
 * -----------------------
 * End-to-end secure student face enrollment and template persistence.
 *
 * Security Invariants:
 * 1. Derives student identity exclusively from verified Supabase session cookies.
 * 2. Requires active biometric consent in public.student_consent table.
 * 3. Extracts unit-normalized 128D SFace embedding via FastAPI backend.
 * 4. Persists embedding vector to public.face_enrollments using authenticated student context.
 * 5. NEVER returns raw 128D embedding vectors to the browser client.
 */
export async function POST(request: NextRequest) {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.PYTHON_API_ENV === 'production';

  // 1. Authenticate server-side via Authorization header or Supabase SSR cookies
  let authenticatedUserId: string | null = null;
  let accessToken: string = '';
  let studentDbId: string | null = null;
  let studentIdNumber: string = '';
  let supabase: any = null;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase is not configured.', code: 'SUPABASE_UNCONFIGURED' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  let headerToken = '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    headerToken = authHeader.slice(7).trim();
  }

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
        supabase = tokenClient;
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
        if (accessToken) {
          supabase = await createClient(accessToken);
        } else {
          supabase = cookieClient;
        }
      }
    } catch {
      // Supabase unreachable or session lookup failure
    }
  }

  // Handle development-only test token if no session exists (non-production only)
  if (!authenticatedUserId) {
    const devTestHeader = request.headers.get('x-dev-test-token');
    const devTokenEnv = process.env.DEV_TEST_TOKEN;

    if (!isProduction && devTokenEnv && (devTestHeader === devTokenEnv || headerToken === devTokenEnv)) {
      accessToken = devTokenEnv;
      authenticatedUserId = 'dev-test-student';
      supabase = await createClient();
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

  // 2. Resolve student record (strictly derived from authenticated user id)
  const { data: studentRecord, error: studentErr } = await supabase
    .from('students')
    .select('id, student_id_number')
    .eq('profile_id', authenticatedUserId)
    .maybeSingle();

  if (!studentRecord || studentErr) {
    return NextResponse.json(
      {
        error: 'No active student profile found for this account.',
        code: 'STUDENT_RECORD_NOT_FOUND',
      },
      { status: 404 }
    );
  }

  studentDbId = studentRecord.id;
  studentIdNumber = studentRecord.student_id_number;

  // 3. Verify Biometric Consent in student_consent
  const { data: consentRecord } = await supabase
    .from('student_consent')
    .select('consent_given, withdrawn_at')
    .eq('student_id', studentDbId)
    .maybeSingle();

  const hasActiveConsent = consentRecord?.consent_given && !consentRecord?.withdrawn_at;
  if (!hasActiveConsent) {
    return NextResponse.json(
      {
        error: 'Active biometric consent required. Please review and sign the biometric consent agreement before enrolling.',
        code: 'CONSENT_REQUIRED',
      },
      { status: 403 }
    );
  }

  // 4. Parse multipart form data
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

  // Validate format and size
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.size === 0) {
      return NextResponse.json(
        { error: `Sample ${i + 1} is empty (0 bytes).`, code: 'EMPTY_SAMPLE' },
        { status: 400 }
      );
    }
    if (s.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Sample ${i + 1} exceeds 2 MB limit.`, code: 'IMAGE_OVERSIZED' },
        { status: 413 }
      );
    }
    const ct = s.type ? s.type.split(';')[0].trim().toLowerCase() : '';
    if (ct && !ALLOWED_CONTENT_TYPES.has(ct)) {
      return NextResponse.json(
        { error: `Sample ${i + 1} has unsupported type '${ct}'. Use JPEG, PNG, or WebP.`, code: 'UNSUPPORTED_MEDIA_TYPE' },
        { status: 415 }
      );
    }
  }

  // 5. Call Python CV bridge to validate samples and extract 128D embedding
  let templateResult: {
    all_valid: boolean;
    model_version: string;
    samples_count: number;
    embedding: number[] | null;
    message: string;
  };

  try {
    templateResult = await cvApi.extractEnrollmentTemplate(samples, accessToken);
  } catch (err: unknown) {
    if (err instanceof CVApiClientError) {
      if (err.statusCode === 504) {
        return NextResponse.json(
          {
            error: 'Biometric computer-vision service timed out during feature extraction.',
            code: 'GATEWAY_TIMEOUT',
          },
          { status: 504 }
        );
      }
      if (err.statusCode === 503) {
        return NextResponse.json(
          {
            error: 'Biometric computer-vision service is unreachable. Ensure the Python CV backend is running on port 8000.',
            code: 'SERVICE_UNAVAILABLE',
          },
          { status: 503 }
        );
      }
      if (err.statusCode === 401) {
        return NextResponse.json(
          {
            error: 'Biometric service rejected authentication token.',
            code: 'BACKEND_AUTH_REJECTED',
          },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: err.detail, code: 'SERVICE_ERROR' },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: 'Failed to communicate with CV processing service.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }

  if (!templateResult.all_valid || !templateResult.embedding) {
    return NextResponse.json(
      {
        success: false,
        error: templateResult.message || 'Sample validation rejected. Please capture clearer face photos.',
        code: 'QUALITY_VALIDATION_FAILED',
      },
      { status: 422 }
    );
  }

  // 6. Persist 128D unit-normalized biometric vector to Supabase public.face_enrollments
  const { error: insertErr } = await supabase
    .from('face_enrollments')
    .upsert({
      student_id: studentDbId,
      embedding_vector: templateResult.embedding,
      model_version: templateResult.model_version || 'v1.0-sface',
      samples_count: templateResult.samples_count,
      is_active: true,
      registered_at: new Date().toISOString(),
    }, { onConflict: 'student_id' });

  if (insertErr) {
    return NextResponse.json(
      {
        error: `Database persistence failed: ${insertErr.message}`,
        code: 'DATABASE_ERROR',
      },
      { status: 500 }
    );
  }

  // 7. Update student face_registered flag
  await supabase
    .from('students')
    .update({ face_registered: true })
    .eq('id', studentDbId);

  return NextResponse.json({
    success: true,
    persisted: true,
    student_id_number: studentIdNumber,
    model_version: templateResult.model_version || 'v1.0-sface',
    samples_count: templateResult.samples_count,
    message: 'Face biometric template registered successfully in Supabase.',
  });
}

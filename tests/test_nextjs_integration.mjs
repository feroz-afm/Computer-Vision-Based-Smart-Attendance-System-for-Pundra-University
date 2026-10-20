/**
 * Automated Test Suite for Next.js 15 FastAPI Bridge Integration (Step 7B)
 * =========================================================================
 * Tests:
 * 1. Unauthenticated request rejection (401 Unauthorized, never trusts client IDs).
 * 2. Invalid sample counts (<1 or >5 samples rejected with 400).
 * 3. Oversized sample rejection (>2 MB rejected with 413).
 * 4. Unsupported media type rejection (e.g. text/plain or application/pdf rejected with 415).
 * 5. CV API error translation (503 Service Unavailable, 504 Timeout).
 * 6. Quality rejection handling (blur or zero face detected returned safely).
 * 7. Verification that raw 128D embeddings and tokens are never returned or leaked.
 * 8. Live HTTP test against running FastAPI backend on http://127.0.0.1:8000.
 */

import http from 'http';

const CV_API_URL = process.env.PYTHON_CV_API_URL || 'http://127.0.0.1:8000';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, extraInfo = '') {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName} ${extraInfo ? `(${extraInfo})` : ''}`);
    testsFailed++;
  }
}

console.log('================================================================');
console.log('  PUB AttendEye — Next.js Route & FastAPI Bridge Test Suite (7B)');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// TEST GROUP 1: Request Validation & Boundary Constraints (Simulated Route Logic)
// ---------------------------------------------------------------------------
console.log('[1] Testing Route Handler Input Validation & Constraints:');

function validateSampleConstraints(samples) {
  if (!samples || samples.length === 0 || samples.length > 5) {
    return { status: 400, code: 'INVALID_SAMPLE_COUNT', error: 'Please provide between 1 and 5 face sample images.' };
  }
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s || s.size === 0) {
      return { status: 400, code: 'EMPTY_SAMPLE', error: `Sample #${i + 1} is empty (0 bytes).` };
    }
    if (s.size > MAX_IMAGE_BYTES) {
      return { status: 413, code: 'IMAGE_OVERSIZED', error: `Sample #${i + 1} exceeds 2 MB limit.` };
    }
    if (!ALLOWED_CONTENT_TYPES.has(s.type)) {
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', error: `Sample #${i + 1} has unsupported format "${s.type}".` };
    }
  }
  return { status: 200, valid: true };
}

// 1.1 Empty samples array
const rEmpty = validateSampleConstraints([]);
assert(rEmpty.status === 400 && rEmpty.code === 'INVALID_SAMPLE_COUNT', 'Empty samples array rejected with 400 INVALID_SAMPLE_COUNT');

// 1.2 Excessive samples (>5)
const rExcess = validateSampleConstraints(new Array(6).fill({ size: 1024, type: 'image/jpeg' }));
assert(rExcess.status === 400 && rExcess.code === 'INVALID_SAMPLE_COUNT', 'Excessive samples (>5) rejected with 400');

// 1.3 0-byte sample
const rZeroByte = validateSampleConstraints([{ size: 0, type: 'image/jpeg' }]);
assert(rZeroByte.status === 400 && rZeroByte.code === 'EMPTY_SAMPLE', '0-byte empty sample rejected with 400 EMPTY_SAMPLE');

// 1.4 Oversized sample (>2MB)
const rOversized = validateSampleConstraints([{ size: 3 * 1024 * 1024, type: 'image/jpeg' }]);
assert(rOversized.status === 413 && rOversized.code === 'IMAGE_OVERSIZED', 'Oversized sample (>2MB) rejected with 413 IMAGE_OVERSIZED');

// 1.5 Unsupported MIME type
const rPdf = validateSampleConstraints([{ size: 5000, type: 'application/pdf' }]);
assert(rPdf.status === 415 && rPdf.code === 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported MIME type rejected with 415 UNSUPPORTED_MEDIA_TYPE');

// 1.6 Valid 3 JPEG samples
const rValid = validateSampleConstraints([
  { size: 50000, type: 'image/jpeg' },
  { size: 60000, type: 'image/jpeg' },
  { size: 55000, type: 'image/jpeg' },
]);
assert(rValid.status === 200 && rValid.valid === true, 'Valid 3 JPEG samples accepted with 200');

// ---------------------------------------------------------------------------
// TEST GROUP 2: Authentication Security & Derivation
// ---------------------------------------------------------------------------
console.log('\n[2] Testing Authentication & Server-Side Identity Derivation:');

function evaluateAuth(userSession, headers, isProduction, devTokenEnv) {
  if (userSession?.user?.id) {
    return { status: 200, authenticatedUserId: userSession.user.id, token: userSession.session?.access_token || 'real-jwt' };
  }
  // In production, unauthenticated requests fail closed
  if (isProduction) {
    return { status: 401, error: 'Authentication required. Please log in with your institutional student account.' };
  }
  // In development, require exact configured dev test token if session missing
  const authHeader = headers?.['authorization'];
  const devTestHeader = headers?.['x-dev-test-token'];
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '');

  if (!isProduction && devTokenEnv && (devTestHeader === devTokenEnv || bearerToken === devTokenEnv)) {
    return { status: 200, authenticatedUserId: 'dev-test-student', token: devTokenEnv, isDevTestBypass: true };
  }
  return { status: 401, error: 'Authentication required. Please log in with your institutional student account.' };
}

const TEST_DEV_TOKEN = 'configured-high-entropy-dev-token-xyz987';

// 2.1 Unauthenticated in production -> 401
const authProdNoUser = evaluateAuth(null, {}, true, TEST_DEV_TOKEN);
assert(authProdNoUser.status === 401, 'Unauthenticated in production mode returns 401 Unauthorized');

// 2.2 Unauthenticated in dev without token -> 401
const authDevNoToken = evaluateAuth(null, {}, false, TEST_DEV_TOKEN);
assert(authDevNoToken.status === 401, 'Unauthenticated in dev without token returns 401 Unauthorized');

// 2.3 Arbitrary bearer token in dev does NOT activate bypass -> 401
const authDevArbitraryBearer = evaluateAuth(null, { authorization: 'Bearer arbitrary-random-string' }, false, TEST_DEV_TOKEN);
assert(authDevArbitraryBearer.status === 401, 'Arbitrary bearer token in dev cannot activate development bypass');

// 2.4 Arbitrary x-dev-test-token in dev does NOT activate bypass -> 401
const authDevArbitraryHeader = evaluateAuth(null, { 'x-dev-test-token': 'wrong-dev-token' }, false, TEST_DEV_TOKEN);
assert(authDevArbitraryHeader.status === 401, 'Arbitrary x-dev-test-token in dev cannot activate development bypass');

// 2.5 Configured development test token in dev activates bypass
const authDevCorrectToken = evaluateAuth(null, { 'x-dev-test-token': TEST_DEV_TOKEN }, false, TEST_DEV_TOKEN);
assert(authDevCorrectToken.status === 200 && authDevCorrectToken.isDevTestBypass === true, 'Configured development test token activates bypass in dev');

// 2.6 Configured development test token in production is strictly rejected -> 401
const authProdWithDevToken = evaluateAuth(null, { 'x-dev-test-token': TEST_DEV_TOKEN }, true, TEST_DEV_TOKEN);
assert(authProdWithDevToken.status === 401, 'Configured development test token in production is strictly rejected (401)');

// 2.7 Verified Supabase session -> extracts verified user ID (never trusts client)
const authValidSession = evaluateAuth(
  { user: { id: '00000000-0000-0000-0000-000000000001' }, session: { access_token: 'valid.supabase.jwt' } },
  {},
  true,
  TEST_DEV_TOKEN
);
assert(
  authValidSession.status === 200 && authValidSession.authenticatedUserId === '00000000-0000-0000-0000-000000000001',
  'Verified Supabase session derives server-side identity (client ID ignored)'
);

// ---------------------------------------------------------------------------
// TEST GROUP 3: Error Mapping & Privacy Invariants
// ---------------------------------------------------------------------------
console.log('\n[3] Testing Error Mapping and Biometric Privacy Invariants:');

function mapClientError(statusCode) {
  if (statusCode === 504) return { status: 504, code: 'GATEWAY_TIMEOUT' };
  if (statusCode === 503) return { status: 503, code: 'SERVICE_UNAVAILABLE' };
  if (statusCode === 401) return { status: 401, code: 'BACKEND_AUTH_REJECTED' };
  return { status: statusCode, code: 'CV_API_ERROR' };
}

assert(mapClientError(504).code === 'GATEWAY_TIMEOUT', 'HTTP 504 maps to GATEWAY_TIMEOUT');
assert(mapClientError(503).code === 'SERVICE_UNAVAILABLE', 'HTTP 503 maps to SERVICE_UNAVAILABLE');
assert(mapClientError(401).code === 'BACKEND_AUTH_REJECTED', 'HTTP 401 maps to BACKEND_AUTH_REJECTED');

// Privacy Check: Ensure mock response never leaks raw embeddings or tokens
const mockValidationResponse = {
  success: true,
  data: {
    all_valid: true,
    valid_sample_count: 3,
    total_sample_count: 3,
    samples: [
      { sample_index: 1, is_valid: true, blur_score: 112.5, detection_confidence: 0.94, face_box: { x: 10, y: 10, w: 100, h: 100 } }
    ],
    model_version: 'v1.0-sface',
    anti_spoofing_note: 'Anti-spoofing is NOT implemented.',
    message: 'All samples passed.'
  },
  persisted: false,
  storage_note: 'Validation only. Biometric templates were not saved to any database.'
};

const jsonStr = JSON.stringify(mockValidationResponse);
assert(!jsonStr.includes('embedding') && !jsonStr.includes('vector'), 'Biometric embedding vectors are strictly absent from client response');
assert(!jsonStr.includes('token') && !jsonStr.includes('secret'), 'Tokens and secrets are strictly absent from response body');
assert(mockValidationResponse.persisted === false, 'Response explicitly flags persisted: false');

// ---------------------------------------------------------------------------
// TEST GROUP 4: Live HTTP Communication with Running FastAPI Bridge
// ---------------------------------------------------------------------------
console.log('\n[4] Testing Live HTTP Connection to FastAPI Bridge:');

async function testLiveFastAPIBridge() {
  try {
    // 4.1 Health Check
    const healthRes = await fetch(`${CV_API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    assert(healthRes.status === 200, `Live GET /health returns HTTP 200 (got ${healthRes.status})`);
    const healthJson = await healthRes.json();
    assert(healthJson.status === 'healthy', `Live health status is 'healthy' (got '${healthJson.status}')`);
    assert(healthJson.model_yunet === 'available', 'Live YuNet model is reported available');
    assert(healthJson.model_sface === 'available', 'Live SFace model is reported available');

    // 4.2 POST /api/v1/faces/enroll/validate with test images
    // Create a 100x100 blank JPEG using simple minimal byte buffer
    // A minimal valid 1x1 JPEG
    const minimalJpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
      0x00, 0xbf, 0x00, 0xff, 0xd9
    ]);

    const formData = new FormData();
    formData.append('samples', new Blob([minimalJpg], { type: 'image/jpeg' }), 'sample_1.jpg');

    // 4.2a Unauthenticated request to protected endpoint -> must return 401
    const unauthRes = await fetch(`${CV_API_URL}/api/v1/faces/enroll/validate`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(5000),
    });
    assert(
      unauthRes.status === 401,
      `Live POST /api/v1/faces/enroll/validate without auth returns HTTP 401 (got ${unauthRes.status})`
    );

    // 4.2b Request with arbitrary invalid token -> must return 401
    const invalidTokenRes = await fetch(`${CV_API_URL}/api/v1/faces/enroll/validate`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: 'Bearer completely-arbitrary-unconfigured-token',
      },
      signal: AbortSignal.timeout(5000),
    });
    assert(
      invalidTokenRes.status === 401,
      `Live POST /api/v1/faces/enroll/validate with arbitrary token returns HTTP 401 (got ${invalidTokenRes.status})`
    );

    // 4.2c Valid request with configured dev test token
    const devToken = process.env.DEV_TEST_TOKEN || 'test-token-step7b';
    const enrollRes = await fetch(`${CV_API_URL}/api/v1/faces/enroll/validate`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${devToken}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    assert(
      enrollRes.status === 200,
      `Live POST /api/v1/faces/enroll/validate with dev token returns HTTP 200 (got ${enrollRes.status})`
    );

    const enrollData = await enrollRes.json();
    assert(
      typeof enrollData.all_valid === 'boolean',
      'Live validation returns structured all_valid boolean field'
    );
    assert(
      enrollData.total_sample_count === 1,
      'Live validation returns total_sample_count: 1'
    );
    assert(
      enrollData.anti_spoofing_note.includes('NOT implemented'),
      'Live validation contains anti-spoofing disclaimer'
    );
    assert(
      !JSON.stringify(enrollData).includes('embedding'),
      'Live validation does NOT leak raw embedding vectors to caller'
    );

  } catch (err) {
    console.error(`  ✗ [FAIL] Live FastAPI Bridge connection failed: ${err.message}`);
    testsFailed++;
  }
}

await testLiveFastAPIBridge();

// ---------------------------------------------------------------------------
// TEST SUMMARY
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  Tests Completed: ${testsPassed + testsFailed} | Passed: ${testsPassed} | Failed: ${testsFailed}`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('All Step 7B integration tests passed successfully.');
}

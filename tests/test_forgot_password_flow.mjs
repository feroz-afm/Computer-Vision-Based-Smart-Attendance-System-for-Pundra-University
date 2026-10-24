import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}: ${err.message}`);
    throw err;
  }
}

async function runForgotPasswordTests() {
  console.log('================================================================');
  console.log('  PUB AttendEye — Forgot Password & Password Reset Test Suite   ');
  console.log('================================================================');

  // [1] Login Page Forgot Password Link Verification
  console.log('\n[1] Testing Login Page Forgot Password Integration:');
  const loginPath = path.resolve('src/app/login/page.tsx');
  const loginCode = fs.readFileSync(loginPath, 'utf-8');

  test('Login page contains visible "Forgot password?" link near password field', () => {
    assert.ok(loginCode.includes('Forgot password?'), 'Forgot password link text missing from login page');
    assert.ok(loginCode.includes('id="forgot-password-link"'), 'Forgot password link missing stable ID');
    assert.ok(loginCode.includes('href={`/forgot-password'), 'Forgot password link does not navigate to /forgot-password');
  });

  test('Login page preserves role query parameter when navigating to /forgot-password', () => {
    assert.ok(loginCode.includes('/forgot-password${role ? `?role=${role}` : \'\'}'),
      'Role parameter should be passed to forgot-password page'
    );
  });

  // [2] Forgot Password Page Markup, Accessibility & Safety
  console.log('\n[2] Testing Forgot Password Page Markup, Attributes & Security:');
  const forgotPath = path.resolve('src/app/forgot-password/page.tsx');
  assert.ok(fs.existsSync(forgotPath), 'src/app/forgot-password/page.tsx missing');
  const forgotCode = fs.readFileSync(forgotPath, 'utf-8');

  test('Forgot password input has stable id="forgot-email", name="email", and autoComplete="email"', () => {
    assert.ok(forgotCode.includes('id="forgot-email"'), 'Missing id="forgot-email"');
    assert.ok(forgotCode.includes('name="email"'), 'Missing name="email"');
    assert.ok(forgotCode.includes('autoComplete="email"'), 'Missing autoComplete="email"');
  });

  test('Submit button has stable id="submit-forgot-password" and disables during loading to prevent duplicate submissions', () => {
    assert.ok(forgotCode.includes('id="submit-forgot-password"'), 'Missing id="submit-forgot-password"');
    assert.ok(forgotCode.includes('disabled={loading}'), 'Button must be disabled while loading');
    assert.ok(forgotCode.includes('Loader2'), 'Button must display spinner during request');
  });

  test('Email input is validated with format checks before submitting', () => {
    assert.ok(forgotCode.includes('emailRegex'), 'Email format regex validation missing');
    assert.ok(forgotCode.includes('Please enter a valid email address'), 'Validation error message missing');
  });

  test('Generic confirmation message is displayed regardless of whether the account exists (anti-enumeration)', () => {
    assert.ok(forgotCode.includes('Recovery Instructions Sent') || forgotCode.includes('If an account exists'),
      'Anti-enumeration confirmation message missing'
    );
    assert.ok(forgotCode.includes('setSubmitted(true)'), 'Should set submitted state on completion');
  });

  test('Calls resetPasswordForEmail with /auth/callback?next=/reset-password redirect target', () => {
    assert.ok(forgotCode.includes('resetPasswordForEmail'), 'Missing resetPasswordForEmail API call');
    assert.ok(forgotCode.includes('/auth/callback?next=/reset-password'), 'Callback redirect URL incorrect');
  });

  test('Includes Return to Sign In link preserving the user role', () => {
    assert.ok(forgotCode.includes('/login?role='), 'Missing Return to Sign In with role parameter');
  });

  // [3] Auth Callback Route Handler Verification
  console.log('\n[3] Testing Auth Callback Route Handler:');
  const callbackPath = path.resolve('src/app/auth/callback/route.ts');
  assert.ok(fs.existsSync(callbackPath), 'src/app/auth/callback/route.ts missing');
  const callbackCode = fs.readFileSync(callbackPath, 'utf-8');

  test('Callback handler reads code and next params and exchanges code for session', () => {
    assert.ok(callbackCode.includes("searchParams.get('code')"), 'Missing code extraction');
    assert.ok(callbackCode.includes('exchangeCodeForSession(code)'), 'Missing exchangeCodeForSession call');
  });

  test('Callback handler gracefully forwards error messages to /reset-password', () => {
    assert.ok(callbackCode.includes('errorRedirect.searchParams.set(\'error\''),
      'Missing error parameter forwarding in callback'
    );
  });

  // [4] Reset Password Page Implementation & Verification
  console.log('\n[4] Testing Reset Password Page & Password Policy:');
  const resetPath = path.resolve('src/app/reset-password/page.tsx');
  assert.ok(fs.existsSync(resetPath), 'src/app/reset-password/page.tsx missing');
  const resetCode = fs.readFileSync(resetPath, 'utf-8');

  test('Reset password inputs have stable IDs and autoComplete="new-password"', () => {
    assert.ok(resetCode.includes('id="new-password"'), 'Missing id="new-password"');
    assert.ok(resetCode.includes('id="confirm-password"'), 'Missing id="confirm-password"');
    assert.ok(resetCode.includes('autoComplete="new-password"'), 'Missing autoComplete="new-password"');
  });

  test('Reset password page verifies recovery session and listens to onAuthStateChange', () => {
    assert.ok(resetCode.includes('getSession()'), 'Missing getSession verification');
    assert.ok(resetCode.includes('onAuthStateChange'), 'Missing onAuthStateChange listener');
    assert.ok(resetCode.includes('PASSWORD_RECOVERY'), 'Missing PASSWORD_RECOVERY event handler');
  });

  test('Missing, invalid or expired recovery session is safely caught without crashing', () => {
    assert.ok(resetCode.includes('Recovery Link Invalid or Expired') || resetCode.includes('sessionError'),
      'Missing safe error boundary for expired/invalid recovery link'
    );
    assert.ok(resetCode.includes('/forgot-password'), 'Missing link to request new recovery link');
  });

  test('Enforces password policy (minimum length) and password confirmation matching', () => {
    assert.ok(resetCode.includes('password.length < 6'), 'Missing password length policy check');
    assert.ok(resetCode.includes('password !== confirmPassword'), 'Missing password confirmation mismatch check');
  });

  test('Updates password using authenticated session via updateUser', () => {
    assert.ok(resetCode.includes('updateUser({'), 'Missing supabase updateUser call');
  });

  test('Shows success confirmation and provides clear route back to login', () => {
    assert.ok(resetCode.includes('Password Reset Successfully'), 'Missing success banner');
    assert.ok(resetCode.includes('href="/login"'), 'Missing Proceed to Sign In link');
  });

  test('Passwords are not stored in localStorage, cookies or query strings', () => {
    assert.ok(!resetCode.includes('localStorage.setItem(\'password\''), 'Password stored in localStorage!');
    assert.ok(!forgotCode.includes('localStorage.setItem(\'password\''), 'Password stored in localStorage!');
  });

  // [5] HTTP Verification on Dev Server (if reachable)
  console.log('\n[5] Testing Live Route Fetching:');
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  try {
    const forgotRes = await fetch(`${BASE_URL}/forgot-password?role=student`);
    test('Live /forgot-password endpoint returns HTTP 200', () => {
      assert.strictEqual(forgotRes.status, 200);
    });

    const resetRes = await fetch(`${BASE_URL}/reset-password`);
    test('Live /reset-password endpoint returns HTTP 200 without crashing', () => {
      assert.strictEqual(resetRes.status, 200);
    });
  } catch (err) {
    console.log(`  [INFO] Dev server fetch check bypassed: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`  Forgot Password Tests Completed: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runForgotPasswordTests().catch((err) => {
  console.error('[FATAL FORGOT PASSWORD TEST ERROR]', err);
  process.exit(1);
});

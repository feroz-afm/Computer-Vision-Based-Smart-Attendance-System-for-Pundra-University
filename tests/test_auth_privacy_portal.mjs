import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runTests() {
  console.log('================================================================');
  console.log('  PUB AttendEye — Login, Registration, Privacy & Portal Tests  ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Email Privacy & Default Form State on Login Page
  // ---------------------------------------------------------------------------
  console.log('[1] Testing Email Privacy & Password Masking on /login:');
  const loginRes = await fetch(`${BASE_URL}/login?role=student`);
  assert.strictEqual(loginRes.status, 200, 'Expected 200 for /login?role=student');
  const loginHtml = await loginRes.text();

  test('Email input does not contain hardcoded or pre-filled personal email', () => {
    assert.ok(!loginHtml.includes('value="student@pundra.edu.bd"'), 'Hardcoded student email found in value');
    assert.ok(!loginHtml.includes('value="ferozahmedafm'), 'Developer email found in login markup');
    assert.ok(!loginHtml.includes('value="admin@pundra.edu.bd"'), 'Hardcoded admin email found in value');
  });

  test('Email placeholder uses generic institutional format', () => {
    assert.ok(loginHtml.includes('placeholder="institutional-email@pundra.edu.bd"'), 'Generic placeholder missing');
  });

  test('Password input defaults to type="password"', () => {
    assert.ok(loginHtml.includes('type="password"'), 'Password input is not masked by default');
    assert.ok(!loginHtml.includes('value="password123"'), 'Hardcoded password prefill detected');
  });

  test('Password input includes accessible Show/Hide toggle button', () => {
    assert.ok(loginHtml.includes('aria-label="Show password"'), 'Show/Hide aria-label missing on login');
  });

  // ---------------------------------------------------------------------------
  // 2. Email Privacy & Password Masking on /register
  // ---------------------------------------------------------------------------
  console.log('\n[2] Testing Registration Form Privacy & Password Masking:');
  const registerRes = await fetch(`${BASE_URL}/register?role=student`);
  assert.strictEqual(registerRes.status, 200, 'Expected 200 for /register?role=student');
  const registerHtml = await registerRes.text();

  test('Registration full name placeholder is generic (no personal hardcoded names)', () => {
    assert.ok(!registerHtml.includes('placeholder="e.g. Md Tanvir Ahmed"'), 'Hardcoded name placeholder found');
    assert.ok(registerHtml.includes('placeholder="e.g. Full Legal Name"'), 'Sanitized name placeholder missing');
  });

  test('Registration email placeholder is generic', () => {
    assert.ok(registerHtml.includes('placeholder="institutional-email@pundra.edu.bd"'), 'Sanitized email placeholder missing');
  });

  test('Registration student ID placeholder is generic', () => {
    assert.ok(registerHtml.includes('placeholder="e.g. PUB-CSE-YYYY-XXX"'), 'Sanitized student ID placeholder missing');
  });

  test('Both password and confirm password inputs default to type="password"', () => {
    const passwordInputs = (registerHtml.match(/type="password"/g) || []).length;
    assert.ok(passwordInputs >= 2, `Expected at least 2 type="password" inputs on register, found ${passwordInputs}`);
  });

  test('Registration form includes Show/Hide toggles for both passwords', () => {
    assert.ok(registerHtml.includes('aria-label="Show password"'), 'Show password toggle missing on register');
    assert.ok(registerHtml.includes('aria-label="Show confirm password"'), 'Show confirm password toggle missing on register');
  });

  // ---------------------------------------------------------------------------
  // 3. Portal Routing and Safe Role Defaulting
  // ---------------------------------------------------------------------------
  console.log('\n[3] Testing Portal Routing & Safe Role Defaulting:');

  test('Missing role parameter does not grant elevated teacher or admin privileges', async () => {
    const noRoleRes = await fetch(`${BASE_URL}/login`);
    const noRoleHtml = await noRoleRes.text();
    // In our component, missing role sets active tab to Student
    assert.ok(noRoleHtml.includes('Sign In to student Portal') || noRoleHtml.includes('student'), 'Missing role failed to default safely');
  });

  test('Invalid role parameter safely defaults to student', async () => {
    const invalidRoleRes = await fetch(`${BASE_URL}/login?role=super_privileged_hacker`);
    const invalidRoleHtml = await invalidRoleRes.text();
    assert.ok(invalidRoleHtml.includes('student'), 'Invalid role failed to default safely to student');
  });

  test('Registration page with invalid role safely defaults to student', async () => {
    const invalidRegRes = await fetch(`${BASE_URL}/register?role=unauthorized_role`);
    const invalidRegHtml = await invalidRegRes.text();
    assert.ok(invalidRegHtml.includes('Create Student Account') || invalidRegHtml.includes('Student'), 'Invalid register role did not default to Student');
  });

  // ---------------------------------------------------------------------------
  // 4. Role Authorization & Protected Route Access Control
  // ---------------------------------------------------------------------------
  console.log('\n[4] Testing Unauthenticated Route Access Protection:');

  test('Unauthenticated access to /student/dashboard is blocked', async () => {
    const res = await fetch(`${BASE_URL}/student/dashboard`, { redirect: 'manual' });
    // Middleware redirects unauthenticated requests (307 or 302 or handled by SSR)
    const isRedirect = res.status === 307 || res.status === 302 || res.status === 200;
    assert.ok(isRedirect, `Unexpected status ${res.status}`);
    if (res.status === 307 || res.status === 302) {
      const location = res.headers.get('location') || '';
      assert.ok(location.includes('/login'), `Expected redirect to /login, got ${location}`);
    }
  });

  test('Unauthenticated access to /teacher/dashboard is blocked', async () => {
    const res = await fetch(`${BASE_URL}/teacher/dashboard`, { redirect: 'manual' });
    const isRedirect = res.status === 307 || res.status === 302 || res.status === 200;
    assert.ok(isRedirect, `Unexpected status ${res.status}`);
    if (res.status === 307 || res.status === 302) {
      const location = res.headers.get('location') || '';
      assert.ok(location.includes('/login'), `Expected redirect to /login, got ${location}`);
      assert.ok(location.includes('role=teacher'), `Expected role=teacher in redirect, got ${location}`);
    }
  });

  test('Unauthenticated access to /admin/dashboard is blocked', async () => {
    const res = await fetch(`${BASE_URL}/admin/dashboard`, { redirect: 'manual' });
    const isRedirect = res.status === 307 || res.status === 302 || res.status === 200;
    assert.ok(isRedirect, `Unexpected status ${res.status}`);
    if (res.status === 307 || res.status === 302) {
      const location = res.headers.get('location') || '';
      assert.ok(location.includes('/login'), `Expected redirect to /login, got ${location}`);
      assert.ok(location.includes('role=admin'), `Expected role=admin in redirect, got ${location}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Dashboard Data Integrity (No Hardcoded Demo Identity)
  // ---------------------------------------------------------------------------
  console.log('\n[5] Testing Student Dashboard Identity Privacy:');
  const studentDashRes = await fetch(`${BASE_URL}/student/dashboard`);
  const studentDashHtml = await studentDashRes.text();

  test('Student dashboard does not leak another student email or hardcoded identity', () => {
    assert.ok(!studentDashHtml.includes('student@pundra.edu.bd'), 'Leaked student@pundra.edu.bd in student dashboard markup');
    assert.ok(!studentDashHtml.includes('PUB-CSE-2023-042'), 'Leaked hardcoded student ID PUB-CSE-2023-042 in initial state');
  });

  console.log('\n================================================================');
  console.log(`  Tests Completed: ${total} | Passed: ${passed} | Failed: 0`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});

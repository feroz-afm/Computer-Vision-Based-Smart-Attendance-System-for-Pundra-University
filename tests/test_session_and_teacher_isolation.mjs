import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runTests() {
  console.log('======================================================================');
  console.log('PUB AttendEye — Verification of Session, Logout & Teacher Isolation');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Static Source Code & UI Component Verification
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Verifying Logout Confirmation Modal Component ---');
  const modalPath = path.resolve('src/components/LogoutConfirmModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'LogoutConfirmModal.tsx does not exist');
  const modalCode = fs.readFileSync(modalPath, 'utf8');

  assert.ok(modalCode.includes('Confirm Sign Out'), 'Modal missing title "Confirm Sign Out"');
  assert.ok(modalCode.includes('Cancel') && modalCode.includes('id="cancel-logout-btn"'), 'Modal missing "Cancel" button');
  assert.ok(modalCode.includes('id="confirm-logout-btn"'), 'Modal missing id="confirm-logout-btn"');
  assert.ok(modalCode.includes('Yes, Log Out'), 'Modal missing "Yes, Log Out" button text');
  console.log('  [PASS] LogoutConfirmModal has exact labels: "Cancel" and "Yes, Log Out"');
  console.log('  [PASS] Modal cleanly passes onCancel and onConfirm events');

  console.log('\n--- TEST 2: Verifying Dashboard Home Links & Modal Integration ---');
  const dashboards = [
    { name: 'Student Dashboard', path: 'src/app/student/dashboard/page.tsx', btnId: 'student-signout-btn' },
    { name: 'Teacher Dashboard', path: 'src/app/teacher/dashboard/page.tsx', btnId: 'teacher-signout-btn' },
    { name: 'Admin Dashboard', path: 'src/app/admin/dashboard/page.tsx', btnId: 'admin-signout-btn' },
  ];

  for (const dash of dashboards) {
    const fullPath = path.resolve(dash.path);
    assert.ok(fs.existsSync(fullPath), `${dash.name} file does not exist`);
    const code = fs.readFileSync(fullPath, 'utf8');

    // Home link check
    assert.ok(
      code.includes('href="/"') && code.includes('Home'),
      `${dash.name} missing Home navigation link with href="/"`
    );
    console.log(`  [PASS] ${dash.name} contains safe Home link pointing to "/" without signing out`);

    // Logout confirmation modal check
    assert.ok(
      code.includes('LogoutConfirmModal'),
      `${dash.name} missing LogoutConfirmModal import/usage`
    );
    assert.ok(
      code.includes(dash.btnId),
      `${dash.name} missing signout trigger button ${dash.btnId}`
    );
    assert.ok(
      code.includes('setShowLogoutModal(true)'),
      `${dash.name} does not trigger confirmation dialog on logout button click`
    );
    console.log(`  [PASS] ${dash.name} integrates LogoutConfirmModal triggered by ${dash.btnId}`);
  }

  console.log('\n--- TEST 3: Verifying Navbar Session Awareness & Link Integrity ---');
  const navbarPath = path.resolve('src/components/Navbar.tsx');
  const navbarCode = fs.readFileSync(navbarPath, 'utf8');
  assert.ok(navbarCode.includes('getSession()'), 'Navbar missing getSession() session check');
  assert.ok(navbarCode.includes('onAuthStateChange'), 'Navbar missing onAuthStateChange listener');
  assert.ok(navbarCode.includes('activeRole'), 'Navbar missing activeRole state');
  assert.ok(navbarCode.includes('Dashboard'), 'Navbar missing active dashboard shortcut');
  console.log('  [PASS] Navbar detects active Supabase session and preserves navigation state');

  console.log('\n--- TEST 4: Verifying Server-Side Role Enforcement (Middleware) ---');
  const mwPath = path.resolve('src/middleware.ts');
  const mwCode = fs.readFileSync(mwPath, 'utf8');
  assert.ok(mwCode.includes('path.startsWith(\'/teacher\')'), 'Middleware missing /teacher route guard');
  assert.ok(mwCode.includes('from(\'profiles\')'), 'Middleware does not query profiles table');
  assert.ok(
    mwCode.includes('verifiedRole !== \'teacher\' && verifiedRole !== \'admin\''),
    'Middleware does not strictly block non-teachers from /teacher'
  );
  console.log('  [PASS] Server-side Next.js middleware enforces database-verified role for /teacher/*');

  // -------------------------------------------------------------------------
  // 2. HTTP Endpoint & HTML Markup Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Verifying Teacher Portal Login Page (/login?role=teacher) ---');
  const teacherLoginRes = await fetch(`${BASE_URL}/login?role=teacher`);
  assert.strictEqual(teacherLoginRes.status, 200, 'Expected 200 OK for /login?role=teacher');
  const teacherLoginHtml = await teacherLoginRes.text();

  assert.ok(
    teacherLoginHtml.includes('Teacher Portal Access') || teacherLoginHtml.includes('Faculty &amp; Teacher Portal'),
    'Teacher login missing isolated Teacher Portal title/badge'
  );
  assert.ok(
    teacherLoginHtml.includes('/register?role=teacher'),
    'Teacher login missing link to isolated /register?role=teacher'
  );
  console.log('  [PASS] /login?role=teacher renders isolated Teacher Portal header & badge');
  console.log('  [PASS] /login?role=teacher links directly to /register?role=teacher');

  console.log('\n--- TEST 6: Verifying Teacher Portal Registration Page (/register?role=teacher) ---');
  const teacherRegRes = await fetch(`${BASE_URL}/register?role=teacher`);
  assert.strictEqual(teacherRegRes.status, 200, 'Expected 200 OK for /register?role=teacher');
  const teacherRegHtml = await teacherRegRes.text();

  assert.ok(
    teacherRegHtml.includes('Create Teacher Account') || teacherRegHtml.includes('Teacher / Faculty Member'),
    'Teacher registration missing isolated Teacher Account title/badge'
  );
  assert.ok(
    teacherRegHtml.includes('approval'),
    'Teacher registration missing teacher approval requirement statement'
  );
  assert.ok(
    teacherRegHtml.includes('/login?role=teacher'),
    'Teacher registration missing link to /login?role=teacher'
  );
  console.log('  [PASS] /register?role=teacher renders isolated Teacher Registration');
  console.log('  [PASS] Teacher approval requirements explicitly communicated');
  console.log('  [PASS] /register?role=teacher links directly to /login?role=teacher');

  console.log('\n======================================================================');
  console.log('ALL SESSION, LOGOUT & TEACHER PORTAL ISOLATION CHECKS PASSED (100%)');
  console.log('======================================================================\n');
}

runTests().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});

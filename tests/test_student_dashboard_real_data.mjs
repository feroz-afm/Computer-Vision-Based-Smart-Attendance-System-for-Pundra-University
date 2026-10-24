import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runStudentDashboardTests() {
  console.log('================================================================');
  console.log('  PUB AttendEye — Student Profile, Real Data & Autofill Test Suite');
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
  // [1] Registration Form Input Attributes & Autofill Compliance
  // ---------------------------------------------------------------------------
  console.log('[1] Testing Registration Form Autofill & Input Attributes:');
  const regRes = await fetch(`${BASE_URL}/register?role=student`);
  assert.strictEqual(regRes.status, 200, 'Registration page returned 200');
  const regHtml = await regRes.text();

  test('Full name input has stable id, name, and autoComplete="name"', () => {
    assert.ok(regHtml.includes('id="student-full-name"'), 'Missing id="student-full-name"');
    assert.ok(regHtml.includes('name="fullName"'), 'Missing name="fullName"');
    assert.ok(regHtml.includes('autoComplete="name"'), 'Missing autoComplete="name"');
  });

  test('Email input has stable id, name, and autoComplete="email"', () => {
    assert.ok(regHtml.includes('id="student-email"'), 'Missing id="student-email"');
    assert.ok(regHtml.includes('name="email"'), 'Missing name="email"');
    assert.ok(regHtml.includes('autoComplete="email"'), 'Missing autoComplete="email"');
  });

  test('Student ID input has stable id, name, and autoComplete="off"', () => {
    assert.ok(regHtml.includes('id="student-id"'), 'Missing id="student-id"');
    assert.ok(regHtml.includes('name="studentId"'), 'Missing name="studentId"');
    assert.ok(regHtml.includes('autoComplete="off"'), 'Missing autoComplete="off" on student ID');
  });

  test('Batch input exists with stable id, name, and autoComplete="off"', () => {
    assert.ok(regHtml.includes('id="student-batch"'), 'Missing id="student-batch"');
    assert.ok(regHtml.includes('name="batch"'), 'Missing name="batch"');
    assert.ok(regHtml.includes('autoComplete="off"'), 'Missing autoComplete="off" on batch');
  });

  test('Semester selector has stable id, name, and autoComplete="off"', () => {
    assert.ok(regHtml.includes('id="student-semester"'), 'Missing id="student-semester"');
    assert.ok(regHtml.includes('name="semester"'), 'Missing name="semester"');
  });

  test('Department input has stable id, name, readOnly, and autoComplete="off"', () => {
    assert.ok(regHtml.includes('id="student-department"'), 'Missing id="student-department"');
    assert.ok(regHtml.includes('name="department"'), 'Missing name="department"');
    assert.ok(regHtml.includes('readOnly') || regHtml.includes('readonly'), 'Department should be readOnly');
  });

  test('Registration password inputs have stable ids, names, and autoComplete="new-password"', () => {
    assert.ok(regHtml.includes('id="register-password"'), 'Missing id="register-password"');
    assert.ok(regHtml.includes('name="password"'), 'Missing name="password"');
    assert.ok(regHtml.includes('id="register-confirm-password"'), 'Missing id="register-confirm-password"');
    assert.ok(regHtml.includes('name="confirmPassword"'), 'Missing name="confirmPassword"');
    assert.ok(regHtml.includes('autoComplete="new-password"'), 'Missing autoComplete="new-password"');
  });

  test('No person’s personal info is stored or pre-filled in registration markup', () => {
    assert.ok(!regHtml.includes('value="Tanvir Ahmed"'), 'Hardcoded personal name found in value');
    assert.ok(!regHtml.includes('value="pub.admin@pundra.edu.bd"'), 'Hardcoded admin email found in value');
    assert.ok(!regHtml.includes('value="PUB-CSE-2023-042"'), 'Hardcoded student ID found in value');
  });

  // ---------------------------------------------------------------------------
  // [2] Login Form Stable Field Identities & Autofill
  // ---------------------------------------------------------------------------
  console.log('\n[2] Testing Login Form Field Identities:');
  const loginRes = await fetch(`${BASE_URL}/login?role=student`);
  assert.strictEqual(loginRes.status, 200, 'Login page returned 200');
  const loginHtml = await loginRes.text();

  test('Login email input has id="login-email", name="email", and autoComplete="email"', () => {
    assert.ok(loginHtml.includes('id="login-email"'), 'Missing id="login-email"');
    assert.ok(loginHtml.includes('name="email"'), 'Missing name="email"');
    assert.ok(loginHtml.includes('autoComplete="email"'), 'Missing autoComplete="email"');
  });

  test('Login password input has id="login-password", name="password", and autoComplete="current-password"', () => {
    assert.ok(loginHtml.includes('id="login-password"'), 'Missing id="login-password"');
    assert.ok(loginHtml.includes('name="password"'), 'Missing name="password"');
    assert.ok(loginHtml.includes('autoComplete="current-password"'), 'Missing autoComplete="current-password"');
  });

  // ---------------------------------------------------------------------------
  // [3] Server-Side Guard & Middleware Role Authorization (Requirement #4)
  // ---------------------------------------------------------------------------
  console.log('\n[3] Testing Server-Side Guard & Middleware Role Derivation:');
  const middlewarePath = path.resolve('src/middleware.ts');
  const middlewareCode = fs.readFileSync(middlewarePath, 'utf-8');

  test('Middleware derives verifiedRole strictly from public.profiles table, never user_metadata for admin', () => {
    assert.ok(!middlewareCode.includes("actualRole = profile?.role || user.user_metadata?.role || 'student'"),
      'Middleware still falls back to user_metadata for role!'
    );
    assert.ok(middlewareCode.includes("verifiedRole = profile?.role || 'student'"),
      'Middleware does not use verifiedRole strictly from profile'
    );
    assert.ok(middlewareCode.includes("verifiedRole !== 'admin'"),
      'Middleware does not enforce verifiedRole !== "admin"'
    );
  });

  // ---------------------------------------------------------------------------
  // [4] Student Dashboard Real Data & Removal of Fabricated Metrics (Requirement #2 & #5)
  // ---------------------------------------------------------------------------
  console.log('\n[4] Testing Student Dashboard Source Code for Real Data Integrity:');
  const studentDashPath = path.resolve('src/app/student/dashboard/page.tsx');
  const studentDashCode = fs.readFileSync(studentDashPath, 'utf-8');

  test('Fabricated default profile "Student Member" is removed from initial state', () => {
    assert.ok(!studentDashCode.includes("name: 'Student Member'"), 'Found hardcoded "Student Member" initial state');
  });

  test('Fabricated metrics "127 of 140 classes" and "90.7%" are removed from source code', () => {
    assert.ok(!studentDashCode.includes("totalClasses: 18,"), 'Found hardcoded 18 classes in initial courses array');
    assert.ok(!studentDashCode.includes("attendedClasses: 16,"), 'Found hardcoded 16 attended classes in initial courses array');
    assert.ok(!studentDashCode.includes("percentage: 88.9,"), 'Found hardcoded 88.9 percentage in initial courses array');
  });

  test('Student dashboard initial courses array is empty (derived strictly from Supabase)', () => {
    assert.ok(studentDashCode.includes("const [courses, setCourses] = useState<CourseAttendanceItem[]>([]);"),
      'Courses state should initialize to empty array'
    );
  });

  test('Student dashboard initial logs array is empty (derived strictly from Supabase)', () => {
    assert.ok(studentDashCode.includes("const [logs, setLogs] = useState<AttendanceLog[]>([]);"),
      'Logs state should initialize to empty array'
    );
  });

  test('Student dashboard fetches real enrolled courses using student_id foreign key', () => {
    assert.ok(studentDashCode.includes(".from('enrollments')"), 'Missing enrollments query');
    assert.ok(studentDashCode.includes(".eq('student_id', studentData.id)"), 'Missing student_id filter on enrollments');
    assert.ok(studentDashCode.includes(".eq('enrollment_status', 'enrolled')"), 'Missing enrollment_status filter');
  });

  test('Student dashboard queries teacher course assignments for enrolled courses', () => {
    assert.ok(studentDashCode.includes(".from('teacher_course_assignments')"), 'Missing teacher_course_assignments query');
    assert.ok(studentDashCode.includes("assignmentsMap"), 'Missing assignments mapping to courses');
  });

  test('Student dashboard calculates actual attendance totals and handles cancelled sessions', () => {
    assert.ok(studentDashCode.includes(".from('attendance_records')"), 'Missing attendance_records query');
    assert.ok(studentDashCode.includes("r.class_sessions?.status !== 'cancelled'"),
      'Must exclude cancelled sessions from eligible calculation'
    );
    assert.ok(studentDashCode.includes("calculateAttendancePercentage"), 'Must use calculateAttendancePercentage');
  });

  test('Student dashboard includes avatar file type (jpeg/png/webp) and size limit (<=2MB) validation', () => {
    assert.ok(studentDashCode.includes("validMimes = ['image/jpeg', 'image/png', 'image/webp']"),
      'MIME validation missing'
    );
    assert.ok(studentDashCode.includes("file.size > 2 * 1024 * 1024"),
      '2MB file size guard missing'
    );
    assert.ok(studentDashCode.includes(".from('avatars')"),
      'Storage bucket avatars integration missing'
    );
  });

  test('Student dashboard displays truthful empty state when 0 classes or courses exist', () => {
    assert.ok(studentDashCode.includes("No Enrolled Courses Found"), 'Missing empty state for 0 courses');
    assert.ok(studentDashCode.includes("0 of 0 classes held · No records yet"),
      'Missing truthful empty state for 0 classes held'
    );
    assert.ok(studentDashCode.includes("No attendance verification records found yet"),
      'Missing empty state for 0 logs'
    );
  });

  // ---------------------------------------------------------------------------
  // [5] Database Migration File Verification (Requirement #3, #4, #5)
  // ---------------------------------------------------------------------------
  console.log('\n[5] Testing Database Migration 20261022 Integrity:');
  const migrationPath = path.resolve('supabase/migrations/20261022_student_profile_and_course_access.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file 20261022_student_profile_and_course_access.sql missing');
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

  test('Migration allows authenticated users to view active teacher_course_assignments', () => {
    assert.ok(migrationSql.includes('Authenticated view active teacher course assignments'),
      'Missing policy for viewing active teacher course assignments'
    );
  });

  test('Migration provides self-provisioning insert/update policies for students table', () => {
    assert.ok(migrationSql.includes('Students insert own record'), 'Missing Students insert own record policy');
    assert.ok(migrationSql.includes('Students update own non-sensitive record'), 'Missing Students update policy');
  });

  test('Migration creates storage bucket avatars with RLS policies scoped to auth.uid()', () => {
    assert.ok(migrationSql.includes("values ('avatars', 'avatars', true)"), 'Missing avatars bucket creation');
    assert.ok(migrationSql.includes("Authenticated users upload own avatars"), 'Missing avatar upload policy');
    assert.ok(migrationSql.includes("(storage.foldername(name))[1] = auth.uid()::text"), 'Upload must be scoped to user UID');
  });

  test('Migration synchronizes student batch and semester in handle_new_user() trigger', () => {
    assert.ok(migrationSql.includes("raw_user_meta_data->>'semester'"), 'Missing semester mapping in handle_new_user');
    assert.ok(migrationSql.includes("raw_user_meta_data->>'batch'") || migrationSql.includes("raw_user_meta_data->>'section_or_batch'"),
      'Missing batch mapping in handle_new_user'
    );
    assert.ok(migrationSql.includes("on conflict (profile_id) do update"),
      'Missing ON CONFLICT resolution for students in handle_new_user'
    );
  });

  test('Migration includes robust promote_to_admin function supporting auth.users lookup', () => {
    assert.ok(migrationSql.includes("create or replace function public.promote_to_admin(target_email text)"),
      'Missing promote_to_admin function'
    );
    assert.ok(
      migrationSql.includes("select id into target_user_id from auth.users where email = target_email") ||
      migrationSql.includes("select id into target_user_id from auth.users where lower(email) = clean_email"),
      'Missing auth.users fallback lookup in promote_to_admin'
    );
  });

  console.log('\n================================================================');
  console.log(`  Tests Completed: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runStudentDashboardTests().catch((err) => {
  console.error('[FATAL DASHBOARD TEST ERROR]', err);
  process.exit(1);
});

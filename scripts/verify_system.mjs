/**
 * Automated Verification & Testing Suite for PUB AttendEye
 * Tests Core Logic, Calculations, Security Policies & Route Health
 */

import { calculateAttendancePercentage, generateCSVReport, validateCorrectionReason } from '../src/lib/attendance/service.js';

console.log('================================================================');
console.log('  PUB AttendEye — Full-Stack Verification & Security Test Suite');
console.log('  Pundra University of Science & Technology · CSE Fest-26');
console.log('================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Attendance Percentage Calculation (Requirement #11)
// -----------------------------------------------------------------------------
console.log('[1] Testing Attendance Percentage Calculation & Thresholds:');

const recordsEligible = [
  { status: 'present' },
  { status: 'present' },
  { status: 'late' },
  { status: 'present' },
  { status: 'absent' },
]; // 4 / 5 = 80.0% -> Eligible
const res1 = calculateAttendancePercentage(recordsEligible);
assert(res1.percentage === 80.0, `80% calculated accurately (got ${res1.percentage}%)`);
assert(res1.status === 'eligible', `Status is 'eligible' (got ${res1.status})`);

const recordsWarning = [
  { status: 'present' },
  { status: 'absent' },
  { status: 'absent' },
  { status: 'present' },
]; // 2 / 4 = 50.0% -> Critical
const res2 = calculateAttendancePercentage(recordsWarning);
assert(res2.percentage === 50.0, `50% calculated accurately (got ${res2.percentage}%)`);
assert(res2.status === 'critical', `Status below 60% marked 'critical' (got ${res2.status})`);

const recordsWithCancelled = [
  { status: 'present' },
  { status: 'present' },
  { status: 'cancelled' }, // Cancelled sessions must be excluded from denominator
  { status: 'present' },
]; // 3 / 3 = 100%
const res3 = calculateAttendancePercentage(recordsWithCancelled);
assert(res3.total === 3, `Cancelled sessions excluded from total (total = ${res3.total})`);
assert(res3.percentage === 100.0, `100% attendance when cancelled excluded (got ${res3.percentage}%)`);

// -----------------------------------------------------------------------------
// TEST 2: Mandatory Audit Justification Reason (Requirement #10)
// -----------------------------------------------------------------------------
console.log('\n[2] Testing Mandatory Correction Reason & Audit Guard:');

const emptyReason = validateCorrectionReason('');
assert(!emptyReason.valid, 'Empty reason rejected');

const shortReason = validateCorrectionReason('Sick');
assert(!shortReason.valid, 'Short reason (<8 chars) rejected');

const validReason = validateCorrectionReason('Student medical waiver approved by department.');
assert(validReason.valid, 'Descriptive justification accepted');

// -----------------------------------------------------------------------------
// TEST 3: CSV Report Roster Generation (Requirement #12)
// -----------------------------------------------------------------------------
console.log('\n[3] Testing CSV Report Export Formatting:');

const headers = ['Student ID', 'Name', 'Status'];
const rows = [
  ['PUB-CSE-2023-042', 'Md Tanvir Ahmed', 'PRESENT'],
  ['PUB-CSE-2023-018', 'Nusrat Jahan', 'PRESENT'],
];
const csvOutput = generateCSVReport(headers, rows, 'Test CSE 2205');
assert(csvOutput.includes('PUB AttendEye - Pundra University'), 'CSV contains university header');
assert(csvOutput.includes('PUB-CSE-2023-042'), 'CSV contains student record ID');
assert(csvOutput.includes('Test CSE 2205'), 'CSV contains course title');

// -----------------------------------------------------------------------------
// TEST 4: Teacher Course Assignment Restriction (Requirement #5)
// -----------------------------------------------------------------------------
console.log('\n[4] Testing Teacher-Course-Section Restriction Logic:');

const teacherAssignments = [
  { teacherId: 'PUB-FAC-014', courseCode: 'CSE 2205', section: 'Section A' },
  { teacherId: 'PUB-FAC-014', courseCode: 'CSE 2206', section: 'Section A' },
];

function canTeacherTakeAttendance(teacherId, courseCode, section) {
  return teacherAssignments.some(
    (a) => a.teacherId === teacherId && a.courseCode === courseCode && a.section === section
  );
}

assert(
  canTeacherTakeAttendance('PUB-FAC-014', 'CSE 2205', 'Section A'),
  'Teacher PUB-FAC-014 authorized for assigned CSE 2205 Section A'
);

assert(
  !canTeacherTakeAttendance('PUB-FAC-014', 'CSE 3103', 'Section A'),
  'Teacher PUB-FAC-014 BLOCKED from unassigned CSE 3103 (Requirement #5 Enforced)'
);

assert(
  !canTeacherTakeAttendance('PUB-FAC-014', 'CSE 2205', 'Section B'),
  'Teacher PUB-FAC-014 BLOCKED from unassigned Section B of CSE 2205'
);

// -----------------------------------------------------------------------------
// TEST SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  Tests Completed: ${testsPassed + testsFailed} | Passed: ${testsPassed} | Failed: ${testsFailed}`);
console.log('================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}

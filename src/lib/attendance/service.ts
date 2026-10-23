import type { AttendanceRecord, AttendanceAuditLog } from '../../types/database.types';

/**
 * Attendance Percentage & Academic Standing Calculation
 * -------------------------------------------------------------
 * Rule (Requirement #11):
 * Attendance percentage = (attended eligible sessions / total eligible sessions) * 100
 *
 * Rules:
 * - 'present' & 'late': Counted as attended.
 * - 'absent': Counted as unattended.
 * - 'excused': Authorized academic waiver (does not penalize student).
 * - Cancelled sessions: Excluded from eligible sessions denominator.
 * - If total eligible sessions = 0: Returns 100.0% (no missed sessions).
 */
export function calculateAttendancePercentage(
  records: { status: string }[],
  warningThreshold = 75.0,
  criticalThreshold = 60.0
): {
  percentage: number;
  attended: number;
  total: number;
  status: 'eligible' | 'warning' | 'critical';
} {
  const eligibleRecords = records.filter((r) => r.status !== 'cancelled');
  
  if (eligibleRecords.length === 0) {
    return {
      percentage: 100.0,
      attended: 0,
      total: 0,
      status: 'eligible',
    };
  }

  // Count attended (present, late, or excused)
  const attendedCount = eligibleRecords.filter(
    (r) => r.status === 'present' || r.status === 'late' || r.status === 'excused'
  ).length;

  const totalCount = eligibleRecords.length;
  const percentage = Number(((attendedCount / totalCount) * 100).toFixed(1));

  let status: 'eligible' | 'warning' | 'critical' = 'eligible';
  if (percentage < criticalThreshold) {
    status = 'critical';
  } else if (percentage < warningThreshold) {
    status = 'warning';
  }

  return {
    percentage,
    attended: attendedCount,
    total: totalCount,
    status,
  };
}

/**
 * Generate CSV Roster Content for Course or Session
 * (Requirement #12)
 */
export function generateCSVReport(
  headers: string[],
  rows: (string | number)[][],
  reportTitle: string
): string {
  const meta = [
    `"PUB AttendEye - Pundra University of Science & Technology"`,
    `"Report: ${reportTitle}"`,
    `"Generated: ${new Date().toISOString()}"`,
    `""`,
  ].join('\n');

  const headerLine = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  const rowLines = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return `${meta}\n${headerLine}\n${rowLines}`;
}

/**
 * Validate Mandatory Correction Reason (Requirement #10)
 */
export function validateCorrectionReason(reason: string): { valid: boolean; error?: string } {
  if (!reason || !reason.trim()) {
    return {
      valid: false,
      error: 'A mandatory justification reason is required for any manual attendance modification.',
    };
  }
  if (reason.trim().length < 8) {
    return {
      valid: false,
      error: 'Please provide a descriptive reason (at least 8 characters) for audit tracking.',
    };
  }
  return { valid: true };
}

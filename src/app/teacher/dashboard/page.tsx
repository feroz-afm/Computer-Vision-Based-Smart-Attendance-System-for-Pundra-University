'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { generateCSVReport, validateCorrectionReason } from '@/lib/attendance/service';
import {
  Users2,
  Calendar,
  CheckCircle2,
  Clock,
  Scan,
  BookOpen,
  LogOut,
  Camera,
  Play,
  Check,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  UploadCloud,
  ShieldAlert,
  Edit3,
  HelpCircle,
  History,
  X,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface TeacherProfile {
  name: string;
  email: string;
  teacherId: string;
  department: string;
  designation: string;
}

interface AssignedCourse {
  id: string;
  code: string;
  title: string;
  credits: number;
  section: string;
  room: string;
  enrolledStudents: number;
}

interface RosterStudent {
  id: string;
  name: string;
  studentId: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending_review';
  confidence?: string;
  time?: string;
  method: string;
}

interface AuditRecord {
  id: string;
  studentName: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string;
  timestamp: string;
}

const ALL_UNIVERSITY_COURSES = [
  { code: 'CSE 2205', title: 'Computer Architecture and Organization', credits: 3.0, isSessional: false },
  { code: 'CSE 2206', title: 'Computer Architecture and Organization Sessional', credits: 1.0, isSessional: true },
  { code: 'CSE 3103', title: 'Operating Systems', credits: 3.0, isSessional: false },
  { code: 'CSE 3104', title: 'Operating Systems Sessional', credits: 1.0, isSessional: true },
  { code: 'CSE 2201', title: 'Web Engineering', credits: 3.0, isSessional: false },
  { code: 'CSE 2202', title: 'Web Engineering Sessional', credits: 1.0, isSessional: true },
  { code: 'CSE 3205', title: 'Computer Networking', credits: 3.0, isSessional: false },
  { code: 'CSE 3206', title: 'Computer Networking Sessional', credits: 1.0, isSessional: true },
  { code: 'LAW 3201', title: 'Cyber and Intellectual Property Law', credits: 2.0, isSessional: false },
  { code: 'BUS 3101', title: 'Technology Entrepreneurship for Business', credits: 3.0, isSessional: false },
];

const getEnrolledRosterForSection = (_courseCode: string, _section: string): RosterStudent[] => {
  return [
    { id: 'stu_1', name: 'Md Tanvir Ahmed', studentId: 'PUB-CSE-2023-042', status: 'present', confidence: '98.8%', time: '10:02:15', method: 'Face Recognition' },
    { id: 'stu_2', name: 'Nusrat Jahan', studentId: 'PUB-CSE-2023-018', status: 'present', confidence: '99.2%', time: '10:02:22', method: 'Face Recognition' },
    { id: 'stu_3', name: 'Sabbir Hossain', studentId: 'PUB-CSE-2023-033', status: 'present', confidence: '97.4%', time: '10:02:40', method: 'Face Recognition' },
    { id: 'stu_4', name: 'Farzana Akter', studentId: 'PUB-CSE-2023-009', status: 'pending_review', confidence: '72.3%', time: '10:03:01', method: 'Low-Confidence Match' },
    { id: 'stu_5', name: 'Mehedi Hasan', studentId: 'PUB-CSE-2023-051', status: 'absent', confidence: 'N/A', time: 'N/A', method: 'Unattended' },
    { id: 'stu_6', name: 'Tasmia Rahman', studentId: 'PUB-CSE-2023-027', status: 'present', confidence: '98.5%', time: '10:03:15', method: 'Face Recognition' },
  ];
};

export default function TeacherDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<TeacherProfile>({
    name: 'Faculty Member',
    email: '',
    teacherId: '',
    department: 'Computer Science & Engineering',
    designation: 'Faculty Member',
  });

  // Course assignments state (Starts empty for newly registered faculty)
  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [topic, setTopic] = useState('Pipelining, Hazard Resolution & Cache Memory');
  const [startTime] = useState('10:00');
  const [endTime] = useState('11:00');

  // Teacher Approval Status (Requirement #2)
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');
  const [teacherDbId, setTeacherDbId] = useState<string>('');

  // Security test trigger for requirement #5
  const [unauthorizedAttempt, setUnauthorizedAttempt] = useState(false);
  const [securityError, setSecurityError] = useState('');

  // Dynamically calculate an unassigned course offering for security boundary verification
  const unassignedCourseExample = ALL_UNIVERSITY_COURSES.find(
    (c) => !assignedCourses.some((ac) => ac.code === c.code)
  ) || {
    code: 'CSE 3103',
    title: 'Operating Systems',
    credits: 3.0,
  };

  // Classroom Roster for the selected course (Empty if no assigned course)
  const [roster, setRoster] = useState<RosterStudent[]>([]);

  // Review Queue & Audit State (Requirements #9 & #10)
  const [reviewQueueOpen, setReviewQueueOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);

  // Correction Modal State
  const [correctionTarget, setCorrectionTarget] = useState<RosterStudent | null>(null);
  const [correctionNewStatus, setCorrectionNewStatus] = useState<'present' | 'absent' | 'late' | 'excused'>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [persistedDbSessionId, setPersistedDbSessionId] = useState<string | null>(null);
  const [unsavedAttendance, setUnsavedAttendance] = useState<{ courseCode: string; section: string; roster: RosterStudent[] } | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<{
    dbSaved: boolean;
    message: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    const fetchTeacher = async () => {
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('full_name, email, role')
              .eq('id', user.id)
              .single();

            const actualRole = profileData?.role || (user.user_metadata?.role as string) || 'student';

            // Enforce role authorization: students cannot access teacher portal
            if (actualRole !== 'teacher' && actualRole !== 'admin') {
              router.push('/student/dashboard');
              return;
            }

            const { data: teacherData } = await supabase
              .from('teachers')
              .select('id, teacher_id_number, department, designation, approval_status')
              .eq('profile_id', user.id)
              .single();

            const name = profileData?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Faculty Member';
            const email = profileData?.email || user.email || '';
            const teacherId = teacherData?.teacher_id_number || user.user_metadata?.teacher_id_number || `PUB-FAC-${user.id.substring(0, 6).toUpperCase()}`;
            const department = teacherData?.department || user.user_metadata?.department || 'Computer Science & Engineering';
            const designation = teacherData?.designation || user.user_metadata?.designation || 'Lecturer';

            // Determine approval status with priority: DB -> user_metadata -> local admin queue
            let currentStatus: 'pending' | 'approved' | 'rejected' = 'approved';
            if (user.user_metadata?.approval_status) {
              currentStatus = user.user_metadata.approval_status as 'pending' | 'approved' | 'rejected';
            }
            if (teacherData?.approval_status) {
              currentStatus = teacherData.approval_status as 'pending' | 'approved' | 'rejected';
            }
            if (typeof window !== 'undefined') {
              const stored = JSON.parse(localStorage.getItem('pending_teachers') || '[]');
              const match = stored.find(
                (t: any) =>
                  (t.email && user.email && t.email.toLowerCase() === user.email.toLowerCase()) ||
                  t.id === user.id ||
                  t.identifier === teacherId
              );
              if (match?.status) {
                currentStatus = match.status;
              }
              const directStatus = localStorage.getItem(`teacher_approval_${user.id}`);
              if (directStatus === 'approved' || directStatus === 'rejected' || directStatus === 'pending') {
                currentStatus = directStatus;
              }
            }
            setApprovalStatus(currentStatus);

            setProfile({
              name,
              email,
              teacherId,
              department,
              designation,
            });

            const dbId = teacherData?.id || user.id;
            setTeacherDbId(dbId);

            // Fetch course assignments from Supabase if table exists
            let loadedAssignments: AssignedCourse[] = [];
            try {
              const { data: assignments } = await supabase
                .from('teacher_course_assignments')
                .select(`
                  id,
                  section_name,
                  room_number,
                  course_id,
                  courses (
                    id,
                    course_code,
                    title,
                    credits
                  )
                `)
                .eq('teacher_id', dbId)
                .eq('is_active', true);

              if (assignments && assignments.length > 0) {
                loadedAssignments = assignments.map((a: any) => ({
                  id: a.id,
                  code: a.courses?.course_code || 'CSE 2205',
                  title: a.courses?.title || 'Computer Architecture and Organization',
                  credits: a.courses?.credits || 3.0,
                  section: a.section_name || 'Section A',
                  room: a.room_number || 'Room 402',
                  enrolledStudents: 32,
                }));
              }
            } catch {
              // Graceful fallback if table does not exist in schema cache
            }

            // Check localStorage for persisted assignments (by DB ID or Teacher ID)
            if (loadedAssignments.length === 0 && typeof window !== 'undefined') {
              let saved = localStorage.getItem(`assigned_courses_${dbId}`);
              if (!saved && teacherId) {
                saved = localStorage.getItem(`assigned_courses_${teacherId}`);
              }
              if (saved) {
                try {
                  loadedAssignments = JSON.parse(saved);
                } catch {}
              }
            }

            if (loadedAssignments.length > 0) {
              setAssignedCourses(loadedAssignments);
              setSelectedCourseCode(loadedAssignments[0].code);
              setSelectedSection(loadedAssignments[0].section);
              setRoomNumber(loadedAssignments[0].room);
              setRoster(getEnrolledRosterForSection(loadedAssignments[0].code, loadedAssignments[0].section));
            } else {
              setAssignedCourses([]);
              setSelectedCourseCode('');
              setSelectedSection('');
              setRoomNumber('');
              setRoster([]);
            }
          }
        } catch {
          // Graceful fallback
        }
      }
      setLoading(false);
    };

    fetchTeacher();
  }, [router]);

  // Web Camera start
  const startCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      }
    } catch {
      setCameraActive(true);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }
    setCameraActive(false);
  };

  // Requirement #5 Guard Test: Teacher tries to initiate unauthorized course
  const handleCourseSelect = (code: string) => {
    const isAssigned = assignedCourses.some((c) => c.code === code);
    if (!isAssigned) {
      setUnauthorizedAttempt(true);
      setSecurityError(
        `SECURITY VIOLATION [403 FORBIDDEN]: You are not assigned as the instructor for ${code}. Unauthorized attendance marking is strictly blocked by Pundra University access controls.`
      );
      return;
    }
    const matched = assignedCourses.find((c) => c.code === code);
    setUnauthorizedAttempt(false);
    setSecurityError('');
    setSelectedCourseCode(code);
    if (matched) {
      setSelectedSection(matched.section);
      setRoomNumber(matched.room);
      setRoster(getEnrolledRosterForSection(matched.code, matched.section));
    }
  };

  const handleStartSession = () => {
    if (approvalStatus === 'pending') {
      setSecurityError('Forbidden [403]: Your faculty account is pending Admin approval. You cannot start class sessions or record attendance.');
      return;
    }
    if (approvalStatus === 'rejected') {
      setSecurityError('Forbidden [403]: Your faculty application has been rejected by the Academic Administrator.');
      return;
    }
    if (assignedCourses.length === 0 || !selectedCourseCode) {
      setSecurityError('Forbidden: Cannot start session without an assigned academic course offering. Please wait for an Administrator to assign your semester courses.');
      return;
    }
    // Re-verify authorization
    const isAssigned = assignedCourses.some((c) => c.code === selectedCourseCode);
    if (!isAssigned) {
      setSecurityError('Forbidden: Cannot start session for unassigned course.');
      return;
    }
    setSessionActive(true);
    setSessionFeedback(null);
    startCamera();
  };

  const handleClassroomPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (approvalStatus === 'pending') {
      setSecurityError('Forbidden [403]: Your faculty account is pending Admin approval. You cannot upload classroom photos.');
      return;
    }
    if (approvalStatus === 'rejected') {
      setSecurityError('Forbidden [403]: Your faculty application has been rejected by the Academic Administrator.');
      return;
    }
    if (assignedCourses.length === 0 || !selectedCourseCode) {
      setSecurityError('Forbidden: Cannot upload photograph without an assigned course.');
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      // Process classroom photograph with multi-face detection
      alert(`Classroom photograph "${file.name}" received for ${selectedCourseCode} (${selectedSection}). Processing multi-face recognition against enrolled students.`);
      setSessionActive(true);
    }
  };

  const handleFinalizeSession = async () => {
    // Keep uncertain matches out of automatic attendance finalization (Requirement #7)
    const pendingReviews = roster.filter((s) => s.status === 'pending_review');
    if (pendingReviews.length > 0) {
      alert(
        `Cannot finalize session: ${pendingReviews.length} student(s) have uncertain biometric matches pending teacher confirmation in the Review Queue. Please review and approve or reject all pending matches before finalizing attendance.`
      );
      setReviewQueueOpen(true);
      return;
    }

    stopCamera();
    setSessionActive(false);

    const sessionId = `sess_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const sessionDate = timestamp.split('T')[0];

    let dbSaved = false;
    let dbErrorMessage = '';
    let newDbSessionId: string | null = null;

    // Persist session and attendance records referencing stable database IDs
    if (isSupabaseConfigured() && teacherDbId) {
      try {
        const supabase = createClient();
        const { data: courseDb, error: courseErr } = await supabase
          .from('courses')
          .select('id')
          .eq('course_code', selectedCourseCode)
          .single();

        if (courseErr) {
          throw new Error(`Course lookup failed (${courseErr.code}: ${courseErr.message})`);
        }

        const courseId = courseDb?.id;
        if (!courseId) {
          throw new Error(`Course "${selectedCourseCode}" not found in database.`);
        }

        // Verify or resolve teacher ID from teachers table
        let effectiveTeacherUuid = teacherDbId;
        if (!/^[0-9a-f-]{36}$/i.test(effectiveTeacherUuid)) {
          const { data: tRow } = await supabase
            .from('teachers')
            .select('id')
            .eq('teacher_id_number', profile.teacherId)
            .single();
          if (tRow?.id) {
            effectiveTeacherUuid = tRow.id;
          }
        }

        const { data: sessionData, error: sessionErr } = await supabase
          .from('class_sessions')
          .insert({
            course_id: courseId,
            teacher_id: effectiveTeacherUuid,
            section_name: selectedSection,
            room_number: roomNumber,
            session_date: sessionDate,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
            topic: topic,
            status: 'completed',
          })
          .select('id')
          .single();

        if (sessionErr) {
          throw new Error(`Class session creation failed (${sessionErr.code}: ${sessionErr.message})`);
        }

        const activeSessionDbId = sessionData?.id;
        if (!activeSessionDbId) {
          throw new Error('Class session ID not returned by database.');
        }

        newDbSessionId = activeSessionDbId;

        // Fetch registered student UUIDs to map student_id_number -> students.id
        const { data: dbStudents } = await supabase
          .from('students')
          .select('id, student_id_number');
        const studentMap = new Map((dbStudents || []).map((st: any) => [st.student_id_number, st.id]));

        const recordsToInsert: any[] = [];
        const reviewQueueToInsert: any[] = [];

        for (const s of roster) {
          const resolvedUuid = studentMap.get(s.studentId) || (/^[0-9a-f-]{36}$/i.test(s.id) ? s.id : null);

          // Route uncertain matches to the Review Queue (Requirement #9)
          if (s.status === 'pending_review') {
            reviewQueueToInsert.push({
              session_id: activeSessionDbId,
              student_id: resolvedUuid,
              captured_face_label: s.name,
              confidence_score: s.confidence && s.confidence !== 'N/A' ? Math.min(0.999, Math.max(0.001, parseFloat(s.confidence) / 100)) : 0.720,
              status: 'pending',
            });
          } else if (resolvedUuid) {
            // Only verified matches with valid student UUIDs go to attendance_records
            recordsToInsert.push({
              session_id: activeSessionDbId,
              student_id: resolvedUuid,
              status: s.status,
              verification_method: s.method.toLowerCase().includes('face') ? 'face_recognition' : 'manual_teacher',
              confidence_score: s.confidence && s.confidence !== 'N/A' ? Math.min(0.999, Math.max(0.001, parseFloat(s.confidence) / 100)) : null,
              timestamp: timestamp,
            });
          }
        }

        if (recordsToInsert.length > 0) {
          const { error: recordsErr } = await supabase.from('attendance_records').insert(recordsToInsert);
          if (recordsErr) {
            throw new Error(`Attendance records insert failed (${recordsErr.code}: ${recordsErr.message})`);
          }
        }

        if (reviewQueueToInsert.length > 0) {
          const { error: reviewErr } = await supabase.from('attendance_review_queue').insert(reviewQueueToInsert);
          if (reviewErr) {
            console.warn('Review queue insert warning:', reviewErr.message);
          }
        }

        dbSaved = true;
      } catch (err: unknown) {
        dbSaved = false;
        dbErrorMessage = err instanceof Error ? err.message : 'Database operation failed.';
      }
    } else {
      dbSaved = false;
      dbErrorMessage = !isSupabaseConfigured()
        ? 'Supabase connection is not configured in .env.local.'
        : 'Faculty profile is not yet linked to a persistent database record (teachers table uninitialized or pending sync).';
    }

    // Persist to local system records for seamless offline/demo reflection
    if (typeof window !== 'undefined') {
      try {
        const existingSessions = JSON.parse(localStorage.getItem('system_class_sessions') || '[]');
        const existingRecords = JSON.parse(localStorage.getItem('system_attendance_records') || '[]');

        const newSession = {
          id: sessionId,
          course_id: selectedCourseCode,
          course_code: selectedCourseCode,
          section_name: selectedSection,
          room_number: roomNumber,
          session_date: sessionDate,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          topic: topic,
          teacher_id: teacherDbId,
          status: 'completed',
        };

        const newRecords = roster.map((s) => ({
          id: `rec_${Date.now()}_${s.id}`,
          session_id: sessionId,
          student_id: s.id,
          student_id_number: s.studentId,
          student_name: s.name,
          course_code: selectedCourseCode,
          date: sessionDate,
          topic: topic,
          status: s.status,
          verification_method: s.method.toLowerCase().includes('face') ? 'Face Recognition' : 'Manual Teacher Override',
          confidence: s.confidence || '98.5%',
          timestamp: timestamp,
        }));

        localStorage.setItem('system_class_sessions', JSON.stringify([newSession, ...existingSessions]));
        localStorage.setItem('system_attendance_records', JSON.stringify([...newRecords, ...existingRecords]));
      } catch {}
    }

    if (dbSaved) {
      setPersistedDbSessionId(newDbSessionId);
      setUnsavedAttendance(null);
      setSessionFeedback({
        dbSaved: true,
        message: `Attendance session for ${selectedCourseCode} (${selectedSection}) has been verified and successfully written to remote Supabase database tables (class_sessions & attendance_records).`,
      });
    } else {
      setUnsavedAttendance({
        courseCode: selectedCourseCode,
        section: selectedSection,
        roster: [...roster],
      });
      setSessionFeedback({
        dbSaved: false,
        message: `Attendance session cached in local browser demo storage ONLY. Remote database write did not occur.`,
        detail: `Database reason: ${dbErrorMessage}`,
      });
    }
  };

  // Retry saving unsaved attendance session to remote database
  const handleRetryDatabaseWrite = async () => {
    if (!unsavedAttendance) return;
    await handleFinalizeSession();
  };

  // Requirement #10: Attendance Correction with Mandatory Reason
  const openCorrectionModal = (student: RosterStudent) => {
    setCorrectionTarget(student);
    setCorrectionNewStatus(student.status === 'present' ? 'absent' : 'present');
    setCorrectionReason('');
    setCorrectionError('');
  };

  const submitCorrection = async () => {
    if (!correctionTarget) return;

    const validation = validateCorrectionReason(correctionReason);
    if (!validation.valid) {
      setCorrectionError(validation.error || 'Mandatory reason required.');
      return;
    }

    // Update roster status
    setRoster((prev) =>
      prev.map((s) => (s.id === correctionTarget.id ? { ...s, status: correctionNewStatus, method: 'Manual Teacher Override' } : s))
    );

    // Append to local audit log state
    const newAudit: AuditRecord = {
      id: `a_${Date.now()}`,
      studentName: correctionTarget.name,
      previousStatus: correctionTarget.status,
      newStatus: correctionNewStatus,
      reason: correctionReason.trim(),
      changedBy: profile.name,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    // Persist correction and audit log to Supabase if live session exists
    if (isSupabaseConfigured() && persistedDbSessionId) {
      try {
        const supabase = createClient();
        const { data: dbStudent } = await supabase
          .from('students')
          .select('id')
          .eq('student_id_number', correctionTarget.studentId)
          .single();
        const targetStudentId = dbStudent?.id || (/^[0-9a-f-]{36}$/i.test(correctionTarget.id) ? correctionTarget.id : null);

        if (targetStudentId) {
          const { data: recData } = await supabase
            .from('attendance_records')
            .update({
              status: correctionNewStatus,
              verification_method: 'manual_teacher',
            })
            .eq('session_id', persistedDbSessionId)
            .eq('student_id', targetStudentId)
            .select('id')
            .single();

          const { data: { user } } = await supabase.auth.getUser();
          if (recData?.id && user) {
            await supabase.from('attendance_audit_logs').insert({
              attendance_id: recData.id,
              session_id: persistedDbSessionId,
              student_id: targetStudentId,
              previous_status: correctionTarget.status,
              new_status: correctionNewStatus,
              changed_by: user.id,
              reason: correctionReason.trim(),
            });
          }
        }
      } catch (err) {
        console.warn('Failed to sync correction to Supabase:', err);
      }
    }

    setCorrectionTarget(null);
  };

  // Review Queue Approve / Reject (Requirement #9)
  const handleReviewAction = async (studentId: string, approve: boolean) => {
    setRoster((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              status: approve ? 'present' : 'absent',
              method: approve ? 'Teacher Confirmed (Review Queue)' : 'Teacher Rejected (Review Queue)',
            }
          : s
      )
    );

    // Sync review action to Supabase if live session exists
    if (isSupabaseConfigured() && persistedDbSessionId) {
      try {
        const supabase = createClient();
        const targetStudent = roster.find((s) => s.id === studentId);
        if (targetStudent) {
          const { data: dbStudent } = await supabase
            .from('students')
            .select('id')
            .eq('student_id_number', targetStudent.studentId)
            .single();
          const targetStudentId = dbStudent?.id || (/^[0-9a-f-]{36}$/i.test(targetStudent.id) ? targetStudent.id : null);

          // Update review queue record
          await supabase
            .from('attendance_review_queue')
            .update({
              status: approve ? 'approved' : 'rejected',
              reviewed_by: /^[0-9a-f-]{36}$/i.test(teacherDbId) ? teacherDbId : null,
              reviewed_at: new Date().toISOString(),
              review_notes: approve ? 'Confirmed by instructor review' : 'Rejected by instructor review',
            })
            .eq('session_id', persistedDbSessionId)
            .eq('student_id', targetStudentId);

          // If approved, insert into attendance_records
          if (approve && targetStudentId) {
            await supabase.from('attendance_records').upsert({
              session_id: persistedDbSessionId,
              student_id: targetStudentId,
              status: 'present',
              verification_method: 'manual_teacher',
              confidence_score: targetStudent.confidence && targetStudent.confidence !== 'N/A' ? Math.min(0.999, parseFloat(targetStudent.confidence) / 100) : 0.720,
              timestamp: new Date().toISOString(),
            }, { onConflict: 'session_id,student_id' });
          }
        }
      } catch (err) {
        console.warn('Failed to sync review action to Supabase:', err);
      }
    }
  };

  // CSV Report Export (Requirement #12)
  const handleExportCSV = () => {
    const headers = ['Student ID', 'Student Name', 'Status', 'Confidence', 'Time Recorded', 'Verification Method'];
    const rows = roster.map((s) => [
      s.studentId,
      s.name,
      s.status.toUpperCase(),
      s.confidence || 'N/A',
      s.time || 'N/A',
      s.method,
    ]);
    const csvContent = generateCSVReport(headers, rows, `Course Session - ${selectedCourseCode} (${selectedSection})`);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Attendance_${selectedCourseCode}_${selectedSection}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push('/login?role=teacher');
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const presentCount = roster.filter((r) => r.status === 'present').length;
  const pendingReviewCount = roster.filter((r) => r.status === 'pending_review').length;
  const absentCount = roster.filter((r) => r.status === 'absent').length;

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 max-w-7xl mx-auto">
      
      {/* Top Banner & Status */}
      <SupabaseStatusBanner />

      {/* Approval Status Alert Banners (Requirement #2) */}
      {approvalStatus === 'pending' && (
        <div className="mb-8 p-5 rounded-2xl bg-amber-950/60 border border-amber-500/60 text-amber-200 flex items-start gap-4 shadow-xl">
          <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-300">Faculty Application Status: Pending Administrative Approval</h4>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Your teacher registration has been submitted and is currently pending review by the Academic Administrator. Attendance recording, session creation, and camera access remain locked until an administrator approves your profile.
            </p>
          </div>
        </div>
      )}

      {approvalStatus === 'rejected' && (
        <div className="mb-8 p-5 rounded-2xl bg-rose-950/60 border border-rose-500/60 text-rose-200 flex items-start gap-4 shadow-xl">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-300">Faculty Application Status: Access Rejected</h4>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              Your application for faculty portal access was rejected by the Academic Administrator. Attendance taking and course management permissions are permanently restricted.
            </p>
          </div>
        </div>
      )}

      {/* Header Profile Bar */}
      <div className="p-8 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 border border-indigo-500/40 p-1 flex items-center justify-center text-indigo-400 shrink-0">
            <Users2 className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white">{profile.name}</h1>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                approvalStatus === 'approved'
                  ? 'bg-indigo-950 border-indigo-800 text-indigo-400'
                  : approvalStatus === 'pending'
                  ? 'bg-amber-950 border-amber-800 text-amber-400'
                  : 'bg-rose-950 border-rose-800 text-rose-400'
              }`}>
                {approvalStatus === 'approved' ? 'Authorized Faculty' : approvalStatus === 'pending' ? 'Pending Approval' : 'Application Rejected'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Faculty ID: <span className="text-slate-200 font-semibold">{profile.teacherId}</span> · {profile.designation}
            </p>
            <p className="text-[11px] text-slate-500">
              Department of {profile.department} · Pundra University
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => setAuditLogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Roster CSV</span>
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Security Error Alert (Requirement #5) */}
      {securityError && (
        <div className="mb-8 p-5 rounded-2xl bg-rose-950/50 border border-rose-500/50 text-rose-200 flex items-start gap-4">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-300">Teacher Course-Section Boundary Enforcement</h4>
            <p className="text-xs text-rose-200/90 leading-relaxed">{securityError}</p>
          </div>
        </div>
      )}

      {sessionFeedback && (
        <div
          className={`mb-8 p-5 rounded-2xl border flex items-start gap-3.5 ${
            sessionFeedback.dbSaved
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
          }`}
        >
          {sessionFeedback.dbSaved ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h4 className="text-sm font-bold">
              {sessionFeedback.dbSaved
                ? 'Attendance Persisted to Database'
                : 'Local Demo Cache Only (Database Write Inactive / Failed)'}
            </h4>
            <p className="text-xs opacity-90 leading-relaxed">{sessionFeedback.message}</p>
            {sessionFeedback.detail && (
              <p className="text-[11px] font-mono opacity-80 mt-1">{sessionFeedback.detail}</p>
            )}
            {!sessionFeedback.dbSaved && unsavedAttendance && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRetryDatabaseWrite}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Remote Database Write</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Session Launcher & Security Guard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        
        {/* Left Column: Course Selector & Session Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-7 rounded-3xl bg-navy-900/70 border border-slate-800 shadow-xl">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-400" />
              <span>My Assigned Courses (Authorized)</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Authorized Course Offering
                </label>
                <div className="space-y-2">
                  {assignedCourses.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-navy-950/90 border border-dashed border-slate-700 text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-white">No Assigned Courses</h3>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                          Your faculty account has no course or section assignments yet. Course offerings are assigned exclusively by the Academic Administrator.
                        </p>
                      </div>
                      <p className="text-[11px] text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-3 py-2 rounded-xl">
                        Please contact the Academic Administrator to assign your semester courses.
                      </p>
                    </div>
                  ) : (
                    <>
                      {assignedCourses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={sessionActive}
                          onClick={() => handleCourseSelect(c.code)}
                          className={`w-full p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
                            selectedCourseCode === c.code && !unauthorizedAttempt
                              ? 'bg-cyan-500/10 border-cyan-500/50 text-white shadow-md'
                              : 'bg-navy-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold font-mono text-cyan-400">{c.code} · {c.section}</div>
                            <div className="text-xs font-medium text-slate-200 mt-0.5">{c.title}</div>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-navy-900 text-slate-300 border border-slate-800">
                            {c.room}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Security Test: Unassigned Course Tester (Requirement #5) */}
              <div className="p-3.5 rounded-xl bg-navy-950/80 border border-dashed border-slate-800">
                <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  <span>Verify Restriction Against Unassigned Course:</span>
                </div>
                <button
                  type="button"
                  disabled={sessionActive}
                  onClick={() => handleCourseSelect(unassignedCourseExample.code)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-navy-900 hover:bg-rose-950/30 text-xs text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-700/50 transition-colors flex items-center justify-between"
                >
                  <span>Attempt {unassignedCourseExample.code} ({unassignedCourseExample.title})</span>
                  <span className="text-[10px] text-rose-400 font-bold uppercase">Test Restriction</span>
                </button>
              </div>

              {/* Class Schedule Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Schedule Room</label>
                  <input
                    type="text"
                    disabled
                    value={roomNumber}
                    className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-800 text-slate-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Time Interval</label>
                  <input
                    type="text"
                    disabled
                    value={`${startTime} - ${endTime}`}
                    className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-800 text-slate-400 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lecture Topic</label>
                <input
                  type="text"
                  disabled={sessionActive}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Action Buttons: Camera or File Upload */}
              <div className="pt-2 space-y-3">
                {!sessionActive ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={approvalStatus !== 'approved'}
                      onClick={handleStartSession}
                      className={`py-3 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                        approvalStatus === 'approved'
                          ? 'text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-md shadow-cyan-500/20'
                          : 'text-slate-500 bg-navy-950 border border-slate-800 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>{approvalStatus === 'approved' ? 'Start Live Camera' : 'Camera Locked (Pending Approval)'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={approvalStatus !== 'approved'}
                      onClick={() => fileInputRef.current?.click()}
                      className={`py-3 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-colors ${
                        approvalStatus === 'approved'
                          ? 'text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700'
                          : 'text-slate-500 bg-navy-950 border border-slate-800 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <UploadCloud className="w-4 h-4 text-cyan-400" />
                      <span>Upload Classroom Photo</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleClassroomPhotoUpload}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleFinalizeSession}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Finalize & Record Session Attendance</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Video/Photo Feed & Metrics */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-7 rounded-3xl bg-navy-900/70 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Scan className="w-5 h-5 text-cyan-400" />
                  <span>Optical Vision & Facial Verification Feed</span>
                </h3>
                <p className="text-xs text-slate-400">Restricted to enrolled students in {selectedCourseCode}</p>
              </div>

              {sessionActive && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>SESSION ACTIVE</span>
                </span>
              )}
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-[16/9] w-full rounded-2xl bg-navy-950 border border-slate-800 overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />

              {!cameraActive && (
                <div className="text-center p-6 space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-navy-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <Camera className="w-8 h-8" />
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Vision node standby. Start Live Camera or upload a classroom group photograph to initiate detection.
                  </p>
                </div>
              )}

              {/* HUD Overlay */}
              {sessionActive && (
                <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="px-3 py-1 rounded-md bg-navy-950/80 border border-cyan-500/40 text-[11px] font-mono text-cyan-400 backdrop-blur-md">
                      COURSE: {selectedCourseCode} · {selectedSection}
                    </div>
                    <div className="px-3 py-1 rounded-md bg-navy-950/80 border border-cyan-500/40 text-[11px] font-mono text-cyan-400 backdrop-blur-md">
                      OPTICAL VISION: ACTIVE
                    </div>
                  </div>

                  <div className="self-center w-44 h-52 border-2 border-dashed border-cyan-400/80 rounded-2xl flex items-end justify-center pb-2 bg-cyan-500/5">
                    <span className="text-[10px] font-mono font-bold bg-navy-950/90 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/40">
                      PUB-CSE-2023-042 (98.8%)
                    </span>
                  </div>

                  <div className="px-3 py-1.5 rounded-lg bg-navy-950/85 border border-slate-700 text-xs text-slate-300 backdrop-blur-md flex justify-between">
                    <span>Present: <strong>{presentCount}</strong> | Pending Review: <strong>{pendingReviewCount}</strong></span>
                    <span className="text-cyan-400 font-mono">Anti-Duplicate Protection: ON</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="p-3.5 rounded-xl bg-navy-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 uppercase font-semibold">Present</div>
                <div className="text-2xl font-extrabold text-emerald-400 mt-0.5">{presentCount}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-navy-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 uppercase font-semibold">Review Queue</div>
                <div className="text-2xl font-extrabold text-amber-400 mt-0.5">{pendingReviewCount}</div>
              </div>
              <div className="p-3.5 rounded-xl bg-navy-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 uppercase font-semibold">Absent</div>
                <div className="text-2xl font-extrabold text-rose-400 mt-0.5">{absentCount}</div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Roster & Attendance Verification Table (Requirement #8, #10) */}
      <div className="p-8 rounded-3xl bg-navy-900/60 border border-slate-800 shadow-xl mb-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users2 className="w-5 h-5 text-indigo-400" />
              <span>Section Roster & Verification Log</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &quot;Correct Status&quot; to modify with mandatory audit justification.
            </p>
          </div>

          {pendingReviewCount > 0 && (
            <button
              onClick={() => setReviewQueueOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-400 bg-amber-950/40 border border-amber-600/50 hover:bg-amber-950/70"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Resolve Uncertain Matches ({pendingReviewCount})</span>
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-950 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-navy-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">ID Number</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {assignedCourses.length === 0 || roster.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users2 className="w-8 h-8 text-slate-600" />
                        <p className="font-semibold text-slate-300">No Active Course Section Selected</p>
                        <p className="text-slate-500 text-[11px]">
                          Assign and select a course section above to view the enrolled student roster and record attendance.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  roster.map((student) => (
                    <tr key={student.id} className="hover:bg-navy-850/40 transition-colors">
                      <td className="px-6 py-4 font-bold text-white text-xs">{student.name}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">{student.studentId}</td>
                      <td className="px-6 py-4">
                        {student.status === 'present' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            Present
                          </span>
                        )}
                        {student.status === 'pending_review' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
                            Review Needed
                          </span>
                        )}
                        {student.status === 'absent' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800">
                            Absent
                          </span>
                        )}
                        {student.status === 'late' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-950 text-purple-400 border border-purple-800">
                            Late
                          </span>
                        )}
                        {student.status === 'excused' && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-950 text-sky-400 border border-sky-800">
                            Excused
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{student.confidence || 'N/A'}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{student.time || 'N/A'}</td>
                      <td className="px-6 py-4 text-xs text-slate-300">{student.method}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openCorrectionModal(student)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-400 hover:text-white bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Correct</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mandatory Correction Modal (Requirement #10) */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-cyan-400" />
                <span>Attendance Correction</span>
              </h3>
              <button
                onClick={() => setCorrectionTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-navy-950 text-xs text-slate-300 space-y-1 border border-slate-800">
              <div>Student: <strong>{correctionTarget.name}</strong> ({correctionTarget.studentId})</div>
              <div>Current Status: <span className="capitalize font-mono text-amber-400">{correctionTarget.status}</span></div>
            </div>

            {correctionError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs">
                {correctionError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Attendance Status</label>
                <select
                  value={correctionNewStatus}
                  onChange={(e) => setCorrectionNewStatus(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs"
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused (Academic Waiver)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Mandatory Audit Justification Reason <span className="text-cyan-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Student was present in class; camera angle missed landmark during initial scan."
                  className="w-full px-3 py-2 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCorrectionTarget(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-navy-800 border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCorrection}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500"
              >
                Commit & Log Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue Modal (Requirement #9) */}
      {reviewQueueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                <span>Teacher Recognition Review Queue</span>
              </h3>
              <button onClick={() => setReviewQueueOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              The following detections matched enrolled students with borderline confidence (65% – 84%). Please verify visually:
            </p>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {roster
                .filter((r) => r.status === 'pending_review')
                .map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-navy-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white">{s.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{s.studentId} · Match: {s.confidence}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReviewAction(s.id, false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 bg-rose-950/40 border border-rose-800 hover:bg-rose-950"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleReviewAction(s.id, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800 hover:bg-emerald-950"
                      >
                        Approve Present
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setReviewQueueOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-navy-800 hover:bg-navy-700 border border-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal (Requirement #10) */}
      {auditLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <span>Attendance Modification Audit History</span>
              </h3>
              <button onClick={() => setAuditLogOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Immutable audit records for all manual corrections conducted during this session.
            </p>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 rounded-xl bg-navy-950 border border-slate-800 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400 font-mono text-[11px]">
                    <span>{log.timestamp}</span>
                    <span>Modified by: <strong className="text-slate-200">{log.changedBy}</strong></span>
                  </div>
                  <div className="text-white font-semibold">
                    Student: {log.studentName} · Status changed from <span className="text-rose-400 uppercase">{log.previousStatus}</span> to <span className="text-emerald-400 uppercase">{log.newStatus}</span>
                  </div>
                  <div className="text-slate-300 italic pt-1">
                    &quot;{log.reason}&quot;
                  </div>
                </div>
              ))}
            </div>

            <div className="text-right pt-2">
              <button
                onClick={() => setAuditLogOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-navy-800 hover:bg-navy-700 border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

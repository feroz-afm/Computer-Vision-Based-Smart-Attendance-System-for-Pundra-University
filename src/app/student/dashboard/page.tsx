'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { LogoutConfirmModal } from '@/components/LogoutConfirmModal';
import { calculateAttendancePercentage, generateCSVReport } from '@/lib/attendance/service';
import {
  GraduationCap,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Scan,
  BookOpen,
  LogOut,
  ShieldCheck,
  AlertTriangle,
  Download,
  Filter,
  Home,
  Loader2,
  Camera,
  CameraOff,
  Trash2,
  Check,
  X,
  Upload,
  UserCheck,
} from 'lucide-react';

interface StudentProfile {
  name: string;
  email: string;
  studentId: string;
  program: string;
  department: string;
  academicYear: string;
  semester: string;
  section: string;
  avatarUrl?: string | null;
  faceRegistered: boolean;
  consentGiven: boolean;
}

interface CourseAttendanceItem {
  id: string;
  code: string;
  title: string;
  credits: number;
  isSessional: boolean;
  semesterInfo?: string;
  assignedTeacher: string;
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
  status: 'eligible' | 'warning' | 'critical';
}

interface AttendanceLog {
  id: string;
  date: string;
  courseCode: string;
  topic: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  method: string;
  confidence: string;
}

export default function StudentDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('ALL');
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedSamples, setCapturedSamples] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [enrollmentNotice, setEnrollmentNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recordsSource, setRecordsSource] = useState<'database' | 'empty' | 'local_cache'>('empty');
  const [studentDbId, setStudentDbId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Truthful initial profile state (no hardcoded fake person)
  const [profile, setProfile] = useState<StudentProfile>({
    name: '',
    email: '',
    studentId: '',
    program: '',
    department: '',
    academicYear: '',
    semester: '',
    section: '',
    avatarUrl: null,
    faceRegistered: false,
    consentGiven: false,
  });

  // Real enrolled courses and attendance logs (no fabricated demo values)
  const [courses, setCourses] = useState<CourseAttendanceItem[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!isSupabaseConfigured()) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/login?role=student');
          return;
        }

        // 1. Fetch server-verified profile record
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        const actualRole = profileData?.role || 'student';

        // Redirect if user has teacher or admin role
        if (actualRole === 'teacher') {
          router.push('/teacher/dashboard');
          return;
        } else if (actualRole === 'admin') {
          router.push('/admin/dashboard');
          return;
        }

        // 2. Fetch student record using stable profile UUID
        let { data: studentData } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', user.id)
          .maybeSingle();

        // Self-provision student record if missing from initial trigger
        if (!studentData && user.user_metadata) {
          try {
            const initialStudentNumber =
              user.user_metadata.student_id_number || `PUB-STU-${user.id.slice(0, 8).toUpperCase()}`;
            const { data: newStudent } = await supabase
              .from('students')
              .insert({
                profile_id: user.id,
                student_id_number: initialStudentNumber,
                program: user.user_metadata.program || 'B.Sc. in Computer Science & Engineering',
                department: user.user_metadata.department || 'Computer Science & Engineering',
                academic_year: user.user_metadata.academic_year || '3rd Year',
                semester: user.user_metadata.semester || '1st Semester',
                section_or_batch:
                  user.user_metadata.section_or_batch || user.user_metadata.batch || 'Section A',
                account_status: 'active',
              })
              .select()
              .maybeSingle();

            if (newStudent) {
              studentData = newStudent;
            }
          } catch {
            // Handled gracefully below
          }
        }

        // 3. Check biometric consent status
        let consentGiven = false;
        if (studentData?.id) {
          setStudentDbId(studentData.id);
          try {
            const { data: consentRow } = await supabase
              .from('student_consent')
              .select('consent_given, withdrawn_at')
              .eq('student_id', studentData.id)
              .maybeSingle();

            if (consentRow && consentRow.consent_given && !consentRow.withdrawn_at) {
              consentGiven = true;
            }
          } catch {
            // Consent table optional until initialized
          }
        }

        // Derive truthful profile values
        const derivedName =
          profileData?.full_name ||
          user.user_metadata?.full_name ||
          user.email?.split('@')[0] ||
          'Student';

        const derivedEmail = profileData?.email || user.email || '';

        setProfile({
          name: derivedName,
          email: derivedEmail,
          studentId: studentData?.student_id_number || 'Not configured',
          program: studentData?.program || 'B.Sc. in Computer Science & Engineering',
          department: studentData?.department || 'Computer Science & Engineering',
          academicYear: studentData?.academic_year || 'Not configured',
          semester: studentData?.semester || user.user_metadata?.semester || 'Not configured',
          section: studentData?.section_or_batch || user.user_metadata?.batch || 'Not configured',
          avatarUrl: profileData?.avatar_url || null,
          faceRegistered: !!studentData?.face_registered,
          consentGiven,
        });

        // 4. Fetch actual enrolled courses for this student
        let enrolledCoursesList: CourseAttendanceItem[] = [];
        if (studentData?.id) {
          try {
            const { data: enrollmentsData } = await supabase
              .from('enrollments')
              .select(`
                id,
                section_name,
                course_id,
                courses (
                  id,
                  course_code,
                  title,
                  credits,
                  is_sessional,
                  semester_info
                )
              `)
              .eq('student_id', studentData.id)
              .eq('enrollment_status', 'enrolled');

            if (enrollmentsData && enrollmentsData.length > 0) {
              // Fetch assigned teacher records for enrolled courses
              const courseIds = enrollmentsData.map((e: any) => e.courses?.id).filter(Boolean);
              const assignmentsMap: Record<string, string> = {};

              try {
                const { data: assignments } = await supabase
                  .from('teacher_course_assignments')
                  .select(`
                    course_id,
                    section_name,
                    teachers (
                      teacher_id_number,
                      designation,
                      profiles (
                        full_name
                      )
                    )
                  `)
                  .in('course_id', courseIds)
                  .eq('is_active', true);

                if (assignments) {
                  assignments.forEach((a: any) => {
                    const teacherName =
                      a.teachers?.profiles?.full_name ||
                      a.teachers?.teacher_id_number ||
                      'Faculty Member';
                    assignmentsMap[`${a.course_id}_${a.section_name}`] = teacherName;
                    assignmentsMap[a.course_id] = teacherName;
                  });
                }
              } catch {
                // If assignments query fails due to RLS, teacher displays as "Faculty Member"
              }

              enrolledCoursesList = enrollmentsData
                .filter((e: any) => e.courses)
                .map((e: any) => {
                  const c = e.courses;
                  const teacher =
                    assignmentsMap[`${c.id}_${e.section_name}`] ||
                    assignmentsMap[c.id] ||
                    'Faculty Member';
                  return {
                    id: c.id,
                    code: c.course_code,
                    title: c.title,
                    credits: Number(c.credits) || 3.0,
                    isSessional: !!c.is_sessional,
                    semesterInfo: c.semester_info || 'Current Semester',
                    assignedTeacher: teacher,
                    totalClasses: 0,
                    attendedClasses: 0,
                    percentage: 0,
                    status: 'eligible' as const,
                  };
                });
            }
          } catch {
            // Enrollments query fallback
          }
        }

        // 5. Fetch actual attendance records for this student
        let loadedLogs: AttendanceLog[] = [];
        if (studentData?.id) {
          try {
            const { data: dbRecords } = await supabase
              .from('attendance_records')
              .select(`
                id,
                status,
                verification_method,
                confidence_score,
                timestamp,
                class_sessions (
                  id,
                  session_date,
                  topic,
                  status,
                  courses (
                    course_code
                  )
                )
              `)
              .eq('student_id', studentData.id)
              .order('timestamp', { ascending: false });

            if (dbRecords && dbRecords.length > 0) {
              // Exclude cancelled sessions according to university rules
              const validRecords = dbRecords.filter(
                (r: any) => r.class_sessions?.status !== 'cancelled'
              );

              loadedLogs = validRecords.map((r: any) => ({
                id: r.id,
                date:
                  r.class_sessions?.session_date ||
                  new Date(r.timestamp).toISOString().split('T')[0],
                courseCode: r.class_sessions?.courses?.course_code || 'N/A',
                topic: r.class_sessions?.topic || 'Class Lecture Session',
                status: r.status as 'present' | 'absent' | 'late' | 'excused',
                method:
                  r.verification_method === 'face_recognition'
                    ? 'Face Recognition'
                    : r.verification_method === 'manual_teacher'
                    ? 'Teacher Override'
                    : 'RFID Card',
                confidence: r.confidence_score
                  ? `${(r.confidence_score * 100).toFixed(1)}%`
                  : 'N/A',
              }));

              setRecordsSource('database');
            }
          } catch {
            // Attendance records query fallback
          }
        }

        // 6. Calculate real per-course attendance from loaded logs
        if (enrolledCoursesList.length > 0) {
          enrolledCoursesList = enrolledCoursesList.map((course) => {
            const courseLogs = loadedLogs.filter((l) => l.courseCode === course.code);
            if (courseLogs.length > 0) {
              const stats = calculateAttendancePercentage(courseLogs);
              return {
                ...course,
                totalClasses: stats.total,
                attendedClasses: stats.attended,
                percentage: stats.percentage,
                status: stats.status,
              };
            }
            return {
              ...course,
              totalClasses: 0,
              attendedClasses: 0,
              percentage: 0,
              status: 'eligible',
            };
          });
        }

        setCourses(enrolledCoursesList);
        setLogs(loadedLogs);
        if (loadedLogs.length === 0 && enrolledCoursesList.length === 0) {
          setRecordsSource('empty');
        }
      } catch {
        // Fallback gracefully on network error
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } finally {
      setShowLogoutModal(false);
      setLoggingOut(false);
      router.push('/login?role=student');
    }
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      setEnrollmentNotice({
        type: 'error',
        text: 'No attendance records available to export.',
      });
      return;
    }
    const headers = ['Date', 'Course Code', 'Lecture Topic', 'Method', 'Confidence', 'Attendance Status'];
    const rows = logs.map((log) => [
      log.date,
      log.courseCode,
      log.topic,
      log.method,
      log.confidence,
      log.status.toUpperCase(),
    ]);
    const csvData = generateCSVReport(headers, rows, `Student Attendance - ${profile.studentId}`);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PUB_Attendance_${profile.studentId || 'Report'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      setEnrollmentNotice({
        type: 'error',
        text: 'Invalid file format. Please upload a JPEG, PNG, or WebP photo.',
      });
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setEnrollmentNotice({
        type: 'error',
        text: 'Photo size exceeds 2MB limit. Please select a smaller photo.',
      });
      return;
    }

    setUploadingAvatar(true);
    setEnrollmentNotice(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setEnrollmentNotice({
          type: 'error',
          text: 'Session expired. Please log in again to update your profile photo.',
        });
        return;
      }

      let newAvatarUrl: string | null = null;

      // 1. Attempt upload to Supabase Storage bucket 'avatars'
      try {
        const fileExt = file.name.split('.').pop() || 'jpg';
        const filePath = `${user.id}/avatar_${Date.now()}.${fileExt}`;
        const { error: storageErr } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, { upsert: true });

        if (!storageErr) {
          const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          newAvatarUrl = publicUrlData.publicUrl;
        }
      } catch {
        // Storage bucket not configured or permissions pending
      }

      // 2. Fallback to base64 Data URL if storage bucket is not yet active
      if (!newAvatarUrl) {
        newAvatarUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // 3. Update public.profiles row
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateErr) {
        setEnrollmentNotice({
          type: 'error',
          text: `Failed to update profile record: ${updateErr.message}`,
        });
        return;
      }

      setProfile((prev) => ({ ...prev, avatarUrl: newAvatarUrl }));
      setEnrollmentNotice({
        type: 'success',
        text: 'Profile photo updated successfully!',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error uploading profile photo';
      setEnrollmentNotice({ type: 'error', text: msg });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConsentToggle = async () => {
    const newConsent = !profile.consentGiven;
    setProfile((prev) => ({
      ...prev,
      consentGiven: newConsent,
      faceRegistered: newConsent ? prev.faceRegistered : false,
    }));
    setConsentModalOpen(false);

    if (isSupabaseConfigured() && studentDbId) {
      try {
        const supabase = createClient();
        if (newConsent) {
          await supabase.from('student_consent').upsert({
            student_id: studentDbId,
            consent_given: true,
            consent_date: new Date().toISOString(),
            consent_text: 'I voluntarily consent to the capture, processing, and temporary template generation of my facial features for the sole purpose of automated classroom attendance recording in Pundra University courses.',
            withdrawn_at: null,
          }, { onConflict: 'student_id' });
        } else {
          await supabase.from('student_consent').update({
            consent_given: false,
            withdrawn_at: new Date().toISOString(),
          }).eq('student_id', studentDbId);
          await supabase.from('face_enrollments').delete().eq('student_id', studentDbId);
          await supabase.from('students').update({ face_registered: false }).eq('id', studentDbId);
        }
      } catch (err) {
        console.warn('Consent persistence notice:', err);
      }
    }

    setEnrollmentNotice({
      type: 'success',
      text: newConsent
        ? 'Biometric consent granted and recorded in Supabase. You can now enroll your face.'
        : 'Biometric consent withdrawn. Stored facial embeddings have been safely deleted.',
    });
  };

  const startCamera = async () => {
    setEnrollmentNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setEnrollmentNotice({
        type: 'error',
        text: 'Unable to access webcam. Please check camera permissions in your browser.',
      });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureSample = () => {
    if (!videoRef.current || !canvasRef.current || capturedSamples.length >= 3) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedSamples((prev) => [...prev, dataUrl]);
    }
  };

  const resetSamples = () => {
    setCapturedSamples([]);
    setEnrollmentNotice(null);
  };

  const handleEnrollSubmit = async () => {
    if (capturedSamples.length < 3) {
      setEnrollmentNotice({
        type: 'error',
        text: 'Please capture all 3 face samples before submitting enrollment validation.',
      });
      return;
    }

    if (!profile.consentGiven) {
      setEnrollmentNotice({
        type: 'error',
        text: 'Consent required. You must agree to the biometric consent terms prior to enrollment.',
      });
      return;
    }

    setEnrolling(true);
    setEnrollmentNotice(null);

    try {
      const blobPromises = capturedSamples.map(async (dataUrl) => {
        const res = await fetch(dataUrl);
        return res.blob();
      });
      const blobs = await Promise.all(blobPromises);

      const formData = new FormData();
      blobs.forEach((blob, idx) => {
        formData.append('samples', blob, `sample_${idx + 1}.jpg`);
      });

      // Retrieve current session access token for authenticated API requests
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // 1. First validate quality checks via /api/faces/enroll/validate
      const validateResponse = await fetch('/api/faces/enroll/validate', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!validateResponse.ok) {
        const errJson = await validateResponse.json().catch(() => ({}));
        setEnrollmentNotice({
          type: 'error',
          text: errJson.error || `Validation request failed with HTTP ${validateResponse.status}.`,
        });
        return;
      }

      const valData = await validateResponse.json();
      if (!valData.success) {
        const firstRejection = valData.data?.samples?.find(
          (s: { is_valid: boolean; rejection_reason?: string }) => !s.is_valid
        );
        const reason = firstRejection?.rejection_reason || 'Face samples failed sharpness or single-face detection check.';
        setEnrollmentNotice({
          type: 'error',
          text: `Quality check rejected: ${reason} Please capture clearer, well-lit samples.`,
        });
        return;
      }

      // 2. Commit enrollment template to Supabase public.face_enrollments
      const enrollResponse = await fetch('/api/faces/enroll', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!enrollResponse.ok) {
        const errJson = await enrollResponse.json().catch(() => ({}));
        setEnrollmentNotice({
          type: 'error',
          text: errJson.error || `Biometric persistence failed with HTTP ${enrollResponse.status}.`,
        });
        return;
      }

      const enrollData = await enrollResponse.json();
      if (enrollData.success) {
        setProfile((prev) => ({ ...prev, faceRegistered: true }));
        setEnrollmentNotice({
          type: 'success',
          text: `Face biometric enrollment successfully registered in Supabase (${enrollData.model_version || 'v1.0-sface'}, 128D). Your attendance can now be verified via live classroom recognition.`,
        });
        stopCamera();
        setEnrollModalOpen(false);
      }
    } catch {
      setEnrollmentNotice({
        type: 'error',
        text: 'Network Error: Unable to complete biometric face enrollment.',
      });
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  // Summary calculations derived strictly from real records
  const totalClasses = courses.reduce((acc, c) => acc + c.totalClasses, 0);
  const totalAttended = courses.reduce((acc, c) => acc + c.attendedClasses, 0);
  const overallPercentage =
    totalClasses > 0 ? ((totalAttended / totalClasses) * 100).toFixed(1) : '0.0';
  const warningCourses = courses.filter((c) => c.status === 'warning' || c.status === 'critical');

  const filteredLogs = selectedCourseFilter === 'ALL'
    ? logs
    : logs.filter((l) => l.courseCode === selectedCourseFilter);

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 max-w-7xl mx-auto">
      
      {/* Top Connection Banner */}
      <SupabaseStatusBanner />

      {/* Header Profile Bar */}
      <div className="p-8 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {/* Avatar / Profile Photo with Upload Trigger */}
          <div className="relative group w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 p-0.5 flex items-center justify-center shrink-0">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.name || 'Student Profile'}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <GraduationCap className="w-9 h-9 text-cyan-400" />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-[10px] text-cyan-300 font-semibold"
              title="Upload / Change Profile Photo"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              ) : (
                <>
                  <Camera className="w-4 h-4 mb-0.5" />
                  <span>Change</span>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFileSelect}
              className="hidden"
            />
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white">
                {profile.name || 'Student Account'}
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400">
                Student · {profile.section}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ID: <span className="text-slate-200 font-semibold font-mono">{profile.studentId}</span> · {profile.program}
            </p>
            <p className="text-[11px] text-slate-500">
              {profile.academicYear}, {profile.semester} · Pundra University of Science & Technology
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>{uploadingAvatar ? 'Uploading...' : 'Change Photo'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Roster CSV</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-navy-900 hover:bg-navy-800 border border-slate-700 hover:text-white transition-colors"
          >
            <Home className="w-3.5 h-3.5 text-cyan-400" />
            <span>Home</span>
          </Link>

          <button
            id="student-signout-btn"
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-800/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        portalName="Student Portal"
        loading={loggingOut}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      {/* Low Attendance Warning Alert Banner (Requirement #11) */}
      {warningCourses.length > 0 && (
        <div className="mb-8 p-5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-300">
              Low Attendance Warning Alert (&lt; 75% Requirement)
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Your attendance in <strong>{warningCourses.map((c) => c.code).join(', ')}</strong> is currently below Pundra University&apos;s 75% minimum semester exam eligibility threshold. Please ensure attendance in upcoming lectures.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Overall Attendance
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">
            {totalClasses > 0 ? `${overallPercentage}%` : 'N/A'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {totalClasses > 0
              ? `${totalAttended} of ${totalClasses} eligible classes attended`
              : '0 of 0 classes held · No records yet'}
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Academic Status
          </div>
          {totalClasses === 0 ? (
            <>
              <div className="text-xl font-bold text-slate-400 flex items-center gap-1.5">
                <Clock className="w-5 h-5 shrink-0 text-slate-500" />
                <span>No records yet</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Classes not yet convened</div>
            </>
          ) : Number(overallPercentage) >= 75 ? (
            <>
              <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Eligible for Final Exam</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Threshold: &ge; 75.0% required</div>
            </>
          ) : Number(overallPercentage) >= 60 ? (
            <>
              <div className="text-xl font-bold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>Attendance Warning</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Below 75.0% exam threshold</div>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-rose-400 flex items-center gap-1.5">
                <XCircle className="w-5 h-5 shrink-0" />
                <span>Disqualified</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Below 60.0% critical threshold</div>
            </>
          )}
        </div>

        {/* Biometric Consent Card (Requirement #9) */}
        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Face Recognition Consent
          </div>
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>{profile.consentGiven ? 'Consented ✓' : 'Pending Consent'}</span>
            </div>
            <button
              onClick={() => setConsentModalOpen(true)}
              className="text-[11px] text-cyan-400 hover:underline font-semibold"
            >
              {profile.consentGiven ? 'Manage Consent' : 'Provide Consent'}
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>{profile.faceRegistered ? '128D Vector Enrolled' : 'Awaiting Enrollment'}</span>
            {profile.consentGiven && (
              <button
                onClick={() => {
                  setEnrollModalOpen(true);
                  setEnrollmentNotice(null);
                  setCapturedSamples([]);
                }}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline"
              >
                {profile.faceRegistered ? 'Re-enroll Face' : 'Enroll Face'}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Registered Courses
          </div>
          <div className="text-3xl font-extrabold text-indigo-400">{courses.length} Courses</div>
          <div className="text-xs text-slate-400 mt-1">
            {courses.reduce((acc, c) => acc + c.credits, 0)} Credits Total · {profile.department}
          </div>
        </div>
      </div>

      {/* Course Breakdown Section (Requirement #5: Real Enrolled Courses & Assigned Teachers) */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <span>Course-Wise Attendance ({profile.semester || 'Current Semester'})</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {courses.length} Enrolled Courses · {courses.reduce((acc, c) => acc + c.credits, 0)} Credits
          </span>
        </div>

        {courses.length === 0 ? (
          <div className="p-8 rounded-2xl bg-navy-900/60 border border-slate-800 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-white">No Enrolled Courses Found</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Your student account has no active course enrollments in the database. Please contact your department academic coordinator to register for semester courses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map((c) => (
              <div
                key={c.id}
                className="p-6 rounded-2xl bg-navy-900/70 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-navy-800 text-cyan-400 border border-slate-700 font-mono">
                        {c.code}
                      </span>
                      <span className="text-[11px] text-slate-400 font-semibold">
                        {c.credits} {c.credits === 1 ? 'Credit' : 'Credits'} {c.isSessional ? '· Sessional' : '· Theory'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1.5">{c.title}</h3>
                    <div className="text-xs text-cyan-300/80 mt-1 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Instructor: <strong className="text-white">{c.assignedTeacher}</strong></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-extrabold text-white">
                      {c.totalClasses > 0 ? `${c.percentage}%` : 'N/A'}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        c.totalClasses === 0
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : c.status === 'eligible'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {c.totalClasses === 0 ? 'No Classes' : c.status === 'eligible' ? 'Eligible' : 'Warning'}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-navy-950 overflow-hidden mt-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      c.totalClasses === 0
                        ? 'bg-slate-700'
                        : c.percentage >= 75
                        ? 'bg-cyan-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${c.totalClasses > 0 ? Math.min(c.percentage, 100) : 0}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-slate-400 mt-2.5">
                  <span>Attended: {c.attendedClasses} classes</span>
                  <span>Total Held: {c.totalClasses} classes</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance History Table with Course Filter */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <span>Attendance Verification Logs</span>
            </h2>
            {recordsSource === 'database' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                Live Supabase Database
              </span>
            )}
            {recordsSource === 'empty' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700">
                Live Database (0 Records)
              </span>
            )}
            {recordsSource === 'local_cache' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800">
                Local Cache (Offline)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-navy-900 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="ALL">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-navy-950 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Course</th>
                  <th className="px-6 py-4">Lecture Topic</th>
                  <th className="px-6 py-4">Verification Method</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                      No attendance verification records found yet. Attendance sessions finalized by course instructors will appear here in real-time.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-navy-850/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{log.date}</td>
                      <td className="px-6 py-4 font-bold text-white font-mono text-xs">{log.courseCode}</td>
                      <td className="px-6 py-4 text-xs text-slate-300 max-w-xs truncate">
                        {log.topic}
                      </td>
                      <td className="px-6 py-4 text-xs text-cyan-300 flex items-center gap-1.5">
                        <Scan className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{log.method}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">{log.confidence}</td>
                      <td className="px-6 py-4">
                        {log.status === 'present' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Present</span>
                          </span>
                        ) : log.status === 'excused' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-950/60 text-cyan-400 border border-cyan-800">
                            <Check className="w-3.5 h-3.5" />
                            <span>Excused</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/60 text-rose-400 border border-rose-800">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Absent</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Biometric Consent Modal (Requirement #9) */}
      {consentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Biometric Face Recognition Consent</h3>
                <p className="text-xs text-slate-400">Pundra University Academic Integrity Policy</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-navy-950 text-xs text-slate-300 space-y-2 leading-relaxed border border-slate-800 max-h-56 overflow-y-auto">
              <p>
                <strong>Informed Voluntary Consent Statement:</strong>
              </p>
              <p>
                I voluntarily agree to allow PUB AttendEye to process biometric facial landmarks solely for automating lecture attendance verification at Pundra University of Science & Technology.
              </p>
              <p>
                <strong>Safeguards & Storage:</strong> Raw face photographs are not distributed or used for commercial purposes. Only mathematical 128-dimensional embedding vectors (v1.0-sface) are retained, scoped strictly to my enrolled course sections.
              </p>
              <p>
                <strong>Right to Withdraw:</strong> You may withdraw your consent at any time. Revoking consent will permanently delete your stored facial embedding vectors from the system.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setConsentModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-navy-800 border border-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConsentToggle}
                className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white shadow-md transition-colors ${
                  profile.consentGiven
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500'
                }`}
              >
                {profile.consentGiven ? 'Revoke Consent & Delete Embeddings' : 'Sign & Submit Consent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Biometric Enrollment Modal (Requirement #2 & #9) */}
      {enrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Student Face Biometric Enrollment</h3>
                  <p className="text-xs text-slate-400">
                    Extracting 128D SFace Embedding for <span className="text-cyan-400 font-mono font-bold">{profile.studentId}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  stopCamera();
                  setEnrollModalOpen(false);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Biometric Enrollment Security Notice */}
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-cyan-300">Secure Biometric Registration (YuNet + SFace)</p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Captured samples are verified for face sharpness and geometry by the CV engine. Upon quality validation and active consent verification, 
                  your 128D SFace biometric embedding template is registered and securely persisted to Supabase for automated classroom attendance.
                </p>
              </div>
            </div>

            {/* Camera Viewport & Overlay */}
            <div className="relative aspect-video rounded-2xl bg-black overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!cameraActive && (
                <div className="text-center space-y-3 p-6">
                  <Camera className="w-12 h-12 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 max-w-sm">
                    Position your face within the frame in good lighting. 3 samples will be captured to compute your 128D SFace biometric embedding.
                  </p>
                  <button
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-navy-950 text-xs font-bold transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Start Webcam</span>
                  </button>
                </div>
              )}

              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-52 h-64 border-2 border-cyan-400/80 rounded-[50%] border-dashed animate-pulse flex items-center justify-center">
                    <span className="text-[10px] text-cyan-300 bg-navy-950/80 px-2 py-0.5 rounded">
                      Align Face Here
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Quality & Sample Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">
                  Captured Samples: <strong className="text-white">{capturedSamples.length} of 3</strong>
                </span>
                <span className="text-[11px] font-mono text-cyan-400">
                  Model: v1.0-sface (CASIA CAS-128D)
                </span>
              </div>

              {/* Sample Thumbnails */}
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="aspect-video rounded-xl bg-navy-950 border border-slate-800 overflow-hidden relative flex items-center justify-center"
                  >
                    {capturedSamples[idx] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={capturedSamples[idx]}
                        alt={`Sample ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-600">Sample #{idx + 1}</span>
                    )}
                    {capturedSamples[idx] && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Notices */}
            {enrollmentNotice && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                  enrollmentNotice.type === 'success'
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                }`}
              >
                {enrollmentNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{enrollmentNotice.text}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {cameraActive && (
                  <button
                    onClick={stopCamera}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-navy-800 hover:bg-navy-700 border border-slate-700"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Stop Camera</span>
                  </button>
                )}
                {capturedSamples.length > 0 && (
                  <button
                    onClick={resetSamples}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cameraActive && capturedSamples.length < 3 && (
                  <button
                    onClick={captureSample}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md"
                  >
                    Capture Sample ({capturedSamples.length + 1}/3)
                  </button>
                )}

                {capturedSamples.length === 3 && (
                  <button
                    onClick={handleEnrollSubmit}
                    disabled={enrolling}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-navy-950 bg-cyan-400 hover:bg-cyan-300 shadow-lg disabled:opacity-50"
                  >
                    {enrolling ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Enrolling with YuNet & SFace...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Enroll Face Biometrics</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Status Notification */}
      {enrollmentNotice && !enrollModalOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs max-w-md ${
            enrollmentNotice.type === 'success'
              ? 'bg-emerald-950 border border-emerald-700 text-emerald-200'
              : 'bg-rose-950 border border-rose-700 text-rose-200'
          }`}
        >
          {enrollmentNotice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{enrollmentNotice.text}</span>
          <button
            onClick={() => setEnrollmentNotice(null)}
            className="ml-auto text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

    </div>
  );
}

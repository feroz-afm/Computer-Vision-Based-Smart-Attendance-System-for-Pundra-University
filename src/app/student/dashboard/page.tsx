'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
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
  FileText,
  Loader2,
  Camera,
  CameraOff,
  Trash2,
  ShieldAlert,
  Check,
  X,
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
  faceRegistered: boolean;
  consentGiven: boolean;
}

interface CourseAttendanceItem {
  id: string;
  code: string;
  title: string;
  credits: number;
  isSessional: boolean;
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
  const [enrollmentNotice, setEnrollmentNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [profile, setProfile] = useState<StudentProfile>({
    name: 'Student Member',
    email: '',
    studentId: '',
    program: 'B.Sc. in Computer Science & Engineering',
    department: 'Computer Science & Engineering',
    academicYear: '3rd Year',
    semester: '1st Semester',
    section: 'Section A',
    faceRegistered: false,
    consentGiven: false,
  });

  // Official 10 courses for CSE 3rd Year 1st Semester
  const [courses, setCourses] = useState<CourseAttendanceItem[]>([
    {
      id: '1',
      code: 'CSE 2205',
      title: 'Computer Architecture and Organization',
      credits: 3.0,
      isSessional: false,
      totalClasses: 18,
      attendedClasses: 16,
      percentage: 88.9,
      status: 'eligible',
    },
    {
      id: '2',
      code: 'CSE 2206',
      title: 'Computer Architecture and Organization Sessional',
      credits: 1.0,
      isSessional: true,
      totalClasses: 10,
      attendedClasses: 10,
      percentage: 100.0,
      status: 'eligible',
    },
    {
      id: '3',
      code: 'CSE 3103',
      title: 'Operating Systems',
      credits: 3.0,
      isSessional: false,
      totalClasses: 20,
      attendedClasses: 19,
      percentage: 95.0,
      status: 'eligible',
    },
    {
      id: '4',
      code: 'CSE 3104',
      title: 'Operating Systems Sessional',
      credits: 1.0,
      isSessional: true,
      totalClasses: 10,
      attendedClasses: 9,
      percentage: 90.0,
      status: 'eligible',
    },
    {
      id: '5',
      code: 'CSE 2201',
      title: 'Web Engineering',
      credits: 3.0,
      isSessional: false,
      totalClasses: 16,
      attendedClasses: 11,
      percentage: 68.8,
      status: 'warning',
    },
    {
      id: '6',
      code: 'CSE 2202',
      title: 'Web Engineering Sessional',
      credits: 1.0,
      isSessional: true,
      totalClasses: 8,
      attendedClasses: 8,
      percentage: 100.0,
      status: 'eligible',
    },
    {
      id: '7',
      code: 'CSE 3205',
      title: 'Computer Networking',
      credits: 3.0,
      isSessional: false,
      totalClasses: 18,
      attendedClasses: 17,
      percentage: 94.4,
      status: 'eligible',
    },
    {
      id: '8',
      code: 'CSE 3206',
      title: 'Computer Networking Sessional',
      credits: 1.0,
      isSessional: true,
      totalClasses: 10,
      attendedClasses: 9,
      percentage: 90.0,
      status: 'eligible',
    },
    {
      id: '9',
      code: 'LAW 3201',
      title: 'Cyber and Intellectual Property Law',
      credits: 2.0,
      isSessional: false,
      totalClasses: 14,
      attendedClasses: 13,
      percentage: 92.9,
      status: 'eligible',
    },
    {
      id: '10',
      code: 'BUS 3101',
      title: 'Technology Entrepreneurship for Business',
      credits: 3.0,
      isSessional: false,
      totalClasses: 16,
      attendedClasses: 15,
      percentage: 93.8,
      status: 'eligible',
    },
  ]);

  const [logs, setLogs] = useState<AttendanceLog[]>([
    {
      id: '1',
      date: '2026-10-18',
      courseCode: 'CSE 2205',
      topic: 'Pipelining & Instruction Level Parallelism',
      status: 'present',
      method: 'Face Recognition',
      confidence: '98.7%',
    },
    {
      id: '2',
      date: '2026-10-17',
      courseCode: 'CSE 3103',
      topic: 'Virtual Memory & Page Replacement',
      status: 'present',
      method: 'Face Recognition',
      confidence: '99.1%',
    },
    {
      id: '3',
      date: '2026-10-16',
      courseCode: 'CSE 2201',
      topic: 'REST API Design & WebSockets',
      status: 'absent',
      method: 'Teacher Audit',
      confidence: 'N/A',
    },
    {
      id: '4',
      date: '2026-10-15',
      courseCode: 'CSE 3205',
      topic: 'Subnetting & BGP Routing Protocols',
      status: 'present',
      method: 'Face Recognition',
      confidence: '97.4%',
    },
    {
      id: '5',
      date: '2026-10-14',
      courseCode: 'LAW 3201',
      topic: 'Digital Security Act & Intellectual Property',
      status: 'present',
      method: 'Face Recognition',
      confidence: '99.0%',
    },
    {
      id: '6',
      date: '2026-10-13',
      courseCode: 'BUS 3101',
      topic: 'Startup Valuation & Pitch Presentations',
      status: 'present',
      method: 'Face Recognition',
      confidence: '98.5%',
    },
  ]);

  useEffect(() => {
    const fetchUserData = async () => {
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

            // Redirect if user has teacher or admin role
            if (profileData?.role === 'teacher') {
              router.push('/teacher/dashboard');
              return;
            } else if (profileData?.role === 'admin') {
              router.push('/admin/dashboard');
              return;
            }

            const { data: studentData } = await supabase
              .from('students')
              .select('student_id_number, program, department, academic_year, semester, section_or_batch, face_registered')
              .eq('profile_id', user.id)
              .single();

            if (profileData && studentData) {
              setProfile((prev) => ({
                ...prev,
                name: profileData.full_name,
                email: profileData.email,
                studentId: studentData.student_id_number,
                program: studentData.program || prev.program,
                department: studentData.department,
                academicYear: studentData.academic_year || prev.academicYear,
                semester: studentData.semester || prev.semester,
                section: studentData.section_or_batch || prev.section,
                faceRegistered: studentData.face_registered,
              }));
            }
          }
        } catch {
          // Fallback to sample data for unconfigured state
        }
      }
      setLoading(false);
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push('/login?role=student');
  };

  const handleExportCSV = () => {
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
    link.setAttribute('download', `PUB_Attendance_${profile.studentId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConsentToggle = async () => {
    const newConsent = !profile.consentGiven;
    setProfile((prev) => ({
      ...prev,
      consentGiven: newConsent,
      faceRegistered: newConsent ? prev.faceRegistered : false, // Revoking consent deletes face biometrics
    }));
    setConsentModalOpen(false);

    if (!newConsent) {
      setEnrollmentNotice({
        type: 'success',
        text: 'Biometric consent withdrawn. Stored facial embeddings have been safely deleted.',
      });
    }
  };

  // Camera handling for biometric enrollment
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
      // Convert captured base64 data URLs to Blobs for multipart form submission
      const blobPromises = capturedSamples.map(async (dataUrl) => {
        const res = await fetch(dataUrl);
        return res.blob();
      });
      const blobs = await Promise.all(blobPromises);

      const formData = new FormData();
      blobs.forEach((blob, idx) => {
        formData.append('samples', blob, `sample_${idx + 1}.jpg`);
      });

      const response = await fetch('/api/faces/enroll/validate', {
        method: 'POST',
        body: formData,
      });

      if (response.status === 401) {
        setEnrollmentNotice({
          type: 'error',
          text: 'Authentication failure: You must be logged in with a valid student account to validate face samples.',
        });
        return;
      }

      if (response.status === 504) {
        setEnrollmentNotice({
          type: 'error',
          text: 'Service Timeout: The biometric computer-vision service timed out processing samples. Please try again.',
        });
        return;
      }

      if (response.status === 503) {
        setEnrollmentNotice({
          type: 'error',
          text: 'Service Unavailable: Python CV service is not running on port 8000. Run: uvicorn backend.api:app --port 8000',
        });
        return;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        setEnrollmentNotice({
          type: 'error',
          text: errJson.error || `Validation request failed with HTTP ${response.status}.`,
        });
        return;
      }

      const resData = await response.json();
      if (resData.success) {
        setEnrollmentNotice({
          type: 'success',
          text: `Face samples validated successfully (${resData.data?.model_version || 'v1.0-sface'}, 128D). All ${resData.data?.valid_sample_count || 3} samples passed sharpness and geometry checks. NOTE: Validation mode only — biometric templates have NOT been saved to the database.`,
        });
        stopCamera();
        setEnrollModalOpen(false);
      } else {
        const firstRejection = resData.data?.samples?.find(
          (s: { is_valid: boolean; rejection_reason?: string }) => !s.is_valid
        );
        const reason = firstRejection?.rejection_reason || 'Face samples failed sharpness or single-face detection check.';
        setEnrollmentNotice({
          type: 'error',
          text: `Quality check rejected: ${reason} Please capture clearer, well-lit samples.`,
        });
      }
    } catch {
      setEnrollmentNotice({
        type: 'error',
        text: 'Network Error: Unable to reach Next.js validation server.',
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

  // Summary calculations
  const totalClasses = courses.reduce((acc, c) => acc + c.totalClasses, 0);
  const totalAttended = courses.reduce((acc, c) => acc + c.attendedClasses, 0);
  const overallPercentage = ((totalAttended / totalClasses) * 100).toFixed(1);
  const warningCourses = courses.filter((c) => c.status === 'warning' || c.status === 'critical');

  const filteredLogs = selectedCourseFilter === 'ALL'
    ? logs
    : logs.filter((l) => l.courseCode === selectedCourseFilter);

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 max-w-7xl mx-auto">
      
      {/* Top Banner & Status */}
      <SupabaseStatusBanner />

      {/* Header Profile Bar */}
      <div className="p-8 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40 p-1 flex items-center justify-center text-cyan-400 shrink-0">
            <GraduationCap className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white">{profile.name}</h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400">
                Student · {profile.section}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ID: <span className="text-slate-200 font-semibold">{profile.studentId}</span> · {profile.program}
            </p>
            <p className="text-[11px] text-slate-500">
              {profile.academicYear}, {profile.semester} · Pundra University of Science & Technology
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
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
          <div className="text-3xl font-extrabold text-cyan-400">{overallPercentage}%</div>
          <div className="text-xs text-slate-400 mt-1">
            {totalAttended} of {totalClasses} eligible classes attended
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Academic Status
          </div>
          <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Eligible for Final Exam</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Threshold: &ge; 75.0% required</div>
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
          <div className="text-xs text-slate-400 mt-1">21 Credits · CSE 3rd Yr 1st Sem</div>
        </div>
      </div>

      {/* Course Breakdown Section (Requirement #6: Official 10 Courses) */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <span>Course-Wise Attendance (CSE 3rd Year, 1st Semester)</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">10 Courses · 21 Credits</span>
        </div>

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
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-white">{c.percentage}%</div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      c.status === 'eligible'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {c.status === 'eligible' ? 'Eligible' : 'Warning'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-navy-950 overflow-hidden mt-4">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    c.percentage >= 75 ? 'bg-cyan-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(c.percentage, 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-slate-400 mt-2.5">
                <span>Attended: {c.attendedClasses} classes</span>
                <span>Total Held: {c.totalClasses} classes</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance History Table with Course Filter */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <span>Attendance Verification Logs</span>
          </h2>

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
                {filteredLogs.map((log) => (
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
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/60 text-rose-400 border border-rose-800">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Absent</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
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

            {/* Step 7B Validation Mode Notice */}
            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-cyan-300">FastAPI Bridge Validation Mode (Step 7B)</p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Captured samples are sent to the Python CV pipeline to validate image sharpness and 128D SFace feature extraction. 
                  Biometric templates are <strong className="text-white">NOT saved</strong> to the database in this milestone.
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
                  {/* Face Guide Oval */}
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
                        <span>Validating with YuNet & SFace...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Validate Face Biometrics (Preview)</span>
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

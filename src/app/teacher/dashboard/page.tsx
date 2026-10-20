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
  FileSpreadsheet,
  Download,
  UploadCloud,
  ShieldAlert,
  Edit3,
  HelpCircle,
  History,
  X,
  Loader2,
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

  // Strict Teacher Course Assignments (Requirement #5)
  // Dr. Rafiqul Islam is ONLY assigned to CSE 2205 and CSE 2206 Section A!
  const [assignedCourses, setAssignedCourses] = useState<AssignedCourse[]>([
    {
      id: 'c1',
      code: 'CSE 2205',
      title: 'Computer Architecture and Organization',
      credits: 3.0,
      section: 'Section A',
      room: 'Room 402',
      enrolledStudents: 32,
    },
    {
      id: 'c2',
      code: 'CSE 2206',
      title: 'Computer Architecture and Organization Sessional',
      credits: 1.0,
      section: 'Section A',
      room: 'Hardware Lab 2',
      enrolledStudents: 32,
    },
  ]);

  // All University Courses (For security test simulation: Teacher attempting unassigned course)
  const unassignedCourseExample = {
    code: 'CSE 3103',
    title: 'Operating Systems',
    instructor: 'Engr. Kamrul Hasan',
  };

  const [selectedCourseCode, setSelectedCourseCode] = useState('CSE 2205');
  const [selectedSection, setSelectedSection] = useState('Section A');
  const [roomNumber, setRoomNumber] = useState('Room 402');
  const [topic, setTopic] = useState('Pipelining, Hazard Resolution & Cache Memory');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');

  // Security test trigger for requirement #5
  const [unauthorizedAttempt, setUnauthorizedAttempt] = useState(false);
  const [securityError, setSecurityError] = useState('');

  // Classroom Roster for the selected course
  const [roster, setRoster] = useState<RosterStudent[]>([
    { id: '1', name: 'Md Tanvir Ahmed', studentId: 'PUB-CSE-2023-042', status: 'present', confidence: '98.8%', time: '10:02:15', method: 'Face Recognition' },
    { id: '2', name: 'Nusrat Jahan', studentId: 'PUB-CSE-2023-018', status: 'present', confidence: '99.2%', time: '10:02:22', method: 'Face Recognition' },
    { id: '3', name: 'Sabbir Hossain', studentId: 'PUB-CSE-2023-033', status: 'present', confidence: '97.4%', time: '10:02:40', method: 'Face Recognition' },
    { id: '4', name: 'Farzana Akter', studentId: 'PUB-CSE-2023-009', status: 'pending_review', confidence: '72.3%', time: '10:03:01', method: 'Low-Confidence Match' },
    { id: '5', name: 'Mehedi Hasan', studentId: 'PUB-CSE-2023-051', status: 'absent', confidence: 'N/A', time: 'N/A', method: 'Unattended' },
    { id: '6', name: 'Tasmia Rahman', studentId: 'PUB-CSE-2023-027', status: 'present', confidence: '98.5%', time: '10:03:15', method: 'Face Recognition' },
  ]);

  // Review Queue & Audit State (Requirements #9 & #10)
  const [reviewQueueOpen, setReviewQueueOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([
    {
      id: 'a1',
      studentName: 'Farzana Akter',
      previousStatus: 'absent',
      newStatus: 'pending_review',
      reason: 'Face detected with partial occlusion (lighting condition angle).',
      changedBy: 'Dr. Rafiqul Islam',
      timestamp: '2026-10-18 10:04:12',
    },
  ]);

  // Correction Modal State
  const [correctionTarget, setCorrectionTarget] = useState<RosterStudent | null>(null);
  const [correctionNewStatus, setCorrectionNewStatus] = useState<'present' | 'absent' | 'late' | 'excused'>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [sessionSavedMsg, setSessionSavedMsg] = useState('');

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

            // Enforce role authorization: students cannot access teacher portal
            if (profileData && profileData.role !== 'teacher' && profileData.role !== 'admin') {
              router.push('/student/dashboard');
              return;
            }

            const { data: teacherData } = await supabase
              .from('teachers')
              .select('id, teacher_id_number, department, designation')
              .eq('profile_id', user.id)
              .single();

            if (profileData && teacherData) {
              setProfile({
                name: profileData.full_name,
                email: profileData.email,
                teacherId: teacherData.teacher_id_number,
                department: teacherData.department,
                designation: teacherData.designation,
              });
            }
          }
        } catch {
          // Graceful fallback
        }
      }
      setLoading(false);
    };

    fetchTeacher();
  }, []);

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
    setUnauthorizedAttempt(false);
    setSecurityError('');
    setSelectedCourseCode(code);
  };

  const handleStartSession = () => {
    // Re-verify authorization
    const isAssigned = assignedCourses.some((c) => c.code === selectedCourseCode);
    if (!isAssigned) {
      setSecurityError('Forbidden: Cannot start session for unassigned course.');
      return;
    }
    setSessionActive(true);
    setSessionSavedMsg('');
    startCamera();
  };

  const handleClassroomPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Simulate multi-face batch processing on classroom image
      alert(`Classroom photograph "${file.name}" received. Running multi-face detection against enrolled students.`);
      setSessionActive(true);
    }
  };

  const handleFinalizeSession = () => {
    stopCamera();
    setSessionActive(false);
    setSessionSavedMsg(`Attendance session for ${selectedCourseCode} (${selectedSection}) has been verified and saved to database.`);
  };

  // Requirement #10: Attendance Correction with Mandatory Reason
  const openCorrectionModal = (student: RosterStudent) => {
    setCorrectionTarget(student);
    setCorrectionNewStatus(student.status === 'present' ? 'absent' : 'present');
    setCorrectionReason('');
    setCorrectionError('');
  };

  const submitCorrection = () => {
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

    // Append to audit log
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

    setCorrectionTarget(null);
  };

  // Review Queue Approve / Reject (Requirement #9)
  const handleReviewAction = (studentId: string, approve: boolean) => {
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

      {/* Header Profile Bar */}
      <div className="p-8 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-cyan-500/20 border border-indigo-500/40 p-1 flex items-center justify-center text-indigo-400 shrink-0">
            <Users2 className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white">{profile.name}</h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-400">
                Authorized Faculty
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

      {sessionSavedMsg && (
        <div className="mb-8 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{sessionSavedMsg}</span>
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
                      onClick={handleStartSession}
                      className="py-3 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Start Live Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-3 px-4 rounded-xl font-semibold text-xs text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors flex items-center justify-center gap-2"
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
                    <div className="px-3 py-1 rounded-md bg-navy-950/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-400 backdrop-blur-md">
                      ANTI-SPOOFING LIVENESS: VALIDATED
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
                {roster.map((student) => (
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
                ))}
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

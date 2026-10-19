'use client';

import React, { useState, useEffect } from 'react';
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

  const [profile, setProfile] = useState<StudentProfile>({
    name: 'Md Tanvir Ahmed',
    email: 'student@pundra.edu.bd',
    studentId: 'PUB-CSE-2023-042',
    program: 'B.Sc. in Computer Science & Engineering',
    department: 'Computer Science & Engineering',
    academicYear: '3rd Year',
    semester: '1st Semester',
    section: 'Section A',
    faceRegistered: true,
    consentGiven: true,
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

  const handleConsentToggle = () => {
    setProfile((prev) => ({ ...prev, consentGiven: !prev.consentGiven }));
    setConsentModalOpen(false);
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
              {profile.consentGiven ? 'View Consent' : 'Provide Consent'}
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {profile.faceRegistered ? '128D Vector Profile Enrolled' : 'Awaiting Enrollment'}
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
                <strong>Safeguards & Storage:</strong> Raw face photographs are not distributed or used for commercial purposes. Only mathematical 128-dimensional embedding vectors are retained, scoped strictly to my enrolled course sections.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
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
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-md"
              >
                {profile.consentGiven ? 'Revoke Consent' : 'Sign & Submit Consent'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

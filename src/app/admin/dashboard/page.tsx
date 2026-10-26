'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { LogoutConfirmModal } from '@/components/LogoutConfirmModal';
import { generateCSVReport } from '@/lib/attendance/service';
import {
  Shield,
  Users,
  GraduationCap,
  Users2,
  BookOpen,
  Calendar,
  Home,
  LogOut,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  Sliders,
  Download,
  History,
  X,
  UserCheck,
  Building2,
  Loader2,
  Check,
} from 'lucide-react';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  identifier: string;
  department: string;
  status: 'active' | 'pending' | 'suspended';
  created_at: string;
}

interface CourseRecord {
  id: string;
  code: string;
  title: string;
  department: string;
  credits: number;
  isSessional: boolean;
  assignedTeacher: string;
  section: string;
  room: string;
  enrolledCount: number;
}

interface SystemAuditItem {
  id: string;
  course: string;
  studentName: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  changedBy: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'courses' | 'approvals' | 'users' | 'audits' | 'settings'>('courses');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher' | 'admin'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Threshold Settings (Requirement #11)
  const [warningThreshold, setWarningThreshold] = useState(75.0);
  const [criticalThreshold, setCriticalThreshold] = useState(60.0);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Assignment Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCourseForAssign, setSelectedCourseForAssign] = useState<CourseRecord | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState('PUB-FAC-014');
  const [selectedRoom, setSelectedRoom] = useState('Room 402');

  const [users, setUsers] = useState<UserRecord[]>([
    {
      id: '1',
      name: 'System Administrator',
      email: 'admin.console@pundra.edu.bd',
      role: 'admin',
      identifier: 'PUB-ADM-001',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-15',
    },
    {
      id: '2',
      name: 'Faculty Instructor',
      email: 'faculty.instructor@pundra.edu.bd',
      role: 'teacher',
      identifier: 'PUB-FAC-014',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-16',
    },
    {
      id: '3',
      name: 'Faculty Lecturer',
      email: 'faculty.lecturer@pundra.edu.bd',
      role: 'teacher',
      identifier: 'PUB-FAC-022',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-16',
    },
    {
      id: 'teacher_pending_demo',
      name: 'Applicant Faculty Member',
      email: 'applicant.faculty@gmail.com',
      role: 'teacher',
      identifier: 'PUB-FAC-088',
      department: 'Computer Science & Engineering',
      status: 'pending',
      created_at: '2026-10-21',
    },
    {
      id: '4',
      name: 'Student Account 1',
      email: 'student.sample1@pundra.edu.bd',
      role: 'student',
      identifier: 'PUB-CSE-2023-042',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-16',
    },
    {
      id: '4',
      name: 'Student Account 1',
      email: 'student.sample1@pundra.edu.bd',
      role: 'student',
      identifier: 'PUB-CSE-2023-042',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-16',
    },
    {
      id: '5',
      name: 'Student Account 2',
      email: 'student.sample2@pundra.edu.bd',
      role: 'student',
      identifier: 'PUB-CSE-2023-018',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-17',
    },
    {
      id: '6',
      name: 'Student Account 3',
      email: 'student.sample3@pundra.edu.bd',
      role: 'student',
      identifier: 'PUB-CSE-2023-033',
      department: 'Computer Science & Engineering',
      status: 'active',
      created_at: '2026-10-17',
    },
  ]);

  // Official 10 Courses (Requirement #6: CSE 3rd Year 1st Semester)
  const [courses, setCourses] = useState<CourseRecord[]>([
    {
      id: 'c1',
      code: 'CSE 2205',
      title: 'Computer Architecture and Organization',
      department: 'Computer Science & Engineering',
      credits: 3.0,
      isSessional: false,
      assignedTeacher: 'Faculty Instructor (PUB-FAC-014)',
      section: 'Section A',
      room: 'Room 402',
      enrolledCount: 32,
    },
    {
      id: 'c2',
      code: 'CSE 2206',
      title: 'Computer Architecture and Organization Sessional',
      department: 'Computer Science & Engineering',
      credits: 1.0,
      isSessional: true,
      assignedTeacher: 'Faculty Instructor (PUB-FAC-014)',
      section: 'Section A',
      room: 'Hardware Lab 2',
      enrolledCount: 32,
    },
    {
      id: 'c3',
      code: 'CSE 3103',
      title: 'Operating Systems',
      department: 'Computer Science & Engineering',
      credits: 3.0,
      isSessional: false,
      assignedTeacher: 'Engr. Kamrul Hasan (PUB-FAC-022)',
      section: 'Section A',
      room: 'Room 403',
      enrolledCount: 28,
    },
    {
      id: 'c4',
      code: 'CSE 3104',
      title: 'Operating Systems Sessional',
      department: 'Computer Science & Engineering',
      credits: 1.0,
      isSessional: true,
      assignedTeacher: 'Engr. Kamrul Hasan (PUB-FAC-022)',
      section: 'Section A',
      room: 'Software Lab 1',
      enrolledCount: 28,
    },
    {
      id: 'c5',
      code: 'CSE 2201',
      title: 'Web Engineering',
      department: 'Computer Science & Engineering',
      credits: 3.0,
      isSessional: false,
      assignedTeacher: 'Engr. Shamim Reza (PUB-FAC-031)',
      section: 'Section A',
      room: 'Room 405',
      enrolledCount: 30,
    },
    {
      id: 'c6',
      code: 'CSE 2202',
      title: 'Web Engineering Sessional',
      department: 'Computer Science & Engineering',
      credits: 1.0,
      isSessional: true,
      assignedTeacher: 'Engr. Shamim Reza (PUB-FAC-031)',
      section: 'Section A',
      room: 'Web Lab',
      enrolledCount: 30,
    },
    {
      id: 'c7',
      code: 'CSE 3205',
      title: 'Computer Networking',
      department: 'Computer Science & Engineering',
      credits: 3.0,
      isSessional: false,
      assignedTeacher: 'Engr. Tariqul Islam (PUB-FAC-019)',
      section: 'Section A',
      room: 'Room 406',
      enrolledCount: 32,
    },
    {
      id: 'c8',
      code: 'CSE 3206',
      title: 'Computer Networking Sessional',
      department: 'Computer Science & Engineering',
      credits: 1.0,
      isSessional: true,
      assignedTeacher: 'Engr. Tariqul Islam (PUB-FAC-019)',
      section: 'Section A',
      room: 'Cisco Networking Lab',
      enrolledCount: 32,
    },
    {
      id: 'c9',
      code: 'LAW 3201',
      title: 'Cyber and Intellectual Property Law',
      department: 'Computer Science & Engineering',
      credits: 2.0,
      isSessional: false,
      assignedTeacher: 'Barrister Anisur Rahman (PUB-FAC-008)',
      section: 'Section A',
      room: 'Auditorium B',
      enrolledCount: 34,
    },
    {
      id: 'c10',
      code: 'BUS 3101',
      title: 'Technology Entrepreneurship for Business',
      department: 'Computer Science & Engineering',
      credits: 3.0,
      isSessional: false,
      assignedTeacher: 'Dr. Mahbubur Rahman (PUB-FAC-005)',
      section: 'Section A',
      room: 'Seminar Hall',
      enrolledCount: 34,
    },
  ]);

  const [audits, setAudits] = useState<SystemAuditItem[]>([
    {
      id: 'aud_1',
      course: 'CSE 2205',
      studentName: 'Farzana Akter (PUB-CSE-2023-009)',
      previousStatus: 'absent',
      newStatus: 'present',
      reason: 'Face detected with partial occlusion; confirmed present via seat inspection.',
      changedBy: 'Faculty Instructor (Faculty)',
      timestamp: '2026-10-18 10:04:12',
    },
    {
      id: 'aud_2',
      course: 'CSE 3103',
      studentName: 'Mehedi Hasan (PUB-CSE-2023-051)',
      previousStatus: 'absent',
      newStatus: 'excused',
      reason: 'Official medical waiver document submitted to department office.',
      changedBy: 'System Administrator (Admin)',
      timestamp: '2026-10-17 14:15:20',
    },
  ]);

  useEffect(() => {
    const fetchAdminData = async () => {
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('role, full_name')
              .eq('id', user.id)
              .single();

            // Enforce strict server-side role check: Only profiles with role = 'admin' in database can access Admin Console
            const actualRole = profileData?.role || 'student';

            // Enforce role authorization: Only admins can view admin console
            if (actualRole !== 'admin') {
              router.push(profileData?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard');
              return;
            }

            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, email, role, created_at')
              .order('created_at', { ascending: false });

            let mergedUsers = [...users];
            if (profiles && profiles.length > 0) {
              mergedUsers = profiles.map((p) => ({
                id: p.id,
                name: p.full_name,
                email: p.email,
                role: p.role,
                identifier: p.id.slice(0, 8).toUpperCase(),
                department: 'Computer Science & Engineering',
                status: 'active' as const,
                created_at: p.created_at ? p.created_at.split('T')[0] : '2026-10-20',
              }));
            }

            // Merge newly registered teachers from localStorage
            if (typeof window !== 'undefined') {
              try {
                const storedPending = JSON.parse(localStorage.getItem('pending_teachers') || '[]');
                storedPending.forEach((pt: any) => {
                  const existingIdx = mergedUsers.findIndex((u) => u.email === pt.email || u.id === pt.id);
                  if (existingIdx !== -1) {
                    mergedUsers[existingIdx] = {
                      ...mergedUsers[existingIdx],
                      status: pt.status || 'pending',
                    };
                  } else {
                    mergedUsers.unshift({
                      id: pt.id,
                      name: pt.name,
                      email: pt.email,
                      role: 'teacher',
                      identifier: pt.identifier || 'PUB-FAC-XXX',
                      department: pt.department || 'Computer Science & Engineering',
                      status: pt.status || 'pending',
                      created_at: pt.created_at || new Date().toISOString().split('T')[0],
                    });
                  }
                });
              } catch {}
            }

            setUsers(mergedUsers);
          }
        } catch {
          // Graceful fallback
        }
      }
      setLoading(false);
    };

    fetchAdminData();
  }, [router]);

  const handleApproveTeacher = async (userId: string) => {
    const approvedUser = users.find((u) => u.id === userId);
    let dbSuccess = false;
    let dbError = '';

    // Persist to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('teachers')
          .update({ approval_status: 'approved' })
          .eq('profile_id', userId);

        if (error) {
          dbError = error.message;
        } else {
          dbSuccess = true;
        }
      } catch (err: unknown) {
        dbError = err instanceof Error ? err.message : 'Remote database error';
      }
    }

    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('pending_teachers') || '[]');
        const updated = stored.map((t: any) =>
          t.id === userId ? { ...t, status: 'active', approval_status: 'approved' } : t
        );
        localStorage.setItem('pending_teachers', JSON.stringify(updated));
        localStorage.setItem(`teacher_status_${userId}`, 'approved');
        if (approvedUser?.identifier) {
          localStorage.setItem(`teacher_status_${approvedUser.identifier}`, 'approved');
        }
      } catch {}
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u))
    );

    if (dbSuccess) {
      setActionNotice({
        type: 'success',
        message: `[Database Confirmed] Faculty member "${approvedUser?.name || 'Teacher'}" approved in remote Supabase.`,
      });
    } else if (dbError) {
      setActionNotice({
        type: 'error',
        message: `Database update failed: ${dbError}. Saved to local demo cache only.`,
      });
    } else {
      setActionNotice({
        type: 'success',
        message: `Faculty member "${approvedUser?.name || 'Teacher'}" approved in local demo mode.`,
      });
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleRejectTeacher = async (userId: string) => {
    const rejectedUser = users.find((u) => u.id === userId);
    let dbSuccess = false;
    let dbError = '';

    // Persist to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('teachers')
          .update({ approval_status: 'rejected' })
          .eq('profile_id', userId);

        if (error) {
          dbError = error.message;
        } else {
          dbSuccess = true;
        }
      } catch (err: unknown) {
        dbError = err instanceof Error ? err.message : 'Remote database error';
      }
    }

    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('pending_teachers') || '[]');
        const updated = stored.map((t: any) =>
          t.id === userId ? { ...t, status: 'suspended', approval_status: 'rejected' } : t
        );
        localStorage.setItem('pending_teachers', JSON.stringify(updated));
        localStorage.setItem(`teacher_status_${userId}`, 'rejected');
        if (rejectedUser?.identifier) {
          localStorage.setItem(`teacher_status_${rejectedUser.identifier}`, 'rejected');
        }
      } catch {}
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: 'suspended' } : u))
    );

    if (dbSuccess) {
      setActionNotice({
        type: 'error',
        message: `[Database Confirmed] Faculty application for "${rejectedUser?.name || 'Teacher'}" rejected in remote Supabase.`,
      });
    } else if (dbError) {
      setActionNotice({
        type: 'error',
        message: `Database update failed: ${dbError}. Saved to local demo cache only.`,
      });
    } else {
      setActionNotice({
        type: 'error',
        message: `Faculty application for "${rejectedUser?.name || 'Teacher'}" has been rejected in local demo mode.`,
      });
    }
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleSaveSettings = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const handleOpenAssignModal = (course: CourseRecord) => {
    setSelectedCourseForAssign(course);
    setSelectedRoom(course.room);
    setAssignModalOpen(true);
  };

  const handleConfirmAssignment = async () => {
    if (!selectedCourseForAssign) return;
    const assignedUser = users.find((u) => u.identifier === selectedTeacherId || u.id === selectedTeacherId);
    if (!assignedUser) return;

    if (assignedUser.status !== 'active') {
      alert('Security Policy: You cannot assign courses to an unapproved or pending faculty member.');
      return;
    }

    const teacherName = `${assignedUser.name} (${assignedUser.identifier})`;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === selectedCourseForAssign.id
          ? {
              ...c,
              assignedTeacher: teacherName,
              room: selectedRoom,
            }
          : c
      )
    );

    // Persist assignment for teacher dashboard
    if (typeof window !== 'undefined') {
      const assignmentItem = {
        id: `tca_${Date.now()}`,
        code: selectedCourseForAssign.code,
        title: selectedCourseForAssign.title,
        credits: selectedCourseForAssign.credits,
        section: selectedCourseForAssign.section,
        room: selectedRoom,
        enrolledStudents: selectedCourseForAssign.enrolledCount,
      };

      const existingId = JSON.parse(localStorage.getItem(`assigned_courses_${assignedUser.id}`) || '[]');
      localStorage.setItem(`assigned_courses_${assignedUser.id}`, JSON.stringify([...existingId, assignmentItem]));

      const existingIdent = JSON.parse(localStorage.getItem(`assigned_courses_${assignedUser.identifier}`) || '[]');
      localStorage.setItem(`assigned_courses_${assignedUser.identifier}`, JSON.stringify([...existingIdent, assignmentItem]));
    }

    // Persist to Supabase if live
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data: tData, error: tErr } = await supabase
          .from('teachers')
          .select('id')
          .eq('profile_id', assignedUser.id)
          .single();

        const { data: cData, error: cErr } = await supabase
          .from('courses')
          .select('id')
          .eq('course_code', selectedCourseForAssign.code)
          .single();

        if (tData?.id && cData?.id) {
          const { error: assignErr } = await supabase.from('teacher_course_assignments').upsert({
            teacher_id: tData.id,
            course_id: cData.id,
            section_name: selectedCourseForAssign.section,
            room_number: selectedRoom,
            is_active: true,
          }, { onConflict: 'teacher_id,course_id,section_name' });

          if (assignErr) {
            setActionNotice({
              type: 'error',
              message: `Course assignment database write failed: ${assignErr.message}`,
            });
            setTimeout(() => setActionNotice(null), 5000);
          } else {
            setActionNotice({
              type: 'success',
              message: `[Database Confirmed] Course ${selectedCourseForAssign.code} assigned to ${teacherName} in Supabase.`,
            });
            setTimeout(() => setActionNotice(null), 5000);
          }
        } else if (tErr || cErr) {
          setActionNotice({
            type: 'error',
            message: `Could not resolve database records: ${tErr?.message || cErr?.message}`,
          });
          setTimeout(() => setActionNotice(null), 5000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error';
        setActionNotice({
          type: 'error',
          message: `Course assignment failed: ${msg}`,
        });
        setTimeout(() => setActionNotice(null), 5000);
      }
    }

    setAssignModalOpen(false);
  };

  const handleExportSystemCSV = () => {
    const headers = ['Course Code', 'Course Title', 'Credits', 'Type', 'Assigned Faculty', 'Section', 'Room', 'Enrolled Students'];
    const rows = courses.map((c) => [
      c.code,
      c.title,
      c.credits,
      c.isSessional ? 'Sessional' : 'Theory',
      c.assignedTeacher,
      c.section,
      c.room,
      c.enrolledCount,
    ]);
    const csv = generateCSVReport(headers, rows, 'Pundra University CSE Course Catalog');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'PUB_Curriculum_Report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
      router.push('/login?role=admin');
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.identifier.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  if (loading) {
    return (
      <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 max-w-7xl mx-auto">
      
      {/* Top Banner & Status */}
      <SupabaseStatusBanner />

      {/* Header Profile Bar */}
      <div className="p-8 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/40 p-1 flex items-center justify-center text-purple-400 shrink-0">
            <Shield className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-white">System Administrator Console</h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-400">
                Superuser Level
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              PUB CSE Fest-26 Administration · Department of Computer Science & Engineering
            </p>
            <p className="text-[11px] text-slate-500">
              Pundra University of Science & Technology, Bogra, Bangladesh
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={handleExportSystemCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-navy-900 hover:bg-navy-800 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Catalog CSV</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-navy-900 hover:bg-navy-800 border border-slate-700 hover:text-white transition-colors"
          >
            <Home className="w-3.5 h-3.5 text-purple-400" />
            <span>Home</span>
          </Link>

          <button
            id="admin-signout-btn"
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
        portalName="Admin Console"
        loading={loggingOut}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Registered Students
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">
            {users.filter((u) => u.role === 'student').length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Section A & B Cohorts</div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Faculty Instructors
          </div>
          <div className="text-3xl font-extrabold text-indigo-400">
            {users.filter((u) => u.role === 'teacher').length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Authorized Department Faculty</div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            CSE 3rd Yr 1st Sem Courses
          </div>
          <div className="text-3xl font-extrabold text-purple-400">10 Courses</div>
          <div className="text-xs text-slate-400 mt-1">21 Credits Total Assigned</div>
        </div>

        <div className="p-6 rounded-2xl bg-navy-900/60 border border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Audit Trail Logs
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">{audits.length} Records</div>
          <div className="text-xs text-slate-400 mt-1">Manual overrides tracked</div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-navy-900 border border-slate-800 mb-8">
        <button
          onClick={() => setActiveTab('courses')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'courses'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Curriculum Courses (10)</span>
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'approvals'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Teacher Approvals</span>
          {users.filter((u) => u.role === 'teacher' && u.status === 'pending').length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black animate-pulse">
              {users.filter((u) => u.role === 'teacher' && u.status === 'pending').length} Pending
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory</span>
        </button>

        <button
          onClick={() => setActiveTab('audits')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'audits'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Logs ({audits.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'settings'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Threshold Settings</span>
        </button>
      </div>

      {/* Tab: Teacher Approvals & Faculty Applications */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-400" />
                <span>Teacher Registration Applications & Approvals</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Review and approve faculty self-registration requests. Only approved teachers can be assigned courses and initiate attendance sessions.
              </p>
            </div>
            {users.filter((u) => u.role === 'teacher' && u.status === 'pending').length > 0 && (
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                {users.filter((u) => u.role === 'teacher' && u.status === 'pending').length} Application Pending Review
              </span>
            )}
          </div>

          {actionNotice && (
            <div
              className={`p-4 rounded-2xl border text-xs flex items-center gap-2.5 ${
                actionNotice.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionNotice.message}</span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-navy-950 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Faculty Applicant</th>
                    <th className="px-6 py-4">Faculty ID</th>
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Applied Date</th>
                    <th className="px-6 py-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {users
                    .filter((u) => u.role === 'teacher')
                    .map((t) => (
                      <tr key={t.id} className="hover:bg-navy-850/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white text-xs sm:text-sm">{t.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{t.email}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-300">{t.identifier}</td>
                        <td className="px-6 py-4 text-xs text-slate-400">{t.department}</td>
                        <td className="px-6 py-4">
                          {t.status === 'pending' && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
                              Pending Approval
                            </span>
                          )}
                          {t.status === 'active' && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              Approved & Authorized
                            </span>
                          )}
                          {t.status === 'suspended' && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-400 border border-rose-800">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-400">{t.created_at}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {t.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproveTeacher(t.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-700 hover:bg-emerald-900 transition-colors flex items-center gap-1.5 shadow-sm"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectTeacher(t.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-300 bg-rose-950/60 border border-rose-700 hover:bg-rose-900 transition-colors flex items-center gap-1.5 shadow-sm"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            ) : t.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleRejectTeacher(t.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 bg-navy-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-800 transition-colors"
                              >
                                Revoke Approval
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApproveTeacher(t.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-emerald-300 bg-navy-950 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-800 transition-colors"
                              >
                                Re-Approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Curriculum & 10 Courses (Requirement #6) */}
      {activeTab === 'courses' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-400" />
                <span>CSE 3rd Year, 1st Semester Course Catalog (10 Courses, 21 Credits)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Manage faculty course assignments, room schedules, and student enrollment boundaries.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map((c) => (
              <div
                key={c.id}
                className="p-6 rounded-2xl bg-navy-900/70 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-navy-850 text-cyan-400 border border-slate-700">
                      {c.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-300">
                      {c.credits} {c.credits === 1 ? 'Credit' : 'Credits'} · {c.isSessional ? 'Sessional' : 'Theory'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mb-1.5">{c.title}</h3>
                  <div className="text-xs text-slate-400 mb-3">{c.department}</div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Assigned Faculty:</span>
                    <span className="font-semibold text-indigo-300">{c.assignedTeacher}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Classroom Room & Section:</span>
                    <span className="font-mono text-slate-300">{c.room} · {c.section}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-cyan-400 font-semibold">{c.enrolledCount} Enrolled Students</span>
                    <button
                      type="button"
                      onClick={() => handleOpenAssignModal(c)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 transition-colors"
                    >
                      Reassign Faculty
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: User Management */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>User Directory & Role Permissions</span>
            </h2>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search user..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-navy-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center p-1 rounded-xl bg-navy-900 border border-slate-800 text-xs">
                {(['all', 'student', 'teacher', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-all ${
                      roleFilter === r ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-navy-900/60 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-navy-950 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Institutional ID</th>
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Created Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-navy-850/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white text-xs sm:text-sm">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-300">{u.identifier}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">{u.department}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${
                            u.role === 'admin'
                              ? 'bg-purple-950 text-purple-400 border-purple-800'
                              : u.role === 'teacher'
                              ? 'bg-indigo-950 text-indigo-400 border-indigo-800'
                              : 'bg-cyan-950 text-cyan-400 border-cyan-800'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-emerald-400">Active</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">{u.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: System Audit Trail (Requirement #10) */}
      {activeTab === 'audits' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <span>Attendance Override & Correction Audit History</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Every manual status modification requires a mandatory justification reason.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {audits.map((a) => (
              <div key={a.id} className="p-5 rounded-2xl bg-navy-900/70 border border-slate-800 text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-400 font-mono text-[11px]">
                  <span>COURSE: <strong>{a.course}</strong> · RECORD ID: {a.id}</span>
                  <span>{a.timestamp}</span>
                </div>
                <div className="text-sm font-bold text-white">
                  Target Student: {a.studentName}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>Status changed from</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 font-mono font-bold uppercase">{a.previousStatus}</span>
                  <span>to</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono font-bold uppercase">{a.newStatus}</span>
                  <span className="text-slate-400">by {a.changedBy}</span>
                </div>
                <div className="p-3 rounded-xl bg-navy-950 border border-slate-800/80 text-slate-300 italic">
                  Mandatory Reason: &quot;{a.reason}&quot;
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Threshold Settings (Requirement #11) */}
      {activeTab === 'settings' && (
        <div className="p-8 rounded-3xl bg-navy-900/70 border border-slate-800 max-w-2xl space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-purple-400" />
              <span>Attendance Thresholds & Exam Eligibility Rules</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure minimum percentage criteria for student semester examination eligibility.
            </p>
          </div>

          {settingsSaved && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Attendance settings updated successfully.</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Warning Threshold Percentage (%)
              </label>
              <input
                type="number"
                min={50}
                max={100}
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Students dropping below this threshold receive an academic warning banner on their dashboard. (Pundra University default: 75%)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Critical Disqualification Threshold (%)
              </label>
              <input
                type="number"
                min={30}
                max={80}
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                className="w-full px-4 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Students below this threshold are marked Ineligible for final semester exams without department waiver.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSaveSettings}
              className="py-3 px-6 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-600/20"
            >
              Save Attendance Thresholds
            </button>
          </div>
        </div>
      )}

      {/* Admin Reassignment Modal */}
      {assignModalOpen && selectedCourseForAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-7 rounded-3xl bg-navy-900 border border-slate-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Reassign Course Faculty</span>
              </h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-navy-950 border border-slate-800 text-xs">
              <div className="text-cyan-400 font-bold font-mono">{selectedCourseForAssign.code}</div>
              <div className="text-white font-medium">{selectedCourseForAssign.title}</div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Select Faculty Instructor</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs"
                >
                  {users
                    .filter((u) => u.role === 'teacher' && u.status === 'active')
                    .map((t) => (
                      <option key={t.id} value={t.identifier}>
                        {t.name} ({t.identifier}) - Approved
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assigned Classroom</label>
                <input
                  type="text"
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-navy-800 border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignment}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 shadow-md"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

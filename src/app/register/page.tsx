'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { GraduationCap, Users2, Shield, ArrowRight, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role');
  const initialRole = roleParam === 'teacher' ? 'teacher' : 'student';

  const [role, setRole] = useState<'student' | 'teacher'>(initialRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Student-specific fields
  const [studentId, setStudentId] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [batch, setBatch] = useState('Spring 2026');
  const [semester, setSemester] = useState('6th Semester');

  // Teacher-specific fields
  const [teacherId, setTeacherId] = useState('');
  const [designation, setDesignation] = useState('Lecturer');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const param = searchParams.get('role');
    if (param === 'teacher') setRole('teacher');
    else setRole('student'); // Missing or invalid role parameters safely default to student, NEVER teacher
  }, [searchParams]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Input Validation
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (role === 'student' && !studentId.trim()) {
      setErrorMsg('Please enter your official Student ID Number.');
      return;
    }

    if (role === 'teacher' && !teacherId.trim()) {
      setErrorMsg('Please enter your official Teacher ID Number.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMsg(
        'Supabase is not yet configured with live credentials in .env.local. Please add your SUPABASE_URL and ANON_KEY first.'
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const userMetadata: Record<string, string> = {
        full_name: fullName,
        role: role,
        department: department,
      };

      if (role === 'student') {
        userMetadata.student_id_number = studentId;
        userMetadata.batch = batch;
        userMetadata.semester = semester;
      } else {
        userMetadata.teacher_id_number = teacherId;
        userMetadata.designation = designation;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: userMetadata,
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.user) {
        // Check if email confirmation is required by Supabase
        if (data.session) {
          setSuccessMsg('Registration successful! Redirecting to your dashboard...');
          setTimeout(() => {
            router.push(`/${role}/dashboard`);
          }, 1500);
        } else {
          setSuccessMsg(
            'Registration successful! Please check your email inbox to verify your account before logging in.'
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 flex items-center justify-center relative">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        
        {/* Status banner */}
        <SupabaseStatusBanner />

        {/* Card Container */}
        <div className="p-8 sm:p-10 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl">
          
          {/* Header */}
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Create Your Account
            </h1>
            <p className="text-sm text-slate-400">
              PUB AttendEye · Pundra University Smart Attendance
            </p>
          </div>

          {/* Role Tabs */}
          <div className="grid grid-cols-2 p-1.5 rounded-2xl bg-navy-900 border border-slate-800 mb-8">
            <button
              type="button"
              onClick={() => {
                setRole('student');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                role === 'student'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Student</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRole('teacher');
                setErrorMsg('');
              }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                role === 'teacher'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users2 className="w-4 h-4" />
              <span>Teacher / Faculty</span>
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Full Name <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Full Legal Name"
                className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                autoComplete="name"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Institutional / Personal Email <span className="text-cyan-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="institutional-email@pundra.edu.bd"
                className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                autoComplete="email"
              />
            </div>

            {/* Student Specific Fields */}
            {role === 'student' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Student ID <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. PUB-CSE-YYYY-XXX"
                    className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Semester
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                    <option value="3rd Semester">3rd Semester</option>
                    <option value="4th Semester">4th Semester</option>
                    <option value="5th Semester">5th Semester</option>
                    <option value="6th Semester">6th Semester</option>
                    <option value="7th Semester">7th Semester</option>
                    <option value="8th Semester">8th Semester</option>
                  </select>
                </div>
              </div>
            )}

            {/* Teacher Specific Fields */}
            {role === 'teacher' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Teacher / Faculty ID <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                    placeholder="e.g. PUB-FAC-XXX"
                    className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    Designation
                  </label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  >
                    <option value="Lecturer">Lecturer</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                  </select>
                </div>
              </div>
            )}

            {/* Department (Common) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Department
              </label>
              <input
                type="text"
                disabled
                value={department}
                className="w-full px-4 py-3 rounded-xl bg-navy-900/50 border border-slate-800 text-slate-400 text-sm cursor-not-allowed"
              />
            </div>

            {/* Passwords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Password <span className="text-cyan-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:text-cyan-400"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Confirm Password <span className="text-cyan-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:text-cyan-400"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering Account...</span>
                </>
              ) : (
                <>
                  <span>{role === 'student' ? 'Create Student Account' : 'Create Faculty Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Navigation */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <Link
                href={`/login?role=${role}`}
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Log In Here
              </Link>
            </p>
            <div className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 pt-1">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>Admin accounts cannot be self-registered. Managed by Pundra University IT.</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

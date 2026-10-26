'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { GraduationCap, Users2, Shield, ArrowRight, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleParam = searchParams.get('role');
  const initialRole: 'student' | 'teacher' | 'admin' =
    roleParam === 'teacher' ? 'teacher' : roleParam === 'admin' ? 'admin' : 'student';
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [existingSession, setExistingSession] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'teacher') setRole('teacher');
    else if (roleParam === 'admin') setRole('admin');
    else if (roleParam === 'student') setRole('student');
    else setRole('student'); // Missing or invalid role parameters safely default to student, NEVER teacher

    const msg = searchParams.get('message');
    if (msg) setErrorMsg(msg);

    // Detect if the user already has an active session to preserve across navigation
    const checkActiveSession = async () => {
      if (!isSupabaseConfigured()) return;
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const userRole = (session.user.user_metadata?.role as string) || 'student';
          try {
            const { data } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single();
            setExistingSession({
              email: session.user.email || '',
              role: data?.role || userRole,
            });
          } catch {
            setExistingSession({
              email: session.user.email || '',
              role: userRole,
            });
          }
        }
      } catch {}
    };

    checkActiveSession();
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMsg(
        'Supabase is not configured with live credentials in .env.local. Please configure your project first.'
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Sign in with password via Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('Invalid email address or password. Please verify your details.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Email address not yet confirmed. Please verify your email inbox.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      if (data.user) {
        // Fetch server-assigned profile role to prevent role spoofing (Never trust client-supplied user_metadata for elevated privileges)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', data.user.id)
          .single();

        // Enforce server-side role from public.profiles table
        const actualRole: 'student' | 'teacher' | 'admin' = profile?.role
          ? (profile.role as 'student' | 'teacher' | 'admin')
          : ((data.user.user_metadata?.role === 'teacher' ? 'teacher' : 'student') as 'student' | 'teacher');

        // Validate that user is logging into a portal their role authorizes
        if (role === 'admin') {
          if (profile?.role !== 'admin') {
            setErrorMsg('Access Denied: Your account does not have verified Administrator privileges in the database.');
            setLoading(false);
            return;
          }
        }

        if (role === 'teacher' && actualRole !== 'teacher' && actualRole !== 'admin') {
          setErrorMsg('Access Denied: Student accounts cannot access the Teacher Portal.');
          setLoading(false);
          return;
        }

        // Check teacher approval status to block rejected accounts
        if (actualRole === 'teacher') {
          let teacherStatus = (data.user.user_metadata?.approval_status as string) || 'approved';
          try {
            const { data: teacherData } = await supabase
              .from('teachers')
              .select('approval_status')
              .eq('profile_id', data.user.id)
              .single();
            if (teacherData?.approval_status) {
              teacherStatus = teacherData.approval_status;
            }
          } catch {}

          if (typeof window !== 'undefined') {
            const stored = JSON.parse(localStorage.getItem('pending_teachers') || '[]');
            const match = stored.find(
              (t: any) =>
                (t.email && data.user.email && t.email.toLowerCase() === data.user.email.toLowerCase()) ||
                t.id === data.user.id
            );
            if (match?.status) {
              teacherStatus = match.status;
            }
            const directStatus = localStorage.getItem(`teacher_approval_${data.user.id}`);
            if (directStatus) {
              teacherStatus = directStatus;
            }
          }

          if (teacherStatus === 'rejected') {
            setErrorMsg('Access Denied: Your faculty registration application was rejected by the Academic Administrator.');
            setLoading(false);
            return;
          }
        }

        const displayName = profile?.full_name || data.user.user_metadata?.full_name || 'Faculty Member';
        setSuccessMsg(`Welcome back, ${displayName}! Redirecting to dashboard...`);

        setTimeout(() => {
          if (role === 'teacher' && (actualRole === 'teacher' || actualRole === 'admin')) {
            router.push('/teacher/dashboard');
          } else if (actualRole === 'admin') {
            router.push('/admin/dashboard');
          } else if (actualRole === 'teacher') {
            router.push('/teacher/dashboard');
          } else {
            router.push('/student/dashboard');
          }
        }, 1200);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during authentication.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 flex items-center justify-center relative">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-cyan-600/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        
        {/* Connection status banner */}
        <SupabaseStatusBanner />

        <div className="p-8 sm:p-10 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl">
          
          {/* Active Session Notice across Navigation */}
          {existingSession && (
            <div className="mb-6 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300">Active Session Preserved</span>
                <span className="capitalize px-2 py-0.5 rounded-md bg-cyan-900/60 text-[10px] font-bold border border-cyan-700/50">
                  {existingSession.role}
                </span>
              </div>
              <p className="text-slate-300">
                You are currently signed in as <strong className="text-white">{existingSession.email}</strong>.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <Link
                  href={`/${existingSession.role}/dashboard`}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Return to {existingSession.role} Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Header & Role Switcher: Teacher Portal is Isolated */}
          {role === 'teacher' ? (
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
                <Users2 className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Teacher Portal Access
              </h1>
              <p className="text-sm text-slate-400">
                Pundra University Faculty & Instructor Authentication
              </p>
              <div className="pt-2 flex items-center justify-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/60 border border-indigo-700/60 text-indigo-300">
                  <Users2 className="w-3.5 h-3.5" />
                  <span>Faculty & Teacher Portal</span>
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Portal Access
                </h1>
                <p className="text-sm text-slate-400">
                  PUB AttendEye · Pundra University
                </p>
              </div>

              {/* 2-Role Switcher Tabs for Student and Admin */}
              <div className="grid grid-cols-2 p-1 rounded-2xl bg-navy-900 border border-slate-800 mb-8">
                <button
                  type="button"
                  onClick={() => {
                    setRole('student');
                    setErrorMsg('');
                  }}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    role === 'student'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 mb-0.5" />
                  <span>Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRole('admin');
                    setErrorMsg('');
                  }}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    role === 'admin'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Shield className="w-4 h-4 mb-0.5" />
                  <span>Admin</span>
                </button>
              </div>
            </>
          )}

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

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5" autoComplete="on">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="institutional-email@pundra.edu.bd"
                className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-300">Password</label>
                <Link
                  id="forgot-password-link"
                  href={`/forgot-password${role ? `?role=${role}` : ''}`}
                  className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  autoComplete="current-password"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span className="capitalize">Sign In to {role} Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Info */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center space-y-2">
            {role === 'teacher' ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Don’t have a faculty account yet?{' '}
                  <Link
                    href="/register?role=teacher"
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Register as Faculty Member
                  </Link>
                </p>
                <p className="text-[11px] text-slate-500">
                  <Link href="/#portals" className="hover:text-slate-300 transition-colors">
                    ← Return to university portals
                  </Link>
                </p>
              </div>
            ) : role === 'student' ? (
              <p className="text-xs text-slate-400">
                Don’t have an account yet?{' '}
                <Link
                  href="/register?role=student"
                  className="text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Register as Student
                </Link>
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Admin accounts are provisioned directly in Supabase SQL editor using <code className="text-cyan-400">public.promote_to_admin()</code>.
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

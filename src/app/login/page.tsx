'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { GraduationCap, Users2, Shield, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'teacher') setRole('teacher');
    else if (roleParam === 'admin') setRole('admin');
    else if (roleParam === 'student') setRole('student');

    const msg = searchParams.get('message');
    if (msg) setErrorMsg(msg);
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
          setErrorMsg('Invalid institutional email or password. Please verify your details.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Email address not yet confirmed. Please verify your email inbox.');
        } else {
          setErrorMsg(error.message);
        }
        return;
      }

      if (data.user) {
        // Fetch server-assigned profile role to prevent role spoofing
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', data.user.id)
          .single();

        const actualRole = profile?.role || 'student';

        setSuccessMsg(`Welcome back, ${profile?.full_name || 'User'}! Redirecting to dashboard...`);

        setTimeout(() => {
          if (actualRole === 'admin') {
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
          
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Portal Access
            </h1>
            <p className="text-sm text-slate-400">
              PUB AttendEye · Pundra University
            </p>
          </div>

          {/* 3-Role Switcher Tabs */}
          <div className="grid grid-cols-3 p-1 rounded-2xl bg-navy-900 border border-slate-800 mb-8">
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
                setRole('teacher');
                setErrorMsg('');
              }}
              className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                role === 'teacher'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users2 className="w-4 h-4 mb-0.5" />
              <span>Teacher</span>
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
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'admin' ? 'admin@pundra.edu.bd' : `${role}@pundra.edu.bd`}
                className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300">Password</label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
              />
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
            {role !== 'admin' ? (
              <p className="text-xs text-slate-400">
                Don’t have an account yet?{' '}
                <Link
                  href={`/register?role=${role}`}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Register as {role === 'student' ? 'Student' : 'Faculty'}
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

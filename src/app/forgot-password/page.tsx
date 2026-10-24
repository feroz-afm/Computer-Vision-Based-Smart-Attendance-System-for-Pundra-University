'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { GraduationCap, Users2, Shield, ArrowRight, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Mail } from 'lucide-react';

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'teacher') setRole('teacher');
    else if (roleParam === 'admin') setRole('admin');
    else setRole('student');
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your account email address.');
      return;
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (e.g. name@pundra.edu.bd).');
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMsg(
        'Supabase is not configured with live credentials in .env.local. Please check your project settings.'
      );
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      
      // Determine callback redirect URL
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const redirectTo = `${origin}/auth/callback?next=/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        // Log to console for debugging, but don't leak user enumeration details
        console.warn('Password recovery request notice:', error.message);
        // Supabase rate-limits or network errors should be shown clearly
        if (error.status === 429 || error.message.toLowerCase().includes('rate limit')) {
          setErrorMsg('Too many recovery requests. Please wait a few minutes before trying again.');
          setLoading(false);
          return;
        }
      }

      // Always show generic confirmation state to prevent account enumeration
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred while requesting password recovery.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-6 flex items-center justify-center relative">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] bg-cyan-600/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <SupabaseStatusBanner />

        <div className="p-8 sm:p-10 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl">
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-2">
              <Mail className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Reset Password
            </h1>
            <p className="text-sm text-slate-400">
              PUB AttendEye · Password Recovery
            </p>
          </div>

          {/* Role badge */}
          <div className="flex items-center justify-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-navy-900 border border-slate-700 text-slate-300 capitalize">
              {role === 'student' && <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />}
              {role === 'teacher' && <Users2 className="w-3.5 h-3.5 text-indigo-400" />}
              {role === 'admin' && <Shield className="w-3.5 h-3.5 text-purple-400" />}
              <span>{role} Portal Recovery</span>
            </span>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {submitted ? (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Recovery Instructions Sent</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  If an account exists with <strong className="text-white">{email}</strong>, a secure password recovery link has been sent.
                </p>
                <p className="text-slate-400 text-[11px] leading-relaxed pt-1">
                  Please check your inbox (and spam/junk folder). The link is time-limited and single-use for security.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-navy-900 border border-slate-700 hover:bg-navy-800 transition-colors"
                >
                  Send another recovery link
                </button>

                <Link
                  href={`/login?role=${role}`}
                  className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to Sign In</span>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-300 mb-2">
                  Account Email Address
                </label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="institutional-email@pundra.edu.bd"
                  className="w-full px-4 py-3 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                  autoComplete="email"
                  disabled={loading}
                />
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Enter the email associated with your PUB AttendEye account.
                </p>
              </div>

              <button
                id="submit-forgot-password"
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Recovery Link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Password Reset Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="mt-6 pt-6 border-t border-slate-800 text-center">
                <Link
                  href={`/login?role=${role}`}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

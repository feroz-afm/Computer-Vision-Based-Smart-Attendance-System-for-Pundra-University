'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { SupabaseStatusBanner } from '@/components/SupabaseStatusBanner';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if query string contains an error from auth callback
    const queryError = searchParams.get('error') || searchParams.get('error_description');
    if (queryError) {
      setSessionError(decodeURIComponent(queryError));
      setCheckingSession(false);
      return;
    }

    // Check hash parameters for implicit flow errors (e.g. #error=access_denied&error_description=...)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashError = hashParams.get('error_description') || hashParams.get('error');
      if (hashError) {
        setSessionError(decodeURIComponent(hashError));
        setCheckingSession(false);
        return;
      }
    }

    if (!isSupabaseConfigured()) {
      setSessionError('Supabase is not configured. Please verify your environment configuration.');
      setCheckingSession(false);
      return;
    }

    const supabase = createClient();

    // Verify if there is an active authenticated recovery session
    const verifySession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasValidSession(true);
        } else {
          // If no immediate session, check for recovery hash tokens
          if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
            // Hash tokens present, allow Supabase client to process them
            setHasValidSession(true);
          } else {
            setSessionError(
              'No active password recovery session detected. Reset links are single-use and expire after a limited period.'
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to verify recovery session.';
        setSessionError(msg);
      } finally {
        setCheckingSession(false);
      }
    };

    // Also listen to auth state changes in case token exchange is happening asynchronously
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED'))) {
        setHasValidSession(true);
        setSessionError('');
        setCheckingSession(false);
      }
    });

    verifySession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!password || !confirmPassword) {
      setErrorMsg('Please enter and confirm your new password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Update password using the active authenticated recovery session
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.user) {
        setSuccess(true);
        // Cleanly terminate recovery session to avoid stale credentials or redirect loops
        try {
          await supabase.auth.signOut();
        } catch {}
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while updating your password.';
      setErrorMsg(msg);
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
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Create New Password
            </h1>
            <p className="text-sm text-slate-400">
              PUB AttendEye · Account Security
            </p>
          </div>

          {checkingSession ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-xs">Verifying recovery authorization...</p>
            </div>
          ) : sessionError && !hasValidSession ? (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-rose-300 text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>Recovery Link Invalid or Expired</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {sessionError}
                </p>
                <p className="text-slate-400 text-[11px] leading-relaxed pt-1">
                  For your protection, password recovery links are single-use and valid for a short window.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/forgot-password"
                  className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <span>Request New Reset Link</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/login"
                  className="w-full py-2.5 rounded-xl text-xs font-medium text-slate-300 bg-navy-900 border border-slate-700 hover:bg-navy-800 transition-colors text-center"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Password Reset Successfully!</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Your PUB AttendEye password has been updated securely. You can now sign in with your new password.
                </p>
              </div>

              <Link
                href="/login"
                className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 text-center"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5" noValidate>
              {errorMsg && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-cyan-200 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Authenticated recovery session verified.</span>
              </div>

              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    name="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    autoComplete="new-password"
                    disabled={loading}
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
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Must be at least 6 characters long.
                </p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-navy-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400 transition-colors"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:text-cyan-400"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                id="submit-reset-password"
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="mt-6 pt-6 border-t border-slate-800 text-center">
                <Link
                  href="/login"
                  className="text-xs text-slate-400 hover:text-cyan-400 transition-colors font-medium"
                >
                  Cancel and Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen pt-32 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

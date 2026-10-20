'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error securely without exposing sensitive payload details
    console.error('App Router Caught Error:', error.message);
  }, [error]);

  return (
    <div className="min-h-screen pt-32 pb-20 px-6 flex items-center justify-center">
      <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl bg-navy-850/90 border border-slate-700/80 shadow-2xl backdrop-blur-xl text-center space-y-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-500/40 p-3 flex items-center justify-center text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Something went wrong</h2>
          <p className="text-sm text-slate-400">
            An unexpected error occurred while processing your request. Please try again.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-md shadow-cyan-500/20 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-xs text-slate-300 hover:text-white bg-navy-900 border border-slate-700 hover:border-slate-600 transition-all"
          >
            <Home className="w-3.5 h-3.5 text-cyan-400" />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

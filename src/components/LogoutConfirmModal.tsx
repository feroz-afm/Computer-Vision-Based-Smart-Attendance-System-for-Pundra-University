'use client';

import React from 'react';
import { LogOut, AlertTriangle, X, Loader2 } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  portalName?: string;
}

export function LogoutConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
  loading = false,
  portalName = 'Portal',
}: LogoutConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-md p-6 sm:p-8 rounded-3xl bg-navy-900 border border-slate-700/80 shadow-2xl space-y-6 text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Icon (behaves as Cancel) */}
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Close dialog"
          className="absolute top-5 right-5 p-1 text-slate-400 hover:text-white rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Icon and Header */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
            <LogOut className="w-6 h-6" />
          </div>
          <div>
            <h2 id="logout-modal-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Confirm Sign Out
            </h2>
            <p className="text-xs text-slate-400">
              PUB AttendEye · {portalName}
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed bg-navy-950/60 p-4 rounded-2xl border border-slate-800">
          <p>
            Are you sure you want to log out of your account?
          </p>
          <p className="text-slate-400 text-xs">
            Your active session will be ended. To stay signed in and keep working, click <strong className="text-slate-200">Cancel</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            id="cancel-logout-btn"
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 bg-navy-800 hover:bg-navy-750 border border-slate-700 hover:text-white transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="confirm-logout-btn"
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 shadow-lg shadow-rose-950/40 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing Out...</span>
              </>
            ) : (
              <span>Yes, Log Out</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

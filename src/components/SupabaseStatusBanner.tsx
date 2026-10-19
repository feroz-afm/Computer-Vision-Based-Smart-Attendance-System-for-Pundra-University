'use client';

import React, { useEffect, useState } from 'react';
import { isSupabaseConfigured, createClient } from '@/lib/supabase/client';
import { AlertCircle, CheckCircle2, Database, ExternalLink } from 'lucide-react';

export const SupabaseStatusBanner = () => {
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      const isConfig = isSupabaseConfigured();
      setConfigured(isConfig);

      if (!isConfig) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { error } = await supabase.from('courses').select('id').limit(1);
        // If no error or table exists, we have connection
        if (!error || error.code === 'PGRST116') {
          setConnected(true);
        } else {
          // Connected to project, but tables might not be migrated yet
          setConnected(false);
        }
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, []);

  if (loading) return null;

  if (!configured) {
    return (
      <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-amber-300 flex items-center gap-2">
              <span>Supabase Connection: Setup Required</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 uppercase">
                Configuration Pending
              </span>
            </div>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Your <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-300">.env.local</code> currently has placeholder values. To enable live authentication and real database persistence:
            </p>
            <ol className="list-decimal list-inside text-xs space-y-1 pt-1 text-amber-200/90">
              <li>Open your Supabase project dashboard at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5 text-amber-300">supabase.com <ExternalLink className="w-3 h-3" /></a></li>
              <li>Copy Project URL and Anon Key into <code className="bg-black/30 px-1 py-0.5 rounded">.env.local</code></li>
              <li>Run the SQL script from <code className="bg-black/30 px-1 py-0.5 rounded">supabase/schema.sql</code> in the Supabase SQL Editor</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="mb-6 p-4 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-sky-200">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-sky-300">
              Supabase Project Configured · Database Schema Setup
            </div>
            <p className="text-xs text-sky-200/80">
              Credentials detected. If tables are not yet created, execute <code className="bg-black/30 px-1.5 py-0.5 rounded text-sky-300">supabase/schema.sql</code> in the Supabase SQL editor to create required tables and RLS policies.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-xs">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-medium">Connected to Supabase PostgreSQL & Authentication</span>
      </div>
      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        Live Backend
      </span>
    </div>
  );
};

'use client';

import React from 'react';
import { Landmark, Users, Layers, Trophy } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: Landmark,
    title: 'Pundra University',
    subtitle: 'Bogra, Bangladesh',
  },
  {
    icon: Users,
    title: 'Triple-Portal Architecture',
    subtitle: 'Student, Teacher, and Admin',
  },
  {
    icon: Layers,
    title: 'Modern Cloud Architecture',
    subtitle: 'Next.js, Supabase & PostgreSQL',
  },
  {
    icon: Trophy,
    title: 'PUB CSE Fest 2026',
    subtitle: 'Hackathon Innovation Track',
  },
];

export const InfoStrip = () => {
  return (
    <section className="py-12 bg-navy-950 border-y border-slate-800/80">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HIGHLIGHTS.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 rounded-xl bg-navy-900/40 border border-slate-850"
            >
              <div className="w-12 h-12 rounded-xl bg-navy-850 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                <h.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{h.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">{h.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

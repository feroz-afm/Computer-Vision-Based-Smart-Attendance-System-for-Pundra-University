'use client';

import React from 'react';
import Image from 'next/image';
import { Camera, Cpu, Database, BarChart3, ShieldCheck, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    title: 'Camera Feed Initiation',
    desc: 'The instructor starts the verified class session from their portal, capturing the classroom lecture hall.',
    icon: Camera,
  },
  {
    step: '02',
    title: 'Facial Detection & Landmark Alignment',
    desc: 'The vision pipeline extracts face crops and computes biometric embeddings with anti-spoofing verification.',
    icon: Cpu,
  },
  {
    step: '03',
    title: 'PostgreSQL Auto-Record via Supabase',
    desc: 'Attendance status (Present, Late, Absent) is matched and committed instantly with timestamp and confidence metrics.',
    icon: Database,
  },
  {
    step: '04',
    title: 'Dynamic Analytics & Reports',
    desc: 'Students receive instant verification, while instructors and department chairs access filterable attendance summaries.',
    icon: BarChart3,
  },
];

export const AboutSection = () => {
  return (
    <section className="py-24 relative scroll-mt-20" id="university">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* Section Header: University Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-20">
          
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-navy-900 border border-slate-700 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Institutional Context
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Designed specifically for <br />
              <span className="text-cyan-400">Pundra University</span>
            </h2>

            <p className="text-base text-slate-300 leading-relaxed">
              Pundra University of Science & Technology (PUB), located in Bogra, Bangladesh, fosters technological advancement and applied innovation. PUB AttendEye represents student-led initiative to modernize campus logistics through reliable artificial intelligence.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <CheckCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <span>Replaces error-prone manual paper registers with automated database accuracy.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <CheckCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <span>Ensures academic integrity with anti-proxy biometric face recognition policies.</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-slate-300">
                <CheckCircle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <span>Supports departmental auditing across Computer Science & Engineering semesters.</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden border border-slate-700/80 shadow-2xl shadow-navy-950/80 group">
              <div className="relative aspect-[16/10] w-full">
                <Image
                  src="/assets/Pundra University.jpeg"
                  alt="Pundra University of Science and Technology campus, Bogra"
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/20 to-transparent" />
                <div className="absolute bottom-5 left-6 right-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">Campus Landmark</div>
                  <div className="text-lg font-bold text-white">Pundra University of Science & Technology</div>
                  <div className="text-xs text-slate-300">Bogra, Bangladesh</div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* How It Works Steps */}
        <div className="pt-8 scroll-mt-28" id="how-it-works">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              How PUB AttendEye Works
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              A frictionless end-to-end pipeline connecting classroom vision to high-performance PostgreSQL records.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="relative rounded-2xl p-6 bg-navy-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-extrabold px-3 py-1 rounded-lg bg-navy-800 text-cyan-400 border border-slate-700">
                      STEP {s.step}
                    </span>
                    <s.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h4 className="text-base font-bold text-white mb-2">{s.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};

'use client';

import React from 'react';
import Image from 'next/image';
import { Crown, Code, Sparkles, BrainCircuit, FileText } from 'lucide-react';

const TEAM_ROLES = [
  { role: 'UI/UX & Frontend Architecture', icon: Code, desc: 'Responsive interfaces & design system', color: 'text-cyan-400' },
  { role: 'Backend & Supabase Engineering', icon: Sparkles, desc: 'PostgreSQL, RLS security & authentication', color: 'text-indigo-400' },
  { role: 'Machine Learning & Vision Research', icon: BrainCircuit, desc: 'Face recognition & embedding pipeline', color: 'text-cyan-300' },
  { role: 'Technical Research & Documentation', icon: FileText, desc: 'System specifications & SRS documentation', color: 'text-indigo-300' },
];

export const TeamSection = () => {
  return (
    <section className="py-24 bg-navy-900/40 relative border-t border-slate-800/80" id="team">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-navy-800 border border-slate-700 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Hackathon Development Team
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Meet the Minds Behind PUB AttendEye
          </h2>
          <p className="text-base text-slate-400 leading-relaxed">
            Developed for the <span className="text-cyan-400 font-semibold">PUB CSE Fest 2026 Hackathon</span> by Computer Science & Engineering students from Pundra University of Science & Technology, Bogra.
          </p>
        </div>

        {/* 2-Column Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Team Hackathon Group Photo */}
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden border border-slate-700/80 shadow-2xl shadow-indigo-950/40 group">
              <div className="relative aspect-[4/3] w-full bg-navy-950">
                <Image
                  src="/assets/Hackaathon group photo.png"
                  alt="PUB AttendEye Team at PUB CSE Fest 2026 Hackathon"
                  fill
                  className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/20 to-transparent" />
                
                {/* Team Logo Badge */}
                <div className="absolute top-4 right-4 w-12 h-12 rounded-xl bg-navy-900/90 border border-slate-700 p-1 shadow-lg">
                  <Image
                    src="/assets/Team logo.png"
                    alt="Team Logo"
                    width={44}
                    height={44}
                    className="object-contain"
                  />
                </div>

                <div className="absolute bottom-5 left-6 right-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    PUB CSE Fest 2026
                  </div>
                  <div className="text-lg font-bold text-white">Hackathon Project Team</div>
                  <div className="text-xs text-slate-300">Department of Computer Science & Engineering</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Roles & Team Lead Highlight */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Team Lead Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-navy-850 to-indigo-950/40 border border-cyan-500/30 flex items-center gap-5 shadow-lg">
              <div className="w-14 h-14 rounded-2xl bg-navy-900 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-md">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-cyan-400">Team Lead & Developer</div>
                <div className="text-xl font-extrabold text-white">Md Feroz Ahmed</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Lead Architecture & AI Vision Integration · Pundra University
                </div>
              </div>
            </div>

            {/* Department Skill Domains */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TEAM_ROLES.map((role) => (
                <div
                  key={role.role}
                  className="p-5 rounded-2xl bg-navy-900/60 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <role.icon className={`w-6 h-6 ${role.color} mb-3`} />
                  <div className="text-sm font-bold text-slate-200">{role.role}</div>
                  <div className="text-xs text-slate-400 mt-1">{role.desc}</div>
                </div>
              ))}
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};

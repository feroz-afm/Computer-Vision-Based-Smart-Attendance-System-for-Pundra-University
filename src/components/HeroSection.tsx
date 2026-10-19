'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck, Sparkles, Scan, Clock, Award } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: 'Liveness & Anti-Proxy', desc: 'Secure biometric verification' },
  { icon: Clock, title: 'Instant Verification', desc: 'Saves 15+ minutes per lecture' },
  { icon: Award, title: 'Automated Reports', desc: 'Real-time course analytics' },
];

export const HeroSection = () => {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden" id="overview">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[450px] h-[450px] bg-cyan-500/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Hero Content & Value Proposition */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
            
            {/* University & Hackathon Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-navy-900/90 border border-slate-700/80 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Pundra University of Science & Technology
              </span>
            </div>

            {/* Main Title */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
                Smart Attendance.<br />
                <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-indigo-300 bg-clip-text text-transparent">
                  Automated with AI.
                </span>
              </h1>
              <p className="text-lg lg:text-xl text-slate-300 font-medium">
                PUB AttendEye — Next-generation facial recognition attendance platform.
              </p>
            </div>

            {/* Subtitle Description */}
            <p className="text-base text-slate-400 max-w-2xl leading-relaxed mx-auto lg:mx-0">
              Eliminate roll-call delays, manual paperwork, and proxy attendance across Pundra University classrooms.
              Engineered with modern vision pipelines and secure role-based portals for students, faculty, and administrators.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <a
                href="#portals"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40 hover:-translate-y-0.5"
              >
                <span>Select Your Portal</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="#how-it-works"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-medium text-slate-200 bg-navy-900 hover:bg-navy-850 border border-slate-700 hover:border-slate-600 transition-all"
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>See How It Works</span>
              </a>
            </div>

            {/* Highlight Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-xl bg-navy-900/40 border border-slate-800/80 text-left"
                >
                  <item.icon className="w-5 h-5 text-cyan-400 mb-2" />
                  <div className="text-sm font-semibold text-slate-200">{item.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>

          </div>

          {/* Right Column: Visual Showcase */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="relative w-full max-w-[560px] aspect-[16/9] rounded-3xl p-2.5 sm:p-3 bg-gradient-to-b from-slate-800/80 via-navy-900/80 to-navy-950 border border-slate-700/60 shadow-2xl shadow-indigo-950/50">
              
              {/* Inner frame */}
              <div className="relative w-full h-full rounded-2xl overflow-hidden bg-navy-950 border border-cyan-500/20 flex items-center justify-center">
                <Image
                  src="/assets/perfect_vision.png"
                  alt="PUB AttendEye Face Recognition Interface Preview"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 560px"
                  className="object-cover object-center opacity-95 transition-transform duration-700 hover:scale-105"
                  priority
                />

                {/* Gradient overlay for readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-transparent to-transparent pointer-events-none" />

                {/* Floating telemetry pills */}
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4 inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-navy-950/85 border border-cyan-500/40 backdrop-blur-md z-10 shadow-lg">
                  <Scan className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-semibold text-cyan-300">Vision Node Ready</span>
                </div>

                {/* Biometric information card */}
                <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 p-3 sm:p-3.5 rounded-xl bg-navy-900/90 border border-slate-700/90 backdrop-blur-md z-10 shadow-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-300">Biometric Architecture</span>
                    <span className="text-xs font-bold text-cyan-400">Modular Engine</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Engineered for high accuracy and anti-spoofing liveness verification.
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export const Footer = () => {
  const [currentYear, setCurrentYear] = React.useState(2026);

  React.useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="bg-navy-950 border-t border-slate-800 text-slate-400 py-16" id="contact">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-850">
          
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-navy-900 border border-cyan-500/30 p-1 flex items-center justify-center">
                <Image
                  src="/assets/Logo.png"
                  alt="PUB AttendEye Logo"
                  width={30}
                  height={30}
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                PUB <span className="text-cyan-400">AttendEye</span>
              </span>
            </div>

            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              Automated facial recognition attendance platform engineered for Pundra University of Science & Technology (PUB), Bogra.
            </p>

            <div className="text-xs text-slate-500 pt-2">
              Presented at PUB CSE Fest 2026 Hackathon
            </div>
          </div>

          {/* Column 2: Portals */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-4">
              Access Portals
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/login?role=student" className="hover:text-cyan-400 transition-colors">
                  Student Portal
                </Link>
              </li>
              <li>
                <Link href="/login?role=teacher" className="hover:text-cyan-400 transition-colors">
                  Teacher Portal
                </Link>
              </li>
              <li>
                <Link href="/login?role=admin" className="hover:text-cyan-400 transition-colors">
                  Administrator Console
                </Link>
              </li>
              <li>
                <Link href="/register?role=student" className="hover:text-cyan-400 transition-colors">
                  Student Registration
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Navigation */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-4">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="#overview" className="hover:text-cyan-400 transition-colors">
                  System Overview
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#university" className="hover:text-cyan-400 transition-colors">
                  Pundra University
                </a>
              </li>
              <li>
                <a href="#team" className="hover:text-cyan-400 transition-colors">
                  Hackathon Team
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Technology */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-4">
              Technology Stack
            </h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>Next.js App Router</li>
              <li>TypeScript</li>
              <li>Tailwind CSS</li>
              <li>Supabase PostgreSQL</li>
              <li>Row Level Security (RLS)</li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            &copy; {currentYear} PUB AttendEye · Pundra University of Science & Technology. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span>Bogra, Bangladesh</span>
            <span>CSE Department</span>
          </div>
        </div>

      </div>
    </footer>
  );
};

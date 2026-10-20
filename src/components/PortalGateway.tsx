'use client';

import React from 'react';
import Link from 'next/link';
import { GraduationCap, Users2, Shield, ArrowRight, UserPlus, LogIn, CheckCircle2 } from 'lucide-react';

interface PortalCardProps {
  role: 'student' | 'teacher' | 'admin';
  title: string;
  badge: string;
  badgeColor: string;
  icon: React.ElementType;
  description: string;
  features: string[];
  loginHref: string;
  registerHref?: string;
  accentBorder: string;
  accentGradient: string;
}

const PORTALS: PortalCardProps[] = [
  {
    role: 'student',
    title: 'Student Portal',
    badge: 'Undergraduate & Graduate',
    badgeColor: 'text-cyan-400 bg-cyan-950/60 border-cyan-800',
    icon: GraduationCap,
    description: 'Access your personalized academic attendance record, review course percentages, and verify your registered face biometric status.',
    features: [
      'Real-time attendance history per course',
      'Eligibility warning for exam requirements',
      'Biometric profile verification status',
    ],
    loginHref: '/login?role=student',
    registerHref: '/register?role=student',
    accentBorder: 'border-cyan-500/30 hover:border-cyan-400/60',
    accentGradient: 'from-cyan-500/10 to-transparent',
  },
  {
    role: 'teacher',
    title: 'Teacher Portal',
    badge: 'Faculty & Instructors',
    badgeColor: 'text-indigo-400 bg-indigo-950/60 border-indigo-800',
    icon: Users2,
    description: 'Launch automated vision attendance sessions during lectures, conduct manual overrides when needed, and export formatted attendance sheets.',
    features: [
      'One-click automated class session launch',
      'Live student face detection validation',
      'Export Excel & PDF attendance reports',
    ],
    loginHref: '/login?role=teacher',
    registerHref: '/register?role=teacher',
    accentBorder: 'border-indigo-500/30 hover:border-indigo-400/60',
    accentGradient: 'from-indigo-500/10 to-transparent',
  },
  {
    role: 'admin',
    title: 'Administrator Portal',
    badge: 'University Management',
    badgeColor: 'text-purple-400 bg-purple-950/60 border-purple-800',
    icon: Shield,
    description: 'Maintain institutional control: manage academic departments, semester schedules, user credentials, audit trails, and camera nodes.',
    features: [
      'Centralized student & teacher management',
      'Course catalog and semester enrollments',
      'System-wide attendance audit logs',
    ],
    loginHref: '/login?role=admin',
    accentBorder: 'border-purple-500/30 hover:border-purple-400/60',
    accentGradient: 'from-purple-500/10 to-transparent',
  },
];

export const PortalGateway = () => {
  return (
    <section className="py-24 bg-navy-900/60 relative border-y border-slate-800/80 scroll-mt-20" id="portals">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-navy-800 border border-slate-700 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Secure Entry Points
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Role-Based Access Portals
          </h2>
          <p className="text-base text-slate-400 leading-relaxed">
            Select your university designation to access tailored attendance management features, verified via Supabase authentication.
          </p>
        </div>

        {/* 3 Spacious Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {PORTALS.map((portal) => (
            <div
              key={portal.role}
              className={`relative rounded-3xl p-8 bg-gradient-to-b ${portal.accentGradient} bg-navy-850/90 border ${portal.accentBorder} shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between`}
            >
              <div className="space-y-6">
                
                {/* Header: Icon & Badge */}
                <div className="flex items-start justify-between gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-navy-900 border border-slate-700/80 p-3 flex items-center justify-center text-cyan-400 shadow-md">
                    <portal.icon className="w-8 h-8" />
                  </div>
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${portal.badgeColor}`}>
                    {portal.badge}
                  </span>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2.5">
                    {portal.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {portal.description}
                  </p>
                </div>

                {/* Key Features List */}
                <div className="pt-2 border-t border-slate-800 space-y-2.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Core Capabilities
                  </span>
                  {portal.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="pt-8 mt-6 border-t border-slate-800/80 space-y-3">
                <Link
                  href={portal.loginHref}
                  className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-md shadow-cyan-600/20 transition-all hover:shadow-cyan-500/30"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{portal.title} Login</span>
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Link>

                {portal.registerHref ? (
                  <Link
                    href={portal.registerHref}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-navy-900/60 hover:bg-navy-900 border border-slate-800 hover:border-slate-700 transition-all"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Create New Account</span>
                  </Link>
                ) : (
                  <div className="text-center py-2 text-xs text-slate-500">
                    Administrator access requires elevated credentials
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

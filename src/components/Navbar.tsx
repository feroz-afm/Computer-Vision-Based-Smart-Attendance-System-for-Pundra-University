'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X, Shield, GraduationCap, Users } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Overview', href: '#overview' },
  { label: 'Portals', href: '#portals' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Team', href: '#team' },
  { label: 'University', href: '#university' },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-navy-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg shadow-black/20 py-3.5'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo & Name */}
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-navy-900 border border-cyan-500/30 p-1 flex items-center justify-center transition-transform group-hover:scale-105">
              <Image
                src="/assets/Logo.png"
                alt="PUB AttendEye Logo"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold tracking-tight text-white">
                  PUB <span className="text-cyan-400">AttendEye</span>
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-400 tracking-wider uppercase">
                Pundra University
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Quick Access Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="#portals"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 bg-navy-900/80 hover:bg-navy-800 px-4 py-2.5 rounded-lg border border-slate-700/80 transition-all hover:border-cyan-500/40"
            >
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Role Portals</span>
            </Link>
            <a
              href="#portals"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 px-5 py-2.5 rounded-lg shadow-md shadow-cyan-500/20 transition-all hover:shadow-cyan-500/35 hover:-translate-y-0.5"
            >
              <span>Get Started</span>
            </a>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg bg-navy-900/60 border border-slate-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 py-4 px-6 rounded-2xl bg-navy-900/95 border border-slate-800 backdrop-blur-xl shadow-2xl space-y-4">
            <div className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-slate-200 hover:text-cyan-400 py-1"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-800 flex flex-col gap-2.5">
              <Link
                href="#portals"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 rounded-lg text-sm font-medium bg-navy-800 text-slate-200 border border-slate-700"
              >
                Access Role Portals
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

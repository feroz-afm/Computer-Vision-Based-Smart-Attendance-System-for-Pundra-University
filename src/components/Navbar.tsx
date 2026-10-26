'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Menu, X, Users, LayoutDashboard } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Overview', href: '/#overview', targetId: 'overview' },
  { label: 'Portals', href: '/#portals', targetId: 'portals' },
  { label: 'How It Works', href: '/#how-it-works', targetId: 'how-it-works' },
  { label: 'Team', href: '/#team', targetId: 'team' },
  { label: 'University', href: '/#university', targetId: 'university' },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<'student' | 'teacher' | 'admin' | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const checkSession = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const role = (session.user.user_metadata?.role as 'student' | 'teacher' | 'admin') || 'student';
          try {
            const { data } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single();
            setActiveRole((data?.role as 'student' | 'teacher' | 'admin') || role);
          } catch {
            setActiveRole(role);
          }
        } else {
          setActiveRole(null);
        }
      } catch {
        // Safe fallback
      }
    };

    checkSession();

    try {
      const supabase = createClient();
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const role = (session.user.user_metadata?.role as 'student' | 'teacher' | 'admin') || 'student';
          setActiveRole(role);
        } else {
          setActiveRole(null);
        }
      });

      return () => {
        listener.subscription.unsubscribe();
      };
    } catch {}
  }, []);

  const scrollToSection = useCallback((targetId: string) => {
    const elem = document.getElementById(targetId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
      return true;
    }
    return false;
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    setMobileMenuOpen(false);
    if (pathname === '/') {
      e.preventDefault();
      const didScroll = scrollToSection(targetId);
      if (didScroll) {
        window.history.pushState(null, '', `#${targetId}`);
      }
    }
    // If not on homepage (e.g. /login?role=student), standard Link behavior navigates to /#targetId
  };

  // When pathname is '/', ensure target element from hash is scrolled into view (including after route transition)
  useEffect(() => {
    if (pathname === '/') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash) {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
          attempts++;
          const target = document.getElementById(hash);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
            clearInterval(interval);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
          }
        }, 50);

        return () => clearInterval(interval);
      }
    }
  }, [pathname]);

  // Listen for hash changes when staying on the homepage
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.pathname === '/') {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash) {
          scrollToSection(hash);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [scrollToSection]);

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
          <Link
            href="/"
            onClick={(e) => {
              if (pathname === '/') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                window.history.pushState(null, '', '/');
              }
            }}
            className="flex items-center gap-3.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-xl"
          >
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
          <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.targetId)}
                className="text-sm font-medium text-slate-300 hover:text-cyan-400 transition-colors py-1 focus:outline-none focus-visible:text-cyan-400"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Quick Access Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/#portals"
              onClick={(e) => handleNavClick(e, 'portals')}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 bg-navy-900/80 hover:bg-navy-800 px-4 py-2.5 rounded-lg border border-slate-700/80 transition-all hover:border-cyan-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Role Portals</span>
            </Link>
            {activeRole ? (
              <Link
                href={`/${activeRole}/dashboard`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 px-5 py-2.5 rounded-lg shadow-md shadow-cyan-500/20 transition-all hover:shadow-cyan-500/35 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 capitalize"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>{activeRole} Dashboard</span>
              </Link>
            ) : (
              <Link
                href="/#portals"
                onClick={(e) => handleNavClick(e, 'portals')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 px-5 py-2.5 rounded-lg shadow-md shadow-cyan-500/20 transition-all hover:shadow-cyan-500/35 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <span>Get Started</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg bg-navy-900/60 border border-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 py-4 px-6 rounded-2xl bg-navy-900/95 border border-slate-800 backdrop-blur-xl shadow-2xl space-y-4">
            <div className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.targetId)}
                  className="text-sm font-medium text-slate-200 hover:text-cyan-400 py-1 focus:outline-none focus-visible:text-cyan-400"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-800 flex flex-col gap-2.5">
              {activeRole && (
                <Link
                  href={`/${activeRole}/dashboard`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-indigo-600 capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  Return to {activeRole} Dashboard
                </Link>
              )}
              <Link
                href="/#portals"
                onClick={(e) => handleNavClick(e, 'portals')}
                className="w-full text-center py-2.5 rounded-lg text-sm font-medium bg-navy-800 text-slate-200 border border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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

import React from 'react';
import { HeroSection } from '@/components/HeroSection';
import { InfoStrip } from '@/components/InfoStrip';
import { PortalGateway } from '@/components/PortalGateway';
import { AboutSection } from '@/components/AboutSection';
import { TeamSection } from '@/components/TeamSection';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* 1. Hero Section with AI Face Showcase */}
      <HeroSection />

      {/* 2. Key Metrics & University Highlights */}
      <InfoStrip />

      {/* 3. Role-Based Access Portals (Student, Teacher, Admin) */}
      <PortalGateway />

      {/* 4. University Profile & How It Works Pipeline */}
      <AboutSection />

      {/* 5. Hackathon Team & Leads */}
      <TeamSection />
    </div>
  );
}

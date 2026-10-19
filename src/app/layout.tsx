import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'PUB AttendEye | AI-Powered Smart Attendance System - Pundra University',
  description: 'Automated facial recognition attendance platform for Pundra University of Science & Technology (PUB), Bogra. Streamlined role portals for students, faculty, and administrators.',
  keywords: ['PUB AttendEye', 'Pundra University', 'Smart Attendance', 'Face Recognition', 'PUB CSE Fest 2026', 'Supabase'],
  icons: {
    icon: '/assets/Logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`scroll-smooth ${inter.variable}`} suppressHydrationWarning>
      <body className="bg-navy-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-navy-950 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

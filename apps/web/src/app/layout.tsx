import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { Activity, Github, BookOpen, BarChart3 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OpenPulse - Open Source Outage Detection',
  description:
    'Real-time, crowd-sourced outage detection platform. Monitor cloud services, detect outages, and report problems.',
  keywords: ['outage detection', 'service monitoring', 'status page', 'downtime tracker'],
  openGraph: {
    title: 'OpenPulse - Open Source Outage Detection',
    description: 'Real-time, crowd-sourced outage detection for cloud services.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('openpulse-theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/80">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
                <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <span className="text-lg font-bold tracking-tight">OpenPulse</span>
              </Link>

              <nav className="hidden items-center gap-1 sm:flex">
                <Link
                  href="/"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  Dashboard
                </Link>
                <Link
                  href="/services"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  Services
                </Link>
                <a
                  href="/api/docs"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  API
                </a>
              </nav>
            </div>

            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-gray-200 dark:border-gray-800">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              OpenPulse - Open source outage detection
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/openpulse"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
              <a
                href="/api/docs"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <BookOpen className="h-4 w-4" />
                API Docs
              </a>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <BarChart3 className="h-4 w-4" />
                Status
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

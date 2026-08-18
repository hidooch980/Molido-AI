import type { Metadata, Viewport } from 'next';
import { config } from '../lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${config.appName} — ${config.tagline}`,
    template: `%s — ${config.appName}`,
  },
  description:
    'MOLIDO AI is an AI-first platform: real products, real users, real value — built from zero.',
  applicationName: config.appName,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05070a',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {/* Keyboard users can jump straight to content instead of tabbing
            through the header on every page. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

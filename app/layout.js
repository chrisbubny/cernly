import { ClerkProvider } from '@clerk/nextjs';
import { DM_Sans, Manrope } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata = {
  title: 'Cernly — Know your website. Improve what matters.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  description: 'AI-powered website intelligence that finds issues, explains what matters, and shows you how to improve.',
  metadataBase: new URL('https://cernly.ai'),
  openGraph: {
    title: 'Cernly — AI-powered website intelligence',
    description: 'Know your website. Improve what matters.',
    url: 'https://cernly.ai',
    siteName: 'Cernly',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cernly',
    description: 'Know your website. Improve what matters.',
  },
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
        <body style={{ fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>{children}</body>
      </html>
    </ClerkProvider>
  );
}

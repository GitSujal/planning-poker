import './globals.css';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const ThemeScript = () => (
  <script
    dangerouslySetInnerHTML={{
      __html: `(() => {
      const stored = localStorage.getItem('theme') || 'dark';
      document.documentElement.classList.toggle('light', stored === 'light');
    })();`
    }}
  />
);

export const metadata = {
  title: 'Vibe Planning Poker',
  description: 'Collaborative planning poker with Cloudflare R2 sync'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

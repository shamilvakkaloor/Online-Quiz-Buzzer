import type { Metadata } from 'next';
import './globals.css';
import { AppInstall } from '@/components/app-install';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Buzzer — make every second count',
  description:
    'A live quiz workspace for quick reactions, good questions, and a little friendly competition.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AppInstall />
      </body>
    </html>
  );
}

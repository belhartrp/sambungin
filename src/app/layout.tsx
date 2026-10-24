import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sambungin: Find the word. Win the round.',
  description:
    'Asisten permainan sambung kata berbasis suara. Temukan kata dengan cepat dan pilih kata yang menyulitkan lawan.',
  applicationName: 'Sambungin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f7fb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

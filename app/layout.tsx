import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'Gün Akışı', description: 'Namaz, dinlenme ve odak. Günün bir arada.',
 manifest: '/manifest.webmanifest',
 appleWebApp: { capable: true, title: 'Gün Akışı', statusBarStyle: 'default' },
 icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f7f9' };
export default function Layout({children}:{children: React.ReactNode}) { return <html lang="tr"><body>{children}</body></html>; }

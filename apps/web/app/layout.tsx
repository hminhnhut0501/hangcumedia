import './globals.css';
import { ToastHub } from '@/components/ToastHub';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastHub />
      </body>
    </html>
  );
}

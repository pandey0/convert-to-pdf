import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata = {
  title: 'convert-to-pdf - Universal File to PDF Converter',
  description: 'Convert any file type perfectly into an instant PDF download with zero formatting loss.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        {children}
      </body>
    </html>
  );
}

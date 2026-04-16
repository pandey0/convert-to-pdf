import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Script from 'next/script';

export const metadata = {
  title: 'convert-to-pdf - Universal File to PDF Converter',
  description: 'Fast, secure, and professional document conversion for Word, Excel, Images, and more. All files deleted after 1 hour.',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
          {/* Razorpay script will be handled by window.Razorpay in page.js */}
      </head>
      <body>
        <Navbar />
        {children}
        <Footer />
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}

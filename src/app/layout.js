import './globals.css';

export const metadata = {
  title: 'Any2PDF - Universal PDF Converter',
  description: 'Convert any file type perfectly into an instant PDF download.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

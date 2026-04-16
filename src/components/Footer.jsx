import React from 'react';
import Link from 'next/link';
import { Shield, Clock, Mail, Heart } from 'lucide-react';

const Footer = () => {
    return (
        <footer style={{ 
            marginTop: '4rem', 
            padding: '4rem 5% 2rem', 
            backgroundColor: '#000', 
            color: '#fff',
            borderTop: '8px solid var(--neo-yellow)',
            width: '100%'
        }}>
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                gap: '3rem',
                textAlign: 'left',
                width: '100%',
                margin: '0 auto'
            }}>
                {/* Brand Section */}
                <div>
                    <div style={{ 
                        display: 'inline-block', 
                        backgroundColor: 'var(--neo-yellow)', 
                        padding: '0.25rem 0.75rem', 
                        border: '3px solid #fff', 
                        marginBottom: '1rem',
                        transform: 'rotate(-1deg)' 
                    }}>
                        <span style={{ color: '#000', fontWeight: 900, textTransform: 'uppercase' }}>convert-to-pdf</span>
                    </div>
                    <p style={{ fontWeight: 600, opacity: 0.8, fontSize: '0.9rem', lineHeight: 1.6 }}>
                        Professional-grade conversion tool. No bloat, no tracking, just perfect PDFs every time.
                    </p>
                </div>

                {/* Trust Section */}
                <div>
                    <h4 style={{ textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>Security first</h4>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.5rem', backgroundColor: '#333', border: '2px solid #fff' }}><Clock size={16} /></div>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Files auto-deleted every hour</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ padding: '0.5rem', backgroundColor: '#333', border: '2px solid #fff' }}><Shield size={16} /></div>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Secure TLS Encryption</span>
                        </div>
                    </div>
                </div>

                {/* Links Section */}
                <div>
                    <h4 style={{ textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>Useful Links</h4>
                    <ul style={{ listStyle: 'none', padding: 0, fontWeight: 700, fontSize: '0.9rem' }}>
                        <li style={{ marginBottom: '0.75rem' }}><Link href="/how-to-use" style={{ color: '#fff', textDecoration: 'none' }}>→ How it works</Link></li>
                        <li style={{ marginBottom: '0.75rem' }}><Link href="/pricing" style={{ color: '#fff', textDecoration: 'none' }}>→ Pricing</Link></li>
                        <li style={{ marginBottom: '0.75rem' }}><Link href="/about" style={{ color: '#fff', textDecoration: 'none' }}>→ About Us</Link></li>
                    </ul>
                </div>

                {/* Contact Section */}
                <div>
                    <h4 style={{ textTransform: 'uppercase', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>Get in touch</h4>
                    <a href="mailto:support@convert-to-pdf.com" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.75rem', 
                        textDecoration: 'none', 
                        color: 'var(--neo-yellow)',
                        fontWeight: 900
                    }}>
                        <Mail size={20} />
                        <span>support@convert-to-pdf.com</span>
                    </a>
                </div>
            </div>

            <div style={{ 
                marginTop: '4rem', 
                paddingTop: '2rem', 
                borderTop: '1px solid #333', 
                textAlign: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                opacity: 0.5,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem'
            }}>
                Made with <Heart size={12} fill="currentColor" /> for the Document Community © {new Date().getFullYear()}
            </div>
        </footer>
    );
};

export default Footer;

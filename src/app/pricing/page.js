"use client";

import { useEffect, useState } from 'react';

export default function PricingPage() {
  const [region, setRegion] = useState({ symbol: '₹', amount: '10', currency: 'INR' });

  useEffect(() => {
    // Simple fetch to detect regional price for UI
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.country_code !== 'IN') {
          setRegion({ symbol: '$', amount: '2.50', currency: 'USD' });
        }
      })
      .catch(() => {}); // Fallback to INR is fine
  }, []);

  return (
    <main className="container" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div className="header">
        <h1>Simple Pricing</h1>
        <p>Premium document conversion starting with a free trial.</p>
      </div>

      <div className="layout-wrapper" style={{ flexWrap: 'wrap', marginTop: '2rem', justifyContent: 'center' }}>
        <div className="converter-card" style={{ flex: '0 1 400px', backgroundColor: '#fff' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', textTransform: 'uppercase' }}>Premium Convert</h2>
          <div style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: '1rem' }}>
            {region.symbol}{region.amount}
          </div>
          <p style={{ fontWeight: 700, marginBottom: '1.5rem', opacity: 0.8 }}>PER CONVERSION</p>
          
          <ul style={{ textAlign: 'left', marginBottom: '2rem', listStyle: 'none', padding: 0 }}>
             <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ First conversion on the house</li>
            <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ Instant high-priority processing</li>
            <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ Up to 10MB per file</li>
            <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ Perfect formatting guaranteed</li>
            <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ Document Merging (Combine multiple file types)</li>
            <li style={{ marginBottom: '0.75rem', fontWeight: 600 }}>✅ Unlimited multi-image merging</li>
          </ul>
          
          <a href="/" className="btn" style={{ textDecoration: 'none', display: 'block' }}>
            Start Converting
          </a>
          
          <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', fontWeight: 700, color: '#666' }}>
            SECURE CHECKOUT VIA RAZORPAY
          </p>
        </div>
      </div>
    </main>
  );
}

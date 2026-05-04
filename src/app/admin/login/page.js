"use client";

import { useState } from 'react';
import { ShieldCheck, LogIn, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to unlock admin area');
      }

      router.replace('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      width: '100%',
      maxWidth: '820px',
      padding: '2rem 1.25rem 4rem',
    }}>
      <section style={{
        background: '#000',
        color: '#fff',
        border: '4px solid #000',
        boxShadow: '10px 10px 0px var(--neo-yellow)',
        padding: '1.5rem',
        marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
          <div style={{ background: 'var(--neo-yellow)', color: '#000', border: '3px solid #000', padding: '0.6rem' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--neo-yellow)' }}>Admin Access</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.04em' }}>Unlock dashboard</h1>
          </div>
        </div>
        <p style={{ opacity: 0.85, fontWeight: 600, lineHeight: 1.6 }}>
          Enter the admin token to create a short-lived session cookie and access the queue dashboard.
        </p>
      </section>

      <form onSubmit={handleLogin} style={{
        background: '#fff',
        border: '4px solid #000',
        boxShadow: '8px 8px 0px #000',
        padding: '1.25rem',
        display: 'grid',
        gap: '0.9rem',
      }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>Admin Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste ADMIN_ACCESS_TOKEN here"
          style={{
            width: '100%',
            padding: '0.95rem 1rem',
            border: '3px solid #000',
            boxShadow: '4px 4px 0px #000',
            fontFamily: 'inherit',
            fontWeight: 700,
            outline: 'none',
          }}
        />
        {error ? (
          <div style={{
            background: '#fee2e2',
            border: '3px solid #000',
            padding: '0.85rem',
            fontWeight: 800,
            color: '#991b1b',
          }}>
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading || !token.trim()}
          style={{
            background: '#000',
            color: '#fff',
            border: '4px solid #000',
            boxShadow: '6px 6px 0px var(--neo-yellow)',
            padding: '0.95rem 1rem',
            fontWeight: 900,
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <LogIn size={16} />
          {loading ? 'Unlocking...' : 'Unlock Admin'}
        </button>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, opacity: 0.75 }}>
          Use the token stored in `ADMIN_ACCESS_TOKEN` on the server.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', fontWeight: 700, opacity: 0.8 }}>
          <Lock size={14} />
          After login, you will be redirected to the protected dashboard.
        </div>
      </form>
    </main>
  );
}

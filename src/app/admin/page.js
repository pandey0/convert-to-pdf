"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Shield, Activity, Clock3, AlertTriangle, CheckCircle2, LogOut } from 'lucide-react';

function StatCard({ label, value, hint, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: '#fff', color: '#000' },
    yellow: { bg: 'var(--neo-yellow)', color: '#000' },
    green: { bg: '#d1fae5', color: '#065f46' },
    red: { bg: '#fee2e2', color: '#991b1b' },
    blue: { bg: '#dbeafe', color: '#1d4ed8' },
  };
  const theme = tones[tone] || tones.neutral;

  return (
    <div style={{
      background: theme.bg,
      color: theme.color,
      border: '4px solid #000',
      boxShadow: '6px 6px 0px #000',
      padding: '1rem',
      minHeight: '120px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1 }}>{value}</div>
      {hint ? <div style={{ fontSize: '0.82rem', fontWeight: 700, opacity: 0.8 }}>{hint}</div> : null}
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <section style={{
      background: '#fff',
      border: '4px solid #000',
      boxShadow: '8px 8px 0px #000',
      padding: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ background: 'var(--neo-yellow)', border: '3px solid #000', padding: '0.5rem' }}>{icon}</div>
        <h2 style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/metrics', { cache: 'no-store' });
      const data = await response.json();

      if (response.status === 401) {
        router.replace('/admin/login');
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to load metrics');
      }

      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      setMetrics(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    router.replace('/admin/login');
  };

  const queue = metrics?.queue || {};
  const payments = metrics?.payments || {};
  const recent = metrics?.recent || {};

  const statusTone = useMemo(() => {
    if (!metrics) return 'neutral';
    if ((queue.failed || 0) > 0) return 'red';
    if ((queue.retrying || 0) > 0) return 'yellow';
    if ((queue.processing || 0) > 0) return 'blue';
    return 'green';
  }, [metrics, queue.failed, queue.retrying, queue.processing]);

  return (
    <main style={{ width: '100%', maxWidth: '1300px', padding: '2rem 1.25rem 4rem' }}>
      <div style={{
        background: '#000',
        color: '#fff',
        border: '4px solid #000',
        boxShadow: '10px 10px 0px var(--neo-yellow)',
        padding: '1.25rem',
        marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--neo-yellow)' }}>Admin</div>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.04em' }}>Queue Health Dashboard</h1>
            <p style={{ opacity: 0.8, fontWeight: 600, marginTop: '0.35rem' }}>Track jobs, retries, and payment state from one place.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={fetchMetrics}
              disabled={loading}
              style={{
                background: 'var(--neo-yellow)',
                color: '#000',
                border: '4px solid #000',
                boxShadow: '6px 6px 0px #fff',
                padding: '0.85rem 1rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <RefreshCw size={16} className={loading ? 'spinner' : ''} />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              style={{
                background: '#fff',
                color: '#000',
                border: '4px solid #000',
                boxShadow: '6px 6px 0px #fff',
                padding: '0.85rem 1rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div style={{
          marginBottom: '1rem',
          background: '#fee2e2',
          border: '4px solid #000',
          boxShadow: '6px 6px 0px #000',
          padding: '1rem',
          fontWeight: 800,
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: '1rem' }}>
        <Section title="Overview" icon={<Shield size={18} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <StatCard label="Queue State" value={metrics ? 'Live' : 'Idle'} hint={metrics ? `Generated ${new Date(metrics.generatedAt).toLocaleString()}` : 'Loading queue health'} tone={statusTone} />
            <StatCard label="Queued" value={queue.queued ?? '—'} hint={`Oldest wait ${queue.queuedLagSeconds ?? 0}s`} />
            <StatCard label="Processing" value={queue.processing ?? '—'} hint="Jobs currently being worked" tone="blue" />
            <StatCard label="Retrying" value={queue.retrying ?? '—'} hint={`Retry wait ${queue.retryWaitSeconds ?? 0}s`} tone="yellow" />
            <StatCard label="Failed" value={queue.failed ?? '—'} hint="Permanent failures" tone="red" />
            <StatCard label="Completed" value={queue.completed ?? '—'} hint="Successful conversions" tone="green" />
          </div>
        </Section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <Section title="Payments" icon={<CheckCircle2 size={18} />}>
            <div style={{ display: 'grid', gap: '0.75rem', fontWeight: 800 }}>
              <div>Pending: <strong>{payments.pending ?? '—'}</strong></div>
              <div>Paid: <strong>{payments.paid ?? '—'}</strong></div>
              <div>Free usage: <strong>{payments.notRequired ?? '—'}</strong></div>
            </div>
          </Section>

          <Section title="Recent Failures" icon={<AlertTriangle size={18} />}>
            {recent.latestFailedJob ? (
              <div style={{ display: 'grid', gap: '0.5rem', fontWeight: 700 }}>
                <div><strong>ID:</strong> {recent.latestFailedJob.id}</div>
                <div><strong>Attempts:</strong> {recent.latestFailedJob.attempts}</div>
                <div><strong>When:</strong> {recent.latestFailedJob.finishedAt ? new Date(recent.latestFailedJob.finishedAt).toLocaleString() : '—'}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{recent.latestFailedJob.errorMessage || 'No error message recorded'}</div>
              </div>
            ) : (
              <div style={{ fontWeight: 700, opacity: 0.7 }}>No failed jobs yet.</div>
            )}
          </Section>

          <Section title="Latest Success" icon={<Clock3 size={18} />}>
            {recent.latestCompletedJob ? (
              <div style={{ display: 'grid', gap: '0.5rem', fontWeight: 700 }}>
                <div><strong>ID:</strong> {recent.latestCompletedJob.id}</div>
                <div><strong>Files:</strong> {recent.latestCompletedJob.fileCount}</div>
                <div><strong>Size:</strong> {Math.round((recent.latestCompletedJob.totalSize || 0) / 1024)} KB</div>
                <div><strong>When:</strong> {recent.latestCompletedJob.finishedAt ? new Date(recent.latestCompletedJob.finishedAt).toLocaleString() : '—'}</div>
              </div>
            ) : (
              <div style={{ fontWeight: 700, opacity: 0.7 }}>No successful jobs yet.</div>
            )}
          </Section>
        </div>

        <Section title="Notes" icon={<Activity size={18} />}>
          <ul style={{ display: 'grid', gap: '0.5rem', paddingLeft: '1.25rem', fontWeight: 600, lineHeight: 1.6 }}>
            <li>The dashboard auto-refreshes every 15 seconds.</li>
            <li>Retrying jobs stay visible until the worker picks them up again.</li>
            <li>Use the login page at `/admin/login` with the server token to access this dashboard.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

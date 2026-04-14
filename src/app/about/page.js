export default function AboutPage() {
  return (
    <main className="container" style={{ padding: '4rem 2rem' }}>
      <div className="header">
        <h1>About convert-to-pdf</h1>
        <p>Premium document conversion crafted for quality.</p>
      </div>

      <div className="converter-card" style={{ backgroundColor: '#fff', textAlign: 'left' }}>
        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Our Mission</h2>
        <p style={{ marginBottom: '1.5rem', fontWeight: 600 }}>
          We built convert-to-pdf because we were tired of "free" conversion tools that ruined document layouts, 
          leaked user data, or forced thousands of ads. Our engine uses professional-grade rendering to ensure 
          that what you see is what you get in your PDF.
        </p>

        <h2 style={{ marginBottom: '1.5rem', textTransform: 'uppercase' }}>Security & Privacy</h2>
        <p style={{ marginBottom: '1rem', fontWeight: 600 }}>
          Your security is our priority. We use:
        </p>
        <ul style={{ listStyle: 'none', padding: 0, fontWeight: 600 }}>
          <li style={{ marginBottom: '0.5rem' }}>🔒 Standard encryption for all file transfers.</li>
          <li style={{ marginBottom: '0.5rem' }}>🛡️ Automatic file deletion after conversion.</li>
          <li style={{ marginBottom: '0.5rem' }}>🚫 No permanent storage of your sensitive documents.</li>
        </ul>
      </div>
    </main>
  );
}

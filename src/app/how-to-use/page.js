export default function HowToPage() {
  const steps = [
    { title: "Select Source Format", description: "Choose the file type you want to convert (Word, Excel, PowerPoint, PDF, Images, Text, Markdown, etc.) from the dropdown." },
    { title: "Upload Files", description: "Drag and drop one or multiple files into the yellow box or click to browse your computer." },
    { title: "Review & Merge", description: "Use the arrows to reorder your files. Our system will merge them all into a single, high-fidelity PDF document." },
    { title: "Convert & Download", description: "Pay a small fee (or use free daily allowance) to generate your high-fidelity PDF instantly." }
  ];

  return (
    <main className="container" style={{ padding: '4rem 2rem' }}>
      <div className="header">
        <h1>How to Use convert-to-pdf</h1>
        <p>Follow these simple steps for perfect PDF conversion.</p>
      </div>

      <div className="layout-wrapper" style={{ flexDirection: 'column', gap: '1.5rem' }}>
        {steps.map((step, index) => (
          <div key={index} className="converter-card" style={{ backgroundColor: '#fff', textAlign: 'left', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--neo-yellow)', WebkitTextStroke: '2px #000' }}>
              {index + 1}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{step.title}</h2>
              <p style={{ fontWeight: 600 }}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

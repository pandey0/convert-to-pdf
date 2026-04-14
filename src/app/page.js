"use client";

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, CheckCircle, Loader2, Download } from 'lucide-react';
import './globals.css'; // Make sure styles are imported if not via layout

export default function Home() {
  const [files, setFiles] = useState([]);
  const [fromFormat, setFromFormat] = useState('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, paying, converting, done, error
  const [pdfUrl, setPdfUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles]);
      setStatus('idle');
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      setStatus('idle');
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (index, direction) => {
    setFiles(prev => {
      const newFiles = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newFiles.length) return prev;
      [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
      return newFiles;
    });
  };

  const performConversion = async (paymentDetails = {}) => {
    setStatus('converting');
    
    const formData = new FormData();
    files.forEach(f => {
      formData.append('file', f);
    });
    
    if (paymentDetails.bypass) {
      formData.append('bypass_payment', 'true');
    } else {
      formData.append('razorpay_payment_id', paymentDetails.razorpay_payment_id);
      formData.append('razorpay_order_id', paymentDetails.razorpay_order_id);
      formData.append('razorpay_signature', paymentDetails.razorpay_signature);
    }

    try {
      const convertRes = await fetch('/api/convert', {
        method: 'POST',
        body: formData
      });
      
      if (convertRes.ok) {
        const blob = await convertRes.blob();
        const url = window.URL.createObjectURL(blob);
        setPdfUrl(url);
        setStatus('done');
      } else {
        const errorData = await convertRes.json();
        throw new Error(errorData.message || 'Conversion failed');
      }
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  };

  const triggerPaymentAndConversion = async () => {
    if (files.length === 0) return;

    // Check for bypass
    if (process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true') {
      await performConversion({ bypass: true });
      return;
    }

    setStatus('paying');
    setErrorMessage("");

    try {
      // 1. Create Razorpay Order
      const orderRes = await fetch('/api/create-order', { method: 'POST' });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error('Failed to create order');
      }

      // 2. Open Razorpay Checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder', 
        amount: orderData.order.amount,
        currency: "INR",
        name: "Convert to PDF",
        description: "One-time PDF conversion fee",
        order_id: orderData.order.id,
        handler: async function (response) {
            await performConversion(response);
        },
        prefill: {
            name: "Customer",
            email: "customer@example.com",
            contact: "9999999999"
        },
        theme: {
            color: "#3b82f6"
        },
        modal: {
            ondismiss: function() {
                setStatus('idle');
            }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
          setErrorMessage(response.error.description);
          setStatus('error');
      });
      rzp.open();

    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  };

  const getButtonState = () => {
    switch (status) {
      case 'paying': return { text: 'Initializing Payment...', disabled: true, icon: <Loader2 className="spinner" /> };
      case 'converting': return { text: 'Converting... Please Wait', disabled: true, icon: <Loader2 className="spinner" /> };
      case 'done': return { text: 'Convert Another File', disabled: false, icon: null, action: () => { setFiles([]); setStatus('idle'); } };
      default: return { 
        text: process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true' ? 'Convert (Free Dev Mode)' : 'Pay ₹99 & Convert', 
        disabled: files.length === 0, 
        icon: null, 
        action: triggerPaymentAndConversion 
      };
    }
  };

  const btnState = getButtonState();

  return (
    <div className="layout-wrapper">
      {/* Sticky Left Sidebar */}
      <aside className="ad-sidebar">
        <span className="ad-label">Sponsored</span>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#666' }}>160 x 600 AD SLOT</div>
      </aside>

      <main className="container">
        {/* Header Banner */}
        <div className="ad-banner">
          <span className="ad-label">Sponsored</span>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#666' }}>728 x 90 LEADERBOARD</div>
        </div>

        <div className="header">
          <h1>convert-to-pdf</h1>
          <p>Convert any document to PDF: MD files, Text files, Presentations, Images, and Word files.</p>
        </div>

      <div className="converter-card">
        {status !== 'done' ? (
          <>
            <div className="selector-group">
              <div className="selector-box">
                <label>From</label>
                <select 
                  className="styled-select" 
                  value={fromFormat}
                  onChange={(e) => setFromFormat(e.target.value)}
                >
                  <option value="auto">Auto Detect</option>
                  <option value="word">Word Document</option>
                  <option value="excel">Excel Sheet</option>
                  <option value="ppt">PowerPoint</option>
                  <option value="image">Image (JPG/PNG)</option>
                  <option value="text">Text File</option>
                  <option value="md">Markdown (.md)</option>
                </select>
              </div>
              
              <div className="arrow-divider">→</div>

              <div className="selector-box">
                <label>To</label>
                <select className="styled-select" disabled>
                  <option>PDF Document</option>
                </select>
              </div>
            </div>

            <div 
              className={`dropzone ${isDragging ? 'active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="dropzone-icon" />
              <h3>Drag & Drop your file here</h3>
              <p style={{ marginTop: '0.5rem', color: '#000', fontWeight: 'bold' }}>OR CLICK TO BROWSE FROM YOUR COMPUTER</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                style={{ display: 'none' }}
                multiple={fromFormat === 'image' || fromFormat === 'auto'}
                accept={
                  fromFormat === 'word' ? '.doc,.docx' :
                  fromFormat === 'excel' ? '.xls,.xlsx,.csv' :
                  fromFormat === 'ppt' ? '.ppt,.pptx' :
                  fromFormat === 'image' ? '.jpg,.jpeg,.png,.webp' :
                  fromFormat === 'md' ? '.md' :
                  fromFormat === 'text' ? '.txt' :
                  undefined
                }
              />
            </div>

            {files.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', marginBottom: '1rem' }}>Queued Files ({files.length})</h4>
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {files.map((f, index) => (
                    <div key={index} className="file-info" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                        <button 
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); moveFile(index, 'up'); }}
                          style={{ border: 'none', background: 'none', cursor: index === 0 ? 'default' : 'pointer', fontSize: '1rem', opacity: index === 0 ? 0.3 : 1 }}
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button 
                          disabled={index === files.length - 1}
                          onClick={(e) => { e.stopPropagation(); moveFile(index, 'down'); }}
                          style={{ border: 'none', background: 'none', cursor: index === files.length - 1 ? 'default' : 'pointer', fontSize: '1rem', opacity: index === files.length - 1 ? 0.3 : 1 }}
                          title="Move Down"
                        >
                          ▼
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                        <File color="#000" style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <h4 style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</h4>
                          <span style={{ fontSize: '0.85rem', color: '#000', fontWeight: 600 }}>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', color: '#666' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorMessage && (
              <div style={{ marginTop: '1rem', color: '#ef4444', textAlign: 'center', background: 'rgba(239,68,68,0.1)', padding: '1rem', borderRadius: '8px' }}>
                {errorMessage}
              </div>
            )}

            <button 
              className="btn" 
              onClick={btnState.action} 
              disabled={btnState.disabled}
            >
              {btnState.icon}
              {btnState.text}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <CheckCircle color="#000" size={80} style={{ margin: '0 auto 1.5rem auto' }} />
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', textTransform: 'uppercase' }}>Conversion Successful!</h2>
            <p style={{ color: '#000', marginBottom: '2rem', fontWeight: 600 }}>Your file has been perfectly converted to PDF.</p>
            
            {/* Success Ad Slot */}
            <div className="ad-success-slot">
              <span className="ad-label">Sponsored</span>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#666', marginBottom: '0.5rem' }}>POST-CONVERSION SPECIAL</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#999' }}>300 x 250 AD SLOT</div>
              </div>
            </div>

            <a 
              href={pdfUrl} 
              download={files[0]?.name.split('.')[0] + '.pdf'}
              className="btn btn-success" 
              style={{ textDecoration: 'none', display: 'flex', marginBottom: '1rem' }}
            >
              <Download /> Download PDF
            </a>
            
            <button className="btn" onClick={btnState.action}>
              Convert Another File
            </button>
          </div>
        )}
      </div>
    </main>

    {/* Sticky Right Sidebar */}
    <aside className="ad-sidebar">
      <span className="ad-label">Sponsored</span>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#666' }}>160 x 600 AD SLOT</div>
    </aside>
  </div>
);
}

"use client";

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, CheckCircle, Loader2, Download } from 'lucide-react';
import './globals.css'; 

export default function Home() {
  const [files, setFiles] = useState([]);
  const [fromFormat, setFromFormat] = useState('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, paying, converting, done, error
  const [pdfUrl, setPdfUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const fileInputRef = useRef(null);
  const supportedExtensions = ['doc', 'docx', 'odt', 'rtf', 'pdf', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md'];

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

  const mapExtensions = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const map = {
      'docx': 'word',
      'dotx': 'word',
      'png': 'image',
      'jpg': 'image',
      'jpeg': 'image',
      'webp': 'image',
      'md': 'md',
      'txt': 'text',
      'pdf': 'word',
      'doc': 'word',
      'odt': 'word',
      'rtf': 'word',
      'xls': 'excel',
      'xlsx': 'excel',
      'csv': 'excel',
      'ppt': 'ppt',
      'pptx': 'ppt'
    };
    return map[ext] || 'auto';
  };

  const isSupportedFile = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    return supportedExtensions.includes(ext);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropFiles = Array.from(e.dataTransfer.files);
      const unsupported = dropFiles.filter(file => !isSupportedFile(file.name));
      if (unsupported.length > 0) {
        setErrorMessage(`Unsupported file type(s): ${unsupported.map(file => file.name).join(', ')}. Supported types are PDF, Word, Excel, PowerPoint, text, markdown, and images.`);
        setStatus('error');
        return;
      }
      setErrorMessage('');
      if (dropFiles[0]) {
        const detected = mapExtensions(dropFiles[0].name);
        if (files.length === 0) {
          // First upload: snap to type
          if (detected !== 'auto') setFromFormat(detected);
        } else if (fromFormat !== 'auto' && detected !== fromFormat) {
          // Subsequent mixed upload: switch to universal auto
          setFromFormat('auto');
        }
      }
      const newFiles = dropFiles.map(file => {
        if (file.type.startsWith('image/')) {
          file.previewUrl = URL.createObjectURL(file);
        }
        return file;
      });
      setFiles(prev => [...prev, ...newFiles]);
      setStatus('idle');
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const unsupported = selectedFiles.filter(file => !isSupportedFile(file.name));
      if (unsupported.length > 0) {
        setErrorMessage(`Unsupported file type(s): ${unsupported.map(file => file.name).join(', ')}. Supported types are PDF, Word, Excel, PowerPoint, text, markdown, and images.`);
        setStatus('error');
        e.target.value = '';
        return;
      }
      setErrorMessage('');
      if (selectedFiles[0]) {
        const detected = mapExtensions(selectedFiles[0].name);
        if (files.length === 0) {
          // First upload: snap to type
          if (detected !== 'auto') setFromFormat(detected);
        } else if (fromFormat !== 'auto' && detected !== fromFormat) {
          // Subsequent mixed upload: switch to universal auto
          setFromFormat('auto');
        }
      }
      const newFiles = selectedFiles.map(file => {
        if (file.type.startsWith('image/')) {
          file.previewUrl = URL.createObjectURL(file);
        }
        return file;
      });
      setFiles(prev => [...prev, ...newFiles]);
      setStatus('idle');
      e.target.value = '';
    }
  };

  const removeFile = (index) => {
    setFiles(prev => {
      const fileToRemove = prev[index];
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
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
    formData.append('compress', compress ? 'true' : 'false');
    
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

      if (convertRes.status === 202) {
        const queuedData = await convertRes.json();
        const jobId = queuedData?.job?.id;
        if (!jobId) {
          throw new Error('Conversion job was not created');
        }
        await waitForJobCompletion(jobId);
        return;
      }

      if (convertRes.ok) {
        const blob = await convertRes.blob();
        const url = window.URL.createObjectURL(blob);
        setPdfUrl(url);
        setActiveJobId(null);
        setJobStatus('completed');
        setStatus('done');
      } else {
        const errorData = await convertRes.json();
        throw new Error(errorData.message || 'Conversion failed');
      }
    } catch (err) {
      setActiveJobId(null);
      setJobStatus(null);
      setErrorMessage(err.message);
      setStatus('error');
    }
  };

  const waitForJobCompletion = async (jobId) => {
    setActiveJobId(jobId);
    setJobStatus('queued');

    while (true) {
      const statusRes = await fetch(`/api/jobs/${jobId}`);
      const statusData = await statusRes.json();

      if (!statusData.success) {
        throw new Error(statusData.message || 'Failed to check conversion status');
      }

      const job = statusData.job;
      const nextRetryAt = job.nextRetryAt ? new Date(job.nextRetryAt) : null;
      const retryPending = job.status === 'queued' && nextRetryAt && nextRetryAt > new Date();
      setJobStatus(retryPending ? 'retrying' : job.status);

      if (job.status === 'failed') {
        throw new Error(job.errorMessage || 'Conversion failed');
      }

      if (job.status === 'completed' && job.downloadUrl) {
        const downloadRes = await fetch(job.downloadUrl);
        if (!downloadRes.ok) {
          throw new Error('Converted PDF is ready but could not be downloaded');
        }

        const blob = await downloadRes.blob();
        const url = window.URL.createObjectURL(blob);
        setPdfUrl(url);
        setStatus('done');
        setActiveJobId(null);
        setJobStatus('completed');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const triggerPaymentAndConversion = async () => {
    if (files.length === 0) return;

    // Use a clean error clearing
    setErrorMessage("");

    // 1. SILENT FREE ATTEMPT (No bragging, just try)
    setStatus('converting'); 
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('file', f));
      formData.append('compress', compress ? 'true' : 'false');
      formData.append('bypass_payment', 'true');

      const freeRes = await fetch('/api/convert', { method: 'POST', body: formData });

      if (freeRes.status === 202) {
        const queuedData = await freeRes.json();
        const jobId = queuedData?.job?.id;
        if (!jobId) {
          throw new Error('Conversion job was not created');
        }
        await waitForJobCompletion(jobId);
        return;
      }

      if (freeRes.ok) {
        // Successful one-time free conversion!
        const blob = await freeRes.blob();
        setPdfUrl(window.URL.createObjectURL(blob));
        setActiveJobId(null);
        setJobStatus('completed');
        setStatus('done');
        return;
      }
      
      // If reached limit (402), transition to payment flow
      if (freeRes.status === 402) {
        setStatus('paying');
      } else {
        const errData = await freeRes.json();
        throw new Error(errData.message || 'Error occurred');
      }
    } catch (err) {
      // If it wasn't a 402, it was a real error
      if (status !== 'paying') {
        setActiveJobId(null);
        setErrorMessage(err.message);
        setStatus('error');
        return;
      }
    }

    // 2. REGIONAL PAYMENT FLOW (Only if free failed)
    try {
      const orderRes = await fetch('/api/create-order', { method: 'POST' });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error('Failed to initialize payment');
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder', 
        amount: orderData.order.amount,
        currency: orderData.order.currency, // DYNAMIC: INR or USD
        name: "convert-to-pdf",
        description: "Premium PDF Conversion",
        order_id: orderData.order.id,
        handler: async function (response) {
            await performConversion(response);
        },
        prefill: {
            name: "Customer",
            email: "customer@example.com",
        },
        theme: {
            color: "#000000"
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
          setActiveJobId(null);
          setJobStatus(null);
          setStatus('error');
      });
      rzp.open();

    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  };

  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval;
    if (status === 'converting') {
      if (jobStatus === 'queued' || jobStatus === 'retrying') {
        setProgress(25);
      } else if (jobStatus === 'processing') {
        setProgress(68);
      } else {
        setProgress(40);
      }
      interval = setInterval(() => {
        setProgress(prev => {
          const floor = jobStatus === 'queued' || jobStatus === 'retrying' ? 15 : jobStatus === 'processing' ? 55 : 25;
          const ceiling = jobStatus === 'queued' || jobStatus === 'retrying' ? 35 : jobStatus === 'processing' ? 90 : 60;
          if (prev < ceiling) return Math.min(ceiling, prev + Math.random() * 4);
          return Math.max(floor, prev);
        });
      }, 500);
    } else if (status === 'done' || status === 'error') {
      setProgress(100);
      clearInterval(interval);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [status, jobStatus]);

  const getButtonState = () => {
    switch (status) {
      case 'paying': return { text: 'Initializing Payment...', disabled: true, icon: <Loader2 className="spinner" /> };
      case 'converting': return { text: activeJobId ? 'Tracking Job...' : 'Processing...', disabled: true, icon: <Loader2 className="spinner" /> };
      case 'done': return { text: 'Convert Another', disabled: false, icon: null, action: () => { setFiles([]); setStatus('idle'); setJobStatus(null); setActiveJobId(null); } };
      default: return { 
        text: 'CONVERT TO PDF', 
        disabled: files.length === 0, 
        icon: null, 
        action: triggerPaymentAndConversion 
      };
    }
  };

  const btnState = getButtonState();

  const [compress, setCompress] = useState(false);

  const getJobStageLabel = (stage) => {
    switch (stage) {
      case 'queued':
        return 'Queued';
      case 'retrying':
        return 'Retrying';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return null;
    }
  };

  const Logo = () => (
    <div style={{ 
      display: 'inline-block',
      padding: '0.5rem 1rem',
      backgroundColor: 'var(--neo-yellow)',
      border: '4px solid #000',
      boxShadow: '6px 6px 0px #000',
      marginBottom: '2rem',
      transform: 'rotate(-2deg)',
      animation: 'logo-float 3s ease-in-out infinite'
    }}>
      <h1 style={{ 
        margin: 0, 
        fontSize: '2rem', 
        fontWeight: 900, 
        textTransform: 'uppercase', 
        letterSpacing: '-0.05em',
        WebkitTextStroke: '1px #000'
      }}>
        convert-to-pdf
      </h1>
    </div>
  );

  return (
    <div className="layout-wrapper" style={{ animation: 'fade-in 0.8s ease-out forwards' }}>
      <aside className="ad-sidebar">
        <span className="ad-label">Sponsored</span>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#666' }}>160 x 600 AD SLOT</div>
      </aside>

      <main className="container">
        <div className="header" style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <Logo />
        </div>

      <div className="converter-card" style={{ boxShadow: '12px 12px 0px #000', transition: 'all 0.3s ease' }}>
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
                <p style={{ fontSize: '0.7rem', fontWeight: 800, marginTop: '0.5rem', opacity: 0.6, letterSpacing: '0.02em' }}>
                  * Use "Auto Detect" to merge different file types.
                </p>
              </div>
              
              <div className="arrow-divider">→</div>

              <div className="selector-box">
                <label>To</label>
                <select className="styled-select" disabled>
                  <option>PDF Document</option>
                </select>
              </div>
            </div>

            <div style={{ padding: '1rem', border: '3px solid #000', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#f9f9f9' }}>
               <input 
                 type="checkbox" 
                 id="compress-pdf" 
                 checked={compress}
                 onChange={(e) => setCompress(e.target.checked)}
                 style={{ width: '20px', height: '20px', accentColor: '#000', cursor: 'pointer' }} 
               />
               <label htmlFor="compress-pdf" style={{ fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 Compress Output PDF <span style={{ fontSize: '0.7rem', backgroundColor: 'var(--neo-yellow)', padding: '2px 6px', border: '1px solid #000' }}>RECOMMENDED</span>
               </label>
            </div>

            <div 
              className={`dropzone ${isDragging ? 'active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="dropzone-icon" />
              <h3>Drag & Drop your files here</h3>
              <p style={{ marginTop: '0.5rem', color: '#000', fontWeight: 'bold' }}>OR CLICK TO BROWSE</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, opacity: 0.6, marginTop: '1rem', fontStyle: 'italic' }}>
                * Tip: Select multiple files (Word, Images, Text, Markdown, etc.) to combine them into one unified PDF.
              </p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                style={{ display: 'none' }}
                multiple={true}
                  accept={
                  fromFormat === 'word' ? '.pdf,.doc,.docx,.odt,.rtf' :
                  fromFormat === 'excel' ? '.xls,.xlsx,.csv' :
                  fromFormat === 'ppt' ? '.ppt,.pptx' :
                  fromFormat === 'image' ? '.jpg,.jpeg,.png,.webp' :
                  fromFormat === 'md' ? '.md' :
                  fromFormat === 'text' ? '.txt' :
                  fromFormat === 'auto' ? '.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp' :
                  undefined
                }
              />
            </div>

            {files.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '1rem' }}>Queued Files ({files.length})</h4>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {files.map((f, index) => (
                    <div key={index} className="file-info" style={{ marginTop: 0, padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}>
                        <button 
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); moveFile(index, 'up'); }}
                          style={{ border: 'none', background: 'none', cursor: index === 0 ? 'default' : 'pointer', fontSize: '1rem', opacity: index === 0 ? 0.3 : 1 }}
                        >▲</button>
                        <button 
                          disabled={index === files.length - 1}
                          onClick={(e) => { e.stopPropagation(); moveFile(index, 'down'); }}
                          style={{ border: 'none', background: 'none', cursor: index === files.length - 1 ? 'default' : 'pointer', fontSize: '1rem', opacity: index === files.length - 1 ? 0.3 : 1 }}
                        >▼</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                        {f.previewUrl ? (
                          <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            flexShrink: 0, 
                            border: '3px solid #000', 
                            overflow: 'hidden',
                            backgroundColor: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <img 
                              src={f.previewUrl} 
                              alt="preview" 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                          </div>
                        ) : (
                          <File size={20} color="#000" style={{ flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <h4 style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{f.name}</h4>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', color: '#666' }}
                      >✕</button>
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

            {(status === 'converting' || status === 'paying') && (
              <div style={{ marginTop: '2rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                  <span>{status === 'paying' ? 'Initializing Payment' : activeJobId ? `Job ${getJobStageLabel(jobStatus) || 'Working'}` : 'Converting...'}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div style={{ 
                  height: '24px', 
                  backgroundColor: '#fff', 
                  border: '3px solid #000', 
                  overflow: 'hidden' 
                }}>
                  <div style={{ 
                    height: '100%', 
                    backgroundColor: 'var(--neo-yellow)', 
                    width: `${progress}%`,
                    transition: 'width 0.3s ease-out',
                    borderRight: progress > 0 ? '3px solid #000' : 'none'
                  }} />
                </div>
                {activeJobId && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.75 }}>
                    Job status: {getJobStageLabel(jobStatus) || 'Starting'}
                    {jobStatus === 'queued' ? ' - waiting for a worker' : ''}
                    {jobStatus === 'retrying' ? ' - waiting for retry window' : ''}
                    {jobStatus === 'processing' ? ' - converting your files' : ''}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
              <button 
                className="convert-btn"
                disabled={btnState.disabled}
                onClick={btnState.action}
                style={{ 
                  padding: '1.25rem 3rem',                 
                  fontSize: '1.2rem'
                }}
              >
                {btnState.icon}
                {btnState.text}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <CheckCircle color="#000" size={60} style={{ margin: '0 auto 1rem auto' }} />
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Conversion Success!</h2>
            
            <div className="ad-success-slot">
              <span className="ad-label">Sponsored</span>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#666', marginBottom: '0.25rem' }}>SPECIAL OFFER</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#999' }}>300 x 250 AD SLOT</div>
              </div>
            </div>

            <a 
              href={pdfUrl} 
              download={files[0]?.name.split('.')[0] + '.pdf'}
              className="btn btn-success" 
              style={{ textDecoration: 'none', display: 'flex', marginBottom: '0.75rem' }}
            >
              <Download size={20} /> Download PDF
            </a>
            
            <button className="btn" onClick={btnState.action}>
              Convert Another File
            </button>
          </div>
        )}
      </div>
    </main>

    <aside className="ad-sidebar">
      <span className="ad-label">Sponsored</span>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#666' }}>160 x 600 AD SLOT</div>
    </aside>
  </div>
);
}

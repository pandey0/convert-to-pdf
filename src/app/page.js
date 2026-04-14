"use client";

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, CheckCircle, Loader2, Download } from 'lucide-react';
import './globals.css'; // Make sure styles are imported if not via layout

export default function Home() {
  const [file, setFile] = useState(null);
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setStatus('idle');
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const performConversion = async (paymentDetails = {}) => {
    setStatus('converting');
    
    const formData = new FormData();
    formData.append('file', file);
    
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
    if (!file) return;

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
      case 'done': return { text: 'Convert Another File', disabled: false, icon: null, action: () => { setFile(null); setStatus('idle'); } };
      default: return { 
        text: process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true' ? 'Convert (Free Dev Mode)' : 'Pay ₹99 & Convert', 
        disabled: !file, 
        icon: null, 
        action: triggerPaymentAndConversion 
      };
    }
  };

  const btnState = getButtonState();

  return (
    <main className="container">
      <div className="header">
        <h1>convert-to-pdf</h1>
        <p>Convert any document to PDF: MD files, Text files, Presentations, Images, and Word files.</p>
      </div>

      <div className="converter-card">
        {status !== 'done' ? (
          <>
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
              />
            </div>

            {file && (
              <div className="file-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <File color="#000" />
                  <div>
                    <h4 style={{ fontWeight: 700 }}>{file.name}</h4>
                    <span style={{ fontSize: '0.85rem', color: '#000', fontWeight: 600 }}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
                <CheckCircle color="#000" />
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
            
            <a 
              href={pdfUrl} 
              download={file.name.split('.')[0] + '.pdf'}
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
  );
}

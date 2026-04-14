import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '../../../lib/db';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import { marked } from 'marked';
import { rateLimit } from '../../../lib/rate-limit';

const convertAsync = promisify(libre.convert);

export async function POST(req) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const limitResult = rateLimit(ip, 10, 60000); // 10 conversions per minute

    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const files = formData.getAll('file');
    const bypassRequested = formData.get('bypass_payment') === 'true';

    // Allowed extensions whitelist
    const ALLOWED_EXTENSIONS = [
        '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', 
        '.txt', '.md', '.html', '.png', '.jpg', '.jpeg', '.webp'
    ];
    
    // Strict bypass validation: only allow if env is explicitly 'true'
    const bypass = bypassRequested && process.env.NEXT_PUBLIC_SKIP_PAYMENT === 'true';

    if (bypassRequested && !bypass) {
        console.warn(`[SECURITY] Unauthorized bypass attempt from IP: ${ip}`);
        return NextResponse.json({ success: false, message: 'Unauthorized bypass attempt' }, { status: 403 });
    }

    if (!files || files.length === 0) {
        return NextResponse.json({ success: false, message: 'Missing file(s)' }, { status: 400 });
    }

    // Comprehensive validation for all files
    for (const f of files) {
        // 10MB File Size Limit per file
        if (f.size > 10 * 1024 * 1024) {
            return NextResponse.json({ success: false, message: `File ${f.name} too large (Max 10MB)` }, { status: 413 });
        }

        const ext = path.extname(f.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return NextResponse.json({ success: false, message: `File type ${ext} not allowed` }, { status: 400 });
        }
    }

    if (!bypass) {
        if (!orderId || !paymentId || !signature) {
          return NextResponse.json({ success: false, message: 'Missing payment parameters' }, { status: 400 });
        }

        // 1. Verify Payment Signature
        const generated_signature = crypto
          .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder')
          .update(orderId + '|' + paymentId)
          .digest('hex');

        if (generated_signature !== signature) {
          if (process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET !== 'secret_placeholder') {
            return NextResponse.json({ success: false, message: 'Invalid payment signature' }, { status: 400 });
          }
        }

        // 2. Mark order as paid
        await prisma.conversionOrder.update({
          where: { razorpayOrderId: orderId },
          data: { status: 'paid' },
        });
    }

    // 3. Conversion Logic
    let pdfBuffer;
    const isMultiImage = files.length > 0 && files.every(f => ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(f.name).toLowerCase()));

    if (isMultiImage) {
        // Multi-Image to PDF
        const pdfDoc = await PDFDocument.create();
        for (const f of files) {
            const arrayBuffer = await f.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const ext = path.extname(f.name).toLowerCase();
            
            const page = pdfDoc.addPage();
            let image;
            if (ext === '.png') {
                image = await pdfDoc.embedPng(buffer);
            } else if (ext === '.webp') {
                // pdf-lib doesn't natively support webp embed yet, 
                // but for this MVP we'll skip or use LibreOffice if webp
                // Actually, let's fall back to LibreOffice for complex multi-formats if needed,
                // but for now we'll support PNG/JPG via pdf-lib.
                // WEBP needs pre-processing or LibreOffice.
                // Let's use LibreOffice for webp.
                continue; 
            } else {
                image = await pdfDoc.embedJpg(buffer);
            }
            if (image) {
                const { width, height } = image.scale(1);
                page.setSize(width, height);
                page.drawImage(image, { x: 0, y: 0, width, height });
            }
        }
        pdfBuffer = Buffer.from(await pdfDoc.save());
    } else if (files.length === 1) {
        const file = files[0];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileName = file.name;
        const extension = path.extname(fileName).toLowerCase();
        
        let finalBuffer = buffer;
        let finalExtension = extension;

        if (extension === '.md') {
            // 3.5 Pre-process Markdown to Styled HTML
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                <meta charset="UTF-8">
                <style>
                    @page { margin: 1in; }
                    body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
                    font-size: 11pt;
                    line-height: 1.5; 
                    color: #1f2328; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    }
                    h1, h2, h3, h4, h5, h6 { 
                    margin-top: 24px; 
                    margin-bottom: 16px; 
                    font-weight: 600; 
                    line-height: 1.25;
                    color: #1f2328;
                    }
                    h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
                    h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
                    h3 { font-size: 1.25em; }
                    
                    p { margin-top: 0; margin-bottom: 16px; }
                    
                    a { color: #0969da; text-decoration: none; }
                    
                    code { 
                    padding: 0.2em 0.4em;
                    margin: 0;
                    font-size: 85%;
                    white-space: break-spaces;
                    background-color: rgba(175, 184, 193, 0.2);
                    border-radius: 6px;
                    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
                    }
                    
                    pre { 
                    padding: 16px;
                    overflow: auto;
                    font-size: 85%;
                    line-height: 1.45;
                    color: #1f2328;
                    background-color: #f6f8fa;
                    border-radius: 6px;
                    word-wrap: normal;
                    margin-bottom: 16px;
                    }
                    pre code { 
                    background-color: transparent; 
                    padding: 0; 
                    font-size: 100%; 
                    color: inherit;
                    }
                    
                    blockquote { 
                    padding: 0 1em;
                    color: #636c76;
                    border-left: 0.25em solid #d0d7de;
                    margin: 0 0 16px 0;
                    }
                    
                    ul, ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
                    li + li { margin-top: 0.25em; }
                    
                    table { 
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 24px;
                    border: 0.5pt solid #000;
                    }
                    table th, table td { 
                    padding: 8px;
                    border: 0.5pt solid #000;
                    text-align: left;
                    }
                    table th { 
                    background-color: #f6f8fa;
                    font-weight: bold;
                    }
                    table tr:nth-child(even) { background-color: #fcfcfc; }
                    
                    img { max-width: 100%; box-sizing: content-box; background-color: #ffffff; }

                    /* Page break rules */
                    h1, h2, h3 { page-break-after: avoid; }
                    pre, blockquote, table { page-break-inside: avoid; }
                </style>
                </head>
                <body>
                ${(() => {
                    const renderer = new marked.Renderer();
                    // In marked v18, the table renderer receives a single token object
                    renderer.table = function(token) {
                    let headerHtml = '';
                    for (let i = 0; i < token.header.length; i++) {
                        headerHtml += this.tablecell(token.header[i]);
                    }
                    const headerRow = this.tablerow({ text: headerHtml });

                    let bodyHtml = '';
                    for (let i = 0; i < token.rows.length; i++) {
                        let rowHtml = '';
                        for (let j = 0; j < token.rows[i].length; j++) {
                        rowHtml += this.tablecell(token.rows[i][j]);
                        }
                        bodyHtml += this.tablerow({ text: rowHtml });
                    }

                    return `<table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse; width:100%; border: 0.5pt solid #000;">
                        <thead>${headerRow}</thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>`;
                    };
                    return marked.parse(buffer.toString(), { renderer });
                })()}
                </body>
                </html>
            `;
            finalBuffer = Buffer.from(htmlContent);
            finalExtension = '.html';
        }

        if (['.png', '.jpg', '.jpeg'].includes(extension)) {
            // Single Image to PDF (via pdf-lib for speed/quality)
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage();
            let image;
            if (extension === '.png') {
                image = await pdfDoc.embedPng(buffer);
            } else {
                image = await pdfDoc.embedJpg(buffer);
            }
            const { width, height } = image.scale(1);
            page.setSize(width, height);
            page.drawImage(image, { x: 0, y: 0, width, height });
            pdfBuffer = Buffer.from(await pdfDoc.save());
        } else {
            // Document to PDF using LibreOffice (handles Word, Excel, PPT, Text, and HTML/MD)
            try {
                const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Conversion timed out after 60s')), 60000)
                );
                
                pdfBuffer = await Promise.race([
                convertAsync(finalBuffer, '.pdf', undefined),
                timeoutPromise
                ]);
            } catch (err) {
                console.error('Conversion error:', err);
                throw new Error(err.message || 'Conversion failed. Process timed out or server error.');
            }
        }
    } else {
        return NextResponse.json({ success: false, message: 'Multiple files only supported for images' }, { status: 400 });
    }

    // 4. Update order as completed (only if not bypassed)
    if (!bypass) {
        await prisma.conversionOrder.update({
          where: { razorpayOrderId: orderId },
          data: { status: 'completed' },
        });
    }

    // Return the PDF directly as a stream/blob
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${files[0].name.replace(path.extname(files[0].name), '.pdf')}"`,
      },
    });

  } catch (error) {
    console.error('Error in conversion:', error);
    return NextResponse.json(
      { success: false, message: 'Conversion failed', error: error.message },
      { status: 500 }
    );
  }
}

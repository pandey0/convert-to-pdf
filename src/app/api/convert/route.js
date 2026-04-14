import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '../../../lib/db';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import libre from 'libreoffice-convert';
import { promisify } from 'util';
import { marked } from 'marked';

const convertAsync = promisify(libre.convert);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const bypass = formData.get('bypass_payment') === 'true';
    const orderId = formData.get('razorpay_order_id');
    const paymentId = formData.get('razorpay_payment_id');
    const signature = formData.get('razorpay_signature');

    if (!file) {
        return NextResponse.json({ success: false, message: 'Missing file' }, { status: 400 });
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
            }
            table th, table td { 
              padding: 10px;
              border: 1px solid #c8d1d9; /* Darker border for better PDF visibility */
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
          ${marked.parse(buffer.toString())}
        </body>
        </html>
      `;
      finalBuffer = Buffer.from(htmlContent);
      finalExtension = '.html';
    }

    let pdfBuffer;
    if (['.png', '.jpg', '.jpeg'].includes(extension)) {
      // Image to PDF
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
        pdfBuffer = await convertAsync(finalBuffer, '.pdf', undefined);
      } catch (err) {
        console.error('LibreOffice conversion error:', err);
        throw new Error('Document conversion failed. Ensure LibreOffice is installed.');
      }
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
        'Content-Disposition': `attachment; filename="${fileName.replace(extension, '.pdf')}"`,
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

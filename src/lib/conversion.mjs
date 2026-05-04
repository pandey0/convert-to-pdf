import path from 'path';
import { promisify } from 'util';
import libre from 'libreoffice-convert';
import { PDFDocument } from 'pdf-lib';
import { marked } from 'marked';

const convertAsync = promisify(libre.convert);
export const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.webp']);
export const maxFileSize = 10 * 1024 * 1024;

export async function convertFilesToPdfBuffer(files, compress = false) {
  const mainPdfDoc = await PDFDocument.create();
  let pdfHasContent = false;

  for (const file of files) {
    const buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
    const fileName = file.name || 'unnamed-file';
    const extension = path.extname(fileName).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
    }

    if (buffer.length > maxFileSize) {
      throw new Error(`File too large: ${fileName}`);
    }

    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      let image;
      if (extension === '.png') {
        image = await mainPdfDoc.embedPng(buffer);
      } else if (extension === '.webp') {
        throw new Error('WebP not natively supported yet in multi-merge. Use PNG/JPG.');
      } else {
        image = await mainPdfDoc.embedJpg(buffer);
      }
      const page = mainPdfDoc.addPage();
      const { width, height } = image.scale(1);
      page.setSize(width, height);
      page.drawImage(image, { x: 0, y: 0, width, height });
      pdfHasContent = true;
      continue;
    }

    let finalBuffer = buffer;
    if (extension === '.md') {
      const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page { margin: 1in; } body { font-family: sans-serif; }</style></head><body>${marked.parse(buffer.toString())}</body></html>`;
      finalBuffer = Buffer.from(htmlContent);
    }

    const singlePdfBuffer = await convertAsync(finalBuffer, '.pdf', undefined);
    const singlePdfDoc = await PDFDocument.load(singlePdfBuffer);
    const copiedPages = await mainPdfDoc.copyPages(singlePdfDoc, singlePdfDoc.getPageIndices());
    copiedPages.forEach((page) => mainPdfDoc.addPage(page));
    pdfHasContent = true;
  }

  if (!pdfHasContent) {
    throw new Error('No valid content found for PDF generation');
  }

  return Buffer.from(
    await mainPdfDoc.save({
      useObjectStreams: compress,
      addDefaultPage: false,
    })
  );
}

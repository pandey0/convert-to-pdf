import path from 'path';
import { promisify } from 'util';
import libre from 'libreoffice-convert';
import { PDFDocument } from 'pdf-lib';
import { marked } from 'marked';

const convertAsync = promisify(libre.convert);
export const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.png', '.jpg', '.jpeg']);
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

    if (['.png', '.jpg', '.jpeg'].includes(extension)) {
      const image = extension === '.png'
        ? await mainPdfDoc.embedPng(buffer)
        : await mainPdfDoc.embedJpg(buffer);
      const page = mainPdfDoc.addPage();
      const { width, height } = image.scale(1);
      page.setSize(width, height);
      page.drawImage(image, { x: 0, y: 0, width, height });
      pdfHasContent = true;
      continue;
    }

    let finalBuffer = buffer;
    const isMarkdown = extension === '.md';
    if (isMarkdown) {
      // LibreOffice's HTML import drops the first block element's content and
      // inserts a blank page in its place when it's followed by more content.
      // A throwaway leading paragraph absorbs that loss instead of real content;
      // the resulting blank page is dropped below.
      const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page { margin: 1in; } body { font-family: sans-serif; }</style></head><body><p>&nbsp;</p>${marked.parse(buffer.toString())}</body></html>`;
      finalBuffer = Buffer.from(htmlContent);
    }

    const singlePdfBuffer = await convertAsync(finalBuffer, '.pdf', undefined);
    const singlePdfDoc = await PDFDocument.load(singlePdfBuffer);
    let pageIndices = singlePdfDoc.getPageIndices();
    if (isMarkdown && pageIndices.length > 1) {
      pageIndices = pageIndices.slice(1);
    }
    const copiedPages = await mainPdfDoc.copyPages(singlePdfDoc, pageIndices);
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

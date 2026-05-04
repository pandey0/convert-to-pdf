import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const storageRoot = process.env.JOB_STORAGE_ROOT || '/data/job-artifacts';

function sanitizeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'file';
}

export function getJobArtifactDir(jobId) {
  return path.join(/* turbopackIgnore: true */ storageRoot, jobId);
}

export function getJobInputDir(jobId) {
  return path.join(/* turbopackIgnore: true */ getJobArtifactDir(jobId), 'inputs');
}

export function getJobOutputDir(jobId) {
  return path.join(/* turbopackIgnore: true */ getJobArtifactDir(jobId), 'output');
}

export async function writeJobArtifact(jobId, orderIndex, originalName, buffer) {
  const safeName = sanitizeSegment(originalName);
  const fileName = `${String(orderIndex).padStart(2, '0')}-${crypto.randomUUID()}-${safeName}`;
  const artifactDir = getJobInputDir(jobId);
  const artifactPath = path.join(/* turbopackIgnore: true */ artifactDir, fileName);

  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(artifactPath, buffer);

  return artifactPath;
}

export async function writeJobOutputArtifact(jobId, buffer, fileName = 'converted-document.pdf') {
  const safeName = sanitizeSegment(fileName);
  const artifactDir = getJobOutputDir(jobId);
  const artifactPath = path.join(/* turbopackIgnore: true */ artifactDir, safeName);

  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(artifactPath, buffer);

  return artifactPath;
}

export async function getJobOutputArtifactPath(jobId, fileName = 'converted-document.pdf') {
  const safeName = sanitizeSegment(fileName);
  return path.join(/* turbopackIgnore: true */ getJobOutputDir(jobId), safeName);
}

export async function readJobArtifact(storageKey) {
  return fs.readFile(storageKey);
}

export async function deleteJobArtifacts(jobId) {
  await fs.rm(getJobArtifactDir(jobId), { recursive: true, force: true });
}

export async function deleteJobInputs(jobId) {
  await fs.rm(getJobInputDir(jobId), { recursive: true, force: true });
}

export async function deleteJobOutputs(jobId) {
  await fs.rm(getJobOutputDir(jobId), { recursive: true, force: true });
}

export async function artifactExists(storageKey) {
  try {
    await fs.access(storageKey);
    return true;
  } catch {
    return false;
  }
}

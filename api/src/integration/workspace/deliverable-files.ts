export interface DeliverableFile {
  path: string;
  content: string;
}

export interface ParsedDeliverable {
  files: DeliverableFile[];
  rejected: string[];
  error?: string;
}

const UNSAFE_SEGMENT = /(?:^|\/|\\)\.\.(?:\/|\\|$)/;

export function isSafeRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  if (!normalized || normalized.includes('\0')) {
    return false;
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false;
  }
  if (UNSAFE_SEGMENT.test(normalized) || normalized.split('/').includes('..')) {
    return false;
  }
  return true;
}

export function parseDeliverableFiles(deliverable: string): ParsedDeliverable {
  if (!deliverable.trim()) {
    return { files: [], rejected: [], error: 'Livrable vide.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(deliverable);
  } catch {
    return { files: [], rejected: [], error: 'Livrable JSON invalide.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { files: [], rejected: [], error: 'Livrable JSON non objet.' };
  }

  const rawFiles = (parsed as { files?: unknown }).files;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return { files: [], rejected: [], error: 'Aucun fichier dans le livrable.' };
  }

  const files: DeliverableFile[] = [];
  const rejected: string[] = [];

  for (const entry of rawFiles) {
    if (typeof entry !== 'object' || entry === null) {
      rejected.push('(entrée invalide)');
      continue;
    }
    const path = String((entry as { path?: unknown }).path ?? '').trim();
    const content =
      (entry as { content?: unknown }).content != null
        ? String((entry as { content?: unknown }).content)
        : '';
    if (!path || !content) {
      rejected.push(path || '(sans chemin)');
      continue;
    }
    if (!isSafeRelativePath(path)) {
      rejected.push(path);
      continue;
    }
    files.push({ path: path.replace(/\\/g, '/'), content });
  }

  if (files.length === 0) {
    return {
      files: [],
      rejected,
      error: rejected.length
        ? `Aucun fichier sûr à matérialiser (${rejected.join(', ')}).`
        : 'Aucun fichier exploitable.',
    };
  }

  return { files, rejected };
}

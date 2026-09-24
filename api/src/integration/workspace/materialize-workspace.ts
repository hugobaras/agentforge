import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve, sep } from 'path';
import { DeliverableFile } from './deliverable-files';

export interface MaterializedWorkspace {
  root: string;
  written: string[];
}

export async function materializeWorkspace(
  files: DeliverableFile[],
  lotId?: string,
): Promise<MaterializedWorkspace> {
  const prefix = join(
    tmpdir(),
    `agentforge-verify-${sanitize(lotId ?? 'lot')}-`,
  );
  const root = await mkdtemp(prefix);
  const written: string[] = [];

  try {
    for (const file of files) {
      const absolute = resolveSafe(root, file.path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, file.content, 'utf8');
      written.push(file.path);
    }
  } catch (error) {
    await removeWorkspace(root);
    throw error;
  }

  return { root, written };
}

export async function removeWorkspace(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'lot';
}

function resolveSafe(root: string, relativePath: string): string {
  const absolute = resolve(root, relativePath);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolute !== root && !absolute.startsWith(prefix)) {
    throw new Error(`Chemin hors workspace : ${relativePath}`);
  }
  return absolute;
}

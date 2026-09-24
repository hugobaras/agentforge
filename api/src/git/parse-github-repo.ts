export interface GithubRepoRef {
  owner: string;
  repo: string;
}

const GITHUB_HTTPS =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/i;
const GITHUB_SSH = /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i;
const GITHUB_SLUG = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export function parseGithubRepo(raw: string): GithubRepoRef {
  const value = raw.trim();
  if (!value) {
    throw new Error('URL de dépôt GitHub manquante.');
  }

  const match =
    value.match(GITHUB_HTTPS) ?? value.match(GITHUB_SSH) ?? value.match(GITHUB_SLUG);
  if (!match) {
    throw new Error(
      `Dépôt GitHub invalide : « ${value} ». Attendu owner/repo ou https://github.com/owner/repo.`,
    );
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  if (!owner || !repo || repo === '.' || repo === '..') {
    throw new Error(`Dépôt GitHub invalide : « ${value} ».`);
  }

  return { owner, repo };
}

export function sanitizeBranch(branch: string | undefined, fallback = 'main'): string {
  const trimmed = branch?.trim() || fallback;
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed)) {
    throw new Error(`Branche invalide : « ${trimmed} ».`);
  }
  return trimmed.replace(/^\/+|\/+$/g, '') || fallback;
}

export function lotHeadBranch(lotId: string): string {
  const slug = lotId.replace(/-/g, '').slice(0, 12);
  return `agentforge/lot-${slug}`;
}

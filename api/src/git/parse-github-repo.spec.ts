import {
  lotHeadBranch,
  parseGithubRepo,
  sanitizeBranch,
} from './parse-github-repo';

describe('parseGithubRepo', () => {
  it('accepte owner/repo et les URL GitHub', () => {
    expect(parseGithubRepo('acme/api')).toEqual({ owner: 'acme', repo: 'api' });
    expect(parseGithubRepo('https://github.com/acme/api.git')).toEqual({
      owner: 'acme',
      repo: 'api',
    });
    expect(parseGithubRepo('git@github.com:acme/api.git')).toEqual({
      owner: 'acme',
      repo: 'api',
    });
  });

  it('refuse un dépôt hors GitHub', () => {
    expect(() => parseGithubRepo('https://gitlab.com/acme/api')).toThrow(
      /GitHub invalide/,
    );
  });
});

describe('sanitizeBranch', () => {
  it('normalise et refuse les caractères dangereux', () => {
    expect(sanitizeBranch(' develop ')).toBe('develop');
    expect(sanitizeBranch(undefined)).toBe('main');
    expect(() => sanitizeBranch('feat branch')).toThrow(/Branche invalide/);
  });
});

describe('lotHeadBranch', () => {
  it('préfixe agentforge/lot-', () => {
    expect(lotHeadBranch('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'agentforge/lot-aaaaaaaabbbb',
    );
  });
});

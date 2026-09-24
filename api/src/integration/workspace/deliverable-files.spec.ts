import { isSafeRelativePath, parseDeliverableFiles } from './deliverable-files';

describe('deliverable-files', () => {
  it('accepte des chemins relatifs sûrs', () => {
    expect(isSafeRelativePath('src/ping.mjs')).toBe(true);
    expect(isSafeRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeRelativePath('/tmp/x')).toBe(false);
    expect(isSafeRelativePath('src/../../secret')).toBe(false);
  });

  it('extrait les fichiers JSON et refuse les chemins unsafe', () => {
    const parsed = parseDeliverableFiles(
      JSON.stringify({
        files: [
          { path: 'src/ok.mjs', content: 'export const ok = true' },
          { path: '../escape.js', content: 'nope' },
        ],
      }),
    );

    expect(parsed.files).toEqual([
      { path: 'src/ok.mjs', content: 'export const ok = true' },
    ]);
    expect(parsed.rejected).toEqual(['../escape.js']);
  });

  it('signale un livrable non JSON', () => {
    const parsed = parseDeliverableFiles('pas json');
    expect(parsed.files).toHaveLength(0);
    expect(parsed.error).toMatch(/JSON invalide/);
  });
});

import { runExecutableVerification } from './executable-verification';

const spec = { title: 'Ping HTTP', body: 'GET /ping doit répondre pong' };

describe('runExecutableVerification', () => {
  it('exécute node --test et approuve un livrable sain', async () => {
    const result = await runExecutableVerification({
      lotId: 'lot-exec-1',
      title: 'Ping',
      spec,
      deliverable: JSON.stringify({
        summary: 'Ping HTTP pong',
        files: [
          {
            path: 'src/app.mjs',
            content:
              '// Ping HTTP GET /ping pong\nexport function ping() { return { pong: true }; }\n',
          },
          {
            path: 'src/app.test.mjs',
            content: [
              "import { test } from 'node:test';",
              "import assert from 'node:assert/strict';",
              "import { ping } from './app.mjs';",
              "test('pong', () => assert.deepEqual(ping(), { pong: true }));",
              '',
            ].join('\n'),
          },
        ],
      }),
    });

    expect(result.approved).toBe(true);
    expect(result.reports?.tests?.command).toMatch(/--test/);
    expect(result.reports?.lint?.ok).toBe(true);
    expect(result.reports?.analysis?.ok).toBe(true);
  });

  it('échoue l’analyse sur une syntaxe JS invalide', async () => {
    const result = await runExecutableVerification({
      lotId: 'lot-exec-2',
      title: 'Ping',
      spec,
      deliverable: JSON.stringify({
        summary: 'Ping HTTP pong',
        files: [
          {
            path: 'src/broken.mjs',
            content: '// Ping HTTP pong\nexport function ping( { return true }\n',
          },
          {
            path: 'src/broken.test.mjs',
            content:
              "import { test } from 'node:test';\ntest('x', () => {});\n",
          },
        ],
      }),
    });

    expect(result.approved).toBe(false);
    expect(result.checks.lint === false || result.checks.analysis === false).toBe(
      true,
    );
  });
});

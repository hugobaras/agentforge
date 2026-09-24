import { Injectable } from '@nestjs/common';
import {
  ImplementerAgent,
  ImplementerInput,
  ImplementerResult,
} from './implementer-agent';

@Injectable()
export class MockImplementerAgent implements ImplementerAgent {
  async implement(input: ImplementerInput): Promise<ImplementerResult> {
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'deliverable';
    const modulePath = `src/${slug}.mjs`;
    const testPath = `src/${slug}.test.mjs`;

    if (!input.feedback) {
      return {
        summary: `Livrable mock initial pour « ${input.title} » (passe incomplète)`,
        provider: 'mock',
        files: [
          {
            path: `src/${slug}.ts`,
            content: [
              '// Placeholder — première passe, hors spec.',
              `export function deliver() {`,
              `  return { lotId: ${JSON.stringify(input.lotId)}, ok: false, draft: true };`,
              `}`,
              '',
            ].join('\n'),
          },
        ],
      };
    }

    return {
      summary: `Livrable mock révisé pour « ${input.title} » (spec: ${input.spec.title})`,
      provider: 'mock',
      files: [
        {
          path: modulePath,
          content: [
            `// Spec: ${input.spec.title}`,
            `// ${input.spec.body}`,
            `// Feedback évaluateur: ${input.feedback}`,
            `export function deliver() {`,
            `  return { lotId: ${JSON.stringify(input.lotId)}, ok: true };`,
            `}`,
            '',
          ].join('\n'),
        },
        {
          path: testPath,
          content: [
            `import { test } from 'node:test';`,
            `import assert from 'node:assert/strict';`,
            `import { deliver } from './${slug}.mjs';`,
            '',
            `test('deliver reflète la spec ${input.spec.title}', () => {`,
            `  assert.deepEqual(deliver(), { lotId: ${JSON.stringify(input.lotId)}, ok: true });`,
            `});`,
            '',
          ].join('\n'),
        },
      ],
    };
  }
}

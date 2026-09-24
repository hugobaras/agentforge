import { existsSync } from 'fs';
import { join } from 'path';
import { CheckReport, failedReport, skippedReport } from './check-report';
import { DeliverableFile } from './deliverable-files';
import { StackDetection } from './detect-stack';
import { runCommand } from './run-command';

const PAIRS: Array<[string, string]> = [
  ['{', '}'],
  ['(', ')'],
  ['[', ']'],
];

export function runStandardsCheck(
  parsedError: string | undefined,
  written: string[],
  rejected: string[],
): CheckReport {
  if (parsedError) {
    return failedReport(parsedError, { stdout: parsedError });
  }
  const lines = [
    `${written.length} fichier(s) écrit(s) : ${written.join(', ')}`,
    rejected.length ? `Ignorés (chemin unsafe) : ${rejected.join(', ')}` : '',
  ].filter(Boolean);
  return {
    ok: written.length > 0,
    stdout: lines.join('\n'),
    stderr: written.length > 0 ? '' : 'Workspace vide.',
    durationMs: 0,
    command: 'materialize',
    exitCode: written.length > 0 ? 0 : 1,
  };
}

export function runLintCheck(
  files: DeliverableFile[],
  stack: StackDetection,
  workspaceRoot: string,
  timeoutMs: number,
): Promise<CheckReport> {
  if (stack.hasEslintConfig && stack.eslintAvailable) {
    return runCommand(
      process.execPath,
      [join(workspaceRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'), '.'],
      { cwd: workspaceRoot, timeoutMs },
    );
  }

  const issues: string[] = [];
  for (const file of files) {
    if (!file.content.trim()) {
      issues.push(`${file.path} : fichier vide`);
      continue;
    }
    if (/\beval\s*\(/.test(file.content) || /\bnew\s+Function\s*\(/.test(file.content)) {
      issues.push(`${file.path} : eval / Function dynamiques`);
    }
    const imbalance = braceImbalance(file.content);
    if (imbalance) {
      issues.push(`${file.path} : ${imbalance}`);
    }
  }

  if (issues.length === 0) {
    return Promise.resolve({
      ok: true,
      command: 'lint:builtin',
      exitCode: 0,
      stdout: `Lint intégré OK (${files.length} fichier(s)).`,
      stderr: '',
      durationMs: 0,
    });
  }

  return Promise.resolve({
    ok: false,
    command: 'lint:builtin',
    exitCode: 1,
    stdout: '',
    stderr: issues.join('\n'),
    durationMs: 0,
  });
}

export async function runAnalysisCheck(
  files: DeliverableFile[],
  stack: StackDetection,
  workspaceRoot: string,
  timeoutMs: number,
): Promise<CheckReport> {
  if (stack.hasTsconfig && existsSync(join(workspaceRoot, 'node_modules', 'typescript'))) {
    const tsc = join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    return runCommand(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], {
      cwd: workspaceRoot,
      timeoutMs,
    });
  }

  const codeFiles = files.filter((file) =>
    /\.(mjs|cjs|js|ts|tsx|jsx)$/i.test(file.path),
  );
  if (codeFiles.length === 0) {
    return skippedReport('Aucun fichier JS/TS à analyser.');
  }

  const ts = tryLoadTypescript();
  if (!ts) {
    return skippedReport('TypeScript indisponible — analyse syntaxique sautée.');
  }

  const diagnostics: string[] = [];
  for (const file of codeFiles) {
    const result = ts.transpileModule(file.content, {
      reportDiagnostics: true,
      fileName: file.path,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    });
    for (const diagnostic of result.diagnostics ?? []) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      diagnostics.push(`${file.path}: ${message}`);
    }
  }

  if (diagnostics.length === 0) {
    return {
      ok: true,
      command: 'tsc:transpile',
      exitCode: 0,
      stdout: `Analyse syntaxique OK (${codeFiles.length} fichier(s)).`,
      stderr: '',
      durationMs: 0,
    };
  }

  return {
    ok: false,
    command: 'tsc:transpile',
    exitCode: 1,
    stdout: '',
    stderr: diagnostics.join('\n'),
    durationMs: 0,
  };
}

export async function runTestsCheck(
  stack: StackDetection,
  workspaceRoot: string,
  timeoutMs: number,
): Promise<CheckReport> {
  if (stack.jsTestFiles.length > 0) {
    return runCommand(process.execPath, ['--test', ...stack.jsTestFiles], {
      cwd: workspaceRoot,
      timeoutMs,
    });
  }

  if (stack.tsTestFiles.length > 0) {
    return failedReport(
      'Tests TypeScript détectés sans runner installé (Jest / compilateur). Ajoutez des *.test.mjs ou un package.json testable.',
      { command: 'node --test' },
    );
  }

  if (stack.pyTestFiles.length > 0) {
    return runCommand('python3', ['-m', 'pytest', '-q'], {
      cwd: workspaceRoot,
      timeoutMs,
    });
  }

  return failedReport('Aucun fichier de test détecté (*.test.mjs / *.spec.js / pytest).');
}

export function runFidelityCheck(
  spec: { title: string; body: string },
  deliverable: string,
): CheckReport {
  const terms = `${spec.title} ${spec.body}`
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 3);
  const unique = [...new Set(terms)];
  if (unique.length === 0) {
    return {
      ok: true,
      skipped: true,
      command: 'fidelity:overlap',
      stdout: 'Spec trop courte pour mesurer la fidélité.',
      stderr: '',
      durationMs: 0,
    };
  }
  const haystack = deliverable.toLowerCase();
  const hits = unique.filter((term) => haystack.includes(term));
  const ratio = hits.length / unique.length;
  const ok = ratio >= 0.4;
  const stdout = `Couverture ${hits.length}/${unique.length} (${Math.round(ratio * 100)}%).`;
  return {
    ok,
    command: 'fidelity:overlap',
    exitCode: ok ? 0 : 1,
    stdout,
    stderr: ok ? '' : `Termes manquants : ${unique.filter((t) => !haystack.includes(t)).slice(0, 8).join(', ')}`,
    durationMs: 0,
  };
}

function braceImbalance(source: string): string | null {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
  for (const [open, close] of PAIRS) {
    let depth = 0;
    for (const char of stripped) {
      if (char === open) {
        depth += 1;
      } else if (char === close) {
        depth -= 1;
        if (depth < 0) {
          return `fermeture ${close} sans ouverture`;
        }
      }
    }
    if (depth !== 0) {
      return `accolades ${open}${close} non équilibrées`;
    }
  }
  return null;
}

function tryLoadTypescript(): typeof import('typescript') | undefined {
  try {
    return require('typescript') as typeof import('typescript');
  } catch {
    return undefined;
  }
}

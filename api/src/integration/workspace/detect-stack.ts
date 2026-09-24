import { existsSync } from 'fs';
import { join } from 'path';
import { DeliverableFile } from './deliverable-files';

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
];

const JS_TEST = /\.(test|spec)\.(mjs|cjs|js)$/i;
const TS_TEST = /\.(test|spec)\.(ts|mts|cts)$/i;
const PY_TEST = /(?:^|\/)test_[^/]+\.py$|(?:^|\/).+_test\.py$/i;
const SOURCE = /\.(mjs|cjs|js|ts|tsx|jsx|py)$/i;

export interface StackDetection {
  jsTestFiles: string[];
  tsTestFiles: string[];
  pyTestFiles: string[];
  sourceFiles: string[];
  hasEslintConfig: boolean;
  hasTsconfig: boolean;
  hasPackageJson: boolean;
  eslintAvailable: boolean;
}

export function detectStack(
  files: DeliverableFile[],
  workspaceRoot: string,
): StackDetection {
  const names = new Set(files.map((file) => file.path.replace(/\\/g, '/')));
  const jsTestFiles = files.map((f) => f.path).filter((p) => JS_TEST.test(p));
  const tsTestFiles = files.map((f) => f.path).filter((p) => TS_TEST.test(p));
  const pyTestFiles = files.map((f) => f.path).filter((p) => PY_TEST.test(p));
  const sourceFiles = files
    .map((f) => f.path)
    .filter((p) => SOURCE.test(p) && !JS_TEST.test(p) && !TS_TEST.test(p) && !PY_TEST.test(p));

  return {
    jsTestFiles,
    tsTestFiles,
    pyTestFiles,
    sourceFiles,
    hasEslintConfig: ESLINT_CONFIGS.some((name) => names.has(name)),
    hasTsconfig: names.has('tsconfig.json'),
    hasPackageJson: names.has('package.json'),
    eslintAvailable: existsSync(join(workspaceRoot, 'node_modules', 'eslint')),
  };
}

import {
  VerifierInput,
  VerifierResult,
} from '../agents/verifier-agent';
import { CheckReport } from './check-report';
import { parseDeliverableFiles } from './deliverable-files';
import { detectStack } from './detect-stack';
import { materializeWorkspace, removeWorkspace } from './materialize-workspace';
import { commandTimeoutMs } from './run-command';
import {
  runAnalysisCheck,
  runFidelityCheck,
  runLintCheck,
  runStandardsCheck,
  runTestsCheck,
} from './runners';

export type VerificationReports = {
  standards: CheckReport;
  lint: CheckReport;
  analysis: CheckReport;
  tests: CheckReport;
  fidelity: CheckReport;
};

export async function runExecutableVerification(
  input: VerifierInput,
): Promise<Omit<VerifierResult, 'provider'>> {
  const parsed = parseDeliverableFiles(input.deliverable);
  const fidelity = runFidelityCheck(input.spec, input.deliverable);

  if (parsed.error || parsed.files.length === 0) {
    const standards = runStandardsCheck(parsed.error, [], parsed.rejected);
    return assemble({
      standards,
      lint: standards,
      analysis: standards,
      tests: standards,
      fidelity,
    });
  }

  const workspace = await materializeWorkspace(parsed.files, input.lotId);
  try {
    const stack = detectStack(parsed.files, workspace.root);
    const timeoutMs = commandTimeoutMs();
    const standards = runStandardsCheck(undefined, workspace.written, parsed.rejected);
    const [lint, analysis, tests] = await Promise.all([
      runLintCheck(parsed.files, stack, workspace.root, timeoutMs),
      runAnalysisCheck(parsed.files, stack, workspace.root, timeoutMs),
      runTestsCheck(stack, workspace.root, timeoutMs),
    ]);

    return assemble({ standards, lint, analysis, tests, fidelity });
  } finally {
    await removeWorkspace(workspace.root);
  }
}

function assemble(
  reports: VerificationReports,
): Omit<VerifierResult, 'provider'> {
  const checks = {
    standards: reports.standards.ok,
    tests: reports.tests.ok,
    fidelity: reports.fidelity.ok,
    lint: reports.lint.ok,
    analysis: reports.analysis.ok,
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  const approved = failed.length === 0;

  return {
    approved,
    reason: approved
      ? 'Vérification exécutable OK (standards, lint, analyse, tests, fidélité).'
      : `Échec vérification : ${failed.join(', ')}.`,
    checks,
    reports,
  };
}

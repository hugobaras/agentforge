export const VERIFIER_AGENT = 'VERIFIER_AGENT';
export const VERIFICATION_OPTIONS = 'VERIFICATION_OPTIONS';

export interface VerificationOptions {
  approvalThreshold: number;
  maxImplementIterations: number;
}

export interface VerifierInput {
  lotId: string;
  title: string;
  spec: {
    title: string;
    body: string;
  };
  deliverable: string;
}

export interface CheckReport {
  ok: boolean;
  skipped?: boolean;
  command?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface VerificationChecks {
  standards: boolean;
  tests: boolean;
  fidelity: boolean;
  lint?: boolean;
  analysis?: boolean;
}

export interface VerificationReports {
  standards?: CheckReport;
  tests?: CheckReport;
  fidelity?: CheckReport;
  lint?: CheckReport;
  analysis?: CheckReport;
}

export interface VerifierResult {
  approved: boolean;
  reason: string;
  checks: VerificationChecks;
  reports?: VerificationReports;
  provider: string;
}

export interface VerifierAgent {
  verify(input: VerifierInput): Promise<VerifierResult>;
}

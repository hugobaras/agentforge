export interface CheckReport {
  ok: boolean;
  skipped?: boolean;
  command?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export const STDOUT_LIMIT = 4000;

export function truncateOutput(text: string, limit = STDOUT_LIMIT): string {
  if (text.length <= limit) {
    return text;
  }
  return `…(${text.length - limit} car. omis)\n${text.slice(-limit)}`;
}

export function skippedReport(reason: string): CheckReport {
  return {
    ok: true,
    skipped: true,
    stdout: reason,
    stderr: '',
    durationMs: 0,
  };
}

export function failedReport(reason: string, extras?: Partial<CheckReport>): CheckReport {
  return {
    ok: false,
    stdout: extras?.stdout ?? '',
    stderr: extras?.stderr ?? reason,
    durationMs: extras?.durationMs ?? 0,
    command: extras?.command,
    exitCode: extras?.exitCode ?? null,
  };
}

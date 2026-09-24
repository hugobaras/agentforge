import { spawn } from 'child_process';
import { CheckReport, truncateOutput } from './check-report';

export async function runCommand(
  file: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<CheckReport> {
  const started = Date.now();
  const command = [file, ...args].join(' ');

  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (report: CheckReport) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(report);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        command,
        exitCode: null,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(`${stderr}\nTimeout après ${options.timeoutMs}ms`.trim()),
        durationMs: Date.now() - started,
      });
    }, options.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      finish({
        ok: false,
        command,
        exitCode: null,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(error.message),
        durationMs: Date.now() - started,
      });
    });

    child.on('close', (code) => {
      finish({
        ok: code === 0,
        command,
        exitCode: code,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        durationMs: Date.now() - started,
      });
    });
  });
}

export function commandTimeoutMs(): number {
  const parsed = Number(process.env.VERIFIER_COMMAND_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 15_000;
}

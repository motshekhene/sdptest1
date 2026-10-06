// Thin wrappers around child processes for running git / unzip.
import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a command, buffering stdout/stderr. Never rejects on a non-zero exit code. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Run a command and throw a descriptive error when it exits non-zero. */
export async function runChecked(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) {
    const tail = r.stderr.trim().split("\n").slice(-6).join("\n");
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${tail || `exit ${r.code}`}`);
  }
  return r.stdout;
}

/** Spawn a command, invoke `onStderr` for each stderr chunk (progress parsing). */
export function runWithStderr(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
  onStderr?: (chunk: string) => void,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => {
      stderr += d;
      if (onStderr) onStderr(String(d));
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

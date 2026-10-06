// Parses `git log` into a compact in-memory model used by the metrics engine.
//
// One pass over the full history produces, for every non-merge commit reachable
// from the reference: its author (raw identity), committer timestamp, subject
// and the per-file added/removed line counts. Binary files are skipped (git
// prints "-" for them). Rename detection runs at 50% similarity (-M50%) so a
// pure rename produces 0/0 entries attributed to the new path, while
// rename+change only reports the changed lines on the new path.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import type { CommitEntry, ParsedRepo } from "./types";
import { buildDirList, normaliseRenamePath } from "./paths";
import { run, runChecked } from "./git";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const HDR = "\u0001"; // marks the start of a commit header line
const SEP = "\u0002"; // field separator inside the header

export interface ParseProgress {
  done: number;
  total?: number;
}

export const PARSED_VERSION = 1;

async function revCount(checkout: string, ref: string): Promise<number | undefined> {
  try {
    const out = await runChecked("git", ["-C", checkout, "rev-list", "--no-merges", "--count", ref]);
    const n = parseInt(out.trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve each raw identity through the repository's .mailmap (if present)
 * using git itself, so mailmap semantics match git exactly.
 */
async function resolveMailmap(checkout: string, identities: string[]): Promise<string[]> {
  const out: string[] = new Array(identities.length);
  const CHUNK = 400;
  for (let i = 0; i < identities.length; i += CHUNK) {
    const chunk = identities.slice(i, i + CHUNK);
    let lines: string[] | null = null;
    try {
      const r = await run("git", ["-C", checkout, "check-mailmap", ...chunk]);
      if (r.code === 0) {
        const l = r.stdout.split("\n");
        if (l.length > 0 && l[l.length - 1] === "") l.pop();
        if (l.length === chunk.length) lines = l;
      }
    } catch {
      lines = null;
    }
    if (lines) {
      for (let j = 0; j < chunk.length; j++) out[i + j] = lines[j];
    } else {
      // Fall back to one-by-one; if that fails too, keep the raw identity.
      for (let j = 0; j < chunk.length; j++) {
        try {
          const r = await run("git", ["-C", checkout, "check-mailmap", chunk[j]]);
          const l = r.code === 0 ? r.stdout.trim() : "";
          out[i + j] = l && l.length > 0 ? l : chunk[j];
        } catch {
          out[i + j] = chunk[j];
        }
      }
    }
  }
  return out;
}

export async function parseRepo(
  checkout: string,
  ref: string,
  outPath: string,
  onProgress: (p: ParseProgress) => void,
): Promise<ParsedRepo> {
  const total = await revCount(checkout, ref);
  const head = (await runChecked("git", ["-C", checkout, "rev-parse", ref])).trim();

  const identityIdx = new Map<string, number>();
  const identities: string[] = [];
  const pathIdx = new Map<string, number>();
  const paths: string[] = [];
  const commits: CommitEntry[] = [];

  const child = spawn(
    "git",
    [
      "-C",
      checkout,
      "-c",
      "core.quotePath=false",
      "log",
      ref,
      "--no-merges",
      "--numstat",
      "-M50%",
      `--format=${HDR}%H${SEP}%an${SEP}%ae${SEP}%ct${SEP}%s`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const errChunks: string[] = [];
  child.stderr.on("data", (d) => {
    errChunks.push(String(d));
    if (errChunks.length > 40) errChunks.shift();
  });

  let current: CommitEntry | null = null;
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.startsWith(HDR)) {
      const parts = line.slice(1).split(SEP);
      const h = parts[0] ?? "";
      const an = parts[1] ?? "";
      const ae = parts[2] ?? "";
      const ct = parseInt(parts[3] ?? "0", 10) || 0;
      const s = parts[4] ?? "";
      if (!h) continue;
      const id = `${an} <${ae}>`;
      let ai = identityIdx.get(id);
      if (ai === undefined) {
        ai = identities.length;
        identityIdx.set(id, ai);
        identities.push(id);
      }
      current = { h, a: ai, t: ct, s, f: [] };
      commits.push(current);
      if (commits.length % 1000 === 0) onProgress({ done: commits.length, total });
      continue;
    }
    if (!current) continue;
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === "-" || m[2] === "-") continue; // binary file — not measured
    const p = normaliseRenamePath(m[3]);
    let pi = pathIdx.get(p);
    if (pi === undefined) {
      pi = paths.length;
      pathIdx.set(p, pi);
      paths.push(p);
    }
    current.f.push([pi, parseInt(m[1], 10), parseInt(m[2], 10)]);
  }

  const exitCode: number = await new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.on("close", (c) => resolve(c ?? -1));
  });
  if (exitCode !== 0 && commits.length === 0) {
    throw new Error(`git log failed: ${errChunks.join("").trim().slice(-400) || `exit ${exitCode}`}`);
  }

  // Every file present in the reference tree (covers files never touched since
  // being added by an untracked edge case, and keeps the object picker complete).
  const tree = await run("git", ["-C", checkout, "-c", "core.quotePath=false", "ls-tree", "-r", "-z", "--name-only", ref]);
  if (tree.code === 0) {
    for (const p of tree.stdout.split("\0")) {
      if (!p) continue;
      if (!pathIdx.has(p)) {
        pathIdx.set(p, paths.length);
        paths.push(p);
      }
    }
  }

  const mailmap = await resolveMailmap(checkout, identities);

  // Newest first — matches how the UI lists commits.
  commits.sort((a, b) => b.t - a.t);

  const parsed: ParsedRepo = {
    version: PARSED_VERSION,
    head,
    ref,
    paths,
    dirs: buildDirList(paths),
    identities,
    mailmap,
    commits,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const json = JSON.stringify(parsed);
  await fs.promises.writeFile(outPath, await gzip(json));
  return parsed;
}

// ---------- loading / caching ----------

const cache = new Map<string, ParsedRepo>();

export async function loadParsed(parsedPath: string): Promise<ParsedRepo> {
  const hit = cache.get(parsedPath);
  if (hit) return hit;
  const buf = await fs.promises.readFile(parsedPath);
  const json = (await gunzip(buf)).toString("utf8");
  const parsed = JSON.parse(json) as ParsedRepo;
  if (cache.size >= 2) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(parsedPath, parsed);
  return parsed;
}

export function dropParsedCache(parsedPath: string): void {
  cache.delete(parsedPath);
}

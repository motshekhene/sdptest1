// Ingestion pipeline: clone a remote repo (deep/full clone) or extract an
// uploaded zip, then parse the history into the compact model. Jobs run in a
// small FIFO queue in the server process; progress is written to the registry
// and polled by the UI.
import fs from "node:fs";
import path from "node:path";
import { parseRepo } from "./parse";
import { computeMetrics } from "./metrics";
import { runWithStderr } from "./git";
import { getRepo, repoPaths, updateRepo } from "./store";

// ---------- job queue ----------

let chain: Promise<unknown> = Promise.resolve();

export function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(job, job);
  chain = next.catch(() => {});
  return next;
}

export function startIngest(
  id: string,
  kind: "url" | "zip",
  payload: { url?: string; ref?: string },
): void {
  enqueue(() => runIngest(id, kind, payload)).catch(() => {});
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------- pipeline ----------

async function runIngest(
  id: string,
  kind: "url" | "zip",
  payload: { url?: string; ref?: string },
): Promise<void> {
  try {
    const p = repoPaths(id);
    fs.mkdirSync(p.dir, { recursive: true });
    const ref = (payload.ref ?? "HEAD").trim() || "HEAD";
    let repoDir: string;

    if (kind === "url") {
      updateRepo(id, {
        status: "cloning",
        progress: { phase: "Cloning repository", message: "Starting deep clone…" },
      });
      await cloneRepo(id, payload.url ?? "", p.checkout);
      repoDir = p.checkout;
    } else {
      updateRepo(id, { status: "extracting", progress: { phase: "Extracting zip archive" } });
      fs.mkdirSync(p.content, { recursive: true });
      const r = await runWithStderr("unzip", ["-q", "-o", p.zip, "-d", p.content]);
      if (r.code !== 0) {
        throw new Error(
          `Could not extract the zip archive: ${r.stderr.trim().slice(-300) || `unzip exited with ${r.code}`}`,
        );
      }
      updateRepo(id, { status: "extracting", progress: { phase: "Locating .git directory" } });
      const found = locateGitRoot(p.content);
      if (!found) {
        throw new Error(
          "No .git directory or file was found inside the zip. Please zip the repository including its .git directory.",
        );
      }
      repoDir = found;
    }

    updateRepo(id, { status: "parsing", progress: { phase: "Reading git history", done: 0 } });
    const parsed = await parseRepo(repoDir, ref, p.parsed, (prog) => {
      updateRepo(id, {
        progress: { phase: "Parsing commits", done: prog.done, total: prog.total },
      });
    });

    // Baseline stats (mailmap only, no manual merges) for the repo list.
    const m = computeMetrics(parsed, (i) => parsed.mailmap[i], {});
    updateRepo(id, {
      status: "ready",
      progress: undefined,
      error: undefined,
      stats: {
        commits: parsed.commits.length,
        authors: m.authors.length,
        files: parsed.paths.length,
        added: m.summary.added,
        removed: m.summary.removed,
        growth: m.summary.growth,
        churn: m.summary.churn,
        head: parsed.head,
        ref: parsed.ref,
      },
    });
  } catch (e) {
    updateRepo(id, { status: "error", error: errMessage(e), progress: undefined });
  }
}

async function cloneRepo(id: string, url: string, dest: string): Promise<void> {
  if (!url) throw new Error("A repository URL is required.");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  let lastMsg = "";
  const r = await runWithStderr(
    "git",
    ["clone", "--progress", url, "."],
    { cwd: dest },
    (chunk) => {
      const recv = /Receiving objects:\s+(\d+)%/.exec(chunk);
      const delt = /Resolving deltas:\s+(\d+)%/.exec(chunk);
      const m = delt ?? recv;
      if (!m) return;
      const label = delt ? "Resolving deltas" : "Receiving objects";
      const msg = `${label} ${m[1]}%`;
      if (msg !== lastMsg) {
        lastMsg = msg;
        updateRepo(id, {
          progress: {
            phase: "Cloning repository",
            message: msg,
            done: parseInt(m[1], 10),
            total: 100,
          },
        });
      }
    },
  );
  if (r.code !== 0) {
    const tail = r.stderr.trim().split("\n").slice(-4).join(" ").slice(-400);
    throw new Error(`git clone failed: ${tail || `exit ${r.code}`}`);
  }
}

/** Breadth-first search for the shallowest directory containing a `.git` entry. */
export function locateGitRoot(contentDir: string): string | null {
  const skip = new Set(["node_modules", "__MACOSX", ".git"]);
  let level: string[] = [contentDir];
  for (let depth = 0; depth < 5 && level.length; depth++) {
    const next: string[] = [];
    const dirs = [...level].sort();
    for (const dir of dirs) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name !== ".git") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return dir;
        if (e.isFile()) {
          // A `.git` file (e.g. worktree/submodule pointer). Accept it only if
          // the git dir it points at is present inside the extracted content.
          try {
            const txt = fs.readFileSync(full, "utf8").trim();
            if (txt.startsWith("gitdir:")) {
              const target = path.resolve(dir, txt.slice("gitdir:".length).trim());
              if (fs.existsSync(target)) return dir;
            }
          } catch {
            /* ignore */
          }
        }
      }
      for (const e of entries) {
        if (e.isDirectory() && !skip.has(e.name) && !e.name.startsWith(".")) {
          next.push(path.join(dir, e.name));
        }
      }
    }
    level = next;
  }
  return null;
}

/** True when a record's parsed data file exists on disk. */
export function parsedExists(id: string): boolean {
  try {
    const rec = getRepo(id);
    if (!rec || rec.status !== "ready") return false;
    return fs.existsSync(repoPaths(id).parsed);
  } catch {
    return false;
  }
}

// File-backed registry of repositories. Single-process app, so synchronous
// read/write with an atomic rename is sufficient and avoids lost updates.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RepoRecord, RepoStatus } from "./types";

export const DATA_ROOT = path.join(process.cwd(), ".rat-data");
export const REPOS_DIR = path.join(DATA_ROOT, "repos");
const REGISTRY_PATH = path.join(DATA_ROOT, "repos.json");

const BUSY: RepoStatus[] = ["queued", "cloning", "extracting", "parsing"];

export function ensureDirs(): void {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

export function isValidId(id: string): boolean {
  return /^[a-z0-9-]{4,40}$/.test(id);
}

export function makeId(): string {
  return randomUUID().slice(0, 8);
}

export function repoPaths(id: string) {
  const dir = path.join(REPOS_DIR, id);
  return {
    dir,
    checkout: path.join(dir, "checkout"),
    content: path.join(dir, "content"),
    zip: path.join(dir, "upload.zip"),
    parsed: path.join(dir, "parsed.json.gz"),
  };
}

function readRegistry(): RepoRecord[] {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
    const data = JSON.parse(raw) as { repos?: RepoRecord[] };
    return Array.isArray(data.repos) ? data.repos : [];
  } catch {
    return [];
  }
}

function writeRegistry(repos: RepoRecord[]): void {
  ensureDirs();
  const tmp = `${REGISTRY_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ repos }, null, 2));
  fs.renameSync(tmp, REGISTRY_PATH);
}

/** Mark records left busy by a previous server run as interrupted. */
let swept = false;
export function sweepStale(): void {
  if (swept) return;
  swept = true;
  const repos = readRegistry();
  let dirty = false;
  for (const r of repos) {
    if (BUSY.includes(r.status)) {
      r.status = "error";
      r.error = "Interrupted — the server was restarted while this job was running. Remove and add the repository again.";
      r.progress = undefined;
      dirty = true;
    }
  }
  if (dirty) writeRegistry(repos);
}

export function listRepos(): RepoRecord[] {
  sweepStale();
  return readRegistry().sort((a, b) => b.createdAt - a.createdAt);
}

export function getRepo(id: string): RepoRecord | undefined {
  return readRegistry().find((r) => r.id === id);
}

export function addRepo(rec: RepoRecord): void {
  const repos = readRegistry();
  repos.push(rec);
  writeRegistry(repos);
}

export function updateRepo(id: string, patch: Partial<RepoRecord>): RepoRecord | undefined {
  const repos = readRegistry();
  const i = repos.findIndex((r) => r.id === id);
  if (i === -1) return undefined;
  repos[i] = { ...repos[i], ...patch };
  writeRegistry(repos);
  return repos[i];
}

export function removeRepo(id: string): boolean {
  if (!isValidId(id)) return false;
  const repos = readRegistry();
  const next = repos.filter((r) => r.id !== id);
  if (next.length === repos.length) return false;
  writeRegistry(next);
  fs.rmSync(repoPaths(id).dir, { recursive: true, force: true });
  return true;
}

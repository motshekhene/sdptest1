// Shared types for the RAT (Repo Analysis Tool) data model.

export type RepoStatus =
  | "queued"
  | "cloning"
  | "extracting"
  | "parsing"
  | "ready"
  | "error";

export interface RepoSource {
  type: "url" | "zip";
  detail: string; // clone URL or zip file name
}

export interface RepoProgress {
  phase: string; // human readable phase label
  message?: string; // e.g. "Receiving objects: 42%"
  done?: number;
  total?: number; // known total, if any
}

export interface RepoStats {
  commits: number;
  authors: number;
  files: number;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  head: string;
  ref: string;
}

/** A manual authorship merge: several mailmapped identities treated as one author. */
export interface AuthorGroup {
  name: string;
  identities: string[]; // mailmapped "Name <email>" strings
}

export interface RepoRecord {
  id: string;
  name: string;
  source: RepoSource;
  ref: string; // reference commit used as analysis root (default "HEAD")
  createdAt: number;
  status: RepoStatus;
  progress?: RepoProgress;
  error?: string;
  stats?: RepoStats;
  authorGroups: AuthorGroup[];
}

/**
 * One file change inside a commit: [pathIndex, linesAdded, linesRemoved].
 * Binary files are excluded entirely (git's own binary detection).
 * Renames (>= 50% similarity) are attributed to the new path only.
 * Deletions appear as (0, N) removals on the file's path.
 */
export type FileChange = [number, number, number];

export interface CommitEntry {
  h: string; // full hash
  a: number; // index into ParsedRepo.identities (raw author)
  t: number; // committer date, unix seconds
  s: string; // subject
  f: FileChange[];
}

export interface ParsedRepo {
  version: number;
  head: string; // resolved reference commit hash
  ref: string;
  paths: string[]; // every file path ever seen (HEAD tree + all changed paths)
  dirs: string[]; // every directory ("" is the root), sorted
  identities: string[]; // raw "Name <email>" values
  mailmap: string[]; // mailmapped identity for each raw identity (same length)
  commits: CommitEntry[]; // non-merge commits reachable from ref, newest first
}

// ---------- Metrics ----------

export interface MetricsSummary {
  commits: number; // |H| — size of the commit set after filters
  added: number; // l+_H,o
  removed: number; // l-_H,o
  growth: number; // d_H,o = added - removed
  churn: number; // lambda_H,o = added + removed
  mods: number; // n_H,o
  modificationFrequency: number; // eta_H,o = n / |H|
  churnRate: number; // rho_H,o = lambda / |H|
}

export interface ObjectRow {
  path: string;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  mods: number;
  modificationFrequency: number;
  churnRate: number;
}

export interface AuthorRow {
  key: string; // resolved author key (merged name, or "Name <email>")
  commits: number; // commits in H by this author
  added: number;
  removed: number;
  churn: number; // lambda_H,o,a
  mods: number; // n_H,o,a
  ownership: number; // omega_H,o,a = churn_a / churn_o
}

export interface SeriesPoint {
  t: number; // bucket start, unix seconds
  added: number;
  removed: number;
  churn: number;
  commits: number; // commits in H within the bucket
  mods: number; // object modifications within the bucket
}

export interface MetricsResult {
  object: { path: string; type: "file" | "dir" | "root" };
  summary: MetricsSummary;
  files: ObjectRow[];
  dirs: ObjectRow[]; // strict descendants of the selected object
  authors: AuthorRow[];
  series: SeriesPoint[];
  bucket: "day" | "week" | "month";
  truncatedFiles: number;
  totalCommitsInRepo: number;
}

export interface CommitListItem {
  h: string;
  short: string;
  author: string;
  t: number;
  subject: string;
}

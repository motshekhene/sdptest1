// Browser-side API helpers and shared formatting utilities.
import type {
  AuthorGroup,
  AuthorRow,
  CommitListItem,
  MetricsResult,
  RepoRecord,
} from "@/lib/types";

export type { AuthorGroup, AuthorRow, CommitListItem, MetricsResult, RepoRecord };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error ?? `Request failed with status ${res.status}.`;
    throw new Error(msg);
  }
  return data as T;
}

// ---------- filters ----------

export type CommitSetMode = "all" | "range" | "list";

export interface MetricsFilters {
  path: string;
  mode: CommitSetMode;
  from?: number; // unix seconds, inclusive
  to?: number; // unix seconds, exclusive
  hashes: string[];
  authors: string[];
}

export function metricsQuery(f: MetricsFilters): string {
  const sp = new URLSearchParams();
  if (f.path) sp.set("path", f.path);
  if (f.mode === "range") {
    if (f.from) sp.set("from", String(f.from));
    if (f.to) sp.set("to", String(f.to));
  }
  if (f.mode === "list" && f.hashes.length > 0) sp.set("commits", f.hashes.join(","));
  for (const a of f.authors) sp.append("author", a);
  return sp.toString();
}

// ---------- formatting ----------

export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString("en-US")}`;
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtWhen(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(ts);
}

// ---------- path helpers (client side) ----------

export function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

export function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export function isDirPath(p: string): boolean {
  return p === "" || !/[^/]+\.[^/]+$/.test(p.split("/").pop() ?? "");
}

/** Convert a `datetime-local` input value to a unix timestamp (seconds). */
export function inputToUnix(v: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/** Convert a unix timestamp (seconds) to a `datetime-local` input value. */
export function unixToInput(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

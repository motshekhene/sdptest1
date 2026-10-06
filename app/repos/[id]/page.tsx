"use client";

// Repository analysis dashboard: filters (commit set / authors / object) drive
// KPIs, time-series chart, treemap and the file/directory/author tables.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, Loader2 } from "lucide-react";
import {
  fetchJson,
  fmtDate,
  fmtNum,
  fmtPct,
  fmtSigned,
  fmtWhen,
  metricsQuery,
  type MetricsResult,
  type RepoRecord,
} from "@/lib/client-api";
import { filtersRange, FilterPanel, CommitPickerModal, AuthorMergeModal, defaultFilters, type AuthorOption, type FiltersState } from "@/components/filter-panel";
import { ActivityChart, DirectoryTreemap } from "@/components/analysis-charts";
import { AuthorTable, ObjectTable } from "@/components/analysis-tables";

const BUSY = ["queued", "cloning", "extracting", "parsing"];

export default function RepoAnalysisPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [repo, setRepo] = useState<RepoRecord | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [files, setFiles] = useState<string[]>([]);
  const [dirs, setDirs] = useState<string[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [authorsLoading, setAuthorsLoading] = useState(true);

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [tab, setTab] = useState<"files" | "dirs" | "authors">("files");

  const [commitPickerOpen, setCommitPickerOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const staticLoaded = useRef(false);

  const loadStatic = useCallback(async () => {
    setAuthorsLoading(true);
    try {
      const [t, a] = await Promise.all([
        fetchJson<{ files: string[]; dirs: string[] }>(`/api/repos/${id}/tree`),
        fetchJson<{ authors: AuthorOption[] }>(`/api/repos/${id}/authors`),
      ]);
      setFiles(t.files);
      setDirs(t.dirs);
      setAuthors(a.authors);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthorsLoading(false);
    }
  }, [id]);

  // Poll the repo until ingestion finishes, then load static data once.
  useEffect(() => {
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const d = await fetchJson<{ repo: RepoRecord }>(`/api/repos/${id}`);
        if (cancelled) return;
        setRepo(d.repo);
        if (d.repo.status === "ready") {
          if (iv) {
            clearInterval(iv);
            iv = null;
          }
          if (!staticLoaded.current) {
            staticLoaded.current = true;
            loadStatic();
          }
        } else if (d.repo.status === "error") {
          if (iv) {
            clearInterval(iv);
            iv = null;
          }
        }
      } catch (e) {
        if (!cancelled) setPageError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    iv = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
    };
  }, [id, loadStatic]);

  // Re-fetch metrics whenever filters change (debounced).
  useEffect(() => {
    if (!repo || repo.status !== "ready") return;
    if (filters.mode === "list" && filters.hashes.length === 0) {
      setMetrics(null);
      return;
    }
    const t = setTimeout(async () => {
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const { from, to } = filtersRange(filters);
        const qs = metricsQuery({
          path: filters.path,
          mode: filters.mode,
          from,
          to,
          hashes: filters.hashes,
          authors: filters.authors,
        });
        const d = await fetchJson<MetricsResult>(`/api/repos/${id}/metrics?${qs}`);
        setMetrics(d);
      } catch (e) {
        setMetricsError(e instanceof Error ? e.message : String(e));
      } finally {
        setMetricsLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [id, repo, filters]);

  const patchFilters = useCallback((patch: Partial<FiltersState>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.mode === "all") parts.push("All commits reachable from HEAD (non-merge)");
    if (filters.mode === "range") {
      const f = filters.fromInput ? fmtDate(Math.floor(new Date(filters.fromInput).getTime() / 1000)) : "start";
      const t = filters.toInput ? fmtDate(Math.floor(new Date(filters.toInput).getTime() / 1000)) : "now";
      parts.push(`Time period ${f} → ${t}`);
    }
    if (filters.mode === "list")
      parts.push(
        `Manual selection · ${fmtNum(filters.hashes.length)} commit${filters.hashes.length === 1 ? "" : "s"}`,
      );
    parts.push(
      filters.authors.length === 0 ? "all authors" : `${fmtNum(filters.authors.length)} author filter(s)`,
    );
    parts.push(filters.path === "" ? "repository root" : filters.path);
    return parts.join(" · ");
  }, [filters]);

  // ----- render states -----
  if (pageError && !repo) {
    return <ErrorScreen message={pageError} />;
  }
  if (!repo) {
    return (
      <div className="grid h-64 place-items-center text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  const busy = BUSY.includes(repo.status);

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-ghost !px-2 !py-1.5 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Repositories
        </Link>
        <h1 className="text-xl font-semibold text-slate-100">{repo.name}</h1>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400">
          ref: {repo.stats?.ref ?? repo.ref}
        </span>
        {repo.stats && (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-400" title={repo.stats.head}>
            HEAD {repo.stats.head.slice(0, 10)}
          </span>
        )}
        <span className="truncate font-mono text-xs text-slate-600" title={repo.source.detail}>
          {repo.source.detail}
        </span>
        {repo.stats && (
          <span className="ml-auto flex gap-3 text-xs text-slate-500">
            <span>
              <b className="text-slate-300">{fmtNum(repo.stats.commits)}</b> commits
            </span>
            <span>
              <b className="text-slate-300">{fmtNum(repo.stats.files)}</b> files
            </span>
            <span>
              <b className="text-slate-300">{fmtNum(repo.stats.authors)}</b> authors
            </span>
          </span>
        )}
      </div>

      {busy && <BusyCard repo={repo} />}
      {repo.status === "error" && <ErrorScreen message={repo.error ?? "Ingestion failed."} inline />}

      {repo.status === "ready" && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <FilterPanel
            filters={filters}
            onChange={patchFilters}
            authors={authors}
            authorsLoading={authorsLoading}
            files={files}
            dirs={dirs}
            onOpenCommitPicker={() => setCommitPickerOpen(true)}
            onOpenMerge={() => setMergeOpen(true)}
            onObjectChange={(p) => patchFilters({ path: p })}
          />

          <div className="min-w-0 space-y-5">
            {metricsError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {metricsError}
              </div>
            )}

            <p className="text-xs text-slate-500">
              {filterSummary}
              {metrics ? ` — ${fmtNum(metrics.summary.commits)} commits in H` : ""}
            </p>

            {filters.mode === "list" && filters.hashes.length === 0 ? (
              <div className="card grid h-52 place-items-center p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-slate-300">No commits selected</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                    Manual selection mode is active. Pick the commits you want the metrics computed
                    over.
                  </p>
                  <button className="btn-primary mx-auto mt-3 text-xs" onClick={() => setCommitPickerOpen(true)}>
                    Select commits
                  </button>
                </div>
              </div>
            ) : (
              <div className={metricsLoading && !metrics ? "opacity-50" : ""}>
                <KpiGrid metrics={metrics} loading={metricsLoading && !metrics} />
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <ActivityChart series={metrics?.series ?? []} bucket={metrics?.bucket ?? "month"} />
                  <DirectoryTreemap
                    object={metrics?.object.path ?? ""}
                    dirs={metrics?.dirs ?? []}
                    files={metrics?.files ?? []}
                    onSelect={(p) => patchFilters({ path: p })}
                  />
                </div>
                <div className="card mt-5">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2">
                    {(
                      [
                        ["files", `Files (${fmtNum(metrics?.files.length ?? 0)})`],
                        ["dirs", `Directories (${fmtNum(metrics?.dirs.length ?? 0)})`],
                        ["authors", `Authors (${fmtNum(metrics?.authors.length ?? 0)})`],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === key ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      {metricsLoading && metrics && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                      <button
                        className="btn-ghost !py-1 text-xs"
                        onClick={() => exportCsv(repo.name, tab, metrics)}
                        disabled={!metrics}
                        title="Export the active table as CSV"
                      >
                        <Download className="h-3.5 w-3.5" /> CSV
                      </button>
                    </div>
                  </div>
                  {tab === "files" && (
                    <ObjectTable
                      rows={metrics?.files ?? []}
                      kind="file"
                      truncated={metrics?.truncatedFiles}
                      onSelect={(p) => patchFilters({ path: p })}
                    />
                  )}
                  {tab === "dirs" && (
                    <ObjectTable rows={metrics?.dirs ?? []} kind="dir" onSelect={(p) => patchFilters({ path: p })} />
                  )}
                  {tab === "authors" && <AuthorTable rows={metrics?.authors ?? []} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CommitPickerModal
        open={commitPickerOpen}
        onClose={() => setCommitPickerOpen(false)}
        repoId={id}
        selected={filters.hashes}
        onApply={(hashes) => {
          patchFilters({ mode: "list", hashes });
          setCommitPickerOpen(false);
        }}
      />
      <AuthorMergeModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        repoId={id}
        onSaved={() => {
          patchFilters({ authors: [] });
          loadStatic();
        }}
      />
    </div>
  );
}

// ---------- pieces ----------

function KpiGrid({ metrics, loading }: { metrics: MetricsResult | null; loading: boolean }) {
  const s = metrics?.summary;
  const items: { label: string; value: string; tone?: string; title: string; sub?: string }[] = [
    {
      label: "Commits |H|",
      value: s ? fmtNum(s.commits) : "—",
      title: "Size of the filtered commit set H (non-merge commits reachable from the reference).",
    },
    {
      label: "Modifications n",
      value: s ? fmtNum(s.mods) : "—",
      title: "n(H,o) — commits in H where the object's churn λ > 0.",
    },
    {
      label: "Mod. frequency η",
      value: s ? fmtPct(s.modificationFrequency) : "—",
      title: "η(H,o) = n(H,o) / |H|",
    },
    { label: "Added l⁺", value: s ? fmtNum(s.added) : "—", tone: "text-emerald-400", title: "l⁺(H,o) = Σ over H of lines added on o." },
    { label: "Removed l⁻", value: s ? fmtNum(s.removed) : "—", tone: "text-red-400", title: "l⁻(H,o) = Σ over H of lines removed on o." },
    {
      label: "Growth δ",
      value: s ? fmtSigned(s.growth) : "—",
      tone: s && s.growth >= 0 ? "text-emerald-400" : "text-red-400",
      title: "δ(H,o) = l⁺ − l⁻",
    },
    { label: "Churn λ", value: s ? fmtNum(s.churn) : "—", title: "λ(H,o) = l⁺ + l⁻ — total changed lines." },
    { label: "Churn rate ρ", value: s ? fmtNum(Math.round(s.churnRate * 10) / 10) : "—", title: "ρ(H,o) = λ(H,o) / |H|" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="card px-3.5 py-3" title={it.title}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">{it.label}</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${it.tone ?? "text-slate-100"}`}>
            {loading ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-slate-800" /> : it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function BusyCard({ repo }: { repo: RepoRecord }) {
  const pct =
    repo.progress?.total && repo.progress?.done !== undefined
      ? Math.round((repo.progress.done / repo.progress.total) * 100)
      : null;
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
        <div>
          <p className="text-sm font-medium text-slate-200">
            {repo.progress?.phase ?? "Working…"}
            {repo.progress?.message ? ` — ${repo.progress.message}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Ingestion runs on the server — you can leave this page and come back. Updated{" "}
            {fmtWhen(repo.createdAt)}.
          </p>
        </div>
        {pct !== null && <span className="ml-auto text-sm tabular-nums text-slate-300">{pct}%</span>}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-indigo-500 ${pct === null ? "w-1/3 animate-pulse" : ""}`}
          style={pct !== null ? { width: `${Math.max(2, pct)}%` } : undefined}
        />
      </div>
    </div>
  );
}

function ErrorScreen({ message, inline }: { message: string; inline?: boolean }) {
  return (
    <div className={`card ${inline ? "" : "mx-auto mt-16 max-w-xl"} p-8 text-center`}>
      <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
      <h2 className="mt-3 text-sm font-semibold text-slate-200">Something went wrong</h2>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href="/" className="btn-ghost text-xs">
          Back to repositories
        </Link>
        <button className="btn-ghost text-xs" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </div>
  );
}

function exportCsv(repoName: string, tab: "files" | "dirs" | "authors", m: MetricsResult | null) {
  if (!m) return;
  let header: string[];
  let rows: (string | number)[][];
  if (tab === "authors") {
    header = ["author", "commits", "added", "removed", "churn", "mods", "ownership"];
    rows = m.authors.map((a) => [a.key, a.commits, a.added, a.removed, a.churn, a.mods, a.ownership.toFixed(4)]);
  } else {
    const data = tab === "files" ? m.files : m.dirs;
    header = ["path", "added", "removed", "growth", "churn", "mods", "modificationFrequency", "churnRate"];
    rows = data.map((r) => [r.path, r.added, r.removed, r.growth, r.churn, r.mods, r.modificationFrequency.toFixed(4), r.churnRate.toFixed(2)]);
  }
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${repoName}-${tab}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

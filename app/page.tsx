"use client";

// Repository manager: add by clone URL or zip upload, watch ingestion
// progress, open analysis dashboards, remove repositories.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileArchive,
  Filter,
  GitBranch,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { fetchJson, fmtNum, fmtWhen, type RepoRecord } from "@/lib/client-api";

const SAMPLES = [
  { name: "cJSON", url: "https://github.com/DaveGamble/cJSON.git", note: "~1k commits · quick" },
  { name: "Redis", url: "https://github.com/redis/redis.git", note: "~15k commits · medium" },
  { name: "Git", url: "https://github.com/git/git.git", note: "~75k commits · large clone" },
];

const BUSY = ["queued", "cloning", "extracting", "parsing"];

export default function HomePage() {
  const [repos, setRepos] = useState<RepoRecord[] | null>(null);
  const [tab, setTab] = useState<"url" | "zip">("url");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState("HEAD");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ repos: RepoRecord[] }>("/api/repos");
      setRepos(d.repos);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const anyBusy = !!repos?.some((r) => BUSY.includes(r.status));
  useEffect(() => {
    if (!anyBusy) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [anyBusy, load]);

  const submitUrl = async (useUrl?: string, useName?: string) => {
    const targetUrl = (useUrl ?? url).trim();
    if (!targetUrl) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/repos/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: targetUrl, name: useName ?? name.trim(), ref: ref.trim() || "HEAD" }),
      });
      setUrl("");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitZip = () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setUploadPct(0);
    const q = new URLSearchParams({ name: name.trim() || file.name, ref: ref.trim() || "HEAD" });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/repos/upload?${q.toString()}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      setUploadPct(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setFile(null);
        load();
      } else {
        try {
          setError(JSON.parse(xhr.responseText).error ?? `Upload failed (${xhr.status})`);
        } catch {
          setError(`Upload failed (status ${xhr.status}).`);
        }
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setUploadPct(null);
      setError("Upload failed — network error.");
    };
    xhr.send(file);
  };

  const remove = async (r: RepoRecord) => {
    if (!window.confirm(`Remove "${r.name}" and delete its local data?`)) return;
    try {
      await fetchJson(`/api/repos/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Repositories</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Analyse git history — file, directory, repository, commit-set and author metrics with
            rename detection (50%), binary exclusion, mailmap author merging and manual author merges.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-400">
          <span className="card flex items-center gap-1.5 px-2.5 py-1.5">
            <GitBranch className="h-3.5 w-3.5 text-indigo-400" /> deep clone or zip
          </span>
          <span className="card flex items-center gap-1.5 px-2.5 py-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-400" /> multi-repo
          </span>
          <span className="card flex items-center gap-1.5 px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-indigo-400" /> filterable
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-red-400 hover:text-red-200" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* ---------- add repo ---------- */}
        <div className="card h-fit p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Plus className="h-4 w-4 text-indigo-400" /> Add a repository
          </h2>
          <div className="mb-4 flex rounded-lg border border-slate-800 bg-slate-950 p-1 text-sm">
            <button
              onClick={() => setTab("url")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 ${tab === "url" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              <Link2 className="h-3.5 w-3.5" /> Clone URL
            </button>
            <button
              onClick={() => setTab("zip")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 ${tab === "zip" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              <FileArchive className="h-3.5 w-3.5" /> Zip upload
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                {tab === "url" ? "Repository URL (cloned deeply, full history)" : "Repository zip (must include the .git directory)"}
              </label>
              {tab === "url" ? (
                <input
                  className="input w-full font-mono text-xs"
                  placeholder="https://github.com/owner/repo.git"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && submitUrl()}
                />
              ) : (
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="input w-full text-xs file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1 file:text-slate-300"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Name (optional)</label>
                <input className="input w-full" placeholder="my-repo" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400" title="Reference commit to analyse (default HEAD)">
                  Reference
                </label>
                <input className="input w-full font-mono text-xs" value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
            </div>
            <button
              className="btn-primary w-full"
              disabled={busy || (tab === "url" ? !url.trim() : !file)}
              onClick={() => (tab === "url" ? submitUrl() : submitZip())}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {busy
                ? uploadPct !== null
                  ? `Uploading ${uploadPct}%`
                  : "Starting…"
                : tab === "url"
                  ? "Clone & analyse"
                  : "Upload & analyse"}
            </button>
          </div>

          <div className="mt-5 border-t border-slate-800 pt-4">
            <p className="mb-2 text-xs font-medium text-slate-400">Quick add — sample repositories</p>
            <div className="space-y-2">
              {SAMPLES.map((s) => (
                <button
                  key={s.name}
                  disabled={busy}
                  onClick={() => submitUrl(s.url, s.name)}
                  className="btn-ghost w-full justify-between !py-1.5 text-xs"
                >
                  <span className="font-mono">{s.name}</span>
                  <span className="text-slate-500">{s.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---------- repo list ---------- */}
        <div className="space-y-4">
          {repos === null ? (
            <div className="card grid h-40 place-items-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : repos.length === 0 ? (
            <div className="card p-10 text-center">
              <GitBranch className="mx-auto h-8 w-8 text-slate-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-300">No repositories yet</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Add a repository by cloning a remote URL or uploading a zip that contains its{" "}
                <span className="font-mono">.git</span> directory. Try a sample repository for a
                quick start.
              </p>
            </div>
          ) : (
            repos.map((r) => <RepoCard key={r.id} repo={r} onRemove={() => remove(r)} />)
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ repo }: { repo: RepoRecord }) {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-amber-950 text-amber-300 border-amber-900" },
    cloning: { label: "Cloning", cls: "bg-sky-950 text-sky-300 border-sky-900" },
    extracting: { label: "Extracting", cls: "bg-sky-950 text-sky-300 border-sky-900" },
    parsing: { label: "Parsing", cls: "bg-sky-950 text-sky-300 border-sky-900" },
    ready: { label: "Ready", cls: "bg-emerald-950 text-emerald-300 border-emerald-900" },
    error: { label: "Error", cls: "bg-red-950 text-red-300 border-red-900" },
  };
  const s = map[repo.status] ?? map.ready;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {BUSY.includes(repo.status) && <Loader2 className="h-3 w-3 animate-spin" />}
      {s.label}
    </span>
  );
}

function RepoCard({ repo, onRemove }: { repo: RepoRecord; onRemove: () => void }) {
  const busy = BUSY.includes(repo.status);
  const pctKnown = repo.progress?.total
    ? Math.round(((repo.progress.done ?? 0) / repo.progress.total) * 100)
    : repo.progress?.done !== undefined && repo.progress.total === 100
      ? repo.progress.done
      : null;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-100">{repo.name}</h3>
            <StatusChip repo={repo} />
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              {repo.source.type === "url" ? "cloned" : "zip"}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-slate-500" title={repo.source.detail}>
            {repo.source.detail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {repo.status === "ready" && (
            <Link href={`/repos/${repo.id}`} className="btn-primary !py-1.5 text-xs">
              Open dashboard →
            </Link>
          )}
          <button className="btn-danger !px-2 !py-1.5" title="Remove repository" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {busy && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>
              {repo.progress?.phase}
              {repo.progress?.message ? ` — ${repo.progress.message}` : ""}
            </span>
            {pctKnown !== null && <span className="tabular-nums">{pctKnown}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full bg-indigo-500 transition-all ${pctKnown === null ? "w-1/3 animate-pulse" : ""}`}
              style={pctKnown !== null ? { width: `${Math.max(2, pctKnown)}%` } : undefined}
            />
          </div>
        </div>
      )}

      {repo.status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{repo.error}</span>
        </div>
      )}

      {repo.stats && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Commits" value={fmtNum(repo.stats.commits)} />
          <MiniStat label="Authors" value={fmtNum(repo.stats.authors)} />
          <MiniStat label="Files" value={fmtNum(repo.stats.files)} />
          <MiniStat label="Churn (λ)" value={fmtNum(repo.stats.churn)} />
          <MiniStat label="Added (l⁺)" value={fmtNum(repo.stats.added)} />
          <MiniStat label="Removed (l⁻)" value={fmtNum(repo.stats.removed)} />
          <MiniStat label="Growth (δ)" value={fmtNum(repo.stats.growth)} />
          <MiniStat label={`HEAD @ ${repo.stats.ref}`} value={repo.stats.head.slice(0, 10)} mono />
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-600">Added {fmtWhen(repo.createdAt)}</p>
    </div>
  );
}

function MiniStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

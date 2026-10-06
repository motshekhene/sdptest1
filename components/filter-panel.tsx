"use client";

// Filter sidebar + the three picker modals: path tree, manual commit
// selection, and author merging (manual merges on top of .mailmap).
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  baseName,
  fetchJson,
  fmtDate,
  fmtNum,
  inputToUnix,
  parentOf,
  type AuthorGroup,
  type CommitListItem,
} from "@/lib/client-api";
import type { CommitSetMode } from "@/lib/client-api";

// ---------- types shared with the page ----------

export interface FiltersState {
  mode: CommitSetMode;
  fromInput: string;
  toInput: string;
  hashes: string[];
  authors: string[];
  path: string;
}

export const defaultFilters: FiltersState = {
  mode: "all",
  fromInput: "",
  toInput: "",
  hashes: [],
  authors: [],
  path: "",
};

export interface AuthorOption {
  key: string;
  commits: number;
}

// ---------- sidebar ----------

export function FilterPanel({
  filters,
  onChange,
  authors,
  authorsLoading,
  files,
  dirs,
  onOpenCommitPicker,
  onOpenMerge,
  onObjectChange,
}: {
  filters: FiltersState;
  onChange: (patch: Partial<FiltersState>) => void;
  authors: AuthorOption[];
  authorsLoading: boolean;
  files: string[];
  dirs: string[];
  onOpenCommitPicker: () => void;
  onOpenMerge: () => void;
  onObjectChange: (path: string) => void;
}) {
  const [pathOpen, setPathOpen] = useState(false);
  const [authorQuery, setAuthorQuery] = useState("");
  const selectedAuthors = new Set(filters.authors);
  const filteredAuthors = useMemo(() => {
    const q = authorQuery.trim().toLowerCase();
    if (!q) return authors;
    return authors.filter((a) => a.key.toLowerCase().includes(q));
  }, [authors, authorQuery]);

  const toggleAuthor = (key: string) => {
    const next = new Set(selectedAuthors);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ authors: [...next] });
  };

  return (
    <div className="space-y-4">
      {/* commit set */}
      <div className="card p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Commit set&nbsp;H
        </h3>
        <div className="space-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={filters.mode === "all"}
              onChange={() => onChange({ mode: "all" })}
            />
            <span className="text-slate-300">All commits</span>
            <span className="ml-auto text-xs text-slate-500">HEAD, no merges</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={filters.mode === "range"}
              onChange={() => onChange({ mode: "range" })}
            />
            <span className="text-slate-300">Time period</span>
          </label>
          {filters.mode === "range" && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">From (inclusive)</label>
                <input
                  type="datetime-local"
                  className="input w-full text-xs"
                  value={filters.fromInput}
                  onChange={(e) => onChange({ fromInput: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">To (exclusive)</label>
                <input
                  type="datetime-local"
                  className="input w-full text-xs"
                  value={filters.toInput}
                  onChange={(e) => onChange({ toInput: e.target.value })}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                H<sub>i,j</sub> = {"{ h | i ≤ committer-date &lt; j }"}; leave a bound empty for
                open-ended. Compared in your local timezone.
              </p>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={filters.mode === "list"}
              onChange={() => onChange({ mode: "list" })}
            />
            <span className="text-slate-300">Manual selection</span>
          </label>
          {filters.mode === "list" && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <button className="btn-ghost w-full text-xs" onClick={onOpenCommitPicker}>
                {filters.hashes.length > 0
                  ? `Edit selection (${fmtNum(filters.hashes.length)} commit${filters.hashes.length === 1 ? "" : "s"})`
                  : "Select commits…"}
              </button>
              {filters.hashes.length === 0 && (
                <p className="mt-2 text-[11px] text-amber-400">
                  No commits selected — pick at least one commit to compute metrics.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* authors */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Authors
          </h3>
          <button className="text-[11px] text-indigo-400 hover:text-indigo-300" onClick={onOpenMerge}>
            Merge authors…
          </button>
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            className="input w-full !pl-8 text-xs"
            placeholder="Filter authors…"
            value={authorQuery}
            onChange={(e) => setAuthorQuery(e.target.value)}
          />
        </div>
        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {filters.authors.length === 0
              ? `All ${authors.length} authors`
              : `${filters.authors.length} of ${authors.length} selected`}
          </span>
          <span className="flex gap-2">
            <button
              className="hover:text-slate-300"
              onClick={() => onChange({ authors: filteredAuthors.map((a) => a.key) })}
            >
              All
            </button>
            <button className="hover:text-slate-300" onClick={() => onChange({ authors: [] })}>
              None
            </button>
          </span>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {authorsLoading ? (
            <div className="grid h-16 place-items-center text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filteredAuthors.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">No authors match.</p>
          ) : (
            filteredAuthors.map((a) => (
              <label
                key={a.key}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-800/60"
                title={a.key}
              >
                <input
                  type="checkbox"
                  checked={selectedAuthors.has(a.key)}
                  onChange={() => toggleAuthor(a.key)}
                />
                <span className="min-w-0 flex-1 truncate text-slate-300">{a.key}</span>
                <span className="tabular-nums text-slate-500">{fmtNum(a.commits)}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* object */}
      <div className="card p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Object
        </h3>
        <p className="mb-2 break-all rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 font-mono text-xs text-slate-300">
          {filters.path === "" ? "/ (repository root)" : filters.path}
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 text-xs" onClick={() => setPathOpen(true)}>
            Choose file / dir
          </button>
          {filters.path !== "" && (
            <button className="btn-ghost text-xs" onClick={() => onObjectChange("")}>
              Root
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Repository metrics are directory metrics on the root. Select a file or directory to scope
          every metric below.
        </p>
      </div>

      <button
        className="btn-ghost w-full text-xs"
        onClick={() =>
          onChange({
            mode: "all",
            fromInput: "",
            toInput: "",
            hashes: [],
            authors: [],
            path: "",
          })
        }
      >
        Reset all filters
      </button>

      <PathPickerModal
        open={pathOpen}
        onClose={() => setPathOpen(false)}
        files={files}
        dirs={dirs}
        onSelect={(p) => {
          onObjectChange(p);
          setPathOpen(false);
        }}
      />
    </div>
  );
}

// ---------- path picker ----------

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  files: string[];
}

function buildTree(dirs: string[], files: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), files: [] };
  for (const d of dirs) {
    if (!d) continue;
    let cur = root;
    for (const seg of d.split("/")) {
      let n = cur.children.get(seg);
      if (!n) {
        n = { name: seg, path: cur.path ? `${cur.path}/${seg}` : seg, children: new Map(), files: [] };
        cur.children.set(seg, n);
      }
      cur = n;
    }
  }
  for (const f of files) {
    const p = parentOf(f);
    let cur = root;
    if (p) {
      for (const seg of p.split("/")) {
        const n = cur.children.get(seg);
        if (!n) break;
        cur = n;
      }
    }
    cur.files.push(f);
  }
  return root;
}

export function PathPickerModal({
  open,
  onClose,
  files,
  dirs,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  files: string[];
  dirs: string[];
  onSelect: (path: string) => void;
}) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildTree(dirs, files), [dirs, files]);
  if (!open) return null;

  const query = q.trim().toLowerCase();
  const flat = query
    ? [...dirs.filter((d) => d && d.toLowerCase().includes(query)).map((d) => ({ path: d, isDir: true })),
       ...files.filter((f) => f.toLowerCase().includes(query)).map((f) => ({ path: f, isDir: false }))]
        .slice(0, 300)
    : [];

  const toggle = (p: string) => {
    const next = new Set(expanded);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setExpanded(next);
  };

  return (
    <Modal title="Choose a file or directory" onClose={onClose} wide>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          autoFocus
          className="input w-full !pl-8 text-xs"
          placeholder="Search paths (e.g. src/, utils.c)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <button className="btn-ghost mb-3 w-full justify-start text-xs" onClick={() => onSelect("")}>
        <Folder className="h-3.5 w-3.5" /> / — repository root
      </button>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2">
        {query ? (
          flat.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">No matches.</p>
          ) : (
            flat.map((r) => (
              <button
                key={r.path}
                onClick={() => onSelect(r.path)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs text-slate-300 hover:bg-slate-800"
              >
                {r.isDir ? (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className="truncate">{r.path}</span>
              </button>
            ))
          )
        ) : (
          <TreeRow node={tree} depth={0} expanded={expanded} toggle={toggle} onSelect={onSelect} rootLabel="/ (root)" />
        )}
      </div>
    </Modal>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  onSelect,
  rootLabel,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (p: string) => void;
  onSelect: (p: string) => void;
  rootLabel?: string;
}) {
  const isOpen = expanded.has(node.path);
  const hasChildren = node.children.size > 0 || node.files.length > 0;
  const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const filesShown = isOpen ? node.files.slice(0, 100) : [];
  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-800/70"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <button
          className={`grid h-4 w-4 place-items-center text-slate-500 ${hasChildren ? "" : "invisible"}`}
          onClick={() => toggle(node.path)}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Folder className={`h-3.5 w-3.5 shrink-0 ${depth === 0 ? "text-indigo-400" : "text-indigo-400/70"}`} />
        <button className="min-w-0 flex-1 truncate text-left font-mono text-xs text-slate-300 hover:text-white" onClick={() => onSelect(node.path)}>
          {rootLabel ?? node.name}
        </button>
        <span className="text-[10px] tabular-nums text-slate-600">{node.children.size + node.files.length}</span>
      </div>
      {isOpen && (
        <div>
          {children.map((c) => (
            <TreeRow key={c.path} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} onSelect={onSelect} />
          ))}
          {filesShown.map((f) => (
            <button
              key={f}
              onClick={() => onSelect(f)}
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left font-mono text-xs text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              style={{ paddingLeft: `${(depth + 1) * 14 + 22}px` }}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-600" />
              <span className="truncate">{baseName(f)}</span>
            </button>
          ))}
          {isOpen && node.files.length > 100 && (
            <p className="px-3 py-1 text-[11px] text-slate-600">
              … {fmtNum(node.files.length - 100)} more files — use search to find them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- commit picker ----------

export function CommitPickerModal({
  open,
  onClose,
  repoId,
  selected,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  repoId: string;
  selected: string[];
  onApply: (hashes: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CommitListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [matched, setMatched] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set(selected));

  const LIMIT = 200;

  const load = async (query: string, off: number, append: boolean) => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchJson<{ total: number; matched: number; commits: CommitListItem[] }>(
        `/api/repos/${repoId}/commits?q=${encodeURIComponent(query)}&offset=${off}&limit=${LIMIT}`,
      );
      setTotal(d.total);
      setMatched(d.matched);
      setOffset(off + d.commits.length);
      setItems((prev) => (append ? [...prev, ...d.commits] : d.commits));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setItems([]);
      setSel(new Set(selected));
      load("", 0, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggle = (h: string) => {
    const next = new Set(sel);
    if (next.has(h)) next.delete(h);
    else next.add(h);
    setSel(next);
  };

  const selectAllMatching = async () => {
    setLoading(true);
    try {
      const d = await fetchJson<{ hashes: string[] }>(
        `/api/repos/${repoId}/commits?q=${encodeURIComponent(q)}&hashesOnly=1`,
      );
      setSel(new Set(d.hashes));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Select commits — ${fmtNum(sel.size)} selected of ${fmtNum(matched)} matching`} onClose={onClose} wide>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          autoFocus
          className="input w-full !pl-8 text-xs"
          placeholder="Search by hash, subject or author…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q, 0, false)}
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <button className="btn-ghost !py-1 text-xs" onClick={() => load(q, 0, false)} disabled={loading}>
          Search
        </button>
        <button className="btn-ghost !py-1 text-xs" onClick={selectAllMatching} disabled={loading}>
          Select all matching ({fmtNum(matched)})
        </button>
        <button className="btn-ghost !py-1 text-xs" onClick={() => setSel(new Set())}>
          Clear selection
        </button>
        <span className="ml-auto self-center text-slate-500">
          {fmtNum(total)} commits in history
        </span>
      </div>
      {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
      <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50">
        {items.map((c) => (
          <label
            key={c.h}
            className="flex cursor-pointer items-center gap-3 border-b border-slate-900 px-3 py-1.5 text-xs hover:bg-slate-900"
          >
            <input type="checkbox" checked={sel.has(c.h)} onChange={() => toggle(c.h)} />
            <span className="w-20 shrink-0 font-mono text-indigo-300">{c.short}</span>
            <span className="w-40 shrink-0 truncate text-slate-400" title={c.author}>
              {c.author}
            </span>
            <span className="w-24 shrink-0 text-slate-500">{fmtDate(c.t)}</span>
            <span className="min-w-0 flex-1 truncate text-slate-300" title={c.subject}>
              {c.subject}
            </span>
          </label>
        ))}
        {loading && (
          <div className="grid h-16 place-items-center text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          className="btn-ghost text-xs"
          disabled={loading || items.length >= matched}
          onClick={() => load(q, offset, true)}
        >
          Load more
        </button>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary text-xs" onClick={() => onApply([...sel])}>
            <Check className="h-3.5 w-3.5" /> Apply selection ({fmtNum(sel.size)})
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- author merge ----------

interface IdentityInfo {
  key: string;
  commits: number;
  raw: string[];
}

export function AuthorMergeModal({
  open,
  onClose,
  repoId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  repoId: string;
  onSaved: () => void;
}) {
  const [identities, setIdentities] = useState<IdentityInfo[]>([]);
  const [groups, setGroups] = useState<AuthorGroup[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    setSel(new Set());
    setMergeName("");
    fetchJson<{ identities: IdentityInfo[]; groups: AuthorGroup[] }>(`/api/repos/${repoId}/authors`)
      .then((d) => {
        setIdentities(d.identities);
        setGroups(d.groups);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, repoId]);

  if (!open) return null;

  const grouped = new Set(groups.flatMap((g) => g.identities));
  const query = q.trim().toLowerCase();
  const list = query ? identities.filter((i) => i.key.toLowerCase().includes(query)) : identities;

  const toggle = (key: string) => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSel(next);
    if (mergeName === "" && next.size === 1) {
      const first = identities.find((i) => next.has(i.key));
      if (first) setMergeName(first.key.replace(/\s*<.*>$/, ""));
    }
  };

  const merge = async () => {
    if (sel.size < 2) {
      setErr("Select at least two identities to merge.");
      return;
    }
    const name = mergeName.trim() || [...sel][0].replace(/\s*<.*>$/, "");
    const nextGroups = [...groups.filter((g) => !g.identities.some((id) => sel.has(id))), { name, identities: [...sel] }];
    await save(nextGroups);
  };

  const ungroup = async (name: string) => {
    const nextGroups = groups.filter((g) => g.name !== name);
    await save(nextGroups);
  };

  const save = async (nextGroups: AuthorGroup[]) => {
    setSaving(true);
    setErr(null);
    try {
      const d = await fetchJson<{ groups: AuthorGroup[] }>(`/api/repos/${repoId}/authors`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: nextGroups }),
      });
      setGroups(d.groups);
      setSel(new Set());
      setMergeName("");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Merge authors" onClose={onClose} wide>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        Identities are resolved through the repository <span className="font-mono">.mailmap</span>{" "}
        first (via git). Select two or more identities that belong to the same person and merge them
        into one author — all metrics re-attribute immediately. If the repo has no mailmap this is
        how you fix split authorship.
      </p>

      {groups.length > 0 && (
        <div className="mb-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Merged authors
          </p>
          {groups.map((g) => (
            <div
              key={g.name}
              className="flex items-center gap-2 rounded-lg border border-indigo-900/60 bg-indigo-950/30 px-3 py-1.5 text-xs"
            >
              <Users className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="font-medium text-slate-200">{g.name}</span>
              <span className="truncate text-slate-500">({g.identities.length} identities)</span>
              <button
                className="ml-auto text-red-400 hover:text-red-300"
                onClick={() => ungroup(g.name)}
                disabled={saving}
              >
                ungroup
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          className="input w-full !pl-8 text-xs"
          placeholder="Filter identities…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="max-h-[36vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50">
        {loading ? (
          <div className="grid h-20 place-items-center text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          list.map((i) => {
            const inGroup = grouped.has(i.key);
            return (
              <label
                key={i.key}
                className={`flex items-center gap-3 border-b border-slate-900 px-3 py-1.5 text-xs ${inGroup ? "opacity-50" : "cursor-pointer hover:bg-slate-900"}`}
                title={i.raw.length > 1 ? `Raw identities: ${i.raw.join(" | ")}` : i.key}
              >
                <input
                  type="checkbox"
                  disabled={inGroup}
                  checked={sel.has(i.key)}
                  onChange={() => toggle(i.key)}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-slate-300">{i.key}</span>
                {i.raw.length > 1 && (
                  <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-400" title={`Mailmapped from: ${i.raw.join(", ")}`}>
                    mailmap
                  </span>
                )}
                <span className="tabular-nums text-slate-500">{fmtNum(i.commits)} commits</span>
              </label>
            );
          })
        )}
      </div>

      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input min-w-[220px] flex-1 text-xs"
          placeholder="Merged author name"
          value={mergeName}
          onChange={(e) => setMergeName(e.target.value)}
        />
        <button className="btn-primary text-xs" disabled={saving || sel.size < 2} onClick={merge}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
          Merge {sel.size >= 2 ? `${sel.size} identities` : ""}
        </button>
      </div>
    </Modal>
  );
}

// ---------- modal shell ----------

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} border-slate-700 bg-slate-900 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button className="text-slate-500 hover:text-slate-200" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Helper kept for callers that need the unix conversion of range inputs. */
export function filtersRange(f: FiltersState): { from?: number; to?: number } {
  return { from: inputToUnix(f.fromInput), to: inputToUnix(f.toInput) };
}

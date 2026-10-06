"use client";

// Sortable metric tables (files, directories, authors).
import { useMemo, useState } from "react";
import type { AuthorRow, ObjectRow } from "@/lib/types";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/client-api";

interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => number | string;
  display?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  title?: string;
}

type SortDir = "asc" | "desc";

function useSorted<T>(rows: T[], columns: Column<T>[], initialKey: string) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDir>("desc");
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) ?? columns[0];
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      let cmp: number;
      if (typeof va === "string" || typeof vb === "string") {
        cmp = String(va).localeCompare(String(vb));
      } else {
        cmp = va - vb;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortKey, dir]);
  const onSort = (key: string) => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir("desc");
    }
  };
  return { sorted, sortKey, dir, onSort };
}

function TableFrame<T>({
  rows,
  columns,
  initialKey,
  emptyText,
  initialLimit = 150,
  id,
}: {
  rows: T[];
  columns: Column<T>[];
  initialKey: string;
  emptyText: string;
  initialLimit?: number;
  id: (row: T) => string;
}) {
  const { sorted, sortKey, dir, onSort } = useSorted(rows, columns, initialKey);
  const [limit, setLimit] = useState(initialLimit);
  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">{emptyText}</p>;
  }
  const shown = sorted.slice(0, limit);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-950/95 backdrop-blur">
            <tr className="border-b border-slate-800">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`th ${c.align === "right" ? "text-right" : ""}`}
                  onClick={() => onSort(c.key)}
                  title={c.title ?? `Sort by ${c.label}`}
                >
                  {c.label}
                  {sortKey === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={id(r)} className="border-b border-slate-900 hover:bg-slate-900/70">
                {columns.map((c) => (
                  <td key={c.key} className={`td ${c.align === "right" ? "text-right" : ""}`}>
                    {c.display ? c.display(r) : String(c.value(r))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
        <span>
          Showing {shown.length.toLocaleString()} of {sorted.length.toLocaleString()} rows
        </span>
        {shown.length < sorted.length && (
          <button className="btn-ghost !py-1 text-xs" onClick={() => setLimit(limit + 300)}>
            Show more
          </button>
        )}
      </div>
    </div>
  );
}

export function ObjectTable({
  rows,
  kind,
  onSelect,
  truncated,
}: {
  rows: ObjectRow[];
  kind: "file" | "dir";
  onSelect: (path: string) => void;
  truncated?: number;
}) {
  const columns: Column<ObjectRow>[] = useMemo(
    () => [
      {
        key: "path",
        label: kind === "file" ? "File" : "Directory",
        value: (r) => r.path,
        display: (r) => (
          <button
            onClick={() => onSelect(r.path)}
            className="max-w-[420px] truncate font-mono text-xs text-indigo-300 hover:underline"
            title={`Open ${r.path}`}
          >
            {r.path}
          </button>
        ),
      },
      { key: "added", label: "l⁺ Added", align: "right", value: (r) => r.added, display: (r) => fmtNum(r.added) },
      { key: "removed", label: "l⁻ Removed", align: "right", value: (r) => r.removed, display: (r) => fmtNum(r.removed) },
      {
        key: "growth",
        label: "δ Growth",
        align: "right",
        value: (r) => r.growth,
        display: (r) => <span className={r.growth >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtSigned(r.growth)}</span>,
      },
      { key: "churn", label: "λ Churn", align: "right", value: (r) => r.churn, display: (r) => fmtNum(r.churn) },
      { key: "mods", label: "n Mods", align: "right", value: (r) => r.mods, display: (r) => fmtNum(r.mods) },
      {
        key: "modificationFrequency",
        label: "η Mod freq",
        align: "right",
        value: (r) => r.modificationFrequency,
        display: (r) => fmtPct(r.modificationFrequency),
      },
      {
        key: "churnRate",
        label: "ρ Churn rate",
        align: "right",
        value: (r) => r.churnRate,
        display: (r) => fmtNum(Math.round(r.churnRate * 10) / 10),
      },
    ],
    [kind, onSelect],
  );
  return (
    <div>
      <TableFrame
        rows={rows}
        columns={columns}
        initialKey="churn"
        id={(r) => r.path}
        emptyText={`No ${kind} changes under this object for the current filters.`}
      />
      {truncated ? (
        <p className="px-3 pb-2 text-xs text-amber-400">
          {truncated.toLocaleString()} further files were truncated (largest churn shown first).
        </p>
      ) : null}
    </div>
  );
}

export function AuthorTable({ rows }: { rows: AuthorRow[] }) {
  const maxChurn = rows.reduce((m, r) => Math.max(m, r.churn), 0) || 1;
  const columns: Column<AuthorRow>[] = useMemo(
    () => [
      {
        key: "key",
        label: "Author",
        value: (r) => r.key,
        display: (r) => (
          <span className="max-w-[360px] truncate text-slate-200" title={r.key}>
            {r.key}
          </span>
        ),
      },
      { key: "commits", label: "Commits", align: "right", value: (r) => r.commits, display: (r) => fmtNum(r.commits) },
      { key: "added", label: "l⁺ Added", align: "right", value: (r) => r.added, display: (r) => fmtNum(r.added) },
      { key: "removed", label: "l⁻ Removed", align: "right", value: (r) => r.removed, display: (r) => fmtNum(r.removed) },
      { key: "churn", label: "λ Churn", align: "right", value: (r) => r.churn, display: (r) => fmtNum(r.churn) },
      { key: "mods", label: "n Mods", align: "right", value: (r) => r.mods, display: (r) => fmtNum(r.mods) },
      {
        key: "ownership",
        label: "ω Ownership",
        align: "right",
        value: (r) => r.ownership,
        display: (r) => (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.min(100, (r.churn / maxChurn) * 100)}%` }}
              />
            </div>
            <span className="w-14 text-right tabular-nums">{fmtPct(r.ownership)}</span>
          </div>
        ),
      },
    ],
    [maxChurn],
  );
  return (
    <TableFrame
      rows={rows}
      columns={columns}
      initialKey="churn"
      id={(r) => r.key}
      emptyText="No authors for the current filters."
    />
  );
}

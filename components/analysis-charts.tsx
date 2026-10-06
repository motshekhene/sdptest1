"use client";

// Charts for the analysis page: activity timeseries + directory treemap.
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import type { ObjectRow, SeriesPoint } from "@/lib/types";
import { baseName, fmtDate, fmtNum, parentOf } from "@/lib/client-api";

type SeriesMetric = "lines" | "churn" | "growth" | "commits";

export function ActivityChart({ series, bucket }: { series: SeriesPoint[]; bucket: "day" | "week" | "month" }) {
  const [metric, setMetric] = useState<SeriesMetric>("lines");
  const data = useMemo(
    () =>
      series.map((p) => ({
        ...p,
        date: p.t * 1000,
        growth: p.added - p.removed,
      })),
    [series],
  );
  const unit = bucket === "day" ? "day" : bucket === "week" ? "week" : "month";
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Activity over time</h3>
          <p className="text-xs text-slate-500">Bucketed per {unit} · committer dates</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
          {(
            [
              ["lines", "Added / removed"],
              ["churn", "Churn"],
              ["growth", "Growth"],
              ["commits", "Commits"],
            ] as [SeriesMetric, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`rounded-md px-2 py-1 text-xs ${metric === key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="gAdd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gRem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gChu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: number) =>
                new Date(v).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
              }
              stroke="#64748b"
              fontSize={11}
              minTickGap={24}
            />
            <YAxis stroke="#64748b" fontSize={11} width={54} tickFormatter={(v: number) => fmtNum(v)} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => fmtDate(Math.floor((v as number) / 1000))}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {(metric === "lines" || metric === "churn" || metric === "growth") && (
              <Area
                type="monotone"
                dataKey="added"
                name="Lines added"
                stroke="#34d399"
                fill="url(#gAdd)"
                strokeWidth={1.5}
              />
            )}
            {(metric === "lines" || metric === "churn" || metric === "growth") && (
              <Area
                type="monotone"
                dataKey="removed"
                name="Lines removed"
                stroke="#f87171"
                fill="url(#gRem)"
                strokeWidth={1.5}
              />
            )}
            {metric === "churn" && (
              <Area type="monotone" dataKey="churn" name="Churn (λ)" stroke="#818cf8" fill="url(#gChu)" strokeWidth={1.5} />
            )}
            {metric === "growth" && (
              <Area type="monotone" dataKey="growth" name="Growth (δ)" stroke="#fbbf24" fill="none" strokeWidth={1.5} />
            )}
            {metric === "commits" && (
              <Area type="monotone" dataKey="commits" name="Commits" stroke="#818cf8" fill="url(#gChu)" strokeWidth={1.5} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- treemap ----------

interface Cell {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  color: string;
  [key: string]: string | number | boolean;
}

function heat(t: number): string {
  // amber -> red ramp for volatility
  const r = Math.round(217 + (239 - 217) * t);
  const g = Math.round(119 + (68 - 119) * t);
  const b = Math.round(6 + (68 - 6) * t);
  return `rgb(${r},${g},${b})`;
}

export function DirectoryTreemap({
  object,
  dirs,
  files,
  onSelect,
}: {
  object: string;
  dirs: ObjectRow[];
  files: ObjectRow[];
  onSelect: (path: string) => void;
}) {
  const [metric, setMetric] = useState<"churn" | "added" | "mods">("churn");
  const cells = useMemo<Cell[]>(() => {
    const pick = (r: ObjectRow) => (metric === "churn" ? r.churn : metric === "added" ? r.added : r.mods);
    const out: Cell[] = [];
    for (const d of dirs) {
      if (parentOf(d.path) !== object) continue;
      const s = pick(d);
      if (s > 0) out.push({ name: `${baseName(d.path)}/`, path: d.path, size: s, isDir: true, color: "" });
    }
    for (const f of files) {
      if (parentOf(f.path) !== object) continue;
      const s = pick(f);
      if (s > 0) out.push({ name: baseName(f.path), path: f.path, size: s, isDir: false, color: "" });
    }
    const max = out.reduce((m, c) => Math.max(m, c.size), 0) || 1;
    for (const c of out) c.color = heat(c.size / max);
    return out.sort((a, b) => b.size - a.size);
  }, [object, dirs, files, metric]);
  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Volatility map</h3>
          <p className="text-xs text-slate-500">
            Immediate children of <span className="font-mono text-slate-400">{object || "/"}</span> · cell size = {metric} · click to drill in
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
          {(
            [
              ["churn", "Churn"],
              ["added", "Added"],
              ["mods", "Mods"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMetric(key)}
              className={`rounded-md px-2 py-1 text-xs ${metric === key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {cells.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No changes under this object for the current filters.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={cells}
              dataKey="size"
              nameKey="name"
              stroke="#0f172a"
              isAnimationActive={false}
              onClick={(node: unknown) => {
                const n = node as { path?: string };
                if (n && typeof n.path === "string" && n.path) onSelect(n.path);
              }}
              content={<TreemapCell />}
            />
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TreemapCell(props: unknown) {
  const p = props as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    size?: number;
    color?: string;
  };
  const { x = 0, y = 0, width = 0, height = 0 } = p;
  if (width <= 0 || height <= 0) return <g />;
  const showLabel = width > 46 && height > 20;
  const label = p.name ?? "";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={p.color ?? "#475569"} rx={2} />
      {showLabel && (
        <text x={x + 5} y={y + 14} fontSize={11} fill="#0b1220" fontWeight={600}>
          {label.length > Math.floor(width / 7) ? `${label.slice(0, Math.max(3, Math.floor(width / 7) - 1))}…` : label}
        </text>
      )}
      {showLabel && height > 36 && (
        <text x={x + 5} y={y + 28} fontSize={10} fill="#1f2937">
          {fmtNum(p.size ?? 0)}
        </text>
      )}
    </g>
  );
}

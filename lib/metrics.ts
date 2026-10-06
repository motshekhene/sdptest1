// The metrics engine — implements the formulas from the test brief:
//
//   l+_{h,f} / l-_{h,f}  lines added / removed on file f in commit h vs h[p]
//   d(h,f) = l+ - l-     growth        lambda(h,f) = l+ + l-   churn
//   Directory o: the recursive sum over its immediate files and subdirectories
//     (equivalently: the sum over every descendant file), so directory metrics
//     are computed by accumulating each file change into all of its ancestors.
//   Commit set H: metrics are sums over h in H; modifications n_{H,o} counts
//     commits with lambda(h,o) > 0; modification frequency = n/|H|;
//     churn rate = lambda/|H|.
//   Author metrics filter the same sums by I(a,h); ownership = churn_a / churn_o.
import type {
  AuthorRow,
  MetricsResult,
  ObjectRow,
  ParsedRepo,
  SeriesPoint,
} from "./types";
import { ancestorsOf, isUnder } from "./paths";

export interface MetricsFilter {
  from?: number; // inclusive, unix seconds (committer date)
  to?: number; // exclusive
  hashes?: Set<string>; // manual commit selection
  authors?: Set<string>; // resolved author keys
  object?: string; // "" is the repository root
}

export interface DerivedTables {
  pathIdx: Map<string, number>;
  dirIdx: Map<string, number>;
  pathAncestors: number[][]; // for each path index: dir indices, root first
}

const derivedCache = new WeakMap<ParsedRepo, DerivedTables>();

export function derivedOf(parsed: ParsedRepo): DerivedTables {
  let d = derivedCache.get(parsed);
  if (!d) {
    const pathIdx = new Map<string, number>();
    parsed.paths.forEach((p, i) => pathIdx.set(p, i));
    const dirIdx = new Map<string, number>();
    parsed.dirs.forEach((p, i) => dirIdx.set(p, i));
    const pathAncestors: number[][] = parsed.paths.map((p) =>
      ancestorsOf(p).map((a) => dirIdx.get(a) ?? 0),
    );
    d = { pathIdx, dirIdx, pathAncestors };
    derivedCache.set(parsed, d);
  }
  return d;
}

const MAX_ROWS = 2000;

export function computeMetrics(
  parsed: ParsedRepo,
  authorKeyOf: (identityIndex: number) => string,
  filter: MetricsFilter,
): MetricsResult {
  const object = filter.object ?? "";
  const d = derivedOf(parsed);
  const isFileObject = object !== "" && d.pathIdx.has(object);
  const objectType: "file" | "dir" | "root" = object === "" ? "root" : isFileObject ? "file" : "dir";

  // ---- phase 1: select the commit set H ----
  const selected: number[] = [];
  let minT = Infinity;
  let maxT = -Infinity;
  for (let i = 0; i < parsed.commits.length; i++) {
    const c = parsed.commits[i];
    if (filter.from !== undefined && c.t < filter.from) continue;
    if (filter.to !== undefined && c.t >= filter.to) continue;
    if (filter.hashes && !filter.hashes.has(c.h)) continue;
    if (filter.authors && !filter.authors.has(authorKeyOf(c.a))) continue;
    selected.push(i);
    if (c.t < minT) minT = c.t;
    if (c.t > maxT) maxT = c.t;
  }
  const H = selected.length;

  const span = H > 0 ? maxT - minT : 0;
  const bucket: "day" | "week" | "month" =
    span <= 90 * 86400 ? "day" : span <= 900 * 86400 ? "week" : "month";

  const bucketOf = (t: number): number => {
    if (bucket === "day") return Math.floor(t / 86400) * 86400;
    if (bucket === "week") return Math.floor(t / 604800) * 604800;
    const dt = new Date(t * 1000);
    return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1) / 1000;
  };

  // ---- phase 2: aggregate ----
  let totalAdded = 0;
  let totalRemoved = 0;
  let objectMods = 0;
  const files = new Map<number, { a: number; r: number; m: number }>();
  const dirs = new Map<number, { a: number; r: number; m: number }>();
  const authors = new Map<string, AuthorRow>();
  const series = new Map<number, SeriesPoint>();

  for (const i of selected) {
    const c = parsed.commits[i];
    const key = authorKeyOf(c.a);
    let arow = authors.get(key);
    if (!arow) {
      arow = { key, commits: 0, added: 0, removed: 0, churn: 0, mods: 0, ownership: 0 };
      authors.set(key, arow);
    }
    arow.commits++;

    // merge duplicate entries for the same path within one commit
    let merged: Map<number, [number, number]> | null = null;
    for (const [pi, add, rem] of c.f) {
      const p = parsed.paths[pi];
      const match = isFileObject ? p === object : isUnder(p, object);
      if (!match) continue;
      if (!merged) merged = new Map();
      const cur = merged.get(pi);
      if (cur) {
        cur[0] += add;
        cur[1] += rem;
      } else merged.set(pi, [add, rem]);
    }

    let cAdd = 0;
    let cRem = 0;
    const touchedDirs = new Set<number>();
    if (merged) {
      for (const [pi, [add, rem]] of merged) {
        const ch = add + rem;
        cAdd += add;
        cRem += rem;
        let f = files.get(pi);
        if (!f) {
          f = { a: 0, r: 0, m: 0 };
          files.set(pi, f);
        }
        f.a += add;
        f.r += rem;
        if (ch > 0) f.m++;
        for (const di of d.pathAncestors[pi]) {
          let dd = dirs.get(di);
          if (!dd) {
            dd = { a: 0, r: 0, m: 0 };
            dirs.set(di, dd);
          }
          dd.a += add;
          dd.r += rem;
          if (ch > 0 && !touchedDirs.has(di)) {
            touchedDirs.add(di);
            dd.m++;
          }
        }
      }
    }
    const commitChurn = cAdd + cRem;
    totalAdded += cAdd;
    totalRemoved += cRem;
    arow.added += cAdd;
    arow.removed += cRem;
    arow.churn += commitChurn;
    if (commitChurn > 0) {
      arow.mods++;
      objectMods++;
    }

    const bt = bucketOf(c.t);
    let sp = series.get(bt);
    if (!sp) {
      sp = { t: bt, added: 0, removed: 0, churn: 0, commits: 0, mods: 0 };
      series.set(bt, sp);
    }
    sp.commits++;
    sp.added += cAdd;
    sp.removed += cRem;
    sp.churn += commitChurn;
    if (commitChurn > 0) sp.mods++;
  }

  // ---- phase 3: build rows (denominators use the final |H|) ----
  const denom = H;
  const row = (p: string, a: number, r: number, m: number): ObjectRow => {
    const growth = a - r;
    const churn = a + r;
    return {
      path: p,
      added: a,
      removed: r,
      growth,
      churn,
      mods: m,
      modificationFrequency: denom ? m / denom : 0,
      churnRate: denom ? churn / denom : 0,
    };
  };

  let fileRows = [...files.entries()]
    .map(([pi, v]) => row(parsed.paths[pi], v.a, v.r, v.m))
    .sort((x, y) => y.churn - x.churn || y.mods - x.mods);
  let truncatedFiles = 0;
  if (fileRows.length > MAX_ROWS) {
    truncatedFiles = fileRows.length - MAX_ROWS;
    fileRows = fileRows.slice(0, MAX_ROWS);
  }

  const dirRows = [...dirs.entries()]
    .map(([di, v]) => row(parsed.dirs[di], v.a, v.r, v.m))
    .filter((r) => r.path !== object && isUnder(r.path, object))
    .sort((x, y) => y.churn - x.churn || x.path.localeCompare(y.path));

  const totalChurn = totalAdded + totalRemoved;
  const authorRows = [...authors.values()]
    .map((a) => ({ ...a, ownership: totalChurn ? a.churn / totalChurn : 0 }))
    .sort((x, y) => y.churn - x.churn || y.commits - x.commits);

  // ---- series: fill empty buckets so charts have a continuous axis ----
  let points = [...series.values()].sort((a, b) => a.t - b.t);
  if (points.length > 1) {
    const filled: SeriesPoint[] = [];
    const step = bucket === "day" ? 86400 : bucket === "week" ? 604800 : 0;
    const last = points[points.length - 1].t;
    if (step) {
      for (let t = points[0].t; t <= last; t += step) {
        filled.push(series.get(t) ?? { t, added: 0, removed: 0, churn: 0, commits: 0, mods: 0 });
      }
    } else {
      const start = new Date(points[0].t * 1000);
      let y = start.getUTCFullYear();
      let m = start.getUTCMonth();
      for (;;) {
        const t = Date.UTC(y, m, 1) / 1000;
        if (t > last) break;
        filled.push(series.get(t) ?? { t, added: 0, removed: 0, churn: 0, commits: 0, mods: 0 });
        m++;
        if (m > 11) {
          m = 0;
          y++;
        }
      }
    }
    points = filled;
  }

  const churn = totalAdded + totalRemoved;
  return {
    object: { path: object, type: objectType },
    summary: {
      commits: H,
      added: totalAdded,
      removed: totalRemoved,
      growth: totalAdded - totalRemoved,
      churn,
      mods: objectMods,
      modificationFrequency: denom ? objectMods / denom : 0,
      churnRate: denom ? churn / denom : 0,
    },
    files: fileRows,
    dirs: dirRows,
    authors: authorRows,
    series: points,
    bucket,
    truncatedFiles,
    totalCommitsInRepo: parsed.commits.length,
  };
}

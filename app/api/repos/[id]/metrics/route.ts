import { NextRequest, NextResponse } from "next/server";
import { getRepo, repoPaths } from "@/lib/store";
import { loadParsed } from "@/lib/parse";
import { computeMetrics, type MetricsFilter } from "@/lib/metrics";
import { makeAuthorResolver } from "@/lib/authors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Metrics for a filtered commit set and object.
 *
 * Query params:
 *   path      object path ("" = repository root) — a file or directory
 *   from / to unix seconds; set H = { h | from <= t < to } (to optional)
 *   commits   comma-separated hash list (manual commit selection)
 *   author    repeated param — resolved author keys to include
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (rec.status !== "ready") {
    return NextResponse.json(
      { error: `Repository is not ready (status: ${rec.status}).` },
      { status: 409 },
    );
  }

  let parsed;
  try {
    parsed = await loadParsed(repoPaths(id).parsed);
  } catch {
    return NextResponse.json(
      { error: "Parsed data is missing for this repository. Remove it and re-add." },
      { status: 410 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const filter: MetricsFilter = { object: sp.get("path") ?? "" };

  const from = sp.get("from");
  if (from) {
    const n = parseInt(from, 10);
    if (Number.isFinite(n)) filter.from = n;
  }
  const to = sp.get("to");
  if (to) {
    const n = parseInt(to, 10);
    if (Number.isFinite(n)) filter.to = n;
  }
  const commitsParam = sp.get("commits");
  if (commitsParam) {
    const hashes = commitsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (hashes.length > 0) filter.hashes = new Set(hashes);
  }
  const authorParams = sp.getAll("author").map((s) => s.trim()).filter(Boolean);
  if (authorParams.length > 0) filter.authors = new Set(authorParams);

  const keyOf = makeAuthorResolver(parsed, rec.authorGroups);
  const result = computeMetrics(parsed, keyOf, filter);
  return NextResponse.json(result);
}

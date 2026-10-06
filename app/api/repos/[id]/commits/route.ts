import { NextRequest, NextResponse } from "next/server";
import { getRepo, repoPaths } from "@/lib/store";
import { loadParsed } from "@/lib/parse";
import { makeAuthorResolver } from "@/lib/authors";
import type { CommitListItem, ParsedRepo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Case-folded caches for fast text search over large histories.
const lowerCache = new WeakMap<ParsedRepo, { s: string[]; a: string[] }>();
function lowered(parsed: ParsedRepo, keyOf: (i: number) => string) {
  let c = lowerCache.get(parsed);
  if (!c) {
    c = { s: parsed.commits.map((x) => x.s.toLowerCase()), a: [] };
    lowerCache.set(parsed, c);
  }
  if (c.a.length !== parsed.commits.length) {
    c.a = parsed.commits.map((x) => keyOf(x.a).toLowerCase());
  }
  return c;
}

/**
 * Commit list for the manual commit selector.
 * Query params: q (hash prefix / subject / author substring), offset, limit,
 * hashesOnly=1 (return only matching hashes — used by "select all matching").
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (rec.status !== "ready") {
    return NextResponse.json({ error: `Repository is not ready (status: ${rec.status}).` }, { status: 409 });
  }
  const parsed = await loadParsed(repoPaths(id).parsed);
  const keyOf = makeAuthorResolver(parsed, rec.authorGroups);

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const hashesOnly = sp.get("hashesOnly") === "1";
  const args = sp.get("offset");
  const offset = Math.max(0, args ? parseInt(args, 10) || 0 : 0);
  const limitArg = sp.get("limit");
  const limit = Math.min(1000, Math.max(1, limitArg ? parseInt(limitArg, 10) || 200 : 200));

  const cache = lowered(parsed, keyOf);
  const total = parsed.commits.length;
  const matchedHashes: string[] = [];
  const items: CommitListItem[] = [];
  let matched = 0;

  for (let i = 0; i < parsed.commits.length; i++) {
    const c = parsed.commits[i];
    if (q) {
      const hit =
        c.h.startsWith(q) ||
        cache.s[i].includes(q) ||
        cache.a[i].includes(q);
      if (!hit) continue;
    }
    matched++;
    if (hashesOnly) {
      matchedHashes.push(c.h);
      continue;
    }
    if (matched <= offset) continue;
    if (items.length >= limit) continue;
    items.push({
      h: c.h,
      short: c.h.slice(0, 10),
      author: keyOf(c.a),
      t: c.t,
      subject: c.s,
    });
  }

  if (hashesOnly) {
    return NextResponse.json({ total, matched, hashes: matchedHashes });
  }
  return NextResponse.json({ total, matched, offset, limit, commits: items });
}

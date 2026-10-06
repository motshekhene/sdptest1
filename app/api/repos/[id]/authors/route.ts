import { NextRequest, NextResponse } from "next/server";
import { getRepo, repoPaths, updateRepo } from "@/lib/store";
import { loadParsed } from "@/lib/parse";
import { listAuthors, listIdentities } from "@/lib/authors";
import type { AuthorGroup } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Author data: mailmapped identities (merge units), final authors, groups. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (rec.status !== "ready") {
    return NextResponse.json({ error: `Repository is not ready (status: ${rec.status}).` }, { status: 409 });
  }
  const parsed = await loadParsed(repoPaths(id).parsed);
  return NextResponse.json({
    groups: rec.authorGroups,
    identities: listIdentities(parsed),
    authors: listAuthors(parsed, rec.authorGroups),
  });
}

/** Replace manual author merge groups for this repository. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (rec.status !== "ready") {
    return NextResponse.json({ error: `Repository is not ready (status: ${rec.status}).` }, { status: 409 });
  }

  let body: { groups?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = await loadParsed(repoPaths(id).parsed);
  const validIdentities = new Set(parsed.mailmap);

  const rawGroups = Array.isArray(body.groups) ? body.groups : [];
  const seen = new Set<string>();
  const groups: AuthorGroup[] = [];
  for (const g of rawGroups) {
    const gg = g as { name?: unknown; identities?: unknown };
    const name = String(gg.name ?? "").trim().slice(0, 120);
    if (!name) continue;
    const ids = Array.isArray(gg.identities) ? gg.identities : [];
    const clean: string[] = [];
    for (const raw of ids) {
      const s = String(raw);
      if (!validIdentities.has(s) || seen.has(s)) continue;
      seen.add(s);
      clean.push(s);
    }
    if (clean.length > 0) groups.push({ name, identities: clean });
  }

  updateRepo(id, { authorGroups: groups });
  return NextResponse.json({ groups, authors: listAuthors(parsed, groups) });
}

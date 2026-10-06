import { NextRequest, NextResponse } from "next/server";
import { getRepo, removeRepo } from "@/lib/store";
import { dropParsedCache } from "@/lib/parse";
import { repoPaths } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Repo metadata + live status. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  return NextResponse.json({ repo: rec });
}

/** Delete a repository and all of its data. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  dropParsedCache(repoPaths(id).parsed);
  const ok = removeRepo(id);
  if (!ok) return NextResponse.json({ error: "Could not remove the repository." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

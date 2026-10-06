import { NextRequest, NextResponse } from "next/server";
import { getRepo, repoPaths } from "@/lib/store";
import { loadParsed } from "@/lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** File + directory object lists for the path picker. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = getRepo(id);
  if (!rec) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (rec.status !== "ready") {
    return NextResponse.json({ error: `Repository is not ready (status: ${rec.status}).` }, { status: 409 });
  }
  const parsed = await loadParsed(repoPaths(id).parsed);
  return NextResponse.json({ files: parsed.paths, dirs: parsed.dirs, head: parsed.head, ref: parsed.ref });
}

import { NextRequest, NextResponse } from "next/server";
import { addRepo, makeId, getRepo } from "@/lib/store";
import { startIngest } from "@/lib/ingest";
import type { RepoRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deriveName(url: string): string {
  const cleaned = url.replace(/\.git$/, "").replace(/[/\\]+$/, "");
  const base = cleaned.split("/").pop()?.split(":").pop() ?? "repository";
  return base || "repository";
}

/** Create a repository by deep-cloning a remote URL (background job). */
export async function POST(req: NextRequest) {
  let body: { url?: string; name?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "A repository URL is required." }, { status: 400 });
  }
  const ref = (body.ref ?? "HEAD").trim() || "HEAD";
  const name = (body.name ?? "").trim() || deriveName(url);
  const id = makeId();
  const rec: RepoRecord = {
    id,
    name,
    source: { type: "url", detail: url },
    ref,
    createdAt: Date.now(),
    status: "queued",
    authorGroups: [],
    progress: { phase: "Queued", message: "Waiting in the ingestion queue…" },
  };
  addRepo(rec);
  startIngest(id, "url", { url, ref });
  return NextResponse.json({ repo: getRepo(id) ?? rec }, { status: 202 });
}

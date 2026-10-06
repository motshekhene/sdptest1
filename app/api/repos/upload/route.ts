import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { addRepo, makeId, repoPaths, getRepo } from "@/lib/store";
import { startIngest } from "@/lib/ingest";
import type { RepoRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Create a repository from an uploaded zip. The body is streamed straight to
 * disk (raw octet-stream) so arbitrarily large archives do not sit in memory.
 * Query params: name, ref.
 */
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawName = (sp.get("name") ?? "uploaded-repo").trim() || "uploaded-repo";
  const ref = (sp.get("ref") ?? "HEAD").trim() || "HEAD";

  if (!req.body) {
    return NextResponse.json({ error: "Empty request body — no file was uploaded." }, { status: 400 });
  }

  const id = makeId();
  const p = repoPaths(id);
  fs.mkdirSync(p.dir, { recursive: true });
  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(p.zip),
    );
  } catch (e) {
    fs.rmSync(p.dir, { recursive: true, force: true });
    return NextResponse.json(
      { error: `Upload failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const size = fs.existsSync(p.zip) ? fs.statSync(p.zip).size : 0;
  if (size === 0) {
    fs.rmSync(p.dir, { recursive: true, force: true });
    return NextResponse.json({ error: "The uploaded file was empty." }, { status: 400 });
  }

  const name = rawName.replace(/\.zip$/i, "") || "uploaded-repo";
  const rec: RepoRecord = {
    id,
    name,
    source: { type: "zip", detail: `${rawName} — ${(size / 1048576).toFixed(1)} MB` },
    ref,
    createdAt: Date.now(),
    status: "queued",
    authorGroups: [],
    progress: { phase: "Queued", message: "Waiting in the ingestion queue…" },
  };
  addRepo(rec);
  startIngest(id, "zip", { ref });
  return NextResponse.json({ repo: getRepo(id) ?? rec }, { status: 202 });
}

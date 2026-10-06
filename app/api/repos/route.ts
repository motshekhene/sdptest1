import { NextResponse } from "next/server";
import { listRepos } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List all repositories in the registry (with live status/progress). */
export async function GET() {
  return NextResponse.json({ repos: listRepos() });
}

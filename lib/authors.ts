// Author resolution: mailmap (applied at parse time via git) + manual merges.
import type { AuthorGroup, ParsedRepo } from "./types";

/** Resolve an identity index to its final author key (manual merge wins). */
export function makeAuthorResolver(
  parsed: ParsedRepo,
  groups: AuthorGroup[],
): (identityIndex: number) => string {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.identities) {
      if (!map.has(id)) map.set(id, g.name);
    }
  }
  return (i: number) => map.get(parsed.mailmap[i]) ?? parsed.mailmap[i];
}

export interface IdentityInfo {
  key: string; // mailmapped identity — the unit of manual merging
  commits: number;
  raw: string[]; // raw identities that map to this one
  first: number;
  last: number;
}

/** Distinct mailmapped identities with commit counts (merge candidates). */
export function listIdentities(parsed: ParsedRepo): IdentityInfo[] {
  const acc = new Map<string, { commits: number; raw: Set<string>; first: number; last: number }>();
  for (const c of parsed.commits) {
    const key = parsed.mailmap[c.a];
    let e = acc.get(key);
    if (!e) {
      e = { commits: 0, raw: new Set(), first: c.t, last: c.t };
      acc.set(key, e);
    }
    e.commits++;
    e.raw.add(parsed.identities[c.a]);
    if (c.t < e.first) e.first = c.t;
    if (c.t > e.last) e.last = c.t;
  }
  return [...acc.entries()]
    .map(([key, e]) => ({ key, commits: e.commits, raw: [...e.raw].sort(), first: e.first, last: e.last }))
    .sort((a, b) => b.commits - a.commits || a.key.localeCompare(b.key));
}

export interface AuthorSummary {
  key: string; // final key after manual merges
  commits: number;
  identities: string[]; // mailmapped identities inside this author
}

/** Final (post-merge) author list with commit counts. */
export function listAuthors(parsed: ParsedRepo, groups: AuthorGroup[]): AuthorSummary[] {
  const acc = new Map<string, { commits: number; identities: Set<string> }>();
  const keyOf = makeAuthorResolver(parsed, groups);
  for (const c of parsed.commits) {
    const key = keyOf(c.a);
    let e = acc.get(key);
    if (!e) {
      e = { commits: 0, identities: new Set() };
      acc.set(key, e);
    }
    e.commits++;
    e.identities.add(parsed.mailmap[c.a]);
  }
  return [...acc.entries()]
    .map(([key, e]) => ({ key, commits: e.commits, identities: [...e.identities].sort() }))
    .sort((a, b) => b.commits - a.commits || a.key.localeCompare(b.key));
}

/** CSV list of all final author keys, one per line (for export). */
export function authorKeysCsv(parsed: ParsedRepo, groups: AuthorGroup[]): string {
  return listAuthors(parsed, groups).map((a) => a.key).join("\n");
}

// Path utilities: rename notation parsing, directory derivation.

/**
 * Normalise a `git log --numstat` path that may use rename notation.
 * Git prints renames as:
 *   "dir/{old => new}/file"
 *   "{old => new}"
 *   "old => new"
 *   "dir/{ => sub}/f"
 * A rename + change must be attributed to the NEW path.
 */
export function normaliseRenamePath(raw: string): string {
  if (!raw.includes(" => ")) return raw;
  const b = raw.indexOf("{");
  const e = raw.indexOf("}");
  if (b !== -1 && e !== -1 && b < e) {
    const pre = raw.slice(0, b);
    const inner = raw.slice(b + 1, e);
    const post = raw.slice(e + 1);
    const arrow = inner.indexOf(" => ");
    const newPart = arrow === -1 ? inner : inner.slice(arrow + 4);
    return pre + newPart + post;
  }
  const parts = raw.split(" => ");
  return parts[parts.length - 1];
}

/** Parent directory of a file path ("" for root-level files). */
export function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/** All directories containing `path`, root first: e.g. "a/b/c.txt" -> ["", "a", "a/b"]. */
export function ancestorsOf(p: string): string[] {
  const d = dirOf(p);
  if (d === "") return [""];
  const out: string[] = [""];
  let cur = "";
  for (const part of d.split("/")) {
    cur = cur === "" ? part : `${cur}/${part}`;
    out.push(cur);
  }
  return out;
}

/** All directories implied by a list of file paths (including the root ""). */
export function buildDirList(paths: string[]): string[] {
  const set = new Set<string>([""]);
  for (const p of paths) {
    for (const a of ancestorsOf(p)) set.add(a);
  }
  return [...set].sort();
}

/** True when `path` is the object itself or nested below a directory object. */
export function isUnder(path: string, object: string): boolean {
  if (object === "") return true;
  return path === object || path.startsWith(`${object}/`);
}

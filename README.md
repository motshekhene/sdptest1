# RAT — Repository Analysis Tool

A web dashboard for measuring **line-level change metrics** (added, removed, growth, churn) of
software repositories, by file, directory, repository, commit set, and author — with
**.mailmap-aware author merging** and **rename-aware** attribution.

Built with **Next.js 15** (App Router, TypeScript, Tailwind CSS v4) and **recharts**.

## Quick start

Prerequisites: **Node.js 18+** and **git** on your `PATH` (git is required — the app shells
out to it for cloning and history parsing).

```bash
npm install     # 1. install dependencies
npm run dev     # 2. start the app → http://localhost:3000
```

Then open **http://localhost:3000** and add a repository:
- **Clone URL** tab — paste a repo URL (there is a one-click **cJSON sample**; ingests in ~30 s), or
- **Zip upload** tab — select a zip of a repository that includes its `.git` directory.

The dashboard tracks ingestion progress (`queued → cloning/extracting → parsing → ready`)
and a **Open dashboard** button appears when the repo is ready.

Production build: `npm run build && npm start` (serves the same URL).

Notes:
- All data is stored in `.rat-data/` (created on first run, git-ignored). Delete the folder to
  reset the app to an empty state.
- If port 3000 is busy: `npm run dev -- -p 3001`.
- If `npm install` fails on `@tailwindcss/oxide` (npm optional-dependency bug):

  ```bash
  npm i --no-save @tailwindcss/oxide-linux-x64-gnu@4.3.3
  ```

## Features

### Ingestion (both forms from the brief)
- **Zip upload** — a zipped/compressed repository *including its `.git` directory*. The archive is
  extracted, the `.git` root is located (nested folders are handled), and the git history is parsed.
  Upload streams directly to disk (no memory buffering), with a progress bar in the UI.
- **Remote URL clone** — deep/full clone (`git clone --progress`), with live fetch progress.

Ingestion runs on a background FIFO queue; the dashboard polls status (`queued → cloning/
extracting → parsing → ready`) with progress bars. Both paths produce identical results:
the same cJSON content ingested via clone and via zip reports identical stats (955 commits,
37,166 net lines).

### Metric categories (all from the brief)

| Category | Where |
|---|---|
| **File** metrics | Files table: l⁺, l⁻, δ, n, η, ρ |
| **Directory** metrics | Directories table + treemap; recursive sums over immediate children |
| **Repository** metrics | KPI header = root-directory metrics over the whole commit set |
| **Commit set** metrics | n (commits with λ > 0), η = n/\|H\|, ρ = λ/\|H\| |
| **Author** metrics | Authors table: n, l⁺, l⁻, λ and **ownership ω = λ_a / λ_o** with share bars |

Formulas implemented per the brief: `δ = l⁺ − l⁻`, `λ = l⁺ + l⁻`, `η = n/|H|`, `ρ = λ/|H|`.

### Filtering
- **By repository** — dashboard manages multiple repositories simultaneously.
- **By commit set** — three modes:
  - *All commits* (reachable from the chosen ref, non-merge only),
  - *Time period* — `H_t` from t to present, or `[i, j)` — with `datetime-local` inputs,
  - *Manual list* — pick individual commits (searchable, with "select all matching"),
  - Author filters also narrow the commit set H (and all denominators |H|)
- **By author** — multi-select of final (post-merge) authors.
- **By file/directory** — drill into any path: click a directory in the treemap or table to scope
  every metric to it (with its children).

### Author merging
- **.mailmap** is applied exactly as git does (via `git check-mailmap` at parse time).
- **Manual merging** — on top of mailmap, group any identities into one author (e.g. same person,
  different names). Merged authors are re-attributed across *all* metrics and ownership.

### Git-correctness details
- Merge commits are excluded (H ⊆ non-merge commits reachable from HEAD/ref).
- **Rename detection at 50% similarity** (`-M50%`); pure renames do not distort metrics, and
  renames-with-changes are attributed to the **new** path.
- **Binary files are skipped** (not measured), using git's own binary detection.
- **Deletions** are recorded as line removals on the affected path.

## Architecture (performance)

- **Parse once, query fast**: history is parsed with a single streaming `git log --numstat`
  pass into a compact, interned model (path/identity indices), stored gzipped. Full metrics for
  the 11.8k-commit Redis repo return in ~0.4 s, and ~1 s for the 61k-commit git.git repo;
  queries are in-memory aggregations.
- Aggregation is a two-phase scan with per-commit merge maps; derived path→ancestor tables are
  memoized with `WeakMap`s, and file rows are capped (2000) with an explicit truncation notice.
- The registry is a small JSON file with atomic writes; ingestion is an in-process queue with
  per-repo progress and stale-job recovery on restart.

## Verification

`scripts/verify-metrics.sh <repo-id>` cross-checks the API against raw `git log` for:
time ranges, author filters, manual commit lists, and per-path metrics. All checks pass
**exactly** on all three provided test repositories — every commit, line, and churn total
matches raw git:

| Repo | Commits | Added | Removed | Churn |
|---|---|---|---|---|
| cJSON | 955 | 46,377 | 11,211 | 57,588 |
| Redis | 11,874 | 1,110,258 | 500,312 | 1,610,570 |
| git.git | 61,101 | 4,070,371 | 2,375,604 | 6,445,975 |

## AI Declaration

- Claude Web (Opus 5.5) — reviewed
- This project was developed with the assistance of an AI coding assistant for scaffolding,
  implementation, and verification.

## Submission

Repository URL: https://github.com/motshekhene/sdptest1

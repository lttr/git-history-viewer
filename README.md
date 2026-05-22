# Git History Viewer

Browser-based git history viewer. Three panes: commit list, file tree, diff.

Built on Nuxt 4 + Nitro + `simple-git` + `@git-diff-view/vue`.

## Install

One-shot run inside a repo:

```bash
npx @lttr/gv
```

Or install globally:

```bash
npm i -g @lttr/gv
cd /path/to/repo
gv
```

## Use

```bash
gv                          # serve current repo
gv path/to/file.ts          # preselect a file
gv --comments pr.json       # overlay review comments (see Comments)
gv --repo /path/to/repo     # explicit repo path
gv --port 4000              # explicit port
gv --host 0.0.0.0           # explicit bind host
```

Flags:

| Flag | Default | Purpose |
| --- | --- | --- |
| `-c, --comments <path>` | — | Inline review comments file (see Comments) |
| `-r, --repo <path>` | current directory | Target repo root |
| `-p, --port <n>` | `3434` (auto-picks next free) | HTTP port |
| `--host <host>` | `127.0.0.1` | Bind host |

By default picks a free port starting at `3434`, binds `127.0.0.1`, opens default browser. Passing `--port` pins that exact port (errors if in use).

## Develop

```bash
pnpm install
pnpm build
GV_REPO_PATH=/path/to/repo pnpm dev
```

Dev server on `http://localhost:3000`.

## Keys

- `n` / `p` — next / previous commit
- `Shift+N` / `Shift+P` — extend multi-commit selection down / up
- `j` / `k` — next / previous file (scrolls diff pane)
- `?` — toggle hotkey help
- `Esc` — close help
- Top-right button in diff pane — toggle side-by-side / unified

Mouse: click a commit to select; `Ctrl`/`Cmd`+click to toggle into selection; `Shift`+click to extend range. Multi-select aggregates diffs across the range.

## Range

Top bar filters commits by any git rev range (`main..HEAD`, `v1.0..HEAD`, `HEAD`, branch/tag names, empty = full history). Quick actions: `branch` (auto-detected base branch `..HEAD`), `all` (full history).

## Deep links

- `#<short-hash>` — preselect commit
- `?range=main..HEAD` — preset range
- `?changes=staged` / `?changes=unstaged` — preselect uncommitted changes view

All are written back to the URL as you navigate.

## Uncommitted changes

Pseudo-rows at the top of the commit list show **Unstaged changes** (working tree vs index) and **Staged changes** (index vs HEAD) when present. Click ↻ on a row to refresh after staging files outside the app. Untracked files are not yet shown.

## Comments

Overlay review comments onto the diff with `gv --comments <file.json>`. Comments render three ways depending on their anchor:

- **inline** — a thread attached to a file + line, shown under that line in the diff
- **file-level** — a thread attached to a file (no line), shown under the file header
- **PR-level** — a thread with no file, shown in a summary panel above the diff

Each file with comments gets a 💬 badge; resolved threads render dimmed. If a comment's line — or its whole file — isn't present in the diff you're viewing (different commit/range than it was authored against), it can't attach inline; instead it's collected in an **unattached comments** panel above the diff (with its `path:line`) so nothing is lost.

### Format (`gv` comment format v1)

The viewer is source-agnostic — it reads this neutral JSON shape:

```jsonc
{
  "version": 1,
  "source": { "kind": "azure-devops", "ref": "PR #101678", "url": "https://…" }, // optional
  "anchoredTo": { "base": "<sha>", "head": "<sha>" },                            // optional
  "threads": [
    {
      "id": "693641",
      "status": "open",                     // "open" | "resolved"
      "anchor": {                            // null = PR-level
        "path": "src/foo.ts",                // repo-relative, no leading slash
        "side": "new",                       // "new" | "old"  (default "new")
        "line": 150,                         // omit for a file-level thread
        "endLine": 150                       // optional span end
      },
      "comments": [
        { "author": "Jane Doe", "date": "2026-05-13T15:24:34Z", "body": "markdown text" }
      ]
    }
  ]
}
```

`anchor` shapes: `null` → PR-level; `{path}` → file-level; `{path, line}` → inline. `body` supports a small markdown subset (fenced code, inline `code`, line breaks), HTML-escaped.

### Importing (external)

Importers live outside this tool — convert any review source into the format above and pass the result with `--comments`. Example: Azure DevOps via `az` + `jq`:

```bash
az repos pr comment-thread list --id 101678 --org https://dev.azure.com/ORG -p PROJECT > raw.json
jq --arg ref "PR #101678" -f examples/azure-to-gv.jq raw.json > pr.json
gv --comments pr.json
```

`examples/azure-to-gv.jq` (drops `system`/policy threads, normalizes `fixed`→`resolved`, strips the leading `/` from paths, maps `rightFileStart`→`new` side) maps the Azure thread shape onto v1.

## Layout

- `app/` — pages, components, Pinia store (`stores/viewer.ts`)
- `server/api/` — Nitro routes
- `server/utils/git.ts` — `simple-git` singleton, rooted at `GV_REPO_PATH`
- `server/utils/cache.ts` — LRU for commit/diff payloads
- `bin/gv.mjs` — CLI entry, boots built Nitro and opens browser

## API

| Route | Purpose |
| --- | --- |
| `GET /api/context` | branch, auto-detected base, default range, HEAD, repo name |
| `GET /api/log?range&limit&skip` | paginated commit summaries |
| `GET /api/commit/:sha` | commit metadata + changed files |
| `GET /api/diffs/:sha` | all file diffs for a commit (patch + old/new content) |
| `GET /api/diff?sha&file` | single file diff |
| `GET /api/diffs-range?shas=a,b,c` | aggregated diff across multiple commits |
| `GET /api/changes` | counts of staged + unstaged changes |
| `GET /api/changes/:kind` | diffs for `staged` or `unstaged` uncommitted changes |
| `GET /api/comments` | review comments doc (`--comments` file), or empty doc if unset |

## Env (dev / internal only)

The `gv` CLI is configured entirely via flags (see Use). These env vars are read
only by the Nitro server itself — `bin/gv.mjs` sets them when spawning it, and the
dev server reads them directly:

| Var             | Default         | Purpose          |
| --------------- | --------------- | ---------------- |
| `GV_REPO_PATH`  | `process.cwd()` | Target repo root |
| `GV_FILE_PATH`  | —               | Preselected file |

## Known limits

- Merge commits: diff is against first parent only
- Large diffs (>3000 lines) render on demand via `Load diff` button; old/new full file content is loaded both sides (needed for syntax highlight)
- No branch/tag picker, no file search
- Comments anchored to a line/file not present in the current diff (incl. deleted files) appear in the "unattached comments" panel above the diff rather than inline
- Uncommitted-changes view skips untracked files

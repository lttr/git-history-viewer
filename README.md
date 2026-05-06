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
gv                     # serve current repo
gv path/to/file.ts     # preselect a file
GV_REPO_PATH=/repo gv  # explicit repo path
```

Picks a free port starting at `3434`, binds `127.0.0.1`, opens default browser.

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

## Env

| Var             | Default                      | Purpose          |
| --------------- | ---------------------------- | ---------------- |
| `GV_REPO_PATH`  | `process.cwd()`              | Target repo root |
| `PORT`          | `3434` (prod) / `3000` (dev) | HTTP port        |
| `HOST`          | `127.0.0.1`                  | Bind host        |

## Known limits

- Merge commits: diff is against first parent only
- Large diffs (>3000 lines) render on demand via `Load diff` button; old/new full file content is loaded both sides (needed for syntax highlight)
- No branch/tag picker, no file search
- Uncommitted-changes view skips untracked files

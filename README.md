# Git History Viewer

Browser-based git history viewer. Three panes: commit list, file tree, diff.

Built on Nuxt 4 + Nitro + `simple-git` + `@git-diff-view/vue`.

## Install

```bash
pnpm install
pnpm build
```

## Use

Point at any git repo via `GHV_REPO_PATH`:

```bash
GHV_REPO_PATH=/path/to/repo node bin/ghv.mjs
```

Defaults to `process.cwd()` if unset. Opens `http://127.0.0.1:3434` in your browser.

## Develop

```bash
GHV_REPO_PATH=/path/to/repo pnpm dev
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

Both are written back to the URL as you navigate.

## Layout

- `app/` — pages, components, Pinia store (`stores/viewer.ts`)
- `server/api/` — Nitro routes
- `server/utils/git.ts` — `simple-git` singleton, rooted at `GHV_REPO_PATH`
- `server/utils/cache.ts` — LRU for commit/diff payloads
- `bin/ghv.mjs` — CLI entry, boots built Nitro and opens browser

## API

| Route | Purpose |
| --- | --- |
| `GET /api/context` | branch, auto-detected base, default range, HEAD, repo name |
| `GET /api/log?range&limit&skip` | paginated commit summaries |
| `GET /api/commit/:sha` | commit metadata + changed files |
| `GET /api/diffs/:sha` | all file diffs for a commit (patch + old/new content) |
| `GET /api/diff?sha&file` | single file diff |
| `GET /api/diffs-range?shas=a,b,c` | aggregated diff across multiple commits |

## Env

| Var             | Default                      | Purpose          |
| --------------- | ---------------------------- | ---------------- |
| `GHV_REPO_PATH` | `process.cwd()`              | Target repo root |
| `PORT`          | `3434` (prod) / `3000` (dev) | HTTP port        |
| `HOST`          | `127.0.0.1`                  | Bind host        |

## Known limits

- Merge commits: diff is against first parent only
- Large diffs (>3000 lines) render on demand via `Load diff` button; old/new full file content is loaded both sides (needed for syntax highlight)
- No branch/tag picker, no file search, no working-tree view

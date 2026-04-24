# ghv

Browser-based git history viewer. Three panes: commits, file tree, diff.

Built on Nuxt 4 + Nitro + `simple-git` + `@git-diff-view/vue`.

## Install

```bash
vp install
vp run build
```

## Use

Point at any git repo via `GHV_REPO_PATH`:

```bash
GHV_REPO_PATH=/path/to/repo node bin/ghv.mjs
```

Defaults to `process.cwd()` if unset. Opens `http://127.0.0.1:3434` in your browser.

## Develop

```bash
GHV_REPO_PATH=/path/to/repo vp run dev
```

Dev server on `http://localhost:3000`.

## Keys

- `j` / `k` — next / previous commit
- `n` / `p` (or `J` / `K`) — next / previous file (scrolls diff pane)
- Top-right button — toggle side-by-side / unified diff

## Layout

- `app/` — Vue pages, components, Pinia store
- `server/api/` — Nitro routes (`log`, `commit/:sha`, `diff`)
- `server/utils/git.ts` — `simple-git` singleton, rooted at `GHV_REPO_PATH`
- `bin/ghv.mjs` — CLI entry, boots built Nitro and opens browser

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `GHV_REPO_PATH` | `process.cwd()` | Target repo root |
| `PORT` | `3434` (prod) / `3000` (dev) | HTTP port |
| `HOST` | `127.0.0.1` | Bind host |

## Known limits

- Merge commits: diff is against first parent only
- Large diffs load full old/new file content both sides (needed for syntax highlight)
- No branch/tag picker, no file search, no working-tree view

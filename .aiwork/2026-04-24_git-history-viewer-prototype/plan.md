---
references:
  - https://github.com/MrWangJustToDo/git-diff-view
  - https://github.com/steveukx/git-js
---

# Git History Viewer — Prototype Plan

Browser app. Launch via CLI in repo dir. 3-pane: commits | files | diff.

## Stack

- Nuxt 3 (SSR off, SPA)
- Nitro server routes
- `simple-git` — shell wrap
- `@git-diff-view/vue` — diff component
- Repo path = `process.cwd()` at Nitro boot
- Dark-only theme
- Binary: `ghv`

## Layout

```
app/
  pages/index.vue          3-pane grid
  components/
    CommitList.vue         left
    FileTree.vue           middle
    DiffView.vue           right
  composables/useGit.ts    fetch wrappers
server/
  api/
    log.get.ts             ?skip=0&limit=100
    commit/[sha].get.ts    files + stats
    diff.get.ts            ?sha=&file=
  utils/git.ts             simple-git singleton
nuxt.config.ts
package.json               bin: ghv → node .output/server/index.mjs
```

## Steps

1. Scaffold Nuxt, SPA mode, add deps
2. `server/utils/git.ts` — `simpleGit(process.cwd())` singleton
3. `GET /api/log?skip=0&limit=200` — `git.log({maxCount: 200, from})` → `[{hash, subject, author, date}]`
4. `CommitList.vue` — render 200, "Load more" button appends next 200. Click sets `selectedSha`.
5. `GET /api/commit/:sha` — `git.show(['--name-status', '--format=', sha])` parse → `[{path, status}]`. First parent only for merges.
6. `FileTree.vue` — nested tree from path segments. Collapsible folders, all expanded default. A/M/D/R badges on leaves. Click sets `selectedFile`
7. `GET /api/diff?sha=&file=` — `git.show([sha, '--', file])` return raw unified diff
8. `DiffView.vue` — mount `@git-diff-view/vue`. Side-by-side default, toggle button → unified. Mode in Pinia.
9. Keyboard: j/k commits, J/K files, `/` filter commits
10. CLI entry: `bin/ghv.mjs` → start Nitro on free port → open browser (`open` pkg)

## Cuts (post-prototype)

- Branches/tags sidebar
- Staged/working tree view
- Merge commit parent picker
- File history (`--follow`)
- Binary file handling beyond skip
- Syntax highlight tuning
- Search across commits (`git log -S`)

## Build & run

```
vp install
vp dev              # dev in current repo
vp build            # outputs .output/
node .output/server/index.mjs   # in any repo dir
```

Package `bin` later.

## Resolved

- File tree: nested tree
- Diff view: both w/ toggle, side-by-side default
- Merges: first parent only
- Commit list: 200 per page, "Load more" button
- Theme: dark only
- Binary: `ghv`

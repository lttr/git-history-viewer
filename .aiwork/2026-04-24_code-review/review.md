# Code Review: git-history-viewer (whole repo)

Date: 2026-04-24
Branch: main
Scope: full repo (app/, server/, bin/, nuxt.config.ts)

Reviewed 20 source files. No CLAUDE.md in repo.

## Issues Found

### 1. [Security/RCE] `server/api/log.get.ts:15`

```ts
if (range) args.push(...range.split(/\s+/))
```

User-supplied `range` split on whitespace, pushed raw onto `git log` argv. simple-git uses argv (no shell), so classic shell injection blocked — but **git option injection** is open. `?range=--output=/home/user/.ssh/authorized_keys%20HEAD` writes attacker-controlled log output to arbitrary file → RCE as user.

Reachable via DNS rebinding from any webpage user visits (server defaults to 127.0.0.1, no Origin check).

Fix: validate tokens with allowlist regex (e.g. `^[A-Za-z0-9._/^~@{}-]+(\.\.\.?[A-Za-z0-9._/^~@{}-]+)?$`) or reject `-`-prefixed tokens.

Confidence: 95

### 2. [Security] sha/file injection in multiple routes

Files:
- `server/api/diff.get.ts:4-19`
- `server/api/diffs/[sha].get.ts:35,71`
- `server/api/diffs-range.get.ts:39,60-61,76,84`
- `server/api/commit/[sha].get.ts:6,14`

`sha` and `file` flow into `git show ${sha}:${file}`, `rev-list --parents -n 1 ${sha}`, `rev-list --no-walk ${...shas}` without validation. Several sinks place user input where git treats `-`-prefixed tokens as flags (no `--` separator).

Less impactful than #1 but same class.

Fix: validate `sha` as `^[0-9a-f]{4,64}$` (or resolve via `rev-parse --verify` and use canonical hash); reject `file` starting with `-`.

Confidence: 85

### 3. [Security] No Origin/Host check on any API route

All routes are GET with no CSRF token. Any webpage user visits can issue cross-origin GETs to `http://127.0.0.1:3434/api/log?range=...`. Combined with #1 → drive-by file write.

Fix: Origin allowlist, bind to unix socket, or require a session token.

Confidence: 85

### 4. [Bug] `app/stores/viewer.ts:9-12` — broken LRU eviction

```ts
function cacheSet(sha, value) {
  commitCache.set(sha, value)
  if (commitCache.size > MAX_CACHE) {
    const first = commitCache.keys().next().value
    if (first) commitCache.delete(first)
  }
}
```

`Map.set` on existing key preserves insertion order, doesn't promote to end. LRU semantics broken on rewrite. Worse: when `sha === first` and size at cap, deletes the just-set entry. Server `LRU` (`server/utils/cache.ts`) does delete-then-set correctly; client doesn't.

Confidence: 90

### 5. [Bug] `server/api/diffs-range.get.ts:57-61` — root commit crash

```ts
const base = `${from}^`
... git.raw(['diff', `${base}..${to}`])
```

`${from}^` doesn't exist for root commit → uncaught throw → 500. Selecting a range that includes the initial commit crashes.

Fix: detect root via `rev-list --max-parents=0`; use `4b825dc642cb6eb9a060e54bf8d69288fbee4904` (empty tree) as base, or `git diff-tree --root`.

Confidence: 90

### 6. [Bug] `app/components/RangeBar.vue:17-24` — Enter double-fire, Esc-cancel becomes confirm

`@keydown.enter="submit"` sets `editing=false` then refetches; the resulting blur fires `submit()` again → double `reloadCommits()`.

`@keydown.esc="cancel"` similarly triggers blur → `submit(draft.value)` runs with the unconfirmed draft, turning Esc-cancel into confirm.

Fix: track a `cancelled`/`submitted` flag in the handler; or detach `@blur` once Enter/Esc handled.

Confidence: 90

### 7. [Bug] `app/stores/viewer.ts:86-103` — back/forward broken

`writeUrl` uses `history.replaceState` and store has no `popstate` listener. Browser back/forward changes the URL but app state stays stale. Breaks navigation for a feature explicitly built around URL-as-state.

Fix: switch to `pushState` for meaningful navigation, add `popstate` handler that re-reads URL into store.

Confidence: 85

### 8. [Bug] `app/stores/viewer.ts:97,151-155` — deep-link sha resolution silently lost

URL writes truncated 8-char shas (`s.slice(0,8)`); read resolves via `commits.find(c => c.hash.startsWith(s))`. Only first 200 commits loaded at init. Deep link to any commit beyond page 1 silently falls back to `commits[0]` — shared URLs lose target.

Fix: page until resolved, or resolve server-side via `rev-parse`. Also avoid 8-char truncation (use full sha — URL length is fine).

Confidence: 85

### 9. [Bug] `app/components/DiffView.vue:104-117` (with `:86-90`) — FileTree clicks dropped during scroll

`userScrolling` flag set true for 400ms inside IO callback. `selectedFile` watcher bails when `userScrolling` is true → clicking a file in FileTree right after any diff scroll is silently no-op'd for up to 400ms.

Fix: distinguish IO-driven `userScrolling` (suppress reverse update only) from external selection changes (always honor).

Confidence: 80

### 10. [Bug] `app/components/CommitList.vue`, `app/components/FileTree.vue` — selection scrolls off-screen

n/p/j/k mutate `selectedSha`/`selectedFile` but neither list scrolls the new selection into view. Repeated keypress walks selection off-screen.

Fix: in each list, watch the selected key and call `scrollIntoView({ block: 'nearest' })` on the matching row.

Confidence: 85

### 11. [Bug] `app/stores/viewer.ts:153` — deep-linked multi-select loses pivot

`setMultiSelection` doesn't update `lastPivotSha`. Deep-linked URL with multi-selection leaves `lastPivotSha=''`; first Shift+click after page load loses range-extend semantics.

Fix: in `setMultiSelection`, set `lastPivotSha = shas[0]` (or whichever end is the anchor).

Confidence: 80

### 12. [Bug] `app/pages/index.vue:32-44` + `app/components/HotkeyHelp.vue` — hotkeys fire while help open

Global hotkey handler doesn't check whether the help dialog is open. Pressing `n`/`p`/`j`/`k` while help is open still navigates the underlying view.

Fix: gate handler on `!helpOpen` (expose state from store or via a ref).

Confidence: 80

### 13. [Bug] `server/utils/git.ts:5-11` — singleton serializes concurrent calls

Module-level `simpleGit` singleton; simple-git serializes commands per instance. The `Promise.all` parallelism in `diffs/[sha].get.ts` and `diffs-range.get.ts` is defeated — calls queue.

Fix: instantiate per request (cheap), or run git via raw subprocess.

Confidence: 80

## Summary

- 9 bugs
- 3 security concerns (#1 RCE-class, #2 sha/file injection, #3 no Origin check)
- 0 CLAUDE.md violations (no repo CLAUDE.md)

Top fixes by impact:
1. #1 — RCE via `--output` flag injection
2. #6 — Esc-cancel becomes confirm (data-loss UX)
3. #4 — silent client cache corruption
4. #5 — root-commit crash
5. #7 — back/forward broken

## Method

4 parallel review agents (Sonnet) over the whole repo:
- Bug detection
- Security & error handling
- Architecture and correctness
- UX/frontend quality

Findings deduped and filtered to confidence ≥80.

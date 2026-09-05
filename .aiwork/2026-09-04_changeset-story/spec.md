---
references:
  - "Inspiration: https://www.coderabbit.ai/blog/introducing-change-stack-the-first-ai-native-code-review-interface"
  - "Builds on: branch review (store.selectBranchReview, server/api/diff-branch.get.ts, DiffView.vue pendingScrollLine)"
  - "Verified locally: claude 2.1.260 — `-p --output-format stream-json --include-partial-messages` emits `stream_event` / `text_delta`; `--tools \"\"`, `--setting-sources`, `--no-session-persistence` exist. A user SessionStart hook fired under -p ⇒ `--setting-sources \"\"` is required."
  - "h3 1.15 `createEventStream()` available for SSE"
---

# Changeset Story — intent-grouped walkthrough of a feature branch

## Goal

One button switches branch review into a **Story view**: the branch as an
ordered list of change groups, each with a very short summary and the
*relevant hunks only*. Reviewers skim the story first; the classic full diff
is one click away and stays unchanged.

CodeRabbit's framing (orientation only): "change cohorts" split into "ordered
layers that reflect the natural reading order of the change", navigation "by
intent instead of the raw file order".

Grouping is produced by the **local Claude Code CLI, model `sonnet`, hard-coded**.
gv handles no API keys.

## Non-negotiables

- **Skimmable.** Hard length caps on every model string, enforced in the prompt
  and re-truncated server-side. No paragraphs anywhere.
- **On demand only.** Nothing runs until the button is clicked. A reload shows a
  story only if a persisted result exists.
- **Degrades to the classic UI.** Any failure ⇒ one-line notice, branch review
  untouched.
- **Classic diff is the source of truth.** Story view is a reading layer;
  comments, widgets, side-by-side stay in the classic view.

---

## 1. UX

### Entry point
Button **`Story`** in the DiffView header (next to side-by-side / expand-all).
Visible only when `store.isReview && !store.focusPath`.

States:
- **idle** — `Story`.
- **loading** — `Grouping 23 files…` + elapsed seconds; click = cancel. Groups
  appear progressively (§3.4) so the view opens as soon as the header arrives.
- **ready** — Story view is open. Its header has `Diff` (back to classic) and
  `↻ Regenerate`. Coming back via `Story` button re-opens without re-running.
- **error** — one-line red notice under the classic header, auto-hide 8 s.

### Story view = its own layout
Replaces the whole classic 3-pane grid. Left commit pane is hidden to give the
content room (`Esc` or `Diff` returns; the URL keeps `review=1` so state is
preserved).

```
┌ Story · main..HEAD · 23 files · 6 groups            [↻] [Diff] ┐
│ Add comment authoring with plain-text output                   │  title ≤ 60
│ Drafts live in the store; Finish prints them as text.          │  summary ≤ 120
├───────────────┬────────────────────────────────────────────────┤
│ OUTLINE 260px │ DOCUMENT (scrolls)                             │
│               │                                                │
│ 1 Comment     │ ▎1  Comment model & index               feat   │
│   model…  3   │ ▎   Shared thread type, one index for all.     │
│ 2 Composer 2  │                                                │
│ 3 Finish   2  │   app/types/comments.ts · thread + anchor      │  item header
│ 4 Overview 4  │   ┌ @@ +1,42 ─────────────────────────────┐   │  excerpt
│ 5 Nav      3  │   │ 1 +export interface CommentThread {   │   │  (unified,
│ 6 Other    2  │   │ 2 +  id: string                       │   │   compact)
│               │   │ … 30 more lines · open in diff ↗      │   │
│               │   └───────────────────────────────────────┘   │
│               │   app/stores/viewer.ts · index getter          │
│               │   ┌ @@ +212,18 ─────…                          │
│               │                                                │
│               │ ▎2  Composer UI                         feat   │
└───────────────┴────────────────────────────────────────────────┘
```

Document, per group: numbered header (title ≤ 40, kind tag, summary ≤ 90),
then **items**: file path + note (≤ 40) and an **excerpt per referenced hunk**.
A file appears under **every** group that references it, each time with only
that group's hunks (resolved: duplicate, show relevant parts).

Excerpt rendering: own lightweight component (`HunkExcerpt.vue`), unified only,
`+`/`-`/context coloring, new-side line numbers, monospace, capped at
**60 lines** with `… N more lines · open in diff ↗`. No `@git-diff-view`
here — it needs full file contents and split-mode plumbing we don't want in the
skim view.

Clicking a file path or `open in diff ↗` ⇒ leave Story view, classic review with
`selectFile(path)` + `pendingScrollLine = { path, line: hunk.newStart, side:'new' }`
(existing scroll+flash watcher).

Outline (left column): group number, title, item count; current group
highlighted by scroll spy (IntersectionObserver on group headers). Click ⇒
scroll document to group.

### Keys (Story view only)
- `j` / `k` — next / previous **item** (scroll into view, subtle highlight).
- `]` / `[` — next / previous **group**.
- `Enter` — open focused item in classic diff.
- `Esc` — back to classic diff.
- Add to `HotkeyHelp.vue`.

---

## 2. Data model

```ts
// app/types/story.ts
export type StoryKind = 'feat' | 'fix' | 'refactor' | 'test' | 'docs' | 'config' | 'chore' | 'other'

export interface StoryHunk {
  id: string           // "app/x.ts#2" — path + 1-based hunk index in the branch patch
  newStart: number     // from @@ header
  oldStart: number
  header: string       // "@@ -100,7 +120,15 @@ fn name"
  lines: string[]      // raw patch lines (' ', '+', '-' prefixed), capped server-side
  truncatedLines: number // lines dropped by the cap, 0 if none
}
export interface StoryItem {
  path: string
  note: string         // ≤ 40 chars
  hunks: StoryHunk[]   // resolved server-side; [] for binary / excluded files
}
export interface StoryGroup {
  id: string           // "g1".."gN"
  title: string        // ≤ 40
  summary: string      // ≤ 90
  kind: StoryKind
  items: StoryItem[]
}
export interface ChangesetStory {
  base: string; head: string; headSha: string; mergeBase: string
  title: string; summary: string
  groups: StoryGroup[]
  model: string; durationMs: number; createdAt: string
  truncated: boolean   // model input was cut (§3.3)
}
```

Store (`app/stores/viewer.ts`):
```ts
story: ChangesetStory | null
storyStatus: 'idle' | 'loading' | 'ready' | 'error'
storyError: string
storyView: boolean                     // Story layout open
storyActive (getter) = isReview && !focusPath && storyView && story !== null
async buildStory({ force = false } = {})   // opens SSE, fills story progressively
cancelStory()
openStory() / closeStory()             // toggle view; openStory() with no story ⇒ buildStory()
async loadPersistedStory()             // GET /api/story?range= ; used by init when ?story=1
```
Invalidation: `story.headSha !== context.head` after commits/refresh ⇒ drop the
in-memory story (the persisted file for the old sha stays on disk).

---

## 3. Server

### 3.1 Endpoints
- `GET /api/story?range=` → persisted `ChangesetStory` for the current
  `mergeBase..headSha`, or `404`. Never triggers generation.
- `POST /api/story` body `{ range, force? }` → **SSE** stream (`createEventStream`):
  - `event: meta` `{ base, head, headSha, mergeBase, files, truncated }`
  - `event: header` `{ title, summary }`
  - `event: group` `StoryGroup` (fully resolved, hunks included) — one per group as it parses
  - `event: done` `ChangesetStory` (final, repaired, persisted)
  - `event: error` `{ message }`
  Client disconnect ⇒ `child.kill('SIGTERM')`.
  Existing origin middleware covers both routes.

### 3.2 Persistence
`<git-dir>/gv/story/<mergeBase>-<headSha>.json` (`git rev-parse --git-dir`,
so worktrees resolve correctly; nothing gets committed). Written on `done`,
overwritten by `force`. In-memory `LRU<ChangesetStory>(20)` in front of it.
Corrupt file ⇒ treated as missing.

### 3.3 Model input
Plain text on **stdin**:
```
REPO: git-history-viewer   BRANCH: feat/story   RANGE: main...HEAD
COMMITS (oldest first, max 50):
- 5d54fd1 fix(diff): land file-tree jumps on the right scroll position
FILES (23):
M app/stores/viewer.ts (3 hunks)
A app/components/ChangesetStory.vue (1 hunk)
M pnpm-lock.yaml (patch omitted)

=== app/stores/viewer.ts ===
--- hunk app/stores/viewer.ts#1  @@ -3,7 +3,9 @@
<patch lines>
--- hunk app/stores/viewer.ts#2  @@ -180,6 +182,20 @@
<patch lines>
```
- Hunks are **pre-numbered per file**; the model references `"path#n"`. This is
  far more robust than asking it to copy line ranges.
- Patch omitted (listed only): lockfiles (`pnpm-lock.yaml`, `package-lock.json`,
  `yarn.lock`, `*.lock`), binaries, `dist/`, `.output/`, `*.min.*`, `*.snap`, `*.map`.
- Budget **200 000 chars**. Over ⇒ per-file cap = budget / files, keep hunk
  headers + first N lines per hunk, mark `[… truncated]`, `truncated: true`,
  UI shows a `partial` tag in the header.
- Source of the patch: same `git diff base...head` as `diff-branch.get.ts`
  (`splitPatchByFile` → then split by `^@@`). Share the helper.

### 3.4 Invoking Claude Code, progressive output
```
claude -p
  --model sonnet
  --tools ""
  --setting-sources ""            # verified: a user SessionStart hook otherwise runs
  --no-session-persistence
  --output-format stream-json
  --include-partial-messages
  --verbose
  --system-prompt <§3.6>
```
`cwd` = `os.tmpdir()`, env passthrough unchanged. Timeout 180 s ⇒ kill + error.
No cost ceiling (subscription usage).

Output format is **NDJSON, one object per line**, not `--json-schema`
(structured output arrives only at the end and cannot stream). Lines:
```
{"type":"header","title":"…","summary":"…"}
{"type":"group","title":"…","summary":"…","kind":"feat","items":[{"path":"app/x.ts","note":"…","hunks":["app/x.ts#1","app/x.ts#3"]}]}
…
{"type":"end"}
```
Server concatenates `text_delta` chunks, splits on `\n`, `JSON.parse`s each
complete line (skips blank / non-JSON lines, tolerates a ```` ```json ```` fence),
validates, resolves hunk ids → `StoryHunk` excerpts, emits `group` immediately.
The final `result` message is used only for `is_error` / stderr text.

### 3.5 Validation + repair (per group on arrival, plus once at `end`)
- Truncate strings to caps with `…`; unknown `kind` ⇒ `other`.
- Drop hunk ids that don't exist; drop items whose `path` isn't in the diff;
  drop empty groups (an item with a valid path but zero valid hunks survives as
  file-level, e.g. lockfile).
- Cap 12 groups; further groups merged into the last one.
- At `end`: every **hunk** must be referenced ≥ 1 time. Unreferenced hunks ⇒
  appended group `Other` (`kind:'other'`, summary `Remaining changes.`), one
  item per file. Same for files with no hunks (binary) that were never named.
- 0 groups ⇒ `error: Claude returned no usable groups`.
- Assign `g1..gN`, persist.

### 3.6 System prompt (draft, tune on 3 real branches before UI polish)
```
You turn a git branch diff into an ordered "changeset story" for a reviewer who
will only skim. Output NDJSON: one JSON object per line, nothing else — no
markdown, no commentary.

Line 1: {"type":"header","title":"<=60 chars","summary":"<=120 chars"}
Then one line per group, in reading order:
{"type":"group","title":"<=40 chars noun phrase","summary":"<=90 chars, one sentence",
 "kind":"feat|fix|refactor|test|docs|config|chore|other",
 "items":[{"path":"<file from FILES>","note":"<=40 chars, 2-5 words","hunks":["path#n", ...]}]}
Last line: {"type":"end"}

Rules:
- Group by INTENT (what a change accomplishes), never by directory or file type.
- Reading order: types/data first, then core logic, then UI/entry points, then
  tests, docs, config. Prerequisites before dependents.
- 2-8 groups. Merge tiny ones; split a group with two intents.
- Reference hunks by the exact ids given (e.g. app/x.ts#2). A file may appear
  in several groups with different hunks. Every hunk belongs somewhere.
- Files marked "patch omitted" get an item with "hunks":[].
- Style: telegraphic, active voice, no trailing periods in titles/notes, no
  file names inside title/summary/note, no filler ("this change", "various").
- Describe; do not review, judge, or suggest.
```

---

## 4. Client wiring

- `store.buildStory()`: `fetch('/api/story', { method:'POST', body, signal })`
  + manual SSE parse of the response body (EventSource can't POST). On `header`
  set `story` skeleton + `storyView = true`; append on `group`; replace on
  `done`; `error` ⇒ status error + close view if still empty.
- `store.init()`: if `?story=1 && canReview` ⇒ `loadPersistedStory()`, open only
  on `200`. Never generate on load.
- `app/pages/index.vue`: `<StoryView v-if="store.storyActive" />` else the
  classic grid. Key handler branches on `storyActive`.
- `StoryView.vue` (new) — header, outline, document; scroll spy; keys.
- `StoryGroup.vue`, `HunkExcerpt.vue` (new) — presentational.
- `DiffView.vue` — `Story` button + states + error notice.
- `HotkeyHelp.vue` — new rows.

---

## 5. Files touched

- `server/api/story.post.ts` (new) — SSE, spawn, NDJSON parse, repair, persist.
- `server/api/story.get.ts` (new) — persisted lookup.
- `server/utils/storyInput.ts` (new) — hunk splitting/numbering, exclusions, budget.
- `server/utils/storyRepair.ts` (new) — validation/repair, pure + unit-testable.
- `server/utils/storyStore.ts` (new) — `<git-dir>/gv/story/*.json` read/write + LRU.
- `app/types/story.ts` (new).
- `app/stores/viewer.ts` — story state/actions, invalidation, `?story=1`.
- `app/components/StoryView.vue`, `StoryGroup.vue`, `HunkExcerpt.vue` (new).
- `app/components/DiffView.vue` — button, notice.
- `app/pages/index.vue` — layout switch, keys.
- `app/components/HotkeyHelp.vue`.
- `README.md` — Story section: needs Claude Code installed and logged in; what
  is sent (diff + commit subjects); where results are cached.

## 6. Out of scope (MVP)

- Non-branch selections (single commit, ranges, staged/unstaged).
- Layers inside groups, diagrams, per-line AI notes.
- Comments/widgets inside Story view (open in diff instead).
- Model selection UI or env override.
- Cost ceiling.
- Editing/reordering groups by hand.

## 7. Risks / notes

- **Grouping quality is the feature.** Iterate the prompt on real branches
  first; keep it in one file.
- **NDJSON robustness.** Sonnet follows line-per-object well, but keep the parser
  forgiving (fences, trailing commas ⇒ line skipped, not fatal) and rely on
  the `end` repair to fill gaps.
- **Latency.** 10–40 s typical; progressive groups hide most of it.
- **Privacy.** Diff leaves the machine through the user's Claude login; README
  says so; the button is the consent.

## 8. Resolved decisions

- Branch review only.
- Files duplicated per group, showing only that group's hunks.
- Story view is its own layout focused on groups/summaries; classic diff untouched and one click away.
- `sonnet` hard-coded.
- Persist to `<git-dir>/gv/story/`.
- Generation only on demand; reload reuses persisted result only.
- Progressive rendering via NDJSON over stream-json → SSE.
- No cost ceiling.

## 9. Open

- Excerpt line cap 60 and 200k input budget are guesses; adjust after trying real branches.

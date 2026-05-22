---
references:
  - "Builds on: --collect MVP (CommentComposer.vue, finish.post.ts, store add/remove/finishReview)"
  - "Shared spine: app/types/comments.ts buildCommentIndex(), CommentThread.vue, DiffView.vue"
---

# Comment authoring UX — edit, overview, navigation, plain-text output

## Goal

Extend `--collect` MVP. Three additions + one change:
1. **Plain-text output** (replace JSON block; consumer = AI agent).
2. **Edit** an authored comment.
3. **Overview panel** — list all comments, click → navigate to code.

All built on the existing shared comment spine (no parallel system).

## Shared architecture (answer to "does it share logic?")

Already shared, keep it that way:
- `app/types/comments.ts` — `CommentThread` model + `buildCommentIndex()` (path/line/side, file-level, PR-level).
- store `commentIndex` getter — merges loaded `--comments` + authored `draft-*` into one index.
- `CommentThread.vue` — one renderer for all.
- `DiffView.vue` — inline (`#extend`), file-level, PR-level, orphan panel.

New work = new views/actions over the SAME index + model. Only split = provenance: `draft-*` id ⇒ editable/authored; everything else ⇒ read-only loaded. Editability already factored as `isDraft(id)`.

Centralization: keep everything in the Pinia store (no `useComments()` composable for MVP — store already holds it; avoid premature abstraction). [resolved]

---

## 1. Plain-text output

Plain text **only** — drop JSON entirely. [resolved: no `--json` opt-out]

Server (`finish.post.ts`) formats threads → text, emits on sentinel line; CLI prints between markers. Serializer lives **server-side only** — plain text is purely an output concern; client renders structurally and never needs it, so no cross-bundle sharing. [resolved Q6]

Format (markdown, grouped by file, line-sorted; PR-level under "General"):

```
# Review comments (3)

## bin/gv.mjs
- L47 (old): I move. I really like this.
- L50 (old): *asdfo*
  - aslidf

## General
- Overall the CLI parsing is clean.
```

Rules:
- group by `anchor.path`; sort files, then by line.
- inline: `L<line>[-<endLine>] (<side>): <body>`; default side `new` ⇒ omit `(new)`, only show `(old)`.
- file-level (no line): `L— (file): <body>`.
- PR-level (anchor null) ⇒ `## General` section.
- multiline body: indent continuation lines 2 spaces (keeps markdown list intact).
- only authored `draft-*` threads go to output (loaded `--comments` excluded — agent already has them).

Output only authored threads. Empty ⇒ `# Review comments (0)\n(none)`.

**Q2:** keep JSON available behind a flag (`--collect --json`) or drop entirely?

## 2. Edit authored comment

- `CommentComposer.vue`: add `initialValue?: string` prop, prefill `text`.
- `CommentThread.vue`: when `editable` (already gated by `deletable`/`isDraft`), add pencil ✎ next to ✕. Emits `edit`.
- DiffView/overview: clicking ✎ swaps the rendered thread for a `CommentComposer` prefilled with `comments[0].body`; save → `store.editComment(id, body)`; cancel → revert.
- store `editComment(id, body)`: set `thread.comments[0].body = body.trim()` (single-comment threads in MVP). No-op if not found or empty.
- Loaded (read-only) comments: no ✎.
- Inline edit reuses the same memoized-`:data` rule (editing must not recreate DiffFile / close widget). Edit happens outside lib widget (in `#extend`), so lower risk, but verify.

## 3. Overview panel + navigation

### View
- **Placement: left-pane tab.** [resolved Q4] Left pane (currently `CommitList`, 320px in `index.vue` grid) gets a tab strip: `Commits` | `Comments (N)` (N = `commentIndex.total`). Selecting `Comments` swaps `CommitList` for `CommentsOverview` in the same pane. Diff + file panes unchanged.
- Overview lists every thread grouped by file (`commentIndex.byPath` + `prLevel` + orphans). Each row: anchor label (`path:line (side)`) + body preview (first line) + status dot + provenance badge (authored vs loaded) + ✎/✕ for authored.
- **New `CommentRow.vue`** for overview rows (compact: anchor + 1-line preview + click-to-navigate + edit/delete). `CommentThread.vue` stays the full renderer. [resolved Q3]

### Navigate (click row → code)
Click row → `store.navigateToComment(thread)`:
1. restore the diff context the comment belongs to (see below),
2. `selectFile(anchor.path)`,
3. scroll file into view (existing `scrollToFile`), then scroll to `[data-line="<line>"]` on the right side, flash highlight.
4. close overview.

**Context problem (the hard part):** an inline comment only renders when its file+line are in the *currently selected* diff (commit / range / changes / review). Authored drafts have no stored context ⇒ may be orphan when viewed under a different selection.

**Approach: accurate navigation via stamped context, graceful when unresolvable.** [resolved Q5]
When authoring, stamp each draft thread with the active selection. Client-only field:
```
thread._source?: { sha?: string; range?: string; changes?: 'staged'|'unstaged'|''; review?: boolean; focus?: string }
```
(underscore = not emitted to output; in-memory only.) `navigateToComment` re-applies `_source` via existing `selectCommit` / `selectChanges` / `selectBranchReview`, then file+line scroll + highlight.

**Unresolvable cases must give UI feedback (never silent):**
- loaded comment (no `_source`), or `_source` restore still doesn't surface the line ⇒ select the file if present + scroll; else flash a brief inline notice ("Couldn't locate in this diff — see Unattached") and ensure it shows in the existing orphan/unattached panel.
- acceptable for some clicks to land in the unattached panel rather than inline — the requirement is feedback, not guaranteed inline resolution.

### Line highlight
- DiffView: after scroll, add `.comment-target` class to the line row for ~1.5s. Need a store signal (e.g. `pendingScrollLine: {path,line,side}`) DiffView watches. Reuse existing `selectedFile` scroll watcher pattern.

---

## Files touched

- `server/api/finish.post.ts` — format threads → plain text (serializer lives here / a `server/utils/` helper; server-only).
- `bin/gv.mjs` — markers stay as-is.
- `app/stores/viewer.ts` — `editComment(id, body)`, `navigateToComment(thread)`, `pendingScrollLine`, `overviewTab` state, stamp `_source` on `addComment`.
- `app/types/comments.ts` — optional client-only `_source` field on `CommentThread`.
- `app/components/CommentComposer.vue` — `initialValue` prop (prefill for edit).
- `app/components/CommentThread.vue` — edit (✎) affordance + `edit` emit (authored only).
- `app/components/CommentRow.vue` (new) — compact overview row (anchor + preview + navigate + ✎/✕).
- `app/components/CommentsOverview.vue` (new) — left-pane overview list, grouped by file.
- `app/pages/index.vue` — left-pane tab strip (`Commits` | `Comments`), swap `CommitList`/`CommentsOverview`.
- `app/components/DiffView.vue` — edit-in-place in `#extend`/file/PR slots; scroll-to-line + flash highlight driven by `pendingScrollLine`; unresolved-navigation notice.

## Out of scope (MVP)

- Replies / multi-comment threads.
- Resolving threads from UI.
- Persisting drafts across reload.
- Editing loaded `--comments`.

## Resolved decisions

- Q1 → keep in Pinia store, no composable.
- Q2 → plain text only, drop JSON.
- Q3 → new `CommentRow.vue` for overview; `CommentThread.vue` stays full renderer.
- Q4 → left-pane tab (`Commits` | `Comments`).
- Q5 → accurate nav via stamped `_source`; graceful UI feedback when unresolvable (orphan panel + notice).
- Q6 → serializer server-side only (output concern, no cross-bundle sharing).
- Q7 → MVP threads are single-comment; edit targets `comments[0]`, no replies.

## Open

- None blocking. Confirm overview row preview = first line of `comments[0].body` truncated (assumed).

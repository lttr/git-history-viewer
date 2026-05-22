import { defineStore } from 'pinia'
import { nextTick } from 'vue'
import type { CommentsDoc, CommentIndex, CommentThread, CommentAnchor } from '~/types/comments'
import { buildCommentIndex } from '~/types/comments'

// Line numbers present in a unified-diff patch, per side. Used to detect
// inline comments anchored to a line that isn't in the diff being viewed.
function presentLines(patch: string): { new: Set<number>; old: Set<number> } {
  const res = { new: new Set<number>(), old: new Set<number>() }
  if (!patch) return res
  let oldLn = 0
  let newLn = 0
  for (const line of patch.split('\n')) {
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (h) { oldLn = Number(h[1]); newLn = Number(h[2]); continue }
    const c = line[0]
    if (c === '+') res.new.add(newLn++)
    else if (c === '-') res.old.add(oldLn++)
    else if (c === '\\') { /* "\ No newline at end of file" */ }
    else { res.new.add(newLn++); res.old.add(oldLn++) }
  }
  return res
}

let selectFetchId = 0
const commitCache = new Map<string, { detail: CommitDetail; diffs: DiffsPayload }>()
const MAX_CACHE = 100
function cacheKey(sha: string, focus: string) {
  return focus ? `${focus}::${sha}` : sha
}
function cacheSet(sha: string, focus: string, value: { detail: CommitDetail; diffs: DiffsPayload }) {
  const k = cacheKey(sha, focus)
  if (commitCache.has(k)) commitCache.delete(k)
  commitCache.set(k, value)
  if (commitCache.size > MAX_CACHE) {
    const first = commitCache.keys().next().value
    if (first !== undefined) commitCache.delete(first)
  }
}

export interface Commit {
  hash: string
  shortHash: string
  subject: string
  author: string
  email: string
  date: string
}

export interface CommitFile {
  path: string
  status: string
  oldPath?: string
}

export interface CommitDetail {
  hash: string
  author: string
  email: string
  date: string
  subject: string
  body: string
  parents: string[]
  isMerge: boolean
  files: CommitFile[]
}

export interface FileDiff {
  path: string
  oldPath?: string
  status: string
  patch: string
  oldContent: string
  newContent: string
  isBinary: boolean
}

export interface DiffsPayload {
  sha: string
  parent?: string
  files: FileDiff[]
}

export interface RepoContext {
  branch: string
  base: string
  defaultRange: string
  head: string
  repo: string
  filePath: string
  collect?: boolean
}

export type ChangesKind = 'staged' | 'unstaged'

interface UrlState {
  repo: string
  range: string
  shas: string[]
  file: string
  focus: string
  changes: ChangesKind | ''
  review: boolean
}

function readUrl(): UrlState {
  if (typeof window === 'undefined') return { repo: '', range: '', shas: [], file: '', focus: '', changes: '', review: false }
  const p = new URLSearchParams(window.location.search)
  const shaRaw = p.get('sha') ?? ''
  const shas = shaRaw.split(',').map((s) => s.trim()).filter(Boolean)
  const ch = p.get('changes') ?? ''
  const changes: ChangesKind | '' = ch === 'staged' || ch === 'unstaged' ? ch : ''
  return {
    repo: p.get('repo') ?? '',
    range: p.get('range') ?? '',
    shas,
    file: p.get('file') ?? '',
    focus: p.get('focus') ?? '',
    changes,
    review: p.get('review') === '1',
  }
}

let suppressPopstate = false
function writeUrl(patch: Partial<UrlState>, mode: 'replace' | 'push' = 'replace') {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const setOrDel = (key: string, val: string | undefined) => {
    if (val === undefined) return
    if (val) url.searchParams.set(key, val)
    else url.searchParams.delete(key)
  }
  if (patch.repo !== undefined) setOrDel('repo', patch.repo)
  if (patch.range !== undefined) setOrDel('range', patch.range)
  if (patch.shas !== undefined) {
    const joined = patch.shas.map((s) => s.slice(0, 8)).join(',')
    setOrDel('sha', joined)
  }
  if (patch.changes !== undefined) setOrDel('changes', patch.changes)
  if (patch.review !== undefined) setOrDel('review', patch.review ? '1' : '')
  if (patch.file !== undefined) setOrDel('file', patch.file)
  if (patch.focus !== undefined) setOrDel('focus', patch.focus)
  url.hash = ''
  const target = url.toString()
  if (target === window.location.href) return
  suppressPopstate = true
  if (mode === 'push') history.pushState(null, '', target)
  else history.replaceState(null, '', target)
  suppressPopstate = false
}

export interface DiffsRangePayload {
  shas: string[]
  from: string
  to: string
  base: string
  files: FileDiff[]
}

export interface DiffBranchPayload {
  base: string
  head: string
  range: string
  files: FileDiff[]
}

export const useViewerStore = defineStore('viewer', {
  state: () => ({
    context: null as RepoContext | null,
    range: '' as string,
    rangeError: '' as string,
    commits: [] as Commit[],
    commitsLoading: false,
    commitsDone: false,
    commitDetail: null as CommitDetail | null,
    diffs: null as DiffsPayload | null,
    diffsLoading: false,
    selectedSha: '' as string,
    selectedShas: [] as string[],
    lastPivotSha: '' as string,
    selectedFile: '' as string,
    skipNextScroll: false,
    diffMode: 'split' as 'split' | 'unified',
    changesSummary: { unstaged: 0, staged: 0 } as { unstaged: number; staged: number },
    selectedChanges: '' as ChangesKind | '',
    selectedReview: false,
    focusPath: '' as string,
    initialSnapshot: null as null | {
      range: string
      focus: string
      shas: string[]
      changes: ChangesKind | ''
      review: boolean
    },
    commentsDoc: null as CommentsDoc | null,
    collect: false,
    submitted: false,
  }),
  getters: {
    commentIndex(): CommentIndex {
      return buildCommentIndex(this.commentsDoc)
    },
    // Comments authored in this session (collect mode); the only ones sent back
    // to the agent on finish. Loaded --comments threads keep their own ids.
    draftThreads(): CommentThread[] {
      return (this.commentsDoc?.threads ?? []).filter((t) => t.id.startsWith('draft-'))
    },
    // Threads that can't render anywhere in the current diff: their file isn't
    // in the changeset, or their line isn't present in the patch. Surfaced in
    // an "unattached" panel so no comment is silently lost.
    orphanComments(): CommentThread[] {
      const idx = this.commentIndex
      if (!idx.total) return []
      const byPath = new Map((this.diffs?.files ?? []).map((f) => [f.path, f]))
      const out: CommentThread[] = []
      for (const path of Object.keys(idx.byPath)) {
        const fc = idx.byPath[path]
        const file = byPath.get(path)
        if (!file) {
          out.push(...fc.fileLevel)
          for (const side of ['new', 'old'] as const) {
            for (const ts of Object.values(fc.byLine[side])) out.push(...ts)
          }
          continue
        }
        const present = presentLines(file.patch)
        for (const side of ['new', 'old'] as const) {
          for (const [ln, ts] of Object.entries(fc.byLine[side])) {
            if (!present[side].has(Number(ln))) out.push(...ts)
          }
        }
      }
      return out
    },
    isMulti(): boolean {
      return this.selectedShas.length > 1
    },
    isChanges(): boolean {
      return !!this.selectedChanges
    },
    isReview(): boolean {
      return this.selectedReview
    },
    // Branch review needs a base..head range; "all history" or a bare HEAD has
    // no base to diff against.
    canReview(): boolean {
      return /\.\.\.?/.test(this.range)
    },
    selectedCommits(): Commit[] {
      const set = new Set(this.selectedShas)
      return this.commits.filter((c) => set.has(c.hash))
    },
  },
  actions: {
    async init() {
      if (!this.context) {
        this.context = await $fetch<RepoContext>('/api/context')
      }
      this.collect = !!this.context.collect
      if (!this.commentsDoc) {
        try {
          this.commentsDoc = await $fetch<CommentsDoc>('/api/comments')
        } catch {
          this.commentsDoc = { version: 1, threads: [] }
        }
      }
      const urlState = readUrl()
      this.range = urlState.range || this.context.defaultRange
      this.focusPath = urlState.focus || this.context.filePath || ''
      writeUrl({ repo: this.context.repo, range: this.range, focus: this.focusPath })
      await Promise.all([
        this.loadMore({ autoSelect: false }),
        this.refreshChanges(),
      ])
      if (urlState.review && this.canReview) {
        await this.selectBranchReview(urlState.file)
      } else if (urlState.changes) {
        await this.selectChanges(urlState.changes, urlState.file)
      } else if (urlState.shas.length) {
        const resolved = await Promise.all(urlState.shas.map((s) => this.resolveSha(s)))
        const filtered = resolved.filter((x): x is string => !!x)
        if (filtered.length > 1) await this.setMultiSelection(filtered, urlState.file)
        else if (filtered.length === 1) await this.selectCommit(filtered[0], urlState.file)
        else if (this.changesSummary.unstaged > 0) await this.selectChanges('unstaged')
        else if (this.changesSummary.staged > 0) await this.selectChanges('staged')
        else if (this.commits[0]) await this.selectCommit(this.commits[0].hash)
      } else if (this.changesSummary.unstaged > 0) {
        await this.selectChanges('unstaged')
      } else if (this.changesSummary.staged > 0) {
        await this.selectChanges('staged')
      } else if (this.commits[0]) {
        await this.selectCommit(this.commits[0].hash)
      }
      this.initialSnapshot = {
        range: this.range,
        focus: this.focusPath,
        shas: [...this.selectedShas],
        changes: this.selectedChanges,
        review: this.selectedReview,
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('popstate', () => {
          if (suppressPopstate) return
          this.syncFromUrl()
        })
      }
    },
    async resetView() {
      const snap = this.initialSnapshot
      if (!snap) return
      this.range = snap.range
      this.focusPath = snap.focus
      this.rangeError = ''
      this.commits = []
      this.commitsDone = false
      this.commitDetail = null
      this.diffs = null
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.selectedFile = ''
      this.selectedChanges = ''
      this.selectedReview = false
      commitCache.clear()
      writeUrl(
        { range: snap.range, focus: snap.focus, shas: [], changes: '', review: false, file: '' },
        'push',
      )
      await Promise.all([
        this.loadMore({ autoSelect: false }),
        this.refreshChanges(),
      ])
      if (snap.review) await this.selectBranchReview()
      else if (snap.changes) await this.selectChanges(snap.changes)
      else if (snap.shas.length > 1) await this.setMultiSelection(snap.shas)
      else if (snap.shas.length === 1) await this.selectCommit(snap.shas[0])
      else if (this.changesSummary.unstaged > 0) await this.selectChanges('unstaged')
      else if (this.changesSummary.staged > 0) await this.selectChanges('staged')
      else if (this.commits[0]) await this.selectCommit(this.commits[0].hash)
    },
    async resolveSha(s: string): Promise<string> {
      if (!/^[0-9a-f]{4,64}$/i.test(s)) return ''
      const hit = this.commits.find((c) => c.hash.startsWith(s))
      if (hit) return hit.hash
      try {
        const detail = await $fetch<{ hash: string }>(`/api/commit/${s}`, {
          query: this.focusPath ? { path: this.focusPath } : {},
        })
        return detail.hash
      } catch { return '' }
    },
    async syncFromUrl() {
      const s = readUrl()
      const focusChanged = s.focus !== this.focusPath
      if (focusChanged) {
        this.focusPath = s.focus
        commitCache.clear()
      }
      if (s.range !== this.range || focusChanged) {
        this.range = s.range
        await this.reloadCommits()
      }
      if (s.review && this.canReview) {
        await this.selectBranchReview(s.file)
        return
      }
      if (s.changes) {
        await this.selectChanges(s.changes, s.file)
        return
      }
      const resolved = await Promise.all(s.shas.map((x) => this.resolveSha(x)))
      const filtered = resolved.filter((x): x is string => !!x)
      if (filtered.length > 1) await this.setMultiSelection(filtered, s.file)
      else if (filtered.length === 1) await this.selectCommit(filtered[0], s.file)
    },
    async setFocus(path: string) {
      const next = (path || '').trim()
      if (next === this.focusPath) return
      this.focusPath = next
      commitCache.clear()
      writeUrl({ focus: next, shas: [], changes: '', review: false, file: '' }, 'push')
      this.commitDetail = null
      this.diffs = null
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.selectedFile = ''
      this.selectedChanges = ''
      this.selectedReview = false
      await Promise.all([this.reloadCommits(), this.refreshChanges()])
    },
    async clearFocus() {
      await this.setFocus('')
    },
    async setRange(range: string) {
      this.range = range.trim()
      // A branch range only makes sense for review; leaving it would strand the
      // pile against a base that's no longer selected.
      if (this.selectedReview && !this.canReview) this.selectedReview = false
      writeUrl({ range: this.range, review: this.selectedReview ? true : undefined }, 'push')
      await this.reloadCommits()
      if (this.selectedReview) await this.selectBranchReview()
    },
    async reloadCommits() {
      this.commits = []
      this.commitsDone = false
      this.rangeError = ''
      const keepSelection = this.selectedChanges || this.selectedReview
      if (!keepSelection) {
        this.commitDetail = null
        this.diffs = null
        this.selectedSha = ''
        this.selectedShas = []
        this.lastPivotSha = ''
        this.selectedFile = ''
      }
      await this.loadMore({ autoSelect: !keepSelection })
    },
    async refreshChanges() {
      try {
        this.changesSummary = await $fetch<{ unstaged: number; staged: number }>('/api/changes', {
          query: this.focusPath ? { path: this.focusPath } : {},
        })
      } catch {
        this.changesSummary = { unstaged: 0, staged: 0 }
      }
    },
    async selectChanges(kind: ChangesKind, preferFile = '') {
      this.selectedChanges = kind
      this.selectedReview = false
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.commitDetail = null
      writeUrl({ changes: kind, shas: [], review: false }, 'push')
      const my = ++selectFetchId
      this.diffsLoading = true
      try {
        const payload = await $fetch<{ kind: ChangesKind; files: FileDiff[] }>(
          `/api/changes/${kind}`,
          { query: this.focusPath ? { path: this.focusPath } : {} },
        )
        if (my !== selectFetchId) return
        this.diffs = { sha: '', parent: '', files: payload.files }
        const picked = preferFile && payload.files.some((f) => f.path === preferFile)
          ? preferFile
          : payload.files[0]?.path ?? ''
        this.skipNextScroll = picked === (payload.files[0]?.path ?? '')
        this.selectedFile = picked
        writeUrl({ file: this.selectedFile })
        this.refreshChanges()
      } finally {
        if (my === selectFetchId) this.diffsLoading = false
      }
    },
    // Whole-branch review: every change from the merge-base to HEAD in one
    // aggregate diff. Individual commits stay clickable in the list to drill in.
    async selectBranchReview(preferFile = '') {
      this.selectedReview = true
      this.selectedChanges = ''
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.commitDetail = null
      writeUrl({ review: true, shas: [], changes: '' }, 'push')
      const my = ++selectFetchId
      this.diffsLoading = true
      try {
        const payload = await $fetch<DiffBranchPayload>('/api/diff-branch', {
          query: {
            range: this.range,
            ...(this.focusPath ? { path: this.focusPath } : {}),
          },
        })
        if (my !== selectFetchId) return
        this.diffs = { sha: payload.head, parent: payload.base, files: payload.files }
        const picked = preferFile && payload.files.some((f) => f.path === preferFile)
          ? preferFile
          : payload.files[0]?.path ?? ''
        this.skipNextScroll = picked === (payload.files[0]?.path ?? '')
        this.selectedFile = picked
        writeUrl({ file: this.selectedFile })
      } catch (e: any) {
        if (my !== selectFetchId) return
        this.diffs = { sha: '', parent: '', files: [] }
        this.rangeError = e?.data?.message || e?.message || 'Failed to load branch diff'
      } finally {
        if (my === selectFetchId) this.diffsLoading = false
      }
    },
    async loadMore(opts: { autoSelect?: boolean } = {}) {
      const autoSelect = opts.autoSelect ?? true
      if (this.commitsLoading || this.commitsDone) return
      this.commitsLoading = true
      try {
        const data = await $fetch<Commit[]>('/api/log', {
          query: {
            skip: this.commits.length,
            limit: 200,
            range: this.range,
            ...(this.focusPath ? { path: this.focusPath } : {}),
          },
        })
        if (!data.length) this.commitsDone = true
        this.commits.push(...data)
        if (autoSelect && !this.selectedSha && this.commits[0]) {
          await this.selectCommit(this.commits[0].hash)
        }
      } catch (e: any) {
        this.rangeError = e?.data?.message || e?.message || 'Failed to load'
        this.commitsDone = true
      } finally {
        this.commitsLoading = false
      }
    },
    async selectCommit(sha: string, preferFile = '') {
      this.selectedChanges = ''
      this.selectedReview = false
      this.selectedSha = sha
      this.selectedShas = [sha]
      this.lastPivotSha = sha
      writeUrl({ shas: [sha], changes: '', review: false }, 'push')
      const my = ++selectFetchId
      const pickFile = (files: { path: string }[]) => {
        if (preferFile && files.some((f) => f.path === preferFile)) return preferFile
        return files[0]?.path ?? ''
      }
      const applyWithTransition = (detail: CommitDetail, diffs: DiffsPayload) => {
        const apply = () => {
          this.commitDetail = detail
          this.diffs = diffs
          const picked = pickFile(detail.files)
          this.skipNextScroll = picked === (detail.files[0]?.path ?? '')
          this.selectedFile = picked
          writeUrl({ file: this.selectedFile })
          return nextTick()
        }
        const doc = typeof document !== 'undefined' ? (document as any) : null
        if (doc?.startViewTransition) doc.startViewTransition(apply)
        else apply()
      }
      const focus = this.focusPath
      const cached = commitCache.get(cacheKey(sha, focus))
      if (cached) {
        applyWithTransition(cached.detail, cached.diffs)
        return
      }
      this.diffsLoading = true
      try {
        const q = focus ? { path: focus } : {}
        const [detail, diffs] = await Promise.all([
          $fetch<CommitDetail>(`/api/commit/${sha}`, { query: q }),
          $fetch<DiffsPayload>(`/api/diffs/${sha}`, { query: q }),
        ])
        if (my !== selectFetchId) return
        cacheSet(sha, focus, { detail, diffs })
        applyWithTransition(detail, diffs)
      } finally {
        if (my === selectFetchId) this.diffsLoading = false
      }
    },
    async setMultiSelection(shas: string[], preferFile = '') {
      const unique = [...new Set(shas)]
      if (unique.length === 0) return
      if (unique.length === 1) {
        await this.selectCommit(unique[0], preferFile)
        return
      }
      this.selectedChanges = ''
      this.selectedReview = false
      this.selectedShas = unique
      this.selectedSha = unique[0]
      if (!this.lastPivotSha || !unique.includes(this.lastPivotSha)) {
        this.lastPivotSha = unique[0]
      }
      writeUrl({ shas: unique, changes: '', review: false }, 'push')
      const my = ++selectFetchId
      this.diffsLoading = true
      try {
        const payload = await $fetch<DiffsRangePayload>('/api/diffs-range', {
          query: {
            shas: unique.join(','),
            ...(this.focusPath ? { path: this.focusPath } : {}),
          },
        })
        if (my !== selectFetchId) return
        this.commitDetail = null
        this.diffs = { sha: payload.to, parent: payload.base, files: payload.files }
        const picked = preferFile && payload.files.some((f) => f.path === preferFile)
          ? preferFile
          : payload.files[0]?.path ?? ''
        this.skipNextScroll = picked === (payload.files[0]?.path ?? '')
        this.selectedFile = picked
        writeUrl({ file: this.selectedFile })
      } finally {
        if (my === selectFetchId) this.diffsLoading = false
      }
    },
    async toggleCommit(sha: string) {
      const set = new Set(this.selectedShas)
      if (set.has(sha)) {
        set.delete(sha)
        if (set.size === 0) return
      } else {
        set.add(sha)
      }
      this.lastPivotSha = sha
      await this.setMultiSelection([...set])
    },
    async extendSelectionTo(sha: string) {
      const pivot = this.lastPivotSha || this.selectedSha
      if (!pivot) {
        await this.selectCommit(sha)
        return
      }
      const a = this.commits.findIndex((c) => c.hash === pivot)
      const b = this.commits.findIndex((c) => c.hash === sha)
      if (a < 0 || b < 0) {
        await this.selectCommit(sha)
        return
      }
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const range = this.commits.slice(lo, hi + 1).map((c) => c.hash)
      await this.setMultiSelection(range)
    },
    prefetch(sha: string) {
      const focus = this.focusPath
      if (commitCache.has(cacheKey(sha, focus))) return
      const q = focus ? { path: focus } : {}
      Promise.all([
        $fetch<CommitDetail>(`/api/commit/${sha}`, { query: q }),
        $fetch<DiffsPayload>(`/api/diffs/${sha}`, { query: q }),
      ]).then(([detail, diffs]) => cacheSet(sha, focus, { detail, diffs })).catch(() => {})
    },
    selectFile(path: string) {
      this.skipNextScroll = false
      this.selectedFile = path
      writeUrl({ file: path })
    },
    toggleDiffMode() {
      this.diffMode = this.diffMode === 'split' ? 'unified' : 'split'
    },
    // --- collect mode: authoring comments ---
    addComment(anchor: CommentAnchor | null, body: string) {
      const text = body.trim()
      if (!text) return
      if (!this.commentsDoc) this.commentsDoc = { version: 1, threads: [] }
      this.commentsDoc.threads.push({
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: 'open',
        anchor,
        comments: [{ author: 'reviewer', date: new Date().toISOString(), body: text }],
      })
    },
    // MVP threads are single-comment, so edits target comments[0]. No-op if the
    // thread is gone or the new body is empty.
    editComment(id: string, body: string) {
      const text = body.trim()
      if (!text || !this.commentsDoc) return
      const thread = this.commentsDoc.threads.find((t) => t.id === id)
      if (!thread?.comments[0]) return
      thread.comments[0].body = text
    },
    removeComment(id: string) {
      if (!this.commentsDoc) return
      this.commentsDoc.threads = this.commentsDoc.threads.filter((t) => t.id !== id)
    },
    async finishReview() {
      const doc: CommentsDoc = { version: 1, threads: this.draftThreads }
      try {
        await $fetch('/api/finish', { method: 'POST', body: doc })
      } catch {
        // server exits right after responding; a dropped connection is expected
      }
      this.submitted = true
    },
  },
})

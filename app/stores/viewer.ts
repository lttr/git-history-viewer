import { defineStore } from 'pinia'
import { nextTick } from 'vue'

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
}

export type ChangesKind = 'staged' | 'unstaged'

interface UrlState {
  repo: string
  range: string
  shas: string[]
  file: string
  focus: string
  changes: ChangesKind | ''
}

function readUrl(): UrlState {
  if (typeof window === 'undefined') return { repo: '', range: '', shas: [], file: '', focus: '', changes: '' }
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
    focusPath: '' as string,
  }),
  getters: {
    isMulti(): boolean {
      return this.selectedShas.length > 1
    },
    isChanges(): boolean {
      return !!this.selectedChanges
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
      const urlState = readUrl()
      this.range = urlState.range || this.context.defaultRange
      this.focusPath = urlState.focus || this.context.filePath || ''
      writeUrl({ repo: this.context.repo, range: this.range, focus: this.focusPath })
      await Promise.all([
        this.loadMore({ autoSelect: false }),
        this.refreshChanges(),
      ])
      if (urlState.changes) {
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
      if (typeof window !== 'undefined') {
        window.addEventListener('popstate', () => {
          if (suppressPopstate) return
          this.syncFromUrl()
        })
      }
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
      writeUrl({ focus: next, shas: [], changes: '', file: '' }, 'push')
      this.commitDetail = null
      this.diffs = null
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.selectedFile = ''
      this.selectedChanges = ''
      await Promise.all([this.reloadCommits(), this.refreshChanges()])
    },
    async clearFocus() {
      await this.setFocus('')
    },
    async setRange(range: string) {
      this.range = range.trim()
      writeUrl({ range: this.range }, 'push')
      await this.reloadCommits()
    },
    async reloadCommits() {
      this.commits = []
      this.commitsDone = false
      this.rangeError = ''
      if (!this.selectedChanges) {
        this.commitDetail = null
        this.diffs = null
        this.selectedSha = ''
        this.selectedShas = []
        this.lastPivotSha = ''
        this.selectedFile = ''
      }
      await this.loadMore({ autoSelect: !this.selectedChanges })
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
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.commitDetail = null
      writeUrl({ changes: kind, shas: [] }, 'push')
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
      this.selectedSha = sha
      this.selectedShas = [sha]
      this.lastPivotSha = sha
      writeUrl({ shas: [sha], changes: '' }, 'push')
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
      this.selectedShas = unique
      this.selectedSha = unique[0]
      if (!this.lastPivotSha || !unique.includes(this.lastPivotSha)) {
        this.lastPivotSha = unique[0]
      }
      writeUrl({ shas: unique, changes: '' }, 'push')
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
  },
})

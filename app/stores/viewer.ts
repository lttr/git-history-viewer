import { defineStore } from 'pinia'
import { nextTick } from 'vue'

let selectFetchId = 0
const commitCache = new Map<string, { detail: CommitDetail; diffs: DiffsPayload }>()
const MAX_CACHE = 100
function cacheSet(sha: string, value: { detail: CommitDetail; diffs: DiffsPayload }) {
  commitCache.set(sha, value)
  if (commitCache.size > MAX_CACHE) {
    const first = commitCache.keys().next().value
    if (first) commitCache.delete(first)
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
}

function readRangeFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const p = new URLSearchParams(window.location.search)
  return p.get('range') ?? ''
}

function writeRangeToUrl(range: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (range) url.searchParams.set('range', range)
  else url.searchParams.delete('range')
  history.replaceState(null, '', url.toString())
}

function readShaFromUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hash.replace(/^#/, '').trim()
}

function writeShaToUrl(sha: string) {
  if (typeof window === 'undefined') return
  const short = sha.slice(0, 8)
  const url = new URL(window.location.href)
  url.hash = short ? `#${short}` : ''
  history.replaceState(null, '', url.toString())
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
  }),
  getters: {
    isMulti(): boolean {
      return this.selectedShas.length > 1
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
      const fromUrl = readRangeFromUrl()
      this.range = fromUrl || this.context.defaultRange
      await this.reloadCommits()
      const sha = readShaFromUrl()
      if (sha) {
        const match = this.commits.find((c) => c.hash.startsWith(sha)) || null
        if (match) await this.selectCommit(match.hash)
        else writeShaToUrl('')
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('hashchange', () => {
          const s = readShaFromUrl()
          if (s && !this.selectedSha.startsWith(s)) {
            const m = this.commits.find((c) => c.hash.startsWith(s))
            if (m) this.selectCommit(m.hash)
            else writeShaToUrl('')
          }
        })
      }
    },
    async setRange(range: string) {
      this.range = range.trim()
      writeRangeToUrl(this.range)
      await this.reloadCommits()
    },
    async reloadCommits() {
      this.commits = []
      this.commitsDone = false
      this.commitDetail = null
      this.diffs = null
      this.selectedSha = ''
      this.selectedShas = []
      this.lastPivotSha = ''
      this.selectedFile = ''
      this.rangeError = ''
      await this.loadMore()
    },
    async loadMore() {
      if (this.commitsLoading || this.commitsDone) return
      this.commitsLoading = true
      try {
        const data = await $fetch<Commit[]>('/api/log', {
          query: { skip: this.commits.length, limit: 200, range: this.range },
        })
        if (!data.length) this.commitsDone = true
        this.commits.push(...data)
        if (!this.selectedSha && this.commits[0]) {
          await this.selectCommit(this.commits[0].hash)
        }
      } catch (e: any) {
        this.rangeError = e?.data?.message || e?.message || 'Failed to load'
        this.commitsDone = true
      } finally {
        this.commitsLoading = false
      }
    },
    async selectCommit(sha: string) {
      this.selectedSha = sha
      this.selectedShas = [sha]
      this.lastPivotSha = sha
      writeShaToUrl(sha)
      const my = ++selectFetchId
      const applyWithTransition = (detail: CommitDetail, diffs: DiffsPayload) => {
        const apply = () => {
          this.commitDetail = detail
          this.diffs = diffs
          this.skipNextScroll = true
          this.selectedFile = detail.files[0]?.path ?? ''
          return nextTick()
        }
        const doc = typeof document !== 'undefined' ? (document as any) : null
        if (doc?.startViewTransition) doc.startViewTransition(apply)
        else apply()
      }
      const cached = commitCache.get(sha)
      if (cached) {
        applyWithTransition(cached.detail, cached.diffs)
        return
      }
      this.diffsLoading = true
      try {
        const [detail, diffs] = await Promise.all([
          $fetch<CommitDetail>(`/api/commit/${sha}`),
          $fetch<DiffsPayload>(`/api/diffs/${sha}`),
        ])
        if (my !== selectFetchId) return
        cacheSet(sha, { detail, diffs })
        applyWithTransition(detail, diffs)
      } finally {
        if (my === selectFetchId) this.diffsLoading = false
      }
    },
    async setMultiSelection(shas: string[]) {
      const unique = [...new Set(shas)]
      if (unique.length === 0) return
      if (unique.length === 1) {
        await this.selectCommit(unique[0])
        return
      }
      this.selectedShas = unique
      this.selectedSha = unique[0]
      writeShaToUrl('')
      const my = ++selectFetchId
      this.diffsLoading = true
      try {
        const payload = await $fetch<DiffsRangePayload>('/api/diffs-range', {
          query: { shas: unique.join(',') },
        })
        if (my !== selectFetchId) return
        this.commitDetail = null
        this.diffs = { sha: payload.to, parent: payload.base, files: payload.files }
        this.skipNextScroll = true
        this.selectedFile = payload.files[0]?.path ?? ''
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
      if (commitCache.has(sha)) return
      Promise.all([
        $fetch<CommitDetail>(`/api/commit/${sha}`),
        $fetch<DiffsPayload>(`/api/diffs/${sha}`),
      ]).then(([detail, diffs]) => cacheSet(sha, { detail, diffs })).catch(() => {})
    },
    selectFile(path: string) {
      this.skipNextScroll = false
      this.selectedFile = path
    },
    toggleDiffMode() {
      this.diffMode = this.diffMode === 'split' ? 'unified' : 'split'
    },
  },
})

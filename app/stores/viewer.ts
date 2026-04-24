import { defineStore } from 'pinia'

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
    selectedFile: '' as string,
    skipNextScroll: false,
    diffMode: 'split' as 'split' | 'unified',
  }),
  actions: {
    async init() {
      if (!this.context) {
        this.context = await $fetch<RepoContext>('/api/context')
      }
      const fromUrl = readRangeFromUrl()
      this.range = fromUrl || this.context.defaultRange
      await this.reloadCommits()
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
      this.diffs = null
      this.commitDetail = null
      this.diffsLoading = true
      try {
        const [detail, diffs] = await Promise.all([
          $fetch<CommitDetail>(`/api/commit/${sha}`),
          $fetch<DiffsPayload>(`/api/diffs/${sha}`),
        ])
        this.commitDetail = detail
        this.diffs = diffs
        this.skipNextScroll = true
        this.selectedFile = detail.files[0]?.path ?? ''
      } finally {
        this.diffsLoading = false
      }
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

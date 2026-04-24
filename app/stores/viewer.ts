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

export const useViewerStore = defineStore('viewer', {
  state: () => ({
    commits: [] as Commit[],
    commitsLoading: false,
    commitsDone: false,
    commitDetail: null as CommitDetail | null,
    selectedSha: '' as string,
    selectedFile: '' as string,
    diffMode: 'split' as 'split' | 'unified',
  }),
  actions: {
    async loadMore() {
      if (this.commitsLoading || this.commitsDone) return
      this.commitsLoading = true
      try {
        const data = await $fetch<Commit[]>('/api/log', {
          query: { skip: this.commits.length, limit: 200 },
        })
        if (!data.length) this.commitsDone = true
        this.commits.push(...data)
        if (!this.selectedSha && this.commits[0]) {
          await this.selectCommit(this.commits[0].hash)
        }
      } finally {
        this.commitsLoading = false
      }
    },
    async selectCommit(sha: string) {
      this.selectedSha = sha
      this.commitDetail = await $fetch<CommitDetail>(`/api/commit/${sha}`)
      this.selectedFile = this.commitDetail.files[0]?.path ?? ''
    },
    selectFile(path: string) {
      this.selectedFile = path
    },
    toggleDiffMode() {
      this.diffMode = this.diffMode === 'split' ? 'unified' : 'split'
    },
  },
})

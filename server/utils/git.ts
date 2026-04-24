import { simpleGit, type SimpleGit } from 'simple-git'

let instance: SimpleGit | null = null

export function useGit(): SimpleGit {
  if (!instance) {
    const cfg = useRuntimeConfig()
    instance = simpleGit(cfg.repoPath)
  }
  return instance
}

export function parseNameStatus(raw: string): Array<{ path: string; status: string; oldPath?: string }> {
  const out: Array<{ path: string; status: string; oldPath?: string }> = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const code = parts[0]
    if (!code) continue
    const letter = code[0]
    if (letter === 'R' || letter === 'C') {
      out.push({ status: letter, oldPath: parts[1], path: parts[2] ?? parts[1] })
    } else {
      out.push({ status: letter, path: parts[1] })
    }
  }
  return out
}

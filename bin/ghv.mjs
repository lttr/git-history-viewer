#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import open from 'open'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const entry = resolve(pkgRoot, '.output/server/index.mjs')

if (!existsSync(entry)) {
  console.error('[ghv] build not found at', entry)
  console.error('[ghv] run `vp build` first')
  process.exit(1)
}

const argFile = process.argv[2]
let cwdForRepo = process.cwd()
let filePath = ''

if (argFile) {
  const abs = resolve(process.cwd(), argFile)
  const startDir = existsSync(abs) ? dirname(abs) : process.cwd()
  let root = ''
  try {
    root = execSync('git rev-parse --show-toplevel', { cwd: startDir, encoding: 'utf8' }).trim()
  } catch {
    console.error('[ghv] not a git repository:', abs)
    process.exit(1)
  }
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..')) {
    console.error('[ghv] file not inside repo:', abs)
    process.exit(1)
  }
  filePath = rel
  cwdForRepo = root
}

const repoPath = resolve(process.env.GHV_REPO_PATH || cwdForRepo)
const port = Number(process.env.PORT || 3434)
const host = process.env.HOST || '127.0.0.1'

const env = {
  ...process.env,
  GHV_REPO_PATH: repoPath,
  NUXT_REPO_PATH: repoPath,
  GHV_FILE_PATH: filePath,
  NUXT_FILE_PATH: filePath,
  PORT: String(port),
  HOST: host,
  NITRO_PORT: String(port),
  NITRO_HOST: host,
}

const child = spawn(process.execPath, [entry], { env, stdio: 'inherit' })

const url = `http://${host}:${port}`
console.log(`[ghv] repo: ${repoPath}`)
if (filePath) console.log(`[ghv] file: ${filePath}`)
console.log(`[ghv] serving: ${url}`)
setTimeout(() => { open(url).catch(() => {}) }, 500)

const shutdown = () => { child.kill('SIGTERM') }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', (code) => process.exit(code ?? 0))

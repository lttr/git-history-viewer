#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import open from 'open'

function isPortFree(port, host) {
  return new Promise((resolvePromise) => {
    const srv = createServer()
    srv.once('error', () => resolvePromise(false))
    srv.once('listening', () => srv.close(() => resolvePromise(true)))
    srv.listen(port, host)
  })
}

async function findFreePort(start, host, maxTries = 100) {
  for (let p = start; p < start + maxTries; p++) {
    if (await isPortFree(p, host)) return p
  }
  throw new Error(`no free port in ${start}..${start + maxTries - 1}`)
}

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
const host = process.env.HOST || '127.0.0.1'
const portExplicit = !!(process.env.PORT || process.env.NITRO_PORT)
const basePort = Number(process.env.PORT || process.env.NITRO_PORT || 3434)
let port = basePort
if (!portExplicit) {
  try {
    port = await findFreePort(basePort, host)
  } catch (err) {
    console.error('[ghv]', err.message)
    process.exit(1)
  }
} else if (!(await isPortFree(basePort, host))) {
  console.error(`[ghv] port ${basePort} in use on ${host}`)
  process.exit(1)
}

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

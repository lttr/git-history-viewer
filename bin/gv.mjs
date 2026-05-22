#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import open from 'open'

const c = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : { dim: (s) => s, bold: (s) => s, cyan: (s) => s, green: (s) => s }

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

const rawArgs = process.argv.slice(2)
if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`gv — git history viewer in your browser

Usage:
  gv [file] [options]

Arguments:
  file                 Open a specific file's history (must be inside a git repo)

Options:
  -c, --comments <path>  Load inline review comments from a file
      --collect          Author review comments in the browser; on "Finish",
                         print them as JSON to stdout (for a coding agent)
  -r, --repo <path>      Repo to view (default: current directory)
  -p, --port <n>         Port to use (default: 3434, auto-picks next free)
      --host <host>      Host to bind (default: 127.0.0.1)
  -h, --help             Show this help
  -v, --version          Show version

Examples:
  gv                          View history of the current repo
  gv src/index.ts             Open one file's history
  gv --comments review.md     Show inline review comments
  gv --collect                Collect review feedback, print JSON on finish
  gv --repo /path/to/repo     View a different repo
  gv --port 4000              Use a specific port`)
  process.exit(0)
}
if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  try {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8'))
    console.log(pkg.version)
  } catch {
    console.log('unknown')
  }
  process.exit(0)
}

if (!existsSync(entry)) {
  console.error('[gv] build not found at', entry)
  console.error('[gv] run `vp build` first')
  process.exit(1)
}

// args: [file] [--comments <path>] [--repo <path>] [--port <n>] [--host <host>]
// (--flag=value form accepted for each)
let argFile = ''
let commentsArg = ''
let repoArg = ''
let portArg = ''
let hostArg = ''
let collect = false
const argv = process.argv.slice(2)
const takeValue = (a, name, short, i) =>
  a === name || a === short ? { value: argv[i + 1] ?? '', skip: 1 }
    : a.startsWith(`${name}=`) ? { value: a.slice(name.length + 1), skip: 0 }
      : null
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  let m
  if (a === '--collect') { collect = true }
  else if ((m = takeValue(a, '--comments', '-c', i))) { commentsArg = m.value; i += m.skip }
  else if ((m = takeValue(a, '--repo', '-r', i))) { repoArg = m.value; i += m.skip }
  else if ((m = takeValue(a, '--port', '-p', i))) { portArg = m.value; i += m.skip }
  else if ((m = takeValue(a, '--host', '--host', i))) { hostArg = m.value; i += m.skip }
  else if (!a.startsWith('-') && !argFile) { argFile = a }
}

let cwdForRepo = process.cwd()
let filePath = ''
let commentsPath = ''

if (commentsArg) {
  commentsPath = resolve(process.cwd(), commentsArg)
  if (!existsSync(commentsPath)) {
    console.error('[gv] comments file not found:', commentsPath)
    process.exit(1)
  }
}

if (argFile) {
  const abs = resolve(process.cwd(), argFile)
  const startDir = existsSync(abs) ? dirname(abs) : process.cwd()
  let root = ''
  try {
    root = execSync('git rev-parse --show-toplevel', { cwd: startDir, encoding: 'utf8' }).trim()
  } catch {
    console.error('[gv] not a git repository:', abs)
    process.exit(1)
  }
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..')) {
    console.error('[gv] file not inside repo:', abs)
    process.exit(1)
  }
  filePath = rel
  cwdForRepo = root
}

// --repo overrides the cwd/derived repo; a positional file already pins cwdForRepo to its repo root.
const repoPath = resolve(repoArg || cwdForRepo)

try {
  const root = execSync('git rev-parse --show-toplevel', { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (!root) throw new Error('empty toplevel')
} catch {
  console.error(`[gv] not a git repository: ${repoPath}`)
  process.exit(1)
}

const host = hostArg || '127.0.0.1'
const portExplicit = !!portArg
if (portArg && !Number.isInteger(Number(portArg))) {
  console.error(`[gv] invalid --port: ${portArg}`)
  process.exit(1)
}
const basePort = Number(portArg || 3434)
let port = basePort
if (!portExplicit) {
  try {
    port = await findFreePort(basePort, host)
  } catch (err) {
    console.error('[gv]', err.message)
    process.exit(1)
  }
} else if (!(await isPortFree(basePort, host))) {
  console.error(`[gv] port ${basePort} in use on ${host}`)
  process.exit(1)
}

const env = {
  ...process.env,
  GV_REPO_PATH: repoPath,
  NUXT_REPO_PATH: repoPath,
  GV_FILE_PATH: filePath,
  NUXT_FILE_PATH: filePath,
  NUXT_COMMENTS_PATH: commentsPath,
  NUXT_COLLECT: collect ? '1' : '',
  PORT: String(port),
  HOST: host,
  NITRO_PORT: String(port),
  NITRO_HOST: host,
}

const child = spawn(process.execPath, [entry], { env, stdio: ['inherit', 'pipe', 'inherit'] })

const url = `http://${host}:${port}`
const repoName = basename(repoPath)
const repoDir = dirname(repoPath)

console.log(`${c.bold(c.cyan('gv'))} ${c.bold(repoName)} ${c.dim(repoDir)}`)
if (filePath) console.log(`    ${c.dim('file')} ${filePath}`)
if (commentsPath) console.log(`    ${c.dim('comments')} ${relative(process.cwd(), commentsPath) || commentsPath}`)
if (collect) console.log(`    ${c.dim('collect')} review comments → plain text on finish`)

// The server emits collected comments on this sentinel line when the user
// clicks "Finish review" — base64-encoded plain text (multi-line markdown). We
// capture it and print it decoded after exit, between markers, so a coding
// agent reading stdout can lift it out.
const SENTINEL = '__GV_REVIEW_TEXT__'
let reviewText = null

let ready = false
const rl = createInterface({ input: child.stdout })
rl.on('line', (line) => {
  if (line.startsWith(SENTINEL)) {
    reviewText = line.slice(SENTINEL.length)
    return
  }
  if (!ready && /Listening on /i.test(line)) {
    ready = true
    const hint = collect ? 'add comments, then "Finish review"' : 'Ctrl-C to stop'
    console.log(`    ${c.green('→')} ${c.cyan(url)}  ${c.dim(`(${hint})`)}`)
    open(url).catch(() => {})
    return
  }
  process.stdout.write(line + '\n')
})

const shutdown = () => { child.kill('SIGTERM') }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', (code) => {
  if (reviewText) {
    let out = reviewText
    try { out = Buffer.from(reviewText, 'base64').toString('utf8') } catch {}
    process.stdout.write('===GV_COMMENTS_BEGIN===\n')
    process.stdout.write(out + '\n')
    process.stdout.write('===GV_COMMENTS_END===\n')
  }
  process.exit(code ?? 0)
})

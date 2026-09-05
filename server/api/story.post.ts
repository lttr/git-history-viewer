// Generates a changeset story by piping the branch diff into the local Claude Code
// CLI and streaming groups back over SSE as they parse. Everything the model
// says is re-validated (server/utils/storyRepair.ts) before it reaches the UI.
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { ChangesetStory, StoryGroup } from '../../app/types/story'
import { CAPS } from '../../app/types/story'
import { collectStorySource } from '../utils/storyInput'
import { STORY_SYSTEM_PROMPT } from '../utils/storyPrompt'
import { appendGroup, finalizeGroups, normalizeGroup, truncate } from '../utils/storyRepair'
import { readStory, storyKey, writeStory } from '../utils/storyStore'

const MODEL = 'sonnet'
const TIMEOUT_MS = 180_000

export default defineEventHandler(async (event) => {
  const body = await readBody<{ range?: string; force?: boolean }>(event)
  const range = typeof body?.range === 'string' ? body.range.trim() : ''
  const force = !!body?.force

  const source = await collectStorySource(range)
  const { base, head, headSha, mergeBase, input } = source
  const key = storyKey(mergeBase, headSha)

  const stream = createEventStream(event)
  const send = (name: string, data: unknown) =>
    stream.push({ event: name, data: JSON.stringify(data) })
  // `push()` only resolves once `send()` has attached a reader, so frames are
  // never awaited inline — they go on this chain, which also keeps them in the
  // order the model produced them.
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (fn: () => Promise<void> | void) => { queue = queue.then(fn, () => {}) }

  // Replay a persisted result instead of paying for the model again.
  const cached = force ? null : await readStory(key)
  if (cached) {
    enqueue(() => send('meta', {
      base, head, headSha, mergeBase,
      files: input.files.length,
      truncated: cached.truncated,
    }))
    enqueue(() => send('header', { title: cached.title, summary: cached.summary }))
    for (const g of cached.groups) enqueue(() => send('group', g))
    enqueue(() => send('done', cached))
    enqueue(() => stream.close())
    return stream.send()
  }

  const started = Date.now()
  const child = spawn('claude', [
    '-p',
    '--model', MODEL,
    '--tools', '',
    // Without this a user-level SessionStart hook fires inside our -p run.
    '--setting-sources', '',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--system-prompt', STORY_SYSTEM_PROMPT,
  ], { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })

  let settled = false
  const finish = (fn: () => Promise<void> | void) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    enqueue(fn)
    enqueue(() => stream.close())
  }
  const fail = (message: string) => finish(() => send('error', { message }))

  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    fail(`Grouping timed out after ${Math.round(TIMEOUT_MS / 1000)}s`)
  }, TIMEOUT_MS)

  stream.onClosed(() => {
    settled = true
    clearTimeout(timer)
    if (child.exitCode === null) child.kill('SIGTERM')
  })

  const ctx = { files: input.files, hunksById: input.hunksById }
  const groups: StoryGroup[] = []
  let title = ''
  let summary = ''
  let stderrText = ''

  const handleModelLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) return
    let obj: any
    try { obj = JSON.parse(trimmed) } catch { return }
    if (!obj || typeof obj !== 'object') return
    if (obj.type === 'header') {
      title = truncate(obj.title, CAPS.storyTitle)
      summary = truncate(obj.summary, CAPS.storySummary)
      enqueue(() => send('header', { title, summary }))
      return
    }
    if (obj.type === 'group') {
      const group = normalizeGroup(obj, ctx)
      if (!group) return
      const before = groups.length
      appendGroup(groups, group)
      // A merged group has no frame of its own; it lands in the final `done`.
      if (groups.length > before) {
        group.id = `g${groups.length}`
        enqueue(() => send('group', group))
      }
      return
    }
  }

  // Model text arrives as `text_delta` chunks; buffer until a full line lands.
  let modelBuf = ''
  const onModelText = (text: string) => {
    modelBuf += text
    let nl: number
    while ((nl = modelBuf.indexOf('\n')) >= 0) {
      const line = modelBuf.slice(0, nl)
      modelBuf = modelBuf.slice(nl + 1)
      handleModelLine(line)
    }
  }

  let cliBuf = ''
  const onCliLine = (line: string) => {
    if (!line.trim()) return
    let msg: any
    try { msg = JSON.parse(line) } catch { return }
    if (msg?.type === 'stream_event') {
      const ev = msg.event
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        onModelText(String(ev.delta.text ?? ''))
      }
      return
    }
    if (msg?.type === 'result' && msg.is_error) {
      stderrText = String(msg.result || msg.error || 'Claude reported an error')
    }
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    cliBuf += chunk
    let nl: number
    while ((nl = cliBuf.indexOf('\n')) >= 0) {
      const line = cliBuf.slice(0, nl)
      cliBuf = cliBuf.slice(nl + 1)
      onCliLine(line)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { stderrText += chunk })

  child.on('error', (e: any) => {
    fail(e?.code === 'ENOENT'
      ? 'Claude Code CLI not found — install it and log in to use Story'
      : `Failed to run Claude Code: ${e?.message || e}`)
  })

  child.on('close', () => {
    // Flush a last line the model left without a trailing newline.
    if (modelBuf.trim()) { handleModelLine(modelBuf); modelBuf = '' }
    enqueue(async () => {
      if (settled) return
      if (!groups.length) {
        fail(stderrText.trim()
          ? `Claude returned no usable groups (${truncate(stderrText, 160)})`
          : 'Claude returned no usable groups')
        return
      }
      finalizeGroups(groups, ctx)
      const story: ChangesetStory = {
        base, head, headSha, mergeBase,
        title: title || `${base}..${head}`,
        summary,
        groups,
        model: MODEL,
        durationMs: Date.now() - started,
        createdAt: new Date().toISOString(),
        truncated: input.truncated,
      }
      await writeStory(key, story)
      finish(() => send('done', story))
    })
  })

  enqueue(() => send('meta', {
    base, head, headSha, mergeBase,
    files: input.files.length,
    truncated: input.truncated,
  }))

  child.stdin.on('error', () => {})
  child.stdin.end(input.text)

  return stream.send()
})

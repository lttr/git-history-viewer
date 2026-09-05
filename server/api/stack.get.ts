// Persisted change stack for the current merge-base..head, or 404.
// Never triggers generation — that's the POST route, on an explicit click.
import type { ChangeStack } from '../../app/types/stack'
import { resolveStackRefs } from '../utils/stackInput'
import { readStack, stackKey } from '../utils/stackStore'

export default defineEventHandler(async (event): Promise<ChangeStack> => {
  const q = getQuery(event)
  const range = typeof q.range === 'string' ? q.range.trim() : ''
  const refs = await resolveStackRefs(range)
  const stack = await readStack(stackKey(refs.mergeBase, refs.headSha))
  if (!stack) throw createError({ statusCode: 404, message: 'no stack for this range' })
  return stack
})

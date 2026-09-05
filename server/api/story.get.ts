// Persisted changeset story for the current merge-base..head, or 404.
// Never triggers generation — that's the POST route, on an explicit click.
import type { ChangesetStory } from '../../app/types/story'
import { resolveStoryRefs } from '../utils/storyInput'
import { readStory, storyKey } from '../utils/storyStore'

export default defineEventHandler(async (event): Promise<ChangesetStory> => {
  const q = getQuery(event)
  const range = typeof q.range === 'string' ? q.range.trim() : ''
  const refs = await resolveStoryRefs(range)
  const story = await readStory(storyKey(refs.mergeBase, refs.headSha))
  if (!story) throw createError({ statusCode: 404, message: 'no story for this range' })
  return story
})

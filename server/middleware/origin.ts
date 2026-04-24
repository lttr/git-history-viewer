export default defineEventHandler((event) => {
  if (!event.path?.startsWith('/api/')) return
  const req = event.node.req
  const origin = req.headers.origin
  const host = req.headers.host
  const secFetchSite = req.headers['sec-fetch-site']

  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    throw createError({ statusCode: 403, message: 'cross-site request blocked' })
  }

  if (origin) {
    let originHost: string
    try { originHost = new URL(origin).host } catch {
      throw createError({ statusCode: 403, message: 'invalid origin' })
    }
    if (!host || originHost !== host) {
      throw createError({ statusCode: 403, message: 'origin mismatch' })
    }
  }
})

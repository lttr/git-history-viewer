export default defineNuxtConfig({
  compatibilityDate: '2026-04-24',
  future: { compatibilityVersion: 4 },
  ssr: false,
  modules: ['@pinia/nuxt'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'ghv — git history viewer',
      meta: [{ name: 'color-scheme', content: 'dark' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  runtimeConfig: {
    repoPath: process.env.GHV_REPO_PATH || process.cwd(),
    filePath: process.env.GHV_FILE_PATH || '',
  },
  nitro: {
    preset: 'node-server',
  },
})

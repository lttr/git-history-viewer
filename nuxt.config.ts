export default defineNuxtConfig({
  compatibilityDate: '2026-04-24',
  future: { compatibilityVersion: 4 },
  ssr: false,
  modules: ['@pinia/nuxt'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'ghv',
      meta: [{ name: 'color-scheme', content: 'dark' }],
    },
  },
  runtimeConfig: {
    repoPath: process.env.GHV_REPO_PATH || process.cwd(),
  },
  nitro: {
    preset: 'node-server',
  },
})

# git-history-viewer (`@lttr/gv`)

Nuxt 4 + Vue 3 + Pinia app served by a small Node CLI (`bin/gv.mjs`), published
to npm as `@lttr/gv`.

- `pnpm dev` — dev server; `build` — `nuxt build` (also runs on `prepublishOnly`); `release` — publish
- Conventional commits (`fix(diff): …`, `feat(comments): …`); changelogen turns them into CHANGELOG.md and the `vX.Y.Z` tag
- Published tarball ships `bin/`, `.output/`, `README.md`

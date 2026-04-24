<template>
  <NuxtPage />
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #0d1117;
  --bg-2: #161b22;
  --bg-3: #21262d;
  --border: #30363d;
  --fg: #e6edf3;
  --fg-dim: #9da7b3;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --blue: #58a6ff;
  --purple: #bc8cff;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* Ayu Mirage palette for the code diff view only (!important beats lib CSS order) */
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-style-root {
  --diff-border--: #33415e !important;
  --diff-plain-content--: #1f2430 !important;
  --diff-plain-lineNumber--: #232834 !important;
  --diff-plain-lineNumber-color--: #707a8c !important;
  --diff-empty-content--: #1a1f2a !important;
  --diff-expand-content--: #232834 !important;
  --diff-expand-lineNumber--: #232834 !important;
  --diff-expand-lineNumber-color--: #707a8c !important;

  --diff-add-content--: #253027 !important;
  --diff-add-content-highlight--: #324a32 !important;
  --diff-add-lineNumber--: #293a2b !important;

  --diff-del-content--: #2d2328 !important;
  --diff-del-content-highlight--: #4a3036 !important;
  --diff-del-lineNumber--: #36272c !important;

  --diff-hunk-content--: #23293a !important;
  --diff-hunk-content-color--: #6c7388 !important;
  --diff-hunk-lineNumber--: #263044 !important;
  --diff-hunk-lineNumber-hover--: #5ccfe6 !important;

  --diff-add-widget--: #ffcc66 !important;
  --diff-add-widget-color--: #1f2430 !important;
}

* {
  box-sizing: border-box;
}

html, body, #__nuxt {
  margin: 0;
  padding: 0;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--fg);
  font: 13px/1.5 system-ui, -apple-system, sans-serif;
}

button {
  background: var(--bg-3);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
button:hover { background: var(--border); }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: var(--border); }
</style>

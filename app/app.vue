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
  --accent: #6d97d8;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --blue: #6d97d8;
  --purple: #bc8cff;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Syntax-token palette (used to override @git-diff-view hardcoded dark theme) */
  --syntax-heading: #6d97d8;
  --syntax-keyword: #ff7b72;
  --syntax-entity: #d2a8ff;
  --syntax-constant: #79c0ff;
  --syntax-string: #a5d6ff;
  --syntax-variable: #ffa657;
  --syntax-comment: #8b949e;
  --syntax-tag: #7ee787;
  --syntax-bullet: #f2cc60;
}

/* Ayu Mirage palette for the code diff view only (!important beats lib CSS order) */
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-style-root {
  --diff-border--: #33415e !important;
  --diff-plain-content--: #1f2430 !important;
  --diff-plain-lineNumber--: #232834 !important;
  --diff-plain-lineNumber-color--: #8a92a8 !important;
  --diff-empty-content--: #1a1f2a !important;
  --diff-expand-content--: #232834 !important;
  --diff-expand-lineNumber--: #232834 !important;
  --diff-expand-lineNumber-color--: #8a92a8 !important;

  --diff-add-content--: #253027 !important;
  --diff-add-content-highlight--: #324a32 !important;
  --diff-add-lineNumber--: #293a2b !important;

  --diff-del-content--: #2d2328 !important;
  --diff-del-content-highlight--: #4a3036 !important;
  --diff-del-lineNumber--: #36272c !important;

  --diff-hunk-content--: #23293a !important;
  --diff-hunk-content-color--: #8a92a8 !important;
  --diff-hunk-lineNumber--: #263044 !important;
  --diff-hunk-lineNumber-hover--: #5ccfe6 !important;

  --diff-add-widget--: #ffcc66 !important;
  --diff-add-widget-color--: #1f2430 !important;
}

/* Centralized hljs token palette — overrides @git-diff-view hardcoded dark colors so palette changes happen in one place (vars above). */
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-doctag,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-keyword,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-meta .hljs-keyword,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-template-tag,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-template-variable,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-type,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-variable.language_ {
  color: var(--syntax-keyword) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-title,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-title.class_,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-title.class_.inherited__,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-title.function_ {
  color: var(--syntax-entity) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-attr,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-attribute,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-literal,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-meta,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-number,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-operator,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-variable,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-selector-attr,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-selector-class,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-selector-id {
  color: var(--syntax-constant) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-regexp,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-string,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-meta .hljs-string {
  color: var(--syntax-string) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-built_in,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-symbol {
  color: var(--syntax-variable) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-comment,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-code,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-formula {
  color: var(--syntax-comment) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-name,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-quote,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-selector-tag,
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-selector-pseudo {
  color: var(--syntax-tag) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-section {
  color: var(--syntax-heading) !important;
}
.diff-tailwindcss-wrapper[data-theme="dark"] .diff-line-syntax-raw .hljs-bullet {
  color: var(--syntax-bullet) !important;
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

/* View transition between commit selections */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 90ms;
  animation-timing-function: ease-out;
}
::view-transition-old(diff-pane) {
  animation: vt-fade-out 70ms ease-out both;
}
::view-transition-new(diff-pane) {
  animation: vt-fade-in 110ms ease-out both;
}
@keyframes vt-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes vt-fade-in {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

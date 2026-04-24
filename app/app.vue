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
  --fg: #c9d1d9;
  --fg-dim: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --yellow: #d29922;
  --blue: #58a6ff;
  --purple: #bc8cff;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

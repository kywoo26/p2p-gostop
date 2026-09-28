import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  preprocess: vitePreprocess(),
  // Svelte 5 runes 모드 강제: Svelte 4 문법(export let, $:, on:click, <slot>)은 컴파일 오류 (AGENTS.md 3장).
  compilerOptions: { runes: true },
};

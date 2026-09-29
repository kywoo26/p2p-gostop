import { mount } from 'svelte';
import App from './App.svelte';
import './styles/tokens.css';
import './styles/global.css';
import './pro-assets/pro.css';
import { proEnabled } from './pro-assets/runtime.ts';
if (proEnabled) document.documentElement.classList.add('pro-assets');

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app 요소가 없습니다');
}
target.replaceChildren();
mount(App, { target });

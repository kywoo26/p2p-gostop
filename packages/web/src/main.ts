import { mount } from 'svelte';
import App from './App.svelte';
import './styles/tokens.css';
import './styles/global.css';
import './styles/visual-upgrade.css';

// 시각 비교 실험. 같은 Home/Board·실제 솔로/P2P 화면에 시각 레이어를 적용한다.
if (new URLSearchParams(location.search).get('visual') === 'upgrade') {
  document.documentElement.dataset['visual'] = 'upgrade';
}

const target = document.getElementById('app');
if (!target) {
  throw new Error('#app 요소가 없습니다');
}
mount(App, { target });

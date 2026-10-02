import { captureEntry } from './app/entry.ts';
import { proEnabled } from './pro-assets/runtime.ts';
export function init() {
  captureEntry();
  if (proEnabled) document.documentElement.classList.add('pro-assets');
}
export function handleError() {
  return { message: '화면을 열지 못했습니다.' };
}

// AC-SC-01: 독립 제어형 UI. 실제 protocol 검증은 별도 시험/통합 접점에 둔다.
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SocialTextValidator } from '../game/social-compose.ts';
import SocialPanel from './SocialPanel.svelte';

const validate: SocialTextValidator = (text) =>
  text ? { ok: true, text, graphemes: 1, scalars: 1, bytes: 3 } : { ok: false, reason: 'empty' };
function props() {
  return {
    open: true,
    muted: false,
    available: true,
    emotes: [
      { id: 'smile', label: '미소' },
      { id: 'thanks', label: '감사' },
      { id: 'surprise', label: '놀람' },
    ],
    phrases: [
      { id: 'hello', label: '안녕하세요' },
      { id: 'good-game', label: '좋은 경기였어요' },
      { id: 'one-moment', label: '잠시만요' },
    ],
    validate,
    onsendtext: vi.fn(() => true),
    onsendchoice: vi.fn(() => true),
    onmute: vi.fn(),
    onclose: vi.fn(),
  };
}

test('IME 조합 중과 입력 Enter는 전송0, 조합 뒤 명시 버튼만 전송한다', async () => {
  const p = props();
  const screen = await render(SocialPanel, p);
  const input = screen.getByRole('textbox', { name: '보낼 문장' });
  await input.fill('한');
  const node = input.element();
  node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  node.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
  );
  await expect.element(screen.getByRole('button', { name: '전송', exact: true })).toBeDisabled();
  expect(p.onsendtext).not.toHaveBeenCalled();
  node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  await expect.element(screen.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  node.dispatchEvent(enter);
  expect(enter.defaultPrevented).toBe(true);
  expect(p.onsendtext).not.toHaveBeenCalled();
  await screen.getByRole('button', { name: '전송', exact: true }).click();
  expect(p.onsendtext).toHaveBeenCalledExactlyOnceWith('한');
  await expect.element(input).toHaveValue('');
});

test('감정표현·정형 문구가 각각 명시 callback을 사용하고 mute는 독립 제어한다', async () => {
  const p = props();
  const screen = await render(SocialPanel, p);
  await screen.getByRole('button', { name: '감정표현', exact: true }).click();
  for (const label of ['미소', '감사', '놀람'])
    await expect.element(screen.getByRole('button', { name: label, exact: true })).toBeVisible();
  await screen.getByRole('button', { name: '감사', exact: true }).click();
  expect(p.onsendchoice).toHaveBeenCalledWith('emote', 'thanks');
  await screen.getByRole('button', { name: '정형 문구', exact: true }).click();
  for (const label of ['안녕하세요', '좋은 경기였어요', '잠시만요'])
    await expect.element(screen.getByRole('button', { name: label, exact: true })).toBeVisible();
  await screen.getByRole('button', { name: '잠시만요', exact: true }).click();
  expect(p.onsendchoice).toHaveBeenCalledWith('phrase', 'one-moment');
  await screen.getByRole('checkbox', { name: '상대 표현 끄기' }).click();
  expect(p.onmute).toHaveBeenCalledExactlyOnceWith(true);
  await screen.rerender({ muted: true, available: false });
  await expect.element(screen.getByText('상대 표현 꺼짐', { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: '잠시만요', exact: true }))
    .toBeDisabled();
  await expect
    .element(
      screen.getByText('대화 연결이나 전송 간격을 기다리는 중입니다. 게임은 계속할 수 있습니다.'),
    )
    .toBeVisible();
  expect(p.onsendtext).not.toHaveBeenCalled();
});

test('잘못된 입력·callback 실패는 안내와 초안을 보존하며 닫기/우선 화면 전환은 지운다', async () => {
  const p = props();
  p.onsendtext.mockReturnValue(false);
  const check = vi.fn<SocialTextValidator>((text) =>
    text === 'bad' ? { ok: false, reason: 'control' } : validate(text),
  );
  const screen = await render(SocialPanel, { ...p, validate: check });
  const input = screen.getByRole('textbox', { name: '보낼 문장' });
  await input.fill('bad');
  await expect.element(screen.getByRole('button', { name: '전송', exact: true })).toBeDisabled();
  await expect
    .element(screen.getByText('줄바꿈이나 숨은 제어문자는 보낼 수 없습니다.'))
    .toBeVisible();
  await input.fill('가');
  await screen.getByRole('button', { name: '전송', exact: true }).click();
  await expect.element(input).toHaveValue('가');
  await expect
    .element(screen.getByText('연결 상태나 전송 간격을 확인한 뒤 다시 보내세요.'))
    .toBeVisible();
  await screen.getByRole('button', { name: '닫기', exact: true }).click();
  expect(p.onclose).toHaveBeenCalledTimes(1);
  await expect.element(input).toHaveValue('');
  await input.fill('나');
  await screen.rerender({ open: false });
  await expect.element(input).not.toBeInTheDocument();
  await screen.rerender({ open: true });
  await expect.element(screen.getByRole('textbox', { name: '보낼 문장' })).toHaveValue('');
});

test('360폭/키보드 높이에서 패널만 스크롤하며 48px 조작·현재 입력 focus를 보존한다', async () => {
  await page.viewport(360, 780);
  const screen = await render(SocialPanel, { ...props(), viewportHeight: 300 });
  const input = screen.getByRole('textbox', { name: '보낼 문장' });
  await input.fill('가');
  const node = input.element();
  node.focus();
  await screen.rerender({ viewportHeight: 260 });
  expect(document.activeElement).toBe(node);
  const panel = screen.getByRole('region', { name: '대전 대화' }).element();
  expect(panel.getBoundingClientRect().height).toBeLessThanOrEqual(260);
  expect(getComputedStyle(panel).overflowY).toBe('auto');
  for (const button of screen.container.querySelectorAll('button')) {
    expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(48);
    expect(getComputedStyle(button).animationName).toBe('none');
  }
});

// 조합 중 tab 이동으로 emote/phrase 전송 경로를 열 수 없다.
test.each([
  ['감정표현', '미소', 'emote', 'smile'],
  ['정형 문구', '안녕하세요', 'phrase', 'hello'],
] as const)(
  'IME 중 %s 탭의 직접 click도 전송0·조합 종료 뒤 명시 버튼1',
  async (tab, label, kind, id) => {
    const p = props();
    const screen = await render(SocialPanel, p);
    const input = screen.getByRole('textbox', { name: '보낼 문장' }).element();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    await expect.element(screen.getByRole('button', { name: tab, exact: true })).toBeDisabled();
    (screen.getByRole('button', { name: tab, exact: true }).element() as HTMLButtonElement).click();
    expect(p.onsendchoice).not.toHaveBeenCalled();
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await screen.getByRole('button', { name: tab, exact: true }).click();
    await screen.getByRole('button', { name: label, exact: true }).click();
    expect(p.onsendchoice).toHaveBeenCalledExactlyOnceWith(kind, id);
  },
);

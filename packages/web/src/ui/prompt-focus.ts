// UX-07/24: 선택 창의 열림 상태를 Board에 알리고 초점 순환/복귀를 제공한다.
const panels = new Set<HTMLElement>();
const controls =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

function available(node: HTMLElement): boolean {
  return (
    node.isConnected &&
    !node.closest('[inert]') &&
    !node.matches(':disabled') &&
    node.getClientRects().length > 0
  );
}

function focusable(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(controls)].filter(available);
}

export function promptFocus(panel: HTMLElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const board = panel.closest('.board');
  const menu = board
    ?.closest('.game')
    ?.querySelector<HTMLButtonElement>('[data-testid="game-menu"]');
  const activeTargets = () => [...focusable(panel), ...(menu && available(menu) ? [menu] : [])];
  const suspended = () => !!panel.closest('[inert]') || !!document.querySelector('dialog:modal');
  let released = true;
  const notify = (active: boolean | null) =>
    board?.dispatchEvent(new CustomEvent('promptlockchange', { detail: { panel, active } }));
  const focusFirst = () =>
    (panel.querySelector<HTMLElement>('h2') ?? panel).focus({ preventScroll: true });
  function acquire() {
    if (!released) return;
    released = false;
    panels.add(panel);
    if (menu) {
      if (!menu.id) menu.id = `${panel.getAttribute('aria-labelledby')}-menu`;
      panel.setAttribute('aria-owns', menu.id);
    }
    // 자식 action은 부모 Board의 action보다 먼저 실행될 수 있다.
    queueMicrotask(() => {
      if (!released) notify(true);
    });
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', retainFocus);
    queueMicrotask(() => {
      if (!released) focusFirst();
    });
  }

  function keydown(event: KeyboardEvent) {
    if (released || suspended()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key !== 'Tab') return;
    const targets = activeTargets();
    const index = targets.indexOf(document.activeElement as HTMLElement);
    if (index === -1 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? targets.at(-1) : targets[0])?.focus({ preventScroll: true });
    }
  }
  function retainFocus(event: FocusEvent) {
    if (!released && !suspended() && !panel.contains(event.target as Node) && event.target !== menu)
      focusFirst();
  }
  function release() {
    if (released) return;
    released = true;
    panels.delete(panel);
    panel.removeAttribute('aria-owns');
    notify(false); // Board가 사라지는 애니메이션 중인 창도 잠근다.
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('focusin', retainFocus);
    queueMicrotask(() => {
      if ([...panels].some((node) => node.isConnected)) return;
      if (previous && available(previous) && previous !== document.body) {
        previous.focus({ preventScroll: true });
      } else {
        // 낸 패가 사라지거나 busy로 비활성화되면 남은 손패/판 정보로 복귀한다.
        const fallback = board?.querySelectorAll<HTMLElement>('.hand button:not(:disabled)');
        const target =
          [...(fallback ?? [])].find(available) ?? (menu && available(menu) ? menu : board);
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      }
    });
  }
  acquire();
  panel.addEventListener('introstart', acquire);
  panel.addEventListener('outrostart', release);
  return {
    destroy() {
      release();
      // 퇴장 노드가 DOM에서 사라진 뒤에만 보드의 보관 목록에서 제거한다.
      queueMicrotask(() => {
        if (!panel.isConnected) notify(null);
      });
      panel.removeEventListener('introstart', acquire);
      panel.removeEventListener('outrostart', release);
    },
  };
}

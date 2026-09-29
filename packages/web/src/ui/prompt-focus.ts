// UX-07/24: 예약 행의 인라인 dialog를 유지하며 배경 잠금·초점 순환/복귀를 제공한다.
// 전환 중 두 선택 창이 잠시 공존해도 먼저 닫힌 창이 다른 창의 잠금을 풀지 않는다.
const locks = new WeakMap<HTMLElement, { count: number; previous: boolean }>();
const panels = new Set<HTMLDialogElement>();
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

export function promptFocus(panel: HTMLDialogElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const board = panel.closest('.board');
  const siblings: HTMLElement[] = [];
  let released = false;
  panels.add(panel);
  for (let child: HTMLElement = panel; child.parentElement; child = child.parentElement) {
    for (const sibling of child.parentElement.children) {
      if (
        !(sibling instanceof HTMLElement) ||
        sibling === child ||
        sibling.matches('script, style')
      )
        continue;
      const lock = locks.get(sibling) ?? { count: 0, previous: sibling.inert };
      lock.count++;
      locks.set(sibling, lock);
      sibling.inert = true;
      siblings.push(sibling);
    }
    if (child.parentElement === document.body) break;
  }
  const focusFirst = () => (focusable(panel)[0] ?? panel).focus({ preventScroll: true });
  queueMicrotask(() => {
    if (!released) focusFirst();
  });

  function keydown(event: KeyboardEvent) {
    if (released) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key !== 'Tab') return;
    const targets = focusable(panel);
    const index = targets.indexOf(document.activeElement as HTMLElement);
    if (index === -1 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? targets.at(-1) : targets[0])?.focus({ preventScroll: true });
    }
  }
  function retainFocus(event: FocusEvent) {
    if (!released && !panel.contains(event.target as Node) && !panel.closest('[inert]'))
      focusFirst();
  }
  function release() {
    if (released) return;
    released = true;
    panels.delete(panel);
    panel.inert = true; // 사라지는 애니메이션 중 중복 선택 방지
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('focusin', retainFocus);
    for (const sibling of siblings) {
      const lock = locks.get(sibling)!;
      if (--lock.count === 0) {
        sibling.inert = lock.previous;
        locks.delete(sibling);
      }
    }
    queueMicrotask(() => {
      if ([...panels].some((node) => node.isConnected)) return;
      if (previous && available(previous) && previous !== document.body) {
        previous.focus({ preventScroll: true });
      } else {
        // 낸 패가 사라지거나 busy로 비활성화되면 남은 손패/판 정보로 복귀한다.
        const fallback = board?.querySelectorAll<HTMLElement>(
          '.hand button:not(:disabled), .info-button',
        );
        [...(fallback ?? [])].find(available)?.focus({ preventScroll: true });
      }
    });
  }
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('focusin', retainFocus);
  panel.addEventListener('outrostart', release);
  return {
    destroy() {
      release();
      panel.removeEventListener('outrostart', release);
    },
  };
}

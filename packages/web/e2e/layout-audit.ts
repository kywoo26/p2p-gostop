// UX-06/11: 브라우저 안에서 실행하는 공통 기하 검사. 허용 겹침은 카드 스택과 손패 위 필수 선택 시트뿐.
export function auditLayout() {
  const issues: string[] = [];
  // 스크롤 본문 밖의 사각형과 닫힌 details는 실제로 그려지지 않는다.
  const paintedRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    let left = r.left,
      top = r.top,
      right = r.right,
      bottom = r.bottom;
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (
        parent instanceof HTMLDetailsElement &&
        !parent.open &&
        !parent.querySelector('summary')?.contains(el)
      )
        return new DOMRect();
      const s = getComputedStyle(parent),
        p = parent.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0)
        return new DOMRect();
      if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) {
        left = Math.max(left, p.left);
        right = Math.min(right, p.right);
      }
      if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY)) {
        top = Math.max(top, p.top);
        bottom = Math.min(bottom, p.bottom);
      }
    }
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  };
  const visible = (el: HTMLElement) => {
    const r = paintedRect(el);
    const s = getComputedStyle(el);
    return (
      r.width > 1 &&
      r.height > 1 &&
      s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      Number(s.opacity) > 0 &&
      s.clipPath === 'none' &&
      !el.closest('[aria-hidden="true"], .sr-only')
    );
  };
  const describe = (el: HTMLElement) =>
    `${el.tagName.toLowerCase()}.${el.className
      .toString()
      .split(' ')
      .filter((x) => !x.startsWith('svelte-'))
      .join('.')}:${el.textContent?.trim().slice(0, 30) ?? ''}`;
  const elements = [...document.querySelectorAll<HTMLElement>('body *')].filter(
    (el) =>
      visible(el) &&
      (el.matches('button, input, select, textarea, img') ||
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) &&
      !el.matches('script, style, option'),
  );
  const overlap = (a: DOMRect, b: DOMRect) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const allowed = (a: HTMLElement, b: HTMLElement) => {
    // 브라우저 최상위 모달과 inert 배경의 교차는 메뉴의 의도된 가림이다.
    if (Boolean(a.closest('dialog:modal')) !== Boolean(b.closest('dialog:modal'))) return true;
    for (const selector of ['.captured .stack', '.floor .group', '.deck', '.staging']) {
      if (a.closest(selector) && a.closest(selector) === b.closest(selector)) return true;
    }
    if (
      (a.closest('.prompt') && b.closest('.hand-zone')) ||
      (b.closest('.prompt') && a.closest('.hand-zone'))
    )
      return true;
    if (
      document.querySelector('.board.go-stop') &&
      ((a.closest('.prompt') && b.closest('.center')) ||
        (b.closest('.prompt') && a.closest('.center')))
    )
      return true;
    return false;
  };
  for (let i = 0; i < elements.length; i++) {
    const a = elements[i]!;
    for (const b of elements.slice(i + 1)) {
      if (a.contains(b) || b.contains(a) || allowed(a, b)) continue;
      if (overlap(paintedRect(a), paintedRect(b)))
        issues.push(`overlap: ${describe(a)} / ${describe(b)}`);
    }
  }
  const board = document.querySelector<HTMLElement>('.board');
  for (const el of elements) {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    if (
      board?.contains(el) &&
      (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5)
    )
      issues.push(`viewport: ${describe(el)}`);
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    );
    if (hasText) {
      const size = parseFloat(s.fontSize);
      if (size < 12) issues.push(`font below 12: ${describe(el)} ${size}`);
      if (board?.contains(el) && ![12, 14, 16, 24].includes(size))
        issues.push(`font scale: ${describe(el)} ${size}`);
      if (board?.contains(el) && !['400', '600'].includes(s.fontWeight))
        issues.push(`font weight: ${describe(el)} ${s.fontWeight}`);
      if (
        el.clientWidth > 0 &&
        el.scrollWidth > el.clientWidth + 1 &&
        s.textOverflow !== 'ellipsis'
      )
        issues.push(`text width: ${describe(el)}`);
      if (
        el.clientHeight > 0 &&
        el.scrollHeight > el.clientHeight + 1 &&
        s.overflowY === 'hidden' &&
        s.clipPath === 'none'
      )
        issues.push(`text height: ${describe(el)}`);
    }
    if (
      el.matches('button, input:not([type="checkbox"]):not([type="radio"]), select, textarea') &&
      !el.closest('[inert]') &&
      (r.width < 47.5 || r.height < 47.5)
    )
      issues.push(`target: ${describe(el)} ${r.width}x${r.height}`);
  }
  const cards = board
    ? [...board.querySelectorAll<HTMLElement>('.hand .card, .floor .card, .captured-zone .card')]
        .filter(visible)
        .map((el) => el.getBoundingClientRect().width)
    : [];
  const scales = [...new Set(cards.map((n) => Math.round(n * 100) / 100))];
  if (scales.length > 1) issues.push(`card scales: ${scales}`);
  const rows = board ? [...board.querySelectorAll('.hand .row')] : [];
  const exposure = rows.flatMap((row) => {
    const slots = [...row.querySelectorAll<HTMLElement>('.slot')].map((el) =>
      el.getBoundingClientRect(),
    );
    return slots.slice(0, -1).map((r, i) => Math.min(1, (slots[i + 1]!.left - r.left) / r.width));
  });
  if (exposure.some((n) => n < 1 - 0.001)) issues.push(`hand exposure: ${Math.min(...exposure)}`);
  const center = board?.querySelector('.center')?.getBoundingClientRect();
  const floor = board?.querySelector('.floor')?.getBoundingClientRect();
  const centerError =
    center && floor ? Math.abs((center.top + center.bottom - floor.top - floor.bottom) / 2) : 0;
  if (centerError > 1) issues.push(`floor center: ${centerError}`);
  if (board?.querySelector('[data-floor-fits="false"]')) issues.push('floor packing failed');
  const deck = board?.querySelector('.deck-stack')?.getBoundingClientRect();
  if (floor && deck && Math.abs((deck.left + deck.right - floor.left - floor.right) / 2) > 1)
    issues.push('deck not centered');
  return {
    issues,
    scales,
    minExposure: exposure.length ? Math.min(...exposure) : 1,
    centerError,
    elementCount: elements.length,
  };
}

// UX-06/11: 브라우저 공통 기하 검사. 의도된 카드 스택·모달/선택창만 교차를 허용한다.
export function auditLayout() {
  const issues: string[] = [];
  // 스크롤 본문 밖의 사각형과 닫힌 details는 실제로 그려지지 않는다.
  const paintedRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    let fixed = getComputedStyle(el).position === 'fixed';
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
      // viewport 기준 fixed는 중간 overflow 조상에게 잘리지 않는다.
      // transform/paint containment가 fixed의 기준을 바꾸면 그 조상부터 클립한다.
      if (
        s.transform !== 'none' ||
        s.filter !== 'none' ||
        s.perspective !== 'none' ||
        /paint|layout|strict|content/.test(s.contain) ||
        /transform|filter|perspective/.test(s.willChange)
      )
        fixed = false;
      if (!fixed && ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) {
        left = Math.max(left, p.left);
        right = Math.min(right, p.right);
      }
      if (!fixed && ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowY)) {
        top = Math.max(top, p.top);
        bottom = Math.min(bottom, p.bottom);
      }
      if (s.position === 'fixed') fixed = true;
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
      Number(s.opacity) > 0
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
    // 홈의 장식 카드 부채는 서로만 겹친다. 메뉴·본문과의 교차는 계속 검사한다.
    for (const selector of [
      '.captured .stack',
      '.floor .group',
      '.deck',
      '.staging',
      '.hero-art',
      '.pro-home-art',
    ]) {
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
        .map((el) => el.offsetWidth)
    : [];
  const scales = [...new Set(cards.map((n) => Math.round(n * 100) / 100))];
  const boardCard = board
    ? parseFloat(getComputedStyle(board).getPropertyValue('--table-card')) || 48
    : 48;
  const captureCard = board
    ? parseFloat(getComputedStyle(board).getPropertyValue('--capture-card')) || 32
    : 32;
  for (const card of board?.querySelectorAll<HTMLElement>(
    '.hand .card, .floor .card, .captured-zone .card',
  ) ?? []) {
    const expected = card.closest('.captured-zone') ? captureCard : boardCard;
    if (card.offsetWidth !== expected)
      issues.push(`card scale: ${card.offsetWidth}, expected ${expected}`);
  }
  // 클립된 카드가 가시 요소 필터에서 빠져 검사를 통과하지 않게 한다.
  for (const card of board?.querySelectorAll<HTMLElement>(
    '.hand-zone .card, .center .card, .captured-zone .card',
  ) ?? []) {
    const r = card.getBoundingClientRect(),
      painted = paintedRect(card);
    if (painted.width < r.width - 1 || painted.height < r.height - 1)
      issues.push(`clipped card: ${card.dataset['cardId']}`);
  }
  if (board && document.documentElement.scrollHeight > innerHeight + 1)
    issues.push('board document scroll');
  const rows = board ? [...board.querySelectorAll('.hand .row')] : [];
  const exposure = rows.flatMap((row) => {
    const slots = [...row.querySelectorAll<HTMLElement>('.slot')].map((el) =>
      el.getBoundingClientRect(),
    );
    return slots.slice(0, -1).map((r, i) => Math.min(1, (slots[i + 1]!.left - r.left) / r.width));
  });
  if (exposure.some((n) => n < 1 - 0.001)) issues.push(`hand exposure: ${Math.min(...exposure)}`);
  const floorCells = [...document.querySelectorAll<HTMLElement>('.floor .group')];
  const monthGaps: number[] = [];
  for (const cell of floorCells) {
    const peers = floorCells.filter(
      (other) => other !== cell && other.dataset['month'] === cell.dataset['month'],
    );
    if (!peers.length) continue;
    const a = cell.getBoundingClientRect();
    const distance = Math.min(
      ...peers.map((other) => {
        const b = other.getBoundingClientRect();
        return Math.hypot(
          Math.max(0, a.left - b.right, b.left - a.right),
          Math.max(0, a.top - b.bottom, b.top - a.bottom),
        );
      }),
    );
    monthGaps.push(distance);
    const slot = Number(cell.dataset['floorSlot']);
    if (
      !peers.some((peer) => {
        const other = Number(peer.dataset['floorSlot']);
        return (
          Math.max(
            Math.abs((slot % 5) - (other % 5)),
            Math.abs(Math.floor(slot / 5) - Math.floor(other / 5)),
          ) === 1
        );
      })
    )
      issues.push(`month separated: ${cell.dataset['month']}`);
  }
  const grid = board?.querySelector('.floor')?.getBoundingClientRect();
  if (grid) {
    const cw = Math.min(boardCard * 1.25, grid.width / 5),
      ch = Math.min(boardCard / 0.614 + boardCard / 4, grid.height / 3);
    const used = new Set<number>();
    for (const cell of floorCells) {
      const slot = Number(cell.dataset['floorSlot']),
        r = cell.getBoundingClientRect();
      if (!Number.isInteger(slot) || slot < 0 || slot > 14 || slot === 7 || used.has(slot))
        issues.push(`floor grid slot: ${slot}`);
      used.add(slot);
      const left = grid.left + (grid.width - 5 * cw) / 2 + (slot % 5) * cw;
      const top = grid.top + (grid.height - 3 * ch) / 2 + Math.floor(slot / 5) * ch;
      if (
        r.left < left - 0.5 ||
        r.right > left + cw + 0.5 ||
        r.top < top - 0.5 ||
        r.bottom > top + ch + 0.5
      )
        issues.push(`floor outside cell: ${slot}`);
    }
  }
  const center = board?.querySelector('.center')?.getBoundingClientRect();
  // 진영의 상태판은 차례와 무관하게 같은 바탕·안쪽 여백을 가진다.
  const seatPanels = [...(board?.querySelectorAll<HTMLElement>('.opponent-hud, .mine-hud') ?? [])];
  if (seatPanels.length === 2) {
    const styles = seatPanels.map((el) => getComputedStyle(el));
    for (const property of [
      'backgroundColor',
      'paddingTop',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'borderRadius',
    ] as const)
      if (styles[0]![property] !== styles[1]![property])
        issues.push(`seat style mismatch: ${property}`);
    if (styles[0]!.backgroundColor === 'rgba(0, 0, 0, 0)') issues.push('seat background missing');
    const opponentCapture = board
      ?.querySelector('.captured-zone:not(.mine)')
      ?.getBoundingClientRect();
    const ownCapture = board?.querySelector('.captured-zone.mine')?.getBoundingClientRect();
    const opponent = seatPanels[0]!.getBoundingClientRect();
    const own = seatPanels[1]!.getBoundingClientRect();
    const sideLayout = getComputedStyle(board!).gridTemplateColumns.split(' ').length > 1;
    if (!sideLayout && opponentCapture && opponent.top - opponentCapture.bottom < 5.5)
      issues.push('opponent summary gap');
    if (!sideLayout && ownCapture && ownCapture.top - own.bottom < 5.5)
      issues.push('own summary gap');
    const firstHandCard = board?.querySelector('.hand .card')?.getBoundingClientRect();
    if (!sideLayout && ownCapture && firstHandCard && firstHandCard.top - ownCapture.bottom < 17.5)
      issues.push('captured/hand separation');
  }
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
    monthGaps,
    handCount: board?.querySelectorAll('.hand .slot').length ?? 0,
    floorCount: board?.querySelectorAll('.floor .card').length ?? 0,
  };
}

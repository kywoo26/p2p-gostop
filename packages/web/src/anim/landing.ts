// UX-15~17 / #200: 원 CardId의 before pose와 일시 관계을 Playback 수명 안에서만 보관한다.
// geometry는 권위 판/저장에 넣지 않는다. 복제는 입력·ARIA·canonical 카드 측정에서 제외한다.
import { getCard, type CardId } from '@p2p-gostop/engine';
import { durScale, scaledMs } from './durations.ts';

export interface CardPose {
  readonly rect: DOMRectReadOnly;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

export function originalCards(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
    (el) => el.closest('dialog') === null,
  );
}

/** AABB는 center에만 사용. 회전 전 CSS 크기에 부모 회전을 한 번만 적용한다. */
export function cardPose(el: HTMLElement, root: HTMLElement): CardPose {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  let angle = 0;
  for (
    let parent: HTMLElement | null = el;
    parent !== null && parent !== root;
    parent = parent.parentElement
  ) {
    const s = getComputedStyle(parent);
    if (s.rotate !== 'none') angle += parseFloat(s.rotate) || 0;
    if (s.transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(s.transform);
      angle += (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    }
  }
  return {
    rect,
    width: parseFloat(style.width) || rect.width,
    height: parseFloat(style.height) || rect.height,
    angle,
  };
}

function shifted(pose: CardPose, x: number, y: number): CardPose {
  return {
    ...pose,
    rect: new DOMRect(pose.rect.x + x, pose.rect.y + y, pose.rect.width, pose.rect.height),
  };
}

function paintOutset(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const outline =
    style.outlineStyle === 'none'
      ? 0
      : Math.max(0, (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0));
  // 색 함수 안의 쉼표는 분리하지 않는다. 현재 Card는 outline만 쓰지만 더미의 shadow도 보호한다.
  let shadow = 0;
  for (const part of style.boxShadow.split(/,(?![^()]*\))/)) {
    if (part.includes('inset')) continue;
    const values = [...part.matchAll(/(-?[\d.]+)px/g)].map((match) => Number(match[1]));
    if (values.length < 2) continue;
    shadow = Math.max(
      shadow,
      Math.max(Math.abs(values[0]!), Math.abs(values[1]!)) +
        (values[2] ?? 0) * 1.5 +
        (values[3] ?? 0),
    );
  }
  return Math.max(outline, shadow);
}
function painted(pose: CardPose, outset: number): DOMRectReadOnly {
  // rect는 이미 회전된 AABB다. 바깥 outline만 해당 회전의 축 투영으로 한 번 확장한다.
  const radians = (pose.angle * Math.PI) / 180;
  const pad = outset * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  return new DOMRect(
    pose.rect.x - pad,
    pose.rect.y - pad,
    pose.rect.width + pad * 2,
    pose.rect.height + pad * 2,
  );
}
function overlaps(a: DOMRectReadOnly, b: DOMRectReadOnly): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
interface HeldCard {
  readonly el: HTMLElement;
  readonly outset: number;
  readonly fromFloor: boolean;
  contacted: boolean;
  pose: CardPose;
}

export class LandingScene {
  private layer: HTMLElement | null = null;
  private cards = new Map<CardId, HeldCard>();
  private hidden = new Map<HTMLElement, string>();
  private origin: DOMRectReadOnly | null = null;
  private disposed = false;

  readonly root: HTMLElement;
  constructor(root: HTMLElement) {
    this.root = root;
  }

  has(id: CardId): boolean {
    return this.cards.has(id);
  }

  pose(id: CardId): CardPose | undefined {
    return this.cards.get(id)?.pose;
  }

  /** 복원/빈 snapshot은 현재 관계로 즉시 맞추고 과거 관계를 재생하지 않는다. */
  placeContact(card: CardId, target: CardId): void {
    const keptTarget = this.has(target);
    const to = this.contactPose(target, card);
    if (to === undefined) return;
    const held = this.reserve(card);
    if (held === undefined) {
      if (!keptTarget) this.release([target]);
      return;
    }
    held.el.style.width = `${to.width}px`;
    held.el.style.height = `${to.height}px`;
    this.place(held, to);
  }

  settle(ids: readonly CardId[], duration: number): Animation[] {
    return ids.flatMap((id) => {
      if (!this.has(id)) return [];
      const el = originalCards(this.root).find((el) => Number(el.dataset['cardId']) === id);
      if (el === undefined) return [];
      const a = this.move(id, cardPose(el, this.root), duration);
      return a === undefined ? [] : [a];
    });
  }

  /** commit 전에 호출해 제거될 원본까지 확보한다. 새 CardId는 공개 DOM이 생긴 뒤에만 확보한다. */
  reserve(id: CardId): HeldCard | undefined {
    if (this.disposed) return undefined;
    const kept = this.cards.get(id);
    if (kept !== undefined) return kept;
    const source = originalCards(this.root).find((el) => Number(el.dataset['cardId']) === id);
    if (source === undefined) return undefined;
    return this.reserveFrom(id, source);
  }

  private reserveFrom(id: CardId, source: HTMLElement): HeldCard | undefined {
    if (this.disposed) return undefined;
    const kept = this.cards.get(id);
    if (kept !== undefined) return kept;
    const pose = cardPose(source, this.root);
    if (pose.rect.width <= 0 || pose.rect.height <= 0) return undefined;
    if (this.layer === null) {
      this.origin = this.root.getBoundingClientRect();
      this.layer = document.createElement('div');
      this.layer.dataset['landingScene'] = '';
      this.layer.inert = true;
      this.layer.setAttribute('aria-hidden', 'true');
      this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;';
      this.root.append(this.layer);
    }
    const el = source.cloneNode(true) as HTMLElement;
    for (const node of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      node.removeAttribute('id');
      node.removeAttribute('data-card-id');
      node.removeAttribute('aria-label');
      node.removeAttribute('role');
    }
    el.dataset['motionCardId'] = String(id);
    // CSS 변수/부모 transform을 clone의 새 부모에서 다시 상속하지 않는다.
    el.style.cssText = `position:absolute;left:0;top:0;margin:0;width:${pose.width}px;height:${pose.height}px;rotate:none;translate:none;visibility:visible;pointer-events:none;`;
    this.layer.append(el);
    const held = {
      el,
      pose,
      outset: paintOutset(el),
      fromFloor: source.closest('[aria-label="바닥"]') !== null,
      contacted: false,
    };
    this.cards.set(id, held);
    this.place(held, pose);
    this.hideOriginals();
    return held;
  }

  hideOriginals(): void {
    for (const el of originalCards(this.root)) {
      if (!this.cards.has(Number(el.dataset['cardId']))) continue;
      if (!this.hidden.has(el)) this.hidden.set(el, el.style.visibility);
      el.style.visibility = 'hidden';
    }
  }

  private transform(pose: CardPose, width = pose.width, height = pose.height): string {
    const origin = this.origin!;
    const x = pose.rect.left + pose.rect.width / 2 - origin.left - width / 2;
    const y = pose.rect.top + pose.rect.height / 2 - origin.top - height / 2;
    return `translate(${x}px, ${y}px) rotate(${pose.angle}deg)`;
  }

  private place(card: HeldCard, pose: CardPose): void {
    card.el.style.transform = this.transform(pose);
    card.pose = pose;
  }

  move(id: CardId, to: CardPose, duration: number, via?: CardPose): Animation | undefined {
    const card = this.reserve(id);
    if (card === undefined) return undefined;
    const from = card.pose;
    const frames: Keyframe[] = [{ transform: this.transform(from) }];
    if (via !== undefined)
      frames.push({ transform: this.transform(via, from.width, from.height), offset: 0.45 });
    frames.push({ transform: this.transform(to, from.width, from.height) });
    // 크기는 transform으로만 보간한다. committed clone은 before 크기를 유지한다.
    for (const [i, pose] of [from, ...(via === undefined ? [] : [via]), to].entries()) {
      frames[i]!.transform += ` scale(${pose.width / from.width}, ${pose.height / from.height})`;
    }
    card.el.style.willChange = 'transform, opacity';
    const animation = card.el.animate(frames, {
      duration: scaledMs(duration, this.root),
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'forwards',
    });
    const done = () => {
      if (this.cards.get(id) !== card) return;
      // clone의 기준 크기도 함께 갱신해 다음 이동의 scale을 중복 적용하지 않는다.
      card.el.style.width = `${to.width}px`;
      card.el.style.height = `${to.height}px`;
      this.place(card, to);
      card.el.style.removeProperty('will-change');
      animation.cancel();
    };
    animation.finished.then(done, done);
    return animation;
  }

  private obstacles(target: CardId, incoming?: CardId): DOMRectReadOnly[] {
    const month = getCard(target).month;
    const obstacles: DOMRectReadOnly[] = [];
    const staged = new Set<CardId>();
    for (const el of originalCards(this.root)) {
      const id = Number(el.dataset['cardId']);
      if (el.closest('.staging') !== null) staged.add(id);
      if (
        id === incoming ||
        id === target ||
        getCard(id).month === month ||
        (el.closest('[aria-label="바닥"]') === null && el.closest('.staging') === null) ||
        this.cards.has(id)
      )
        continue;
      obstacles.push(painted(cardPose(el, this.root), paintOutset(el)));
    }
    // commit이 지운 원본도 예약 pose로 보호한다. 현재 다른 월의 관계 카드를 포함한다.
    for (const [id, held] of this.cards) {
      if (
        id === incoming ||
        id === target ||
        getCard(id).month === month ||
        !(held.fromFloor || held.contacted || staged.has(id))
      )
        continue;
      obstacles.push(painted(held.pose, held.outset));
    }
    for (const el of this.root.querySelectorAll<HTMLElement>(
      '.deck-stack, .deck-count, .hand-zone, .hud, .mine-hud, .decision-area',
    )) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        obstacles.push(painted(cardPose(el, this.root), paintOutset(el)));
    }
    return obstacles;
  }

  /** 다른 월·더미/UI paint와 겹친 출발은 월 묶음 전체를 실제 획득 후 표시로 제한한다. */
  prepareCapture(ids: readonly CardId[], floorIds: readonly CardId[]): Map<CardId, CardPose> {
    if (ids.length === 0) return new Map();
    const originals = originalCards(this.root);
    const floor = new Set(
      originals
        .filter((el) => el.closest('[aria-label="바닥"]') !== null)
        .map((el) => Number(el.dataset['cardId'])),
    );
    // 원본 소실로 보호 영역 목록이 비어도 안전하다고 결론 내리지 않는다.
    const complete = floorIds.every(
      (id) => floor.has(id) || this.cards.get(id)?.fromFloor || this.cards.get(id)?.contacted,
    );
    const held = ids.map((id) => [id, this.reserve(id)] as const);
    const unsafeMonths = new Set<ReturnType<typeof getCard>['month']>();
    for (const [id, card] of held) {
      const tableSource =
        floorIds.includes(id) ||
        card?.fromFloor ||
        card?.contacted ||
        originals.some(
          (el) => Number(el.dataset['cardId']) === id && el.closest('.staging') !== null,
        );
      if (
        card === undefined ||
        (tableSource &&
          (!complete ||
            this.obstacles(id).some((obstacle) =>
              overlaps(painted(card.pose, card.outset), obstacle),
            )))
      )
        unsafeMonths.add(getCard(id).month);
    }
    const unsafe = ids.filter((id) => unsafeMonths.has(getCard(id).month));
    const sources = new Map(
      held.flatMap(([id, card]) =>
        card === undefined || unsafe.includes(id) ? [] : [[id, card.pose] as const],
      ),
    );
    // 같은 프레임 안에서 되돌려 실패한 임시 clone/원본 숨김을 남기지 않는다.
    this.release(unsafe);
    return sources;
  }

  /** 실제 선택 원본의 예약 pose. append/top/월 anchor는 사용하지 않는다. */
  contactPose(target: CardId, incoming?: CardId): CardPose | undefined {
    const keptTarget = this.has(target);
    const targetCard = this.reserve(target);
    if (targetCard === undefined) return undefined;
    const pose = targetCard.pose;
    const obstacles = this.obstacles(target, incoming);
    const bounds = (
      this.root.querySelector<HTMLElement>('.table') ?? this.root
    ).getBoundingClientRect();
    const incomingEl = incoming === undefined ? undefined : this.reserve(incoming);
    if (incoming !== undefined && incomingEl === undefined) {
      if (!keptTarget) this.release([target]);
      return undefined;
    }
    const outset = incomingEl?.outset ?? targetCard.outset;
    const radians = (pose.angle * Math.PI) / 180;
    // 유한 방향·감소 후보. 두 그림이 보이는 비율을 남기고 원 target은 이동시키지 않는다.
    for (const amount of [0.38, 0.32, 0.26, 0.2, 0.14]) {
      for (const [dx, dy] of [
        [1, -0.45],
        [-1, -0.45],
        [1, 0.45],
        [-1, 0.45],
        [0.45, -1],
        [-0.45, -1],
        [0.45, 1],
        [-0.45, 1],
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        const x = pose.width * amount * dx!,
          y = pose.height * amount * dy!;
        const candidate = shifted(
          pose,
          x * Math.cos(radians) - y * Math.sin(radians),
          x * Math.sin(radians) + y * Math.cos(radians),
        );
        const paint = painted(candidate, outset);
        if (
          paint.left < bounds.left ||
          paint.right > bounds.right ||
          paint.top < bounds.top ||
          paint.bottom > bounds.bottom ||
          obstacles.some((obstacle) => overlaps(paint, obstacle))
        )
          continue;
        if (incomingEl !== undefined) incomingEl.contacted = true;
        return candidate;
      }
    }
    // 안전 후보가 없으면 공개 settled 표현으로 제한한다. 침범 offset을 강제하지 않는다.
    if (incoming !== undefined) this.release([incoming]);
    if (!keptTarget) this.release([target]);
    return undefined;
  }

  /** 출발 제한 카드의 강조는 Captured commit 후 존재하는 실제 획득 원본에만 만든다. */
  pulseCaptured(ids: readonly CardId[], duration: number): Animation[] {
    const originals = originalCards(this.root);
    const visible = ids.filter((id) => {
      const source = originals.find(
        (el) => Number(el.dataset['cardId']) === id && el.closest('.captured-zone') !== null,
      );
      return source !== undefined && this.reserveFrom(id, source) !== undefined;
    });
    return this.pulse(visible, true, duration);
  }

  pulse(ids: readonly CardId[], strong: boolean, duration: number): Animation[] {
    if (durScale(this.root) === 0) return [];
    return ids.flatMap((id) => {
      const card = this.reserve(id);
      if (card === undefined) return [];
      if (strong) {
        for (const old of card.el.querySelectorAll<HTMLElement>('[data-contact-light]')) {
          old.getAnimations().forEach((animation) => animation.cancel());
          old.remove();
        }
      }
      const light = document.createElement('span');
      light.style.cssText = `position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 ${strong ? 13 : 7}px ${strong ? 4 : 2}px oklch(85% 0.10 85 / ${strong ? 0.85 : 0.35});opacity:0;`;
      light.dataset['contactLight'] = strong ? 'capture' : 'contact';
      card.el.append(light);
      const animation = light.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }],
        { duration: scaledMs(duration, this.root), fill: 'both' },
      );
      const done = () => light.remove();
      animation.finished.then(done, done);
      return [animation];
    });
  }

  release(ids: readonly CardId[]): void {
    for (const id of ids) {
      const card = this.cards.get(id);
      this.cards.delete(id);
      card?.el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      card?.el.remove();
    }
    for (const [el, visibility] of this.hidden) {
      if (this.cards.has(Number(el.dataset['cardId']))) continue;
      el.style.visibility = visibility;
      this.hidden.delete(el);
    }
    if (this.cards.size === 0) {
      this.layer?.remove();
      this.layer = null;
      this.origin = null;
    }
  }

  clear(): void {
    this.release([...this.cards.keys()]);
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }
}

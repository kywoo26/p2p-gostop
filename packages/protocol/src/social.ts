// #246 / FR-SC-01~03·NP-SC-01/02·NF-SC-01: 게임 상태와 별개인 유한 사회표현.
// 시각·난수·grapheme 분할은 호출자가 주입한다. I/O·타이머·게임 RNG·저장·로그는 없다.
export const SOCIAL_LIMITS = Object.freeze({
  graphemes: 80,
  scalars: 320,
  textBytes: 1024,
  frameBytes: 2048,
  sendMs: 2000,
  receiveMs: 5000,
  receiveCount: 2,
  visibleCount: 2,
  visibleMs: 10000,
  announceMs: 5000,
});
export const SOCIAL_EMOTES = ['smile', 'thanks', 'surprise'] as const;
export const SOCIAL_PHRASES = ['hello', 'good-game', 'one-moment'] as const;
export type SocialBody =
  | { readonly kind: 'emote'; readonly id: (typeof SOCIAL_EMOTES)[number] }
  | { readonly kind: 'phrase'; readonly id: (typeof SOCIAL_PHRASES)[number] }
  | { readonly kind: 'text'; readonly text: string };
export type GraphemeSplitter = (text: string) => Iterable<string>;
export type SocialTextError =
  | 'empty'
  | 'invalidUnicode'
  | 'control'
  | 'graphemes'
  | 'scalars'
  | 'bytes'
  | 'segmentation';
export type SocialTextResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly graphemes: number;
      readonly scalars: number;
      readonly bytes: number;
    }
  | { readonly ok: false; readonly reason: SocialTextError };

/** UTF-16 단독 surrogate를 UTF-8 replacement로 몰래 바꾸지 않는다. */
function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** 프레임 상한에도 쓰는 UTF-8 바이트 수. 문자열을 저장하거나 인코딩하지 않는다. */
export function socialByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function forbidden(char: string): boolean {
  const cp = char.codePointAt(0)!;
  if (cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || cp === 0x2028 || cp === 0x2029) return true;
  // 정상 글자 연결/emoji의 ZWJ·ZWNJ는 유지한다. 다른 Cf는 bidi/숨은 제어다.
  return /\p{Cf}/u.test(char) && cp !== 0x200c && cp !== 0x200d;
}

export function validateSocialText(value: unknown, split: GraphemeSplitter): SocialTextResult {
  if (typeof value !== 'string') return { ok: false, reason: 'invalidUnicode' };
  // normalize/분할 전에 raw 입력 자체를 유한하게 제한한다. 자르거나 제어문자를 지우지 않는다.
  // NFC 전의 합법 분해 문자가 normalized scalar 상한을 넘는 것으로 오인되지 않게 한다.
  if (value.length > SOCIAL_LIMITS.frameBytes * 2) return { ok: false, reason: 'scalars' };
  if (!wellFormed(value)) return { ok: false, reason: 'invalidUnicode' };
  const text = value.normalize('NFC');
  if (text.length > SOCIAL_LIMITS.scalars * 2) return { ok: false, reason: 'scalars' };
  // 완결된 emoji flag tag만 예외다. 검사용 복사에서 확인하고 전송 본문은 그대로 유지한다.
  const controlInput = text.replace(/\u{1f3f4}[\u{e0020}-\u{e007e}]+\u{e007f}/gu, '\u{1f3f4}');
  for (const char of controlInput) if (forbidden(char)) return { ok: false, reason: 'control' };
  // scalar 상한은 grapheme와 별개다. 위 NFC UTF-16 상한으로 이 배열도 유한하다.
  const scalars = Array.from(text).length;
  if (scalars > SOCIAL_LIMITS.scalars) return { ok: false, reason: 'scalars' };
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(text)) return { ok: false, reason: 'empty' };
  const bytes = socialByteLength(text);
  if (bytes > SOCIAL_LIMITS.textBytes) return { ok: false, reason: 'bytes' };
  let graphemes = 0;
  let joined = '';
  try {
    for (const segment of split(text)) {
      if (typeof segment !== 'string' || segment.length === 0)
        return { ok: false, reason: 'segmentation' };
      if (++graphemes > SOCIAL_LIMITS.graphemes) return { ok: false, reason: 'graphemes' };
      joined += segment;
      if (joined.length > text.length) return { ok: false, reason: 'segmentation' };
    }
  } catch {
    return { ok: false, reason: 'segmentation' };
  }
  if (joined !== text) return { ok: false, reason: 'segmentation' };
  return { ok: true, text, scalars, bytes, graphemes };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}
export function validateSocialBody(value: unknown, split: GraphemeSplitter): SocialBody | null {
  try {
    if (!record(value)) return null;
    if (value.kind === 'text' && keys(value, ['kind', 'text'])) {
      const checked = validateSocialText(value.text, split);
      return checked.ok ? { kind: 'text', text: checked.text } : null;
    }
    if (!keys(value, ['kind', 'id'])) return null;
    if (value.kind === 'emote')
      for (const id of SOCIAL_EMOTES) if (id === value.id) return { kind: 'emote', id };
    if (value.kind === 'phrase')
      for (const id of SOCIAL_PHRASES) if (id === value.id) return { kind: 'phrase', id };
    return null;
  } catch {
    return null;
  }
}

export interface SocialReadyFrame {
  readonly t: 'socialReady';
  readonly epoch: string;
  readonly receiveNonce: string | null;
}
export interface SocialFrame {
  readonly t: 'social';
  readonly epoch: string;
  readonly toNonce: string;
  readonly socialSeq: number;
  readonly body: SocialBody;
}
export type SocialMessage = SocialReadyFrame | SocialFrame;
const NONCE = /^[a-f0-9]{32}$/;
const EPOCH = /^[A-Za-z0-9_-]{1,64}$/;

/** 인증의 대용물이 아니다. adapter가 기존 세션 인증을 먼저 확인한다. */
export function parseSocialMessage(raw: unknown, split: GraphemeSplitter): SocialMessage | null {
  try {
    if (
      typeof raw !== 'string' ||
      raw.length > SOCIAL_LIMITS.frameBytes ||
      socialByteLength(raw) > SOCIAL_LIMITS.frameBytes
    )
      return null;
    const value: unknown = JSON.parse(raw);
    if (!record(value) || typeof value.epoch !== 'string' || !EPOCH.test(value.epoch)) return null;
    if (value.t === 'socialReady' && keys(value, ['t', 'epoch', 'receiveNonce'])) {
      if (
        value.receiveNonce === null ||
        (typeof value.receiveNonce === 'string' && NONCE.test(value.receiveNonce))
      )
        return { t: 'socialReady', epoch: value.epoch, receiveNonce: value.receiveNonce };
      return null;
    }
    if (!keys(value, ['t', 'epoch', 'toNonce', 'socialSeq', 'body']) || value.t !== 'social')
      return null;
    if (
      typeof value.toNonce !== 'string' ||
      !NONCE.test(value.toNonce) ||
      typeof value.socialSeq !== 'number' ||
      !Number.isSafeInteger(value.socialSeq) ||
      value.socialSeq < 1
    )
      return null;
    const body = validateSocialBody(value.body, split);
    return body === null
      ? null
      : {
          t: 'social',
          epoch: value.epoch,
          toNonce: value.toNonce,
          socialSeq: value.socialSeq,
          body,
        };
  } catch {
    return null;
  }
}

/** 시각은 최대 2개만. 무효 입력도 예산을 소비하고 clockback으로 회복하지 않는다. */
export class SocialRate {
  private now = 0;
  private times: number[] = [];
  take(at: number): boolean {
    if (!Number.isFinite(at) || at < 0) return false;
    this.now = Math.max(this.now, at);
    this.times = this.times.filter((time) => time > this.now - SOCIAL_LIMITS.receiveMs);
    if (this.times.length >= SOCIAL_LIMITS.receiveCount) return false;
    this.times.push(this.now);
    return true;
  }
}

export interface SocialContext {
  readonly epoch: string;
  readonly authenticated: boolean;
  readonly connected: boolean;
  readonly visible: boolean;
  readonly muted: boolean;
}
export interface SocialEntry {
  readonly id: number;
  readonly body: SocialBody;
  readonly expiresAt: number;
}

export interface SocialReceivedContent {
  readonly entry: SocialEntry;
  readonly announce: boolean;
}
export interface SocialReception {
  readonly content: SocialReceivedContent | null;
  /** 유효한 새 non-null peer nonce에만 자기 현재 nonce를 1회 재광고한다. 회전/큐/ACK0. */
  readonly ready: SocialReadyFrame | null;
}

/** 게임/원장을 받지 않는다. 같은 peer nonce에는 응답하지 않아 유한 재광고가 끝난다. */
export class SocialChannel {
  private context: SocialContext | null = null;
  private localNonce: string | null = null;
  private previousNonce: string | null = null;
  private peerNonce: string | null = null;
  private sequence = 0;
  private received = 0;
  private entryId = 0;
  private entries: SocialEntry[] = [];
  private now = 0;
  private lastSend: number | null = null;
  private lastAnnouncement: number | null = null;
  private readonly contentRate = new SocialRate();
  private readonly readyRate = new SocialRate();
  private readonly split: GraphemeSplitter;
  private readonly nonce: () => string;

  constructor(options: { readonly split: GraphemeSplitter; readonly nonce: () => string }) {
    this.split = options.split;
    this.nonce = options.nonce;
  }
  private time(at: number): number | null {
    if (!Number.isFinite(at) || at < 0) return null;
    this.now = Math.max(this.now, at);
    return this.now;
  }
  private linked(): boolean {
    const c = this.context;
    return c !== null && EPOCH.test(c.epoch) && c.authenticated && c.connected && c.visible;
  }
  /** UI의 대화 가용성만. 게임 연결/차례/시한 판정에는 쓰지 않는다. */
  canSend(at?: number): boolean {
    if (!this.linked() || this.peerNonce === null) return false;
    if (at === undefined) return true;
    const now = this.time(at);
    return now !== null && (this.lastSend === null || now - this.lastSend >= SOCIAL_LIMITS.sendMs);
  }
  setContext(context: SocialContext): SocialReadyFrame | null {
    const before = this.context;
    const changed =
      before === null ||
      before.epoch !== context.epoch ||
      before.authenticated !== context.authenticated ||
      before.connected !== context.connected ||
      before.visible !== context.visible ||
      before.muted !== context.muted;
    this.context = {
      epoch: context.epoch,
      authenticated: context.authenticated,
      connected: context.connected,
      visible: context.visible,
      muted: context.muted,
    };
    if (!changed) return null;
    this.entries = [];
    // mute/숨김/재연결로 낭독·송수신 간격 예산을 초기화하지 않는다.
    this.localNonce = null;
    this.received = 0;
    if (
      before?.epoch !== context.epoch ||
      !context.connected ||
      !context.authenticated ||
      !context.visible
    ) {
      this.peerNonce = null;
      this.sequence = 0;
    }
    return this.refreshReady();
  }
  /** 패널 재열기에 한 번만. 주기 retry/queue를 만들지 않는다. */
  refreshReady(): SocialReadyFrame | null {
    if (!this.linked()) return null;
    const c = this.context!;
    this.localNonce = null;
    this.received = 0;
    if (!c.muted) {
      try {
        const next = this.nonce();
        if (!NONCE.test(next) || next === this.previousNonce) return null;
        this.localNonce = next;
        this.previousNonce = next;
      } catch {
        return null;
      }
    }
    return { t: 'socialReady', epoch: c.epoch, receiveNonce: this.localNonce };
  }
  /** 명시 open에서 현재 창구만 재광고한다. nonce/received/예산을 초기화하지 않는다. */
  advertiseReady(): SocialReadyFrame | null {
    if (!this.linked() || (!this.context!.muted && this.localNonce === null)) return null;
    return {
      t: 'socialReady',
      epoch: this.context!.epoch,
      receiveNonce: this.localNonce,
    };
  }
  prepare(body: unknown, at: number): SocialFrame | null {
    const now = this.time(at);
    if (
      now === null ||
      !this.linked() ||
      this.peerNonce === null ||
      (this.lastSend !== null && now - this.lastSend < SOCIAL_LIMITS.sendMs) ||
      this.sequence >= Number.MAX_SAFE_INTEGER
    )
      return null;
    const valid = validateSocialBody(body, this.split);
    if (valid === null) return null;
    // 전송 실패에도 냉각을 지우지 않는다. offline 재전송 대기는 보관하지 않는다.
    this.lastSend = now;
    const frame: SocialFrame = {
      t: 'social',
      epoch: this.context!.epoch,
      toNonce: this.peerNonce,
      socialSeq: ++this.sequence,
      body: valid,
    };
    return socialByteLength(JSON.stringify(frame)) <= SOCIAL_LIMITS.frameBytes ? frame : null;
  }
  /** 기존 content-only 소비자는 ready를 처리하지 않는다. adapter는 아래 I/O 없는 반환을 쓴다. */
  receive(raw: unknown, at: number): SocialReceivedContent | null {
    return this.receiveWithReady(raw, at).content;
  }
  receiveWithReady(raw: unknown, at: number): SocialReception {
    const empty: SocialReception = { content: null, ready: null };
    const now = this.time(at);
    if (now === null || !this.linked()) return empty;
    // 잘못된 ready도 유한하게 제한한다. 내용을 로그에 남기지 않는다.
    let ready = false;
    if (
      typeof raw === 'string' &&
      raw.length <= SOCIAL_LIMITS.frameBytes &&
      socialByteLength(raw) <= SOCIAL_LIMITS.frameBytes
    ) {
      try {
        const head: unknown = JSON.parse(raw);
        ready = record(head) && head.t === 'socialReady';
      } catch {
        /* 잘못된 JSON은 content 예산에서 제한한다. */
      }
    }
    if (!(ready ? this.readyRate : this.contentRate).take(now)) return empty;
    const frame = parseSocialMessage(raw, this.split);
    if (frame === null || frame.epoch !== this.context!.epoch) return empty;
    if (frame.t === 'socialReady') {
      const changed = this.peerNonce !== frame.receiveNonce;
      this.peerNonce = frame.receiveNonce;
      // null은 상대의 수신 중단이다. 같은 nonce/중복에는 응답하지 않는다.
      if (!changed || frame.receiveNonce === null) return empty;
      return {
        content: null,
        ready: {
          t: 'socialReady',
          epoch: this.context!.epoch,
          receiveNonce: this.localNonce,
        },
      };
    }
    if (
      this.context!.muted ||
      this.localNonce === null ||
      frame.toNonce !== this.localNonce ||
      frame.socialSeq <= this.received
    )
      return empty;
    this.received = frame.socialSeq;
    const entry: SocialEntry = {
      id: ++this.entryId,
      body: frame.body,
      expiresAt: now + SOCIAL_LIMITS.visibleMs,
    };
    this.entries = [...this.visible(now), entry].slice(-SOCIAL_LIMITS.visibleCount);
    const announce =
      this.lastAnnouncement === null || now - this.lastAnnouncement >= SOCIAL_LIMITS.announceMs;
    if (announce) this.lastAnnouncement = now;
    return { content: { entry, announce }, ready: null };
  }
  visible(at: number): readonly SocialEntry[] {
    const now = this.time(at);
    if (now === null) return [];
    this.entries = this.entries.filter((entry) => entry.expiresAt > now);
    return this.entries;
  }
}

/** 수신 창구의 분류만. 본문 검증·인증은 각 전용 경계에서 수행한다. */
export function isSocialFrame(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    const value: unknown = JSON.parse(raw);
    return record(value) && typeof value.t === 'string' && value.t.startsWith('social');
  } catch {
    // t가 선두인 손상된 전용 envelope도 게임 오류/활동 경로로 보내지 않는다.
    return /^\s*\{\s*"t"\s*:\s*"social[^"\r\n]*"/.test(raw);
  }
}

/** ECMA-402 native grapheme. 미지원이면 표현만 실패하며 게임 호환성을 대신하지 않는다. */
export function* splitSocialGraphemes(text: string): Iterable<string> {
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  for (const item of segmenter.segment(text)) yield item.segment;
}

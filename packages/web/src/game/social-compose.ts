// #246 / UX-SC-01: 입력 상태만 관리한다. 검증은 공개 protocol helper를 주입하며 중복 구현하지 않는다.
export type ComposeValidation =
  | {
      readonly ok: true;
      readonly text: string;
      readonly graphemes: number;
      readonly scalars: number;
      readonly bytes: number;
    }
  | { readonly ok: false; readonly reason: string };
export type SocialTextValidator = (text: string) => ComposeValidation;
export interface ComposeState {
  readonly draft: string;
  readonly composing: boolean;
  readonly error: string | null;
}
export const EMPTY_COMPOSE: ComposeState = Object.freeze({
  draft: '',
  composing: false,
  error: null,
});

export function editCompose(state: ComposeState, draft: string): ComposeState {
  return { ...state, draft, error: null };
}
export function composeInput(state: ComposeState, composing: boolean): ComposeState {
  return { ...state, composing, error: null };
}
export function submitCompose(
  state: ComposeState,
  validate: SocialTextValidator,
  send: (text: string) => boolean,
): ComposeState {
  if (state.composing) return state;
  try {
    const result = validate(state.draft);
    if (!result.ok) return { ...state, error: result.reason };
    return send(result.text) ? EMPTY_COMPOSE : { ...state, error: 'notSent' };
  } catch {
    // 메시지 원문이나 callback 예외를 로그/게임 오류로 전달하지 않는다.
    return { ...state, error: 'notSent' };
  }
}

// 인증·연결의 공개 상태만 받는 사회표현 adapter. 게임/저장/재전송 API는 받지 않는다.
import {
  SocialChannel,
  splitSocialGraphemes,
  validateSocialText,
  type SocialBody,
  type SocialContext,
  type SocialMessage,
} from '@p2p-gostop/protocol';

export const SOCIAL_EMOTE_CHOICES = [
  { id: 'smile', label: '미소' },
  { id: 'thanks', label: '감사' },
  { id: 'surprise', label: '놀람' },
] as const;
export const SOCIAL_PHRASE_CHOICES = [
  { id: 'hello', label: '안녕하세요' },
  { id: 'good-game', label: '좋은 경기였어요' },
  { id: 'one-moment', label: '잠시만요' },
] as const;
function socialLabel(body: SocialBody): string {
  if (body.kind === 'text') return body.text;
  const choices = body.kind === 'emote' ? SOCIAL_EMOTE_CHOICES : SOCIAL_PHRASE_CHOICES;
  return choices.find((choice) => choice.id === body.id)?.label ?? '';
}
export interface SocialView {
  readonly muted: boolean;
  readonly available: boolean;
  readonly now: number;
  readonly announceId: number | null;
  readonly entries: readonly {
    readonly id: number;
    readonly text: string;
    readonly expiresAt: number;
  }[];
}
export const EMPTY_SOCIAL: SocialView = Object.freeze({
  muted: false,
  available: false,
  now: 0,
  announceId: null,
  entries: [],
});
export interface SocialControl {
  readonly view: SocialView;
  send(body: unknown): boolean;
  mute(value: boolean): void;
  open(): void;
  validate(text: string): ComposeValidation;
}
export class SocialConversation {
  private readonly channel: SocialChannel;
  private readonly now: () => number;
  private readonly sendFrame: (frame: SocialMessage) => boolean;
  private readonly publish: (view: SocialView) => void;
  private context: Omit<SocialContext, 'muted'> = {
    epoch: '',
    authenticated: false,
    connected: false,
    visible: false,
  };
  private muted = false;
  private announceId: number | null = null;
  constructor(options: {
    readonly nonce: () => string;
    readonly now: () => number;
    readonly send: (frame: SocialMessage) => boolean;
    readonly publish: (view: SocialView) => void;
  }) {
    this.channel = new SocialChannel({ split: splitSocialGraphemes, nonce: options.nonce });
    this.now = options.now;
    this.sendFrame = options.send;
    this.publish = options.publish;
  }
  private transmit(frame: SocialMessage | null): boolean {
    if (frame === null) return false;
    try {
      return this.sendFrame(frame);
    } catch {
      return false;
    }
  }
  private display(): void {
    const now = this.now();
    const entries = this.channel.visible(now).map((entry) => ({
      id: entry.id,
      text: socialLabel(entry.body),
      expiresAt: entry.expiresAt,
    }));
    if (!entries.some((entry) => entry.id === this.announceId)) this.announceId = null;
    // 본문·예외를 로그로 넘기거나 게임 callback에 전파하지 않는다.
    try {
      this.publish({
        muted: this.muted,
        available: this.channel.canSend(now),
        now,
        entries,
        announceId: this.announceId,
      });
    } catch {
      /* 사회표현만 갱신 실패 */
    }
  }
  sync(context: Omit<SocialContext, 'muted'>): void {
    this.context = context;
    const ready = this.channel.setContext({ ...context, muted: this.muted });
    this.display();
    this.transmit(ready);
  }
  receive(raw: string): void {
    const received = this.channel.receiveWithReady(raw, this.now());
    if (received.content?.announce) this.announceId = received.content.entry.id;
    this.display();
    // 새 peer nonce에 대한 현재 ready만 즉시 반환한다. 자기 nonce 회전/대기/재시도0.
    this.transmit(received.ready);
  }
  send(body: unknown): boolean {
    const frame = this.channel.prepare(body, this.now());
    const sent = this.transmit(frame);
    this.display();
    return sent;
  }
  mute(value: boolean): void {
    this.muted = value;
    this.announceId = null;
    this.sync(this.context);
  }
  open(): void {
    // peerNonce 존재는 자기 최신 nonce의 전달 증거가 아니다. 현재 창구를 한 번 재광고한다.
    // 정상 연결은 회전/received reset0; 상대 nonce가 없는 복귀만 기존 refresh를 쓴다.
    this.transmit(
      this.channel.canSend() ? this.channel.advertiseReady() : this.channel.refreshReady(),
    );
    this.display();
  }
  validate(text: string): ComposeValidation {
    return validateSocialText(text, splitSocialGraphemes);
  }
}

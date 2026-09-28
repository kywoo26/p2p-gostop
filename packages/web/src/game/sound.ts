// 효과음 (spec 6.5: 카드 놓기·뒤집기·획득·이벤트별 짧은 음, 기본 켬, 자체 제작/CC0).
// 음원 파일 없이 Web Audio로 합성한다(자체 제작, 번들 0KB, 외부 요청 없음). Web Audio는 비보안 컨텍스트에서도 쓸 수 있다.
// 브라우저 자동 재생 정책 때문에 첫 사용자 제스처(pointerdown)에서 unlock()으로 AudioContext를 만든다.

export type SoundKind =
  | 'play'
  | 'flip'
  | 'capture'
  | 'steal'
  | 'deal'
  | 'ppeok'
  | 'jjok'
  | 'ttadak'
  | 'sseul'
  | 'shake'
  | 'bomb'
  | 'go'
  | 'stop'
  | 'payout'
  | 'end';

const MASTER_GAIN = 0.18;

type AudioCtor = new () => AudioContext;

function audioCtor(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

class SoundBoard {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Web Audio 지원 여부 (진단 화면) */
  static supported(): boolean {
    return audioCtor() !== null;
  }

  /** 사용자 제스처 안에서 부른다 (자동 재생 정책) */
  unlock(): void {
    if (!this.enabled) return;
    if (this.ctx === null) {
      const Ctor = audioCtor();
      if (Ctor === null) return;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = MASTER_GAIN;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  play(kind: SoundKind): void {
    const ctx = this.ctx;
    if (!this.enabled || ctx === null || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (kind) {
      case 'play':
        this.noise(t, 0.035, 0.5, 2400);
        this.tone(t, 0.05, 520, 'triangle', 0.35);
        break;
      case 'deal':
        this.noise(t, 0.025, 0.35, 3200);
        break;
      case 'flip':
        this.noise(t, 0.07, 0.45, 1600);
        break;
      case 'capture':
        this.tone(t, 0.06, 660, 'sine', 0.45);
        this.tone(t + 0.055, 0.08, 880, 'sine', 0.4);
        break;
      case 'steal':
        this.tone(t, 0.14, 740, 'triangle', 0.4, 440);
        break;
      case 'ppeok':
        this.tone(t, 0.2, 196, 'sawtooth', 0.35, 150);
        break;
      case 'jjok':
        this.tone(t, 0.1, 1046, 'sine', 0.5, 1318);
        break;
      case 'ttadak':
        this.noise(t, 0.03, 0.6, 2800);
        this.noise(t + 0.08, 0.03, 0.6, 2800);
        break;
      case 'sseul':
        this.noise(t, 0.22, 0.4, 900, 4000);
        break;
      case 'shake':
      case 'bomb':
        this.tone(t, 0.18, 220, 'square', 0.25);
        this.tone(t, 0.18, 330, 'square', 0.2);
        break;
      case 'go':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 0.1, f, 'triangle', 0.45));
        break;
      case 'stop':
        [784, 523].forEach((f, i) => this.tone(t + i * 0.09, 0.12, f, 'triangle', 0.45));
        break;
      case 'payout':
        this.tone(t, 0.08, 988, 'sine', 0.4);
        this.tone(t + 0.07, 0.14, 1319, 'sine', 0.4);
        break;
      case 'end':
        [392, 523, 659].forEach((f, i) => this.tone(t + i * 0.05, 0.25, f, 'sine', 0.3));
        break;
    }
  }

  private tone(
    start: number,
    duration: number,
    freq: number,
    type: OscillatorType,
    gain: number,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== undefined)
      osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** 짧은 잡음(카드 스치는 소리). 필터 주파수를 옮기면 쓸어 담는 소리 */
  private noise(start: number, duration: number, gain: number, freq: number, freqEnd?: number) {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBufferOf(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, start);
    if (freqEnd !== undefined)
      filter.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  /** 0.3초 백색 잡음 (고정 시드 LCG: 결정적이고 외부 난수가 필요 없다) */
  private noiseBufferOf(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer !== null) return this.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 0.3);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let x = 0x2545f491;
    for (let i = 0; i < length; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      data[i] = x / 0x8000_0000 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}

/** 앱 전체가 공유하는 효과음 (설정 sound로 켜고 끈다) */
export const sounds = new SoundBoard();

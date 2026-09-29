// 앱 전체의 친구와 대전 상태: 호스트 방(HostGame) 또는 게스트 참가(GuestGame) 하나만 둔다.
// 화면(HostRoom·GuestApp·Game)을 오가도 연결과 판이 유지된다.
import { PRESETS } from '@p2p-gostop/engine';
import { effectiveStartBalance, type AppSettings } from '../settings/settings.svelte.ts';
import { GuestGame, type GuestOptions } from './guest.svelte.ts';
import { clearHostSave, HostGame, loadHostSave, type HostConfig } from './host.svelte.ts';
import { loadGuestState, readTicket } from './ticket.ts';

export function hostConfigFrom(settings: AppSettings): HostConfig {
  return {
    preset: settings.preset,
    rules: { ...PRESETS[settings.preset], gukjin: settings.gukjinAsk ? 'ask' : 'auto' },
    perPoint: settings.perPoint,
    startBalance: effectiveStartBalance(settings),
    hostName: settings.playerName,
  };
}

class P2pStore {
  host = $state.raw<HostGame | null>(null);
  guest = $state.raw<GuestGame | null>(null);

  /** 방 열기: 이미 열려 있으면 그대로, 아니면 새 방(저장된 세션이 있으면 이어하기 후보로) */
  openRoom(settings: AppSettings, options: { fresh?: boolean } = {}): HostGame {
    const current = this.host;
    if (current !== null && current.phase !== 'ended' && !options.fresh) return current;
    current?.dispose();
    if (options.fresh) clearHostSave();
    const saved = loadHostSave();
    const resume = saved !== null && saved.state.stage !== 'ended' ? saved : null;
    const room = new HostGame({ config: resume?.config ?? hostConfigFrom(settings), resume });
    this.host = room;
    return room;
  }

  closeRoom(): void {
    this.host?.dispose();
    this.host = null;
  }

  join(options: GuestOptions): GuestGame {
    this.guest?.dispose();
    const game = new GuestGame(options);
    this.guest = game;
    return game;
  }

  leave(): void {
    this.guest?.end();
    this.guest = null;
  }

  /** 새로고침·탭 복원: 프래그먼트에 토큰·이름이 있으면 바로 다시 참가한다 */
  resumeGuest(): GuestGame | null {
    if (this.guest !== null) return this.guest;
    const ticket = readTicket();
    if (ticket.token === null || ticket.name === null) return null;
    return this.join({
      name: ticket.name,
      token: ticket.token,
      restore: loadGuestState(ticket.name),
    });
  }
}

export const p2p = new P2pStore();

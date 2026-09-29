import { randomBytes } from 'node:crypto';
import { RoomAuth, tokenHash, type PublicRoom } from './auth.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_LIFETIME = 6 * 60 * 60_000;
export const INVITE_LIFETIME = 15 * 60_000;
export const HOST_ABSENCE = 10 * 60_000;
export const CLAIM_LEASE = 30_000;

export interface RoomState {
  readonly room: PublicRoom;
  readonly code: string;
  readonly expiresAt: number;
  readonly codeExpiresAt: number;
  hostLeftAt?: number;
  joined: boolean;
  readonly claims: Map<string, number>;
}
export function newRoomCode(): string {
  const bytes = randomBytes(8);
  let value = bytes.readBigUInt64BE() >> 4n;
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += ALPHABET[Number(value & 31n)];
    value >>= 5n;
  }
  return code;
}
export function displayCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}
function normalizeCode(code: string): string {
  return code.replaceAll('-', '').toUpperCase();
}

export class Rooms {
  readonly auth: RoomAuth;
  readonly states = new Map<string, RoomState>();
  private readonly codes = new Map<string, string>();
  constructor(secret: string) {
    this.auth = new RoomAuth(secret);
  }
  create(now = Date.now()): { state: RoomState; hostToken: string } | null {
    this.cleanup(now);
    if (this.states.size >= 4) return null;
    const { room, hostToken } = this.auth.create(now);
    let code: string;
    do {
      code = newRoomCode();
    } while (this.codes.has(code));
    const state: RoomState = {
      room,
      code,
      expiresAt: now + ROOM_LIFETIME,
      codeExpiresAt: now + INVITE_LIFETIME,
      joined: false,
      claims: new Map(),
    };
    this.states.set(room.id, state);
    this.codes.set(code, room.id);
    return { state, hostToken };
  }
  get(id: string, now = Date.now()): RoomState | undefined {
    const state = this.states.get(id);
    if (!state) return undefined;
    if (
      state.expiresAt <= now ||
      (state.hostLeftAt !== undefined && state.hostLeftAt + HOST_ABSENCE <= now)
    ) {
      this.delete(id);
      return undefined;
    }
    return state;
  }
  byCode(code: string, now = Date.now()): RoomState | undefined {
    const id = this.codes.get(normalizeCode(code));
    const state = id ? this.get(id, now) : undefined;
    return state && !state.joined && state.codeExpiresAt > now ? state : undefined;
  }
  claim(state: RoomState, token: string, now = Date.now()): boolean {
    const key = tokenHash(token).toString('hex');
    const item = state.room.credentials.get(key);
    if (!item || item.permission !== 'invite' || item.expiresAt <= now) return false;
    const until = state.claims.get(key);
    if (until !== undefined && until > now) return false;
    state.claims.set(key, now + CLAIM_LEASE);
    return true;
  }
  release(state: RoomState, token: string): void {
    state.claims.delete(tokenHash(token).toString('hex'));
  }
  confirm(state: RoomState, inviteToken: string, resumeToken: string, now = Date.now()): boolean {
    const key = tokenHash(inviteToken).toString('hex');
    const until = state.claims.get(key);
    if (until === undefined || until <= now) return false;
    if (!this.registerResume(state, resumeToken)) return false;
    state.room.credentials.delete(key);
    state.claims.delete(key);
    state.joined = true;
    this.codes.delete(state.code);
    return true;
  }
  registerResume(state: RoomState, token: string): boolean {
    const key = tokenHash(token).toString('hex');
    if (state.room.credentials.has(key)) return false;
    state.room.credentials.set(key, {
      hash: tokenHash(token),
      permission: 'resume',
      expiresAt: state.expiresAt,
    });
    return true;
  }
  delete(id: string): void {
    const state = this.states.get(id);
    if (!state) return;
    this.codes.delete(state.code);
    this.states.delete(id);
    this.auth.rooms.delete(id);
  }
  cleanup(now = Date.now()): string[] {
    const expired: string[] = [];
    for (const [id, state] of this.states) {
      if (
        state.expiresAt <= now ||
        (state.hostLeftAt !== undefined && state.hostLeftAt + HOST_ABSENCE <= now)
      ) {
        this.delete(id);
        expired.push(id);
        continue;
      }
      if (state.codeExpiresAt <= now) this.codes.delete(state.code);
      for (const [key, credential] of state.room.credentials)
        if (credential.expiresAt <= now) state.room.credentials.delete(key);
      for (const [key, until] of state.claims) if (until <= now) state.claims.delete(key);
    }
    return expired;
  }
}

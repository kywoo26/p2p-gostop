import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  Rooms,
  CLAIM_LEASE,
  HOST_ABSENCE,
  INVITE_LIFETIME,
  ROOM_LIFETIME,
  displayCode,
  newRoomCode,
} from '../src/rooms.ts';
import { SocketLimit, WindowLimit } from '../src/limits.ts';
const token = () => randomBytes(32).toString('base64url');

describe('공개 방', () => {
  it('60비트 코드 4-4-4, 충돌 방지, 4방 상한', () => {
    const code = newRoomCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    expect(displayCode(code)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const rooms = new Rooms(token());
    for (let i = 0; i < 4; i++) expect(rooms.create(1000)).not.toBeNull();
    expect(rooms.create(1000)).toBeNull();
  });
  it('초대 claim은 원자적이고 lease 만료 뒤 해제, 확정 뒤 재사용 불가', () => {
    const rooms = new Rooms(token());
    const created = rooms.create()!;
    const invite = token();
    const resume = token();
    const now = Date.now();
    expect(
      rooms.auth.register(
        created.state.room,
        created.hostToken,
        invite,
        'invite',
        now + INVITE_LIFETIME,
      ),
    ).toBe(true);
    expect(rooms.claim(created.state, invite, now)).toBe(true);
    expect(rooms.claim(created.state, invite, now)).toBe(false);
    expect(rooms.claim(created.state, invite, now + CLAIM_LEASE + 1)).toBe(true);
    expect(rooms.confirm(created.state, invite, resume, now + CLAIM_LEASE + 2)).toBe(true);
    expect(rooms.claim(created.state, invite, now + CLAIM_LEASE + 3)).toBe(false);
    expect(rooms.auth.authenticate(created.state.room, 'guest', resume)).toBe('resume');
  });
  it('코드 15분, 방 절대 6시간, host 단절 10분', () => {
    const rooms = new Rooms(token());
    const now = Date.now();
    const created = rooms.create(now)!;
    expect(rooms.byCode(created.state.code, now + INVITE_LIFETIME - 1)).toBeDefined();
    expect(rooms.byCode(created.state.code, now + INVITE_LIFETIME)).toBeUndefined();
    expect(rooms.get(created.state.room.id, now + ROOM_LIFETIME)).toBeUndefined();
    const next = rooms.create(now)!;
    next.state.hostLeftAt = now;
    expect(rooms.get(next.state.room.id, now + HOST_ABSENCE)).toBeUndefined();
  });
});

describe('제한', () => {
  it('생성/참여 고정 창과 소켓 순간40·지속20·128KiB', () => {
    const limiter = new WindowLimit();
    expect(limiter.take('ip', 2, 1000, 1000)).toBe(true);
    expect(limiter.take('ip', 2, 1000, 1000)).toBe(true);
    expect(limiter.take('ip', 2, 1000, 1000)).toBe(false);
    expect(limiter.take('ip', 2, 1000, 2001)).toBe(true);
    const socket = new SocketLimit();
    for (let i = 0; i < 40; i++) expect(socket.take(1, 1000)).toBe(true);
    expect(socket.take(1, 1000)).toBe(false);
    expect(socket.take(1, 2000)).toBe(true);
    const bytes = new SocketLimit();
    expect(bytes.take(131_072, 1000)).toBe(true);
    expect(bytes.take(1, 1000)).toBe(false);
  });
});

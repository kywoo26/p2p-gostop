// 공개 중계의 생성/역할 자격 증명. 평문은 발급 응답에서만 반환한다.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type PublicRole = 'host' | 'guest';
export type GuestPermission = 'invite' | 'resume';
export interface Credential {
  readonly hash: Buffer;
  readonly permission: GuestPermission;
  readonly expiresAt: number;
}
export interface PublicRoom {
  readonly id: string;
  readonly hostHash: Buffer;
  readonly credentials: Map<string, Credential>;
  readonly createdAt: number;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const newToken = (bytes: number): string => randomBytes(bytes).toString('base64url');
export const validToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN.test(value) && Buffer.from(value, 'base64url').length === 32;
export const tokenHash = (value: string): Buffer => createHash('sha256').update(value).digest();
const equalHash = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && timingSafeEqual(left, right);

function validCreationSecret(value: string): boolean {
  return validToken(value);
}

export class RoomAuth {
  readonly rooms = new Map<string, PublicRoom>();
  readonly creationHash: Buffer;
  private readonly issuedHostHashes = new Set<string>();
  constructor(secret: string) {
    if (!validCreationSecret(secret)) throw new Error('256-bit creation credential required');
    this.creationHash = tokenHash(secret);
  }
  canCreate(value: string): boolean {
    return validToken(value) && equalHash(this.creationHash, tokenHash(value));
  }
  create(now = Date.now()): { room: PublicRoom; hostToken: string } {
    const id = newToken(16);
    const hostToken = newToken(32);
    const room: PublicRoom = {
      id,
      hostHash: tokenHash(hostToken),
      credentials: new Map(),
      createdAt: now,
    };
    this.issuedHostHashes.add(room.hostHash.toString('hex'));
    this.rooms.set(id, room);
    return { room, hostToken };
  }
  isHost(room: PublicRoom, token: unknown): boolean {
    return validToken(token) && equalHash(room.hostHash, tokenHash(token));
  }
  register(
    room: PublicRoom,
    hostToken: unknown,
    guestToken: unknown,
    permission: GuestPermission,
    expiresAt: number,
    now = Date.now(),
  ): boolean {
    if (!this.isHost(room, hostToken)) return false;
    return this.registerGuest(room, guestToken, permission, expiresAt, now);
  }
  registerGuest(
    room: PublicRoom,
    guestToken: unknown,
    permission: GuestPermission,
    expiresAt: number,
    now = Date.now(),
  ): boolean {
    if (!validToken(guestToken) || !Number.isSafeInteger(expiresAt) || expiresAt <= now)
      return false;
    const hash = tokenHash(guestToken);
    const key = hash.toString('hex');
    if (
      room.credentials.has(key) ||
      equalHash(this.creationHash, hash) ||
      this.issuedHostHashes.has(key)
    )
      return false;
    room.credentials.set(key, { hash, permission, expiresAt });
    return true;
  }
  authenticate(
    room: PublicRoom | undefined,
    role: PublicRole,
    token: unknown,
    now = Date.now(),
  ): GuestPermission | 'host' | null {
    if (!room || !validToken(token)) return null;
    if (role === 'host') return this.isHost(room, token) ? 'host' : null;
    const hash = tokenHash(token);
    let permission: GuestPermission | null = null;
    for (const credential of room.credentials.values()) {
      const matches = equalHash(credential.hash, hash);
      if (matches && credential.expiresAt > now) permission = credential.permission;
    }
    return permission;
  }
}

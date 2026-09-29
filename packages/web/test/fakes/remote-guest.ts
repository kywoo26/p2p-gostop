import type { JoinOutcome, RemoteGuestController, RemoteSnapshot } from '../../src/p2p/remote.ts';

export type FakeSnapshot = Omit<RemoteSnapshot, 'requests'>;

export class FakeRemoteGuest implements RemoteGuestController {
  snapshot: RemoteSnapshot = { state: 'idle', peerPresent: false, requests: [] };
  readonly calls: string[] = [];
  private listeners = new Set<(snapshot: RemoteSnapshot) => void>();

  subscribe(cb: (snapshot: RemoteSnapshot) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  set(snapshot: FakeSnapshot): void {
    this.snapshot = { ...snapshot, requests: [] };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  async joinByLink(url: string, nickname: string): Promise<JoinOutcome> {
    this.calls.push(`link:${url}:${nickname}`);
    this.set({ state: 'waiting', peerPresent: true });
    return { ok: true };
  }

  async joinByCode(origin: string, code: string, nickname: string): Promise<JoinOutcome> {
    this.calls.push(`code:${origin}:${code}:${nickname}`);
    this.set({ state: 'waiting', peerPresent: true });
    return { ok: true };
  }

  async resume(): Promise<JoinOutcome> {
    this.calls.push('resume');
    this.set({ state: 'connected', peerPresent: true });
    return { ok: true };
  }

  retry(): void {
    this.calls.push('retry');
  }
  leave(): void {
    this.calls.push('leave');
    this.set({ state: 'idle', peerPresent: false });
  }
}

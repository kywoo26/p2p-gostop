import type {
  RemoteErrorCode,
  RemoteHostController,
  RemoteRoom,
  RemoteSnapshot,
} from '../../src/p2p/remote.ts';

// 브라우저 테스트용 인메모리 호스트. RP-04B의 공개 계약만 구현한다.
export class FakeRemoteHost implements RemoteHostController {
  snapshot: RemoteSnapshot = { state: 'idle', requests: [], peerPresent: false };
  readonly calls: string[] = [];
  private listeners = new Set<(snapshot: RemoteSnapshot) => void>();

  subscribe(cb: (snapshot: RemoteSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.snapshot);
    return () => this.listeners.delete(cb);
  }

  set(patch: Partial<RemoteSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  async checkHealth(options?: { signal?: AbortSignal }) {
    this.calls.push('checkHealth');
    options?.signal?.throwIfAborted();
    return {
      relay: 'p2p-gostop' as const,
      ready: true as const,
      controlVersion: 1 as const,
      wireVersion: 2,
    };
  }

  async createRoom(): Promise<RemoteRoom> {
    this.calls.push('createRoom');
    const room = {
      roomId: 'test-room',
      code: 'ABCD-EFGH-JKLM',
      expiresAt: Date.now() + 6 * 60 * 60_000,
      inviteLink: 'https://relay.example.test/#invite=test-token',
    };
    this.set({ state: 'waiting', room });
    return room;
  }

  async accept(requestId: string): Promise<void> {
    this.calls.push(`accept:${requestId}`);
    this.set({
      requests: this.snapshot.requests.filter((request) => request.id !== requestId),
      peerPresent: true,
      state: 'connected',
    });
  }

  deny(requestId: string): void {
    this.calls.push(`deny:${requestId}`);
    this.set({ requests: this.snapshot.requests.filter((request) => request.id !== requestId) });
  }

  retry(): void {
    this.calls.push('retry');
  }
  async close(): Promise<void> {
    this.calls.push('close');
    this.set({ state: 'ended' });
  }
  fail(error: RemoteErrorCode): void {
    this.set({ state: 'error', error });
  }
}

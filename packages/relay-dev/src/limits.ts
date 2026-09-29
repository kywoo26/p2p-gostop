// 메모리 내 고정 창 제한. 프록시 전달 헤더는 신뢰하지 않고 실제 연결 주소만 사용한다.
export class WindowLimit {
  private readonly hits = new Map<string, number[]>();
  take(key: string, max: number, period: number, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((time) => time > now - period);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
  cleanup(now = Date.now()): void {
    for (const [key, hits] of this.hits)
      if (hits.every((time) => time <= now - 86_400_000)) this.hits.delete(key);
  }
}

export class SocketLimit {
  private window = 0;
  private bytesWindow = 0;
  private credits = 40;
  private bytes = 0;
  take(size: number, now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.window);
    this.credits = Math.min(40, this.credits + (elapsed * 20) / 1000);
    if (now - this.bytesWindow >= 1000) {
      this.bytes = 0;
      this.bytesWindow = now;
    }
    this.window = now;
    this.credits -= 1;
    this.bytes += size;
    return this.credits >= 0 && this.bytes <= 131_072;
  }
}

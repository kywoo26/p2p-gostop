<script lang="ts">
  import { durationMs } from '../../anim/durations.ts';
  let {
    kind,
    sample = null,
  }: { kind: 'ppeok' | 'jjok' | 'ttadak' | 'bomb' | 'go' | 'settlement'; sample?: number | null } =
    $props();
  const rich = document.documentElement.dataset['visualVariant'] === 'rich';
  let canvas: HTMLCanvasElement;
  // 이벤트 1회당 유한 루프. 레일 안에만 그려 손패·바닥·HUD를 가리지 않는다.
  $effect(() => {
    const node = canvas;
    const colors = {
      ppeok: '#ff6659',
      jjok: '#65ffe0',
      ttadak: '#ffd36c',
      bomb: '#ffab51',
      go: '#ffdf85',
      settlement: '#ffe8ae',
    };
    const color = rich ? colors[kind] : kind === 'ppeok' ? '#ff967d' : '#82e4ff';
    const duration = durationMs('banner');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || duration === 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = node.clientWidth;
    const height = node.clientHeight;
    node.width = Math.ceil(width * dpr);
    node.height = Math.ceil(height * dpr);
    const ctx = node.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    // 작은 광원은 한 번 그려 캐시하고 프레임마다 재사용한다. blur/filter는 쓰지 않는다.
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const glowContext = glow.getContext('2d')!;
    const light = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, '#ffffff');
    light.addColorStop(0.1, color);
    light.addColorStop(1, `${color}00`);
    glowContext.fillStyle = light;
    glowContext.fillRect(0, 0, 64, 64);
    const render = (progress: number) => {
      ctx.clearRect(0, 0, width, height);
      if (reduced) return;
      const t = Math.min(1, progress);
      const cx = width / 2,
        cy = height / 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - t) * 0.38;
      ctx.drawImage(glow, cx - 90, cy - 24, 180, 48);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 32; i++) {
        const angle = i * 2.39996;
        const travel = 18 + (i % 5) * 10 + t * 90;
        const x = cx + Math.cos(angle) * travel * 1.9;
        const y = cy + Math.sin(angle) * travel * 0.24;
        const size = 1.5 + (i % 3);
        ctx.drawImage(glow, x - 7, y - 7, 14, 14);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + t * 2);
        if (kind === 'ppeok') ctx.fillRect(-size, -size / 2, size * 3, size);
        else if (kind === 'bomb') {
          ctx.fillRect(-size * 4, -0.7, size * 7, 1.4);
        } else if (kind === 'ttadak' || kind === 'go' || kind === 'settlement') {
          ctx.fillRect(-size * 2, -0.6, size * 4, 1.2);
          ctx.fillRect(-0.6, -size * 2, 1.2, size * 4);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -size * 2);
          ctx.lineTo(size, 0);
          ctx.lineTo(0, size * 2);
          ctx.lineTo(-size, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.beginPath();
      ctx.ellipse(cx, cy, 35 + t * 115, 9 + t * 20, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (kind === 'bomb' || kind === 'go' || kind === 'settlement') {
        ctx.lineWidth = kind === 'bomb' ? 3 : 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 45 + t * 160, 14 + t * 28, -0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    let raf = 0;
    if (sample !== null || reduced) render(sample ?? 0);
    else {
      const started = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / Math.max(1, duration));
        render(t);
        if (t < 1 && !document.hidden) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, width, height);
    };
  });
</script>

<canvas bind:this={canvas} class="impact" aria-hidden="true"></canvas>

<style>
  .impact {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>

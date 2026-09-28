<script lang="ts">
  // QR 그림 (spec FR-03). uqr 행렬을 SVG 경로 하나로 그린다. 스캔이 잘 되도록 흰 바탕·검은 모듈·여백 2모듈.
  import { qrPath } from './qr.ts';

  interface Props {
    text: string;
    /** 스크린 리더용 이름 (예: "Wi-Fi 접속 QR") */
    label: string;
  }

  let { text, label }: Props = $props();
  const qr = $derived(qrPath(text));
</script>

<svg
  class="qr"
  viewBox={`0 0 ${qr.size} ${qr.size}`}
  role="img"
  aria-label={label}
  shape-rendering="crispEdges"
  data-qr={text}
>
  <rect width={qr.size} height={qr.size} fill="#fff" />
  <path d={qr.d} fill="#000" />
</svg>

<style>
  .qr {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--radius-s);
  }
</style>

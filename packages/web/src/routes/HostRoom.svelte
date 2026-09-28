<script lang="ts">
  // 방 열기(호스트) (spec 6.2, FR-01~03). 정적 틀. QR 그림은 M4에서 uqr로 그린다.
  import { formatMoney } from '../lib/format.ts';
  import type { HostRoomView } from '../lib/view-types.ts';
  import Screen from '../ui/Screen.svelte';

  interface Props {
    view: HostRoomView;
  }

  let { view }: Props = $props();

  const STATE_LABEL: Record<HostRoomView['hotspot']['state'], string> = {
    starting: '켜는 중',
    on: '켜짐',
    failed: '실패',
    off: '꺼짐',
  };

  // 접속 주소는 ip·port로 만든다(번들에 사설 IP 주소 문자열을 두지 않음)
  const address = $derived(`${view.hotspot.ip}:${view.hotspot.port}`);
</script>

<Screen title="방 열기">
  <section aria-labelledby="host-hotspot">
    <h2 id="host-hotspot">핫스팟 · {STATE_LABEL[view.hotspot.state]}</h2>
    <dl class="pairs">
      <dt>이름</dt>
      <dd>{view.hotspot.ssid}</dd>
      <dt>비밀번호</dt>
      <dd>{view.hotspot.password}</dd>
      <dt>주소</dt>
      <dd>{address}</dd>
    </dl>
  </section>

  <section aria-labelledby="host-steps">
    <h2 id="host-steps">친구 폰에서</h2>
    <ol class="steps">
      <li>
        <span class="qr" role="img" aria-label="Wi-Fi 접속 QR (M4에서 표시)">QR</span>
        <span>카메라로 <b>Wi-Fi QR</b>을 찍어 연결</span>
      </li>
      <li>
        <span class="qr" role="img" aria-label="게임 주소 QR (M4에서 표시)">QR</span>
        <span>"인터넷 없이 사용"을 누른 뒤 <b>주소 QR</b>을 찍기</span>
      </li>
      <li>
        <span class="qr step-icon" aria-hidden="true">3</span>
        <span>Safari에서 이름을 적고 입장</span>
      </li>
    </ol>
  </section>

  <section aria-labelledby="host-guest">
    <h2 id="host-guest">접속자</h2>
    <p class="guest">
      {#if view.guest}
        <span class={['dot', { on: view.guest.connected }]} aria-hidden="true"></span>
        {view.guest.name} · {view.guest.connected ? '연결됨' : '끊김'}
      {:else}
        기다리는 중…
      {/if}
    </p>
    <p class="rules">
      규칙 {view.rules.preset} · 점당 {formatMoney(view.rules.pointValue, view.rules.unit)}
    </p>
  </section>

  {#snippet actions()}
    <button type="button" class="button primary" disabled={!view.guest?.connected}>시작</button>
  {/snippet}
</Screen>

<style>
  .pairs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  .pairs dt {
    color: var(--color-text-muted);
  }

  .pairs dd {
    margin: 0;
    font-family: ui-monospace, monospace;
  }

  .steps {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .steps li {
    display: grid;
    grid-template-columns: 4.5rem 1fr;
    align-items: center;
    gap: var(--space-3);
  }

  .qr {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-s);
    color: var(--color-text-muted);
    font-weight: 700;
  }

  .step-icon {
    border-style: solid;
  }

  .guest,
  .rules {
    margin: 0;
  }

  .rules {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--color-event-ppeok);
  }

  .dot.on {
    background: var(--color-accent);
  }
</style>

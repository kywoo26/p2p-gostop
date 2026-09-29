<script lang="ts" module>
  import type { PresetId } from '@p2p-gostop/engine';
  import type { MoneyUnit } from '../lib/view-types.ts';

  export interface HostRoomRules {
    readonly preset: PresetId;
    readonly perPoint: number;
    readonly startBalance: number;
    readonly hostName: string;
    readonly unit: MoneyUnit;
  }
</script>

<script lang="ts">
  // 방 열기(호스트) (spec 2.1·6.2, FR-01~03·05·22, NF-06). 핫스팟 상태·Wi-Fi QR·주소 QR·3단계 안내·접속자·규칙·금액·시작.
  // 화면만 그린다. 핫스팟·세션 동작은 Versus.svelte가 브리지와 HostGame으로 한다.
  import { PER_POINT_OPTIONS } from '@p2p-gostop/ai';
  import { onMount } from 'svelte';
  import type { HotspotInfo } from '../bridge/bridge.ts';
  import { formatMoney } from '../lib/format.ts';
  import { PRESET_LABEL } from '../p2p/common.ts';
  import { REMOTE_ERROR_MESSAGES } from '../p2p/remote-messages.ts';
  import type { RemoteHostController, RemoteSnapshot } from '../p2p/remote.ts';
  import QrCode from '../p2p/QrCode.svelte';
  import { wifiQrText } from '../p2p/qr.ts';
  import { guestUrl } from '../p2p/role.ts';
  import Screen from '../ui/Screen.svelte';
  import RemoteGuide from '../ui/RemoteGuide.svelte';

  interface Props {
    hotspot: HotspotInfo;
    /** 브라우저(개발)에서 연 경우 게스트가 쓸 주소 (host:port) */
    pageAddress?: string | null;
    guest: { readonly name: string; readonly connected: boolean } | null;
    rules: HostRoomRules;
    /** 저장된 세션 이어하기 (MN-05). 있으면 규칙·금액은 그 세션 값으로 고정 */
    resume?: { readonly round: number; readonly guestName: string | null } | null;
    busy?: boolean;
    onhotspot?: (() => void) | undefined;
    onaddressonly?: (() => void) | undefined;
    ondiagnostics?: (() => void) | undefined;
    onrules?: ((patch: Partial<HostRoomRules>) => void) | undefined;
    onstart?: (() => void) | undefined;
    onfresh?: (() => void) | undefined;
    remote?: RemoteHostController | undefined;
  }

  let {
    hotspot,
    pageAddress = null,
    guest,
    rules,
    resume = null,
    busy = false,
    onhotspot,
    onaddressonly,
    ondiagnostics,
    onrules,
    onstart,
    onfresh,
    remote,
  }: Props = $props();

  let remoteSnapshot = $state<RemoteSnapshot | null>(null);
  let now = $state(Date.now());
  let inviteInput = $state<HTMLInputElement | undefined>(undefined);
  let copyStatus = $state('');
  const inviteExpiresAt = $derived(
    remoteSnapshot?.room?.expiresAt === undefined
      ? null
      : remoteSnapshot.room.expiresAt - (6 * 60 - 15) * 60_000,
  );
  let remoteBusy = $state(false);
  onMount(() => {
    const off = remote?.subscribe((snapshot) => (remoteSnapshot = snapshot));
    const timer = window.setInterval(() => (now = Date.now()), 1000);
    return () => {
      off?.();
      window.clearInterval(timer);
    };
  });

  function countdown(deadline: number, maxSeconds = Number.POSITIVE_INFINITY): string {
    const seconds = Math.min(maxSeconds, Math.max(0, Math.ceil((deadline - now) / 1000)));
    return `${Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0')}:${Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  async function createRemoteRoom() {
    if (!remote || remoteBusy) return;
    copyStatus = '';
    remoteBusy = true;
    try {
      await remote.createRoom();
    } catch {
      /* 오류 코드는 controller.snapshot으로 표시 */
    } finally {
      remoteBusy = false;
    }
  }

  async function acceptRemote(id: string) {
    if (!remote || remoteBusy) return;
    remoteBusy = true;
    try {
      await remote.accept(id);
    } catch {
      /* 오류 코드는 controller.snapshot으로 표시 */
    } finally {
      remoteBusy = false;
    }
  }

  async function renewRemoteRoom() {
    if (!remote || remoteBusy) return;
    copyStatus = '';
    remoteBusy = true;
    try {
      await remote.close();
      await remote.createRoom();
    } catch {
      // 오류 코드는 controller.snapshot으로 표시한다.
    } finally {
      remoteBusy = false;
    }
  }

  function copyInvite() {
    if (!inviteInput) return;
    const input = inviteInput;
    input.focus();
    input.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      // 복사가 허용되지 않아도 링크를 선택해 사용자가 직접 복사할 수 있게 한다.
    }
    if (!copied) {
      input.focus();
      input.select();
      copyStatus = '복사에 실패했습니다. 선택된 링크를 직접 복사하세요.';
      return;
    }
    copyStatus = '초대 링크를 복사했습니다.';
  }

  const STATE_LABEL: Record<HotspotInfo['state'], string> = {
    unsupported: 'Android 앱에서만',
    starting: '켜는 중…',
    on: '켜짐',
    failed: '실패',
    off: '꺼짐',
    addressOnly: '주소만 표시',
  };
  const PRESETS: readonly PresetId[] = ['traditional', 'standard', 'arcade'];
  const ids = $props.id();

  const address = $derived(
    hotspot.ip !== null && hotspot.port !== null
      ? { ip: hotspot.ip, port: hotspot.port }
      : pageAddress !== null
        ? (() => {
            const [ip = '', port = '80'] = pageAddress.split(':');
            return { ip, port: Number(port) };
          })()
        : null,
  );
  const url = $derived(address === null ? null : guestUrl(address.ip, address.port));
  const wifi = $derived(
    hotspot.state === 'on' && hotspot.ssid !== null
      ? wifiQrText(hotspot.ssid, hotspot.password)
      : null,
  );
  const permission = $derived(hotspot.error === 'permissionRequired');
  const canStart = $derived(
    remote
      ? remoteSnapshot?.peerPresent === true && guest?.connected === true && !busy && !remoteBusy
      : resume !== null || (guest?.connected === true && !busy),
  );
</script>

<Screen title={remote ? '원격 방 열기' : '방 열기'}>
  {#if remote && remoteSnapshot}
    <RemoteGuide controller={remote} />
    <section aria-label="원격 초대">
      <h2>친구와 원격 대전</h2>
      {#if remoteSnapshot.room}
        <p class="hint">
          초대 남은 시간 <time data-testid="invite-countdown"
            >{countdown(inviteExpiresAt ?? 0, 15 * 60)}</time
          >
        </p>
        <p class="hint">
          방 남은 시간 <time data-testid="room-countdown"
            >{countdown(remoteSnapshot.room.expiresAt, 6 * 60 * 60)}</time
          >
        </p>
        {#if inviteExpiresAt !== null && now < inviteExpiresAt}
          <p>방 코드</p>
          <strong class="remote-code" data-testid="remote-code">{remoteSnapshot.room.code}</strong>
          <label class="remote-link-label" for={`${ids}-remote-link`}>초대 링크</label>
          <input
            id={`${ids}-remote-link`}
            class="remote-link"
            readonly
            bind:this={inviteInput}
            value={remoteSnapshot.room.inviteLink}
            onclick={(e) => e.currentTarget.select()}
            onfocus={(e) => e.currentTarget.select()}
          />
          <button type="button" class="button" onclick={copyInvite}>초대 링크 복사</button>
          {#if copyStatus}<p role="status">{copyStatus}</p>{/if}
          <span class="remote-qr"
            ><QrCode text={remoteSnapshot.room.inviteLink} label="원격 초대 QR" /></span
          >
          <p class="hint">링크 전체를 선택해 친구에게 보내세요. 초대 내용은 비밀입니다.</p>
        {:else}
          <p role="status">초대 시간이 끝났습니다.</p>
          {#if !remoteSnapshot.peerPresent}<button
              type="button"
              class="button"
              disabled={remoteBusy}
              onclick={() => void renewRemoteRoom()}>새 방 만들기</button
            >{/if}
        {/if}
      {:else}
        <button
          class="button primary"
          type="button"
          disabled={remoteBusy || remoteSnapshot.state === 'creating'}
          onclick={() => void createRemoteRoom()}>방 만들기</button
        >
      {/if}
    </section>
    {#if remoteSnapshot.error}<p role="alert" class="warn">
        {#if remoteSnapshot.state === 'ended' && remoteSnapshot.error === 'expired'}
          방 이용 시간이 끝났습니다. 새 방을 만드세요.
        {:else}
          {REMOTE_ERROR_MESSAGES[remoteSnapshot.error].title}. {REMOTE_ERROR_MESSAGES[
            remoteSnapshot.error
          ].action}
        {/if}
      </p>{/if}
    <section aria-label="참여 요청">
      <h2>참여 요청</h2>
      {#each remoteSnapshot.requests as request (request.id)}
        <div class="remote-request">
          <p>
            {request.nickname ?? '이름 미입력'} · {request.kind === 'code'
              ? '코드 참여'
              : '초대 링크'} · 남은 시간 {countdown(request.expiresAt)}
          </p>
          <div class="row-buttons">
            <button
              class="button primary"
              type="button"
              disabled={remoteBusy}
              onclick={() => void acceptRemote(request.id)}>수락</button
            >
            <button
              class="button"
              type="button"
              disabled={remoteBusy}
              onclick={() => remote.deny(request.id)}>거절</button
            >
          </div>
        </div>
      {:else}<p class="hint">요청을 기다리는 중…</p>{/each}
    </section>
    <section aria-label="상대 상태">
      <h2>상대</h2>
      <p role="status">
        {guest?.name ?? '상대'} · {remoteSnapshot.peerPresent ? '연결됨' : '접속 대기'}
      </p>
    </section>
  {:else}
    <section aria-labelledby={`${ids}-hotspot`} data-testid="hotspot" data-state={hotspot.state}>
      <h2 id={`${ids}-hotspot`}>핫스팟 · {STATE_LABEL[hotspot.state]}</h2>
      {#if hotspot.state === 'on' || hotspot.state === 'addressOnly' || hotspot.state === 'unsupported'}
        <dl class="pairs">
          {#if hotspot.ssid !== null}
            <dt>이름</dt>
            <dd>{hotspot.ssid}</dd>
            <dt>비밀번호</dt>
            <dd>{hotspot.password ?? '없음'}</dd>
          {/if}
          <dt>주소</dt>
          <dd data-testid="guest-url">{url ?? '확인 중…'}</dd>
        </dl>
      {/if}
      {#if hotspot.warning !== null || (hotspot.state === 'addressOnly' && hotspot.lanEnabled !== false)}
        <p class="warn" role="note" data-testid="lan-warning">
          {hotspot.warning ??
            '주소만 표시: 같은 Wi-Fi의 누구나 이 주소로 들어올 수 있습니다. 믿을 수 있는 네트워크에서만 쓰세요.'}
          시작한 뒤에는 세션 토큰이 없는 접속을 거절합니다.
        </p>
      {:else if hotspot.state === 'unsupported'}
        <p class="hint">
          핫스팟은 Android 앱에서 켭니다. 지금은 같은 네트워크의 브라우저가 위 주소로 들어올 수
          있습니다.
        </p>
      {:else if hotspot.state === 'failed'}
        <p class="warn" role="alert">
          핫스팟을 켜지 못했습니다{hotspot.error !== null && !permission
            ? ` (${hotspot.error})`
            : ''}. 휴대폰 설정에서 핫스팟을 직접 켜고 친구 폰을 연결한 뒤 "주소만 표시"를 누르세요.
        </p>
      {/if}
      {#if permission}
        <p class="hint" role="status">근처 기기 권한을 허용한 뒤 다시 누르세요.</p>
      {/if}
      {#if hotspot.state === 'addressOnly' && hotspot.lanEnabled === false}
        <p class="hint">친구 폰이 접속하려면 "주소만 표시"로 LAN 접속을 여세요.</p>
      {/if}
      {#if hotspot.state !== 'unsupported' && hotspot.state !== 'on'}
        <div class="row-buttons">
          <button
            type="button"
            class="button primary"
            disabled={hotspot.state === 'starting'}
            onclick={() => onhotspot?.()}>핫스팟 켜기</button
          >
          {#if hotspot.state !== 'addressOnly' || hotspot.lanEnabled === false}
            <button type="button" class="button" onclick={() => onaddressonly?.()}
              >주소만 표시</button
            >
          {/if}
        </div>
      {/if}
      {#if hotspot.state !== 'unsupported'}
        <button type="button" class="link" onclick={() => ondiagnostics?.()}>기기 진단 열기</button>
      {/if}
    </section>

    {#if url !== null}
      <section aria-labelledby={`${ids}-steps`}>
        <h2 id={`${ids}-steps`}>친구 폰(iPhone)에서</h2>
        <ol class="steps">
          {#if wifi !== null}
            <li>
              <span class="qr"><QrCode text={wifi} label="Wi-Fi 접속 QR" /></span>
              <span>카메라로 <b>Wi-Fi QR</b>을 찍어 연결 → "인터넷 없이 사용"</span>
            </li>
          {/if}
          <li>
            <span class="qr"><QrCode text={url} label="게임 주소 QR" /></span>
            <span>카메라로 <b>주소 QR</b>을 찍어 Safari로 열기</span>
          </li>
          <li>
            <span class="qr step-icon" aria-hidden="true">{wifi === null ? 2 : 3}</span>
            <span>이름을 적고 입장. 게임 중에는 자동 잠금을 "안 함"으로</span>
          </li>
        </ol>
      </section>
    {/if}

    <section aria-labelledby={`${ids}-guest`}>
      <h2 id={`${ids}-guest`}>접속자</h2>
      <p class="guest" role="status" data-testid="guest-status">
        {#if guest}
          <span class={['dot', { on: guest.connected }]} aria-hidden="true"></span>
          {guest.name} · {guest.connected ? '연결됨' : '끊김'}
        {:else}
          기다리는 중…
        {/if}
      </p>
    </section>
  {/if}

  <section aria-labelledby={`${ids}-rules`}>
    <h2 id={`${ids}-rules`}>{resume ? '이어하기' : '규칙·금액'}</h2>
    {#if resume}
      <p class="rules">
        {resume.round}판째부터 · {PRESET_LABEL[rules.preset]} · 점당 {formatMoney(
          rules.perPoint,
          rules.unit,
        )}{resume.guestName ? ` · 지난 상대 ${resume.guestName}` : ''}
      </p>
      <button type="button" class="link" onclick={() => onfresh?.()}>새 세션으로 시작</button>
    {:else}
      <label class="row">
        <span>내 이름</span>
        <input
          type="text"
          maxlength="12"
          autocomplete="nickname"
          value={rules.hostName}
          onchange={(e) => onrules?.({ hostName: e.currentTarget.value })}
        />
      </label>
      <label class="row">
        <span>규칙</span>
        <select
          value={rules.preset}
          onchange={(e) => onrules?.({ preset: e.currentTarget.value as PresetId })}
        >
          {#each PRESETS as id (id)}<option value={id}>{PRESET_LABEL[id]}</option>{/each}
        </select>
      </label>
      <label class="row">
        <span>점당</span>
        <select
          value={rules.perPoint}
          onchange={(e) => onrules?.({ perPoint: Number(e.currentTarget.value) })}
        >
          {#each PER_POINT_OPTIONS as value (value)}
            <option {value}>{formatMoney(value, rules.unit)}</option>
          {/each}
        </select>
      </label>
      <p class="row">
        <span>시작 잔액</span>
        <strong>{formatMoney(rules.startBalance, rules.unit)}</strong>
      </p>
    {/if}
  </section>

  {#snippet actions()}
    <button
      type="button"
      class="button primary"
      data-testid="host-start"
      disabled={!canStart}
      onclick={() => onstart?.()}>{resume ? '이어하기' : '시작'}</button
    >
  {/snippet}
</Screen>

<style>
  .pairs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }
  .remote-code {
    font-family: ui-monospace, monospace;
    font-size: clamp(1.4rem, 6vw, 2rem);
    letter-spacing: 0.08em;
    overflow-wrap: anywhere;
  }
  .remote-link-label {
    font-weight: 600;
  }
  .remote-link {
    width: 100%;
    min-width: 0;
    font-size: var(--font-size-s);
  }
  .remote-qr {
    width: min(100%, 12rem);
  }
  .remote-request {
    display: grid;
    gap: var(--space-2);
  }

  .pairs dt {
    color: var(--color-text-muted);
  }

  .pairs dd {
    margin: 0;
    font-family: ui-monospace, monospace;
    overflow-wrap: anywhere;
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
    grid-template-columns: 7.5rem 1fr;
    align-items: center;
    gap: var(--space-3);
  }

  .qr {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
  }

  .step-icon {
    width: 3rem;
    justify-self: center;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-s);
    color: var(--color-text-muted);
    font-weight: 700;
  }

  .guest,
  .rules,
  .hint,
  .warn {
    margin: 0;
  }

  .hint,
  .rules {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }

  .warn {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--color-event-ppeok);
    font-size: var(--font-size-s);
  }

  .row-buttons {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--space-2);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch-min);
    gap: var(--space-3);
    margin: 0;
  }

  input,
  select {
    min-height: var(--touch-min);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }

  input {
    width: 9rem;
  }

  .link {
    justify-self: start;
    min-height: var(--touch-min);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-decoration: underline;
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

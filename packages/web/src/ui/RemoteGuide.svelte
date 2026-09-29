<script lang="ts">
  // FR-RP-07, NF-RP-03/04: PC 수동 시작부터 초대까지의 안내.
  import { PROTOCOL_VERSION } from '@p2p-gostop/protocol';
  import { RelayHealthError } from '../net/public-transport.ts';
  import {
    REMOTE_ERROR_MESSAGES,
    REMOTE_STEPS,
    UNKNOWN_REMOTE_ERROR,
  } from '../p2p/remote-messages.ts';
  import type { RemoteErrorCode, RemoteHostController } from '../p2p/remote.ts';

  let { controller }: { controller: RemoteHostController } = $props();
  let phase = $state<'idle' | 'checking' | 'success' | 'error'>('idle');
  let errorCode = $state<RemoteErrorCode | null>(null);
  let wireVersion = $state<number | null>(null);
  let active = true;
  let healthAbort: AbortController | null = null;

  const currentStep = $derived(phase === 'success' ? 3 : phase === 'idle' ? 1 : 2);
  const message = $derived(
    errorCode === null ? UNKNOWN_REMOTE_ERROR : REMOTE_ERROR_MESSAGES[errorCode],
  );

  async function checkHealth(): Promise<void> {
    if (phase === 'checking') return;
    const abort = new AbortController();
    healthAbort = abort;
    phase = 'checking';
    errorCode = null;
    try {
      const result = await controller.checkHealth({ signal: abort.signal });
      if (!active || abort.signal.aborted) return;
      if (!result.ready || result.relay !== 'p2p-gostop') {
        errorCode = 'invalidResponse';
        phase = 'error';
        return;
      }
      if (result.wireVersion !== PROTOCOL_VERSION) {
        errorCode = 'incompatible';
        phase = 'error';
        return;
      }
      wireVersion = result.wireVersion;
      phase = 'success';
    } catch (error) {
      if (!active || abort.signal.aborted) return;
      errorCode =
        error instanceof RelayHealthError ? error.code : (controller.snapshot.error ?? null);
      phase = 'error';
    } finally {
      if (healthAbort === abort) healthAbort = null;
    }
  }

  $effect(() => {
    active = true;
    return () => {
      active = false;
      healthAbort?.abort();
      healthAbort = null;
    };
  });
</script>

<section class="remote-guide" aria-labelledby="remote-guide-title">
  <h2 id="remote-guide-title">원격 대전 준비</h2>
  <ol class="guide-steps">
    {#each REMOTE_STEPS as step, index (step.title)}
      {@const number = index + 1}
      <li
        class:current={currentStep === number}
        class:complete={currentStep > number}
        aria-current={currentStep === number ? 'step' : undefined}
      >
        <h3><span aria-hidden="true">{currentStep > number ? '✓' : number}</span> {step.title}</h3>
        <p>{step.detail}</p>
        {#if number === 1}
          <p>처음 한 번 Docker Desktop과 Tailscale 로그인, Funnel 승인이 필요합니다.</p>
          <p>중계는 게임할 때만 켜세요. 끝나면 tools/relay/stop.cmd를 더블클릭하세요.</p>
          <p>PC 전기와 인터넷 회선 비용은 별도 부담입니다.</p>
        {:else if number === 2}
          <button
            type="button"
            class="button primary"
            disabled={phase === 'checking'}
            onclick={() => void checkHealth()}
          >
            {phase === 'error' ? '다시 확인' : '연결 확인'}
          </button>
          <div class="health-status" aria-live="polite" aria-atomic="true">
            {#if phase === 'checking'}
              <p>중계 응답 확인 중…</p>
            {:else if phase === 'success'}
              <p class="success">✓ 중계 응답 정상. 게임 버전 {wireVersion} 일치.</p>
            {:else if phase === 'error'}
              <p class="error">연결 확인 실패. {message.title}.</p>
              <p>{message.detail} {message.action}</p>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  <p class="note">중계 응답 확인은 친구의 접속이나 게임 시작을 확인하지 않습니다.</p>
</section>

<style>
  .remote-guide {
    display: grid;
    gap: var(--space-3);
  }

  .remote-guide h2,
  .remote-guide h3,
  .remote-guide p {
    margin: 0;
  }

  .guide-steps {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .guide-steps li {
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-m);
  }

  .guide-steps li.current {
    border-color: var(--color-accent);
    background: var(--color-surface);
  }

  .guide-steps li.complete h3,
  .success {
    color: var(--color-success);
  }

  .guide-steps li p,
  .health-status {
    margin-top: var(--space-2);
  }

  .health-status .error {
    color: var(--color-error);
  }

  .note {
    color: var(--color-text-muted);
    font-size: var(--font-size-s);
  }
</style>

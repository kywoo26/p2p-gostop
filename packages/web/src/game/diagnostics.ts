// 진단 화면 입력 (spec FR-30~32): 빌드·기기·모드·점검 항목·인앱 로그.
import { BUILD_ID } from '../lib/build-info.ts';
import type { DiagnosticsView } from '../lib/view-types.ts';
import { storageAvailable } from '../storage/local.ts';
import { log } from './log.svelte.ts';

export interface ConnectionCheck {
  readonly label: string;
  readonly ok: boolean | null;
  readonly detail: string;
}

export function diagnosticsView(
  mode: DiagnosticsView['mode'],
  connection: readonly ConnectionCheck[] = [],
): DiagnosticsView {
  return {
    buildId: BUILD_ID,
    device: navigator.userAgent,
    mode,
    checks: [
      ...connection.map((c) => ({
        label: c.label,
        status: c.ok === null ? ('warn' as const) : c.ok ? ('ok' as const) : ('fail' as const),
        detail: c.detail,
      })),
      {
        label: 'Web Worker (CPU)',
        status: typeof Worker === 'undefined' ? 'warn' : 'ok',
        detail: typeof Worker === 'undefined' ? '없음: 메인 스레드에서 계산' : '사용 가능',
      },
      {
        label: '저장소 (세션 이어하기)',
        status: storageAvailable() ? 'ok' : 'warn',
        detail: storageAvailable()
          ? 'localStorage 사용 가능'
          : '저장 불가: 앱을 닫으면 세션이 사라짐',
      },
      {
        label: '보안 컨텍스트',
        status: 'ok',
        detail: window.isSecureContext ? '예' : '아니오 (게스트 http: 제한 API 미사용)',
      },
    ],
    log: log.lines,
  };
}

/** 로그 한 줄 문자열 (게스트 업로드·공유) */
export function logLines(): string[] {
  return log.lines.map((l) => `${l.t} ${l.level.toUpperCase()} ${l.msg}`);
}

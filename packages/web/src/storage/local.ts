// localStorage 읽기·쓰기 (MN-05: 호스트 origin 127.0.0.1:17777에만 영속 저장).
// 저장소가 없거나(사생활 보호 모드·용량 초과) JSON이 깨졌으면 조용히 기본값으로 돌아간다. 키는 모두 버전을 붙인다.

export const STORAGE_KEYS = {
  settings: 'gostop.settings.v1',
  soloSession: 'gostop.solo.v1',
} as const;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 일부 브라우저는 접근 자체가 SecurityError를 던진다
    return null;
  }
}

/** 저장소를 쓸 수 있는지 (진단 화면) */
export function storageAvailable(): boolean {
  const s = storage();
  if (s === null) return false;
  try {
    const probe = 'gostop.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export type JsonRead =
  | { readonly status: 'missing' }
  | { readonly status: 'invalid' }
  | { readonly status: 'value'; readonly value: unknown };

/** 이어하기 경계는 미저장과 접근/JSON 실패를 구분해 기존 오류 안내를 유지한다. */
export function readJsonResult(key: string): JsonRead {
  try {
    const s = storage();
    if (s === null) return { status: 'invalid' };
    const raw = s.getItem(key);
    return raw === null
      ? { status: 'missing' }
      : { status: 'value', value: JSON.parse(raw) as unknown };
  } catch {
    return { status: 'invalid' };
  }
}

export function readJson(key: string): unknown {
  const result = readJsonResult(key);
  return result.status === 'value' ? result.value : null;
}

/** 저장에 성공하면 true (용량 초과 등은 false) */
export function writeJson(key: string, value: unknown): boolean {
  const s = storage();
  if (s === null) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // 무시
  }
}

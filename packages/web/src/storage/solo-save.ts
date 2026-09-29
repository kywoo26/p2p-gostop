// MN-05: 솔로 저장 envelope의 버전·난이도와 저장소 오류를 한 곳에서 해석한다.
import type { Difficulty } from '@p2p-gostop/ai';
import * as z from 'zod/mini';
import type { SessionState } from '../game/session.ts';
import { readJsonResult, STORAGE_KEYS } from './local.ts';
import { parseSession } from './session-save.ts';

export interface SoloSave {
  readonly version: 1;
  readonly difficulty: Difficulty;
  readonly session: SessionState;
}

const EnvelopeVersion = z.union([z.literal(0), z.literal(1)]);
const DifficultySchema = z.enum(['easy', 'normal', 'commercial']);

/** 끝난 세션도 기록 화면을 위해 반환한다. 오류 우선순위와 문구는 기존과 같다. */
export function loadSoloSave(): { save: SoloSave | null; error: string | null } {
  const result = readJsonResult(STORAGE_KEYS.soloSession);
  if (result.status === 'missing') return { save: null, error: null };
  if (result.status === 'invalid')
    return {
      save: null,
      error: '저장된 세션을 읽을 수 없습니다. 저장소 접근 또는 데이터 형식을 확인해 주세요.',
    };
  const raw = result.value;
  if (typeof raw !== 'object' || raw === null)
    return { save: null, error: '저장된 세션 데이터가 손상되었습니다.' };
  const envelope = raw as Record<string, unknown>;
  const session = parseSession(envelope['session']);
  if (!EnvelopeVersion.safeParse(envelope['version']).success || session === null)
    return { save: null, error: '저장된 세션 데이터가 손상되었거나 지원하지 않는 형식입니다.' };
  const difficulty = DifficultySchema.safeParse(envelope['difficulty']);
  if (!difficulty.success) return { save: null, error: '저장된 난이도 정보가 손상되었습니다.' };
  return { save: { version: 1, difficulty: difficulty.data, session }, error: null };
}

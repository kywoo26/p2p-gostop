// FR-RP-07: 공개 중계 진단과 세션 오류를 사용자 조치로 연결한다.
import type { RemoteErrorCode } from './remote.ts';

export interface RemoteMessage {
  readonly title: string;
  readonly detail: string;
  readonly action: string;
}

export const REMOTE_STEPS = [
  {
    title: 'PC에서 중계 켜기',
    detail: '게임할 때 PC에서 tools/relay/start.cmd를 더블클릭하세요.',
  },
  {
    title: '연결 확인',
    detail: '저장된 중계 주소의 응답과 게임 버전을 확인하세요.',
  },
  {
    title: '초대 보내기',
    detail: '방을 만든 뒤 아래 링크나 QR을 친구에게 보내세요.',
  },
] as const;

export const REMOTE_ERROR_MESSAGES: Record<RemoteErrorCode, RemoteMessage> = {
  cancelled: {
    title: '연결 확인 중단',
    detail: '확인이 취소되었습니다.',
    action: '연결 확인을 다시 누르세요.',
  },
  timeout: {
    title: '중계 응답 지연',
    detail: '정해진 시간 안에 응답이 오지 않았습니다.',
    action: 'PC와 인터넷 연결을 확인한 뒤 다시 시도하세요.',
  },
  cors: {
    title: '접속 허용 설정 확인',
    detail: '중계가 응답했지만 이 앱의 요청이 허용되지 않았습니다.',
    action: 'PC에서 start.cmd를 다시 실행하고 중계 주소를 확인하세요.',
  },
  network: {
    title: '중계에 연결할 수 없음',
    detail: 'PC, Docker, Funnel, DNS, TLS 또는 인터넷 상태를 이 화면에서 구별할 수 없습니다.',
    action:
      '주소 입력과 인터넷을 확인한 뒤 PC 전원, Docker Desktop, Funnel과 인증서를 차례로 확인하세요.',
  },
  http: {
    title: '중계 응답 오류',
    detail: '중계 주소가 정상 응답을 주지 않았습니다.',
    action: '저장된 주소와 PC의 start.cmd 출력 주소를 비교하세요.',
  },
  invalidResponse: {
    title: '중계 응답 형식 오류',
    detail: '응답을 읽을 수 없습니다.',
    action: '저장된 주소가 게임 중계 주소인지 확인하세요.',
  },
  incompatible: {
    title: '중계 버전 불일치',
    detail: '앱과 중계의 게임 버전이 맞지 않습니다.',
    action: 'PC 중계와 앱을 같은 배포 버전으로 업데이트하세요.',
  },
  auth: {
    title: '인증 실패',
    detail: '방을 만들거나 복귀할 자격을 확인할 수 없습니다.',
    action: '설정의 생성 자격을 확인하고 다시 시도하세요.',
  },
  replaced: {
    title: '다른 탭에서 연결됨',
    detail: '이 연결은 새 연결로 교체되었습니다.',
    action: '계속할 탭에서만 다시 연결하세요.',
  },
  'host-absent': {
    title: '방장이 연결되지 않음',
    detail: '방장이 돌아올 때까지 게임 입력을 기다립니다.',
    action: '방장에게 앱과 인터넷 연결을 확인해 달라고 하세요.',
  },
  'room-create': {
    title: '방 만들기 실패',
    detail: '중계가 방 또는 초대 정보를 처리하지 못했습니다.',
    action: '앱과 중계를 같은 최신 버전으로 업데이트한 뒤 다시 시도하세요.',
  },
  'room-ended': {
    title: '방 종료',
    detail: '이 방에서는 더 플레이할 수 없습니다.',
    action: '새 방을 만들고 초대를 다시 보내세요.',
  },
  version: {
    title: '중계 버전 불일치',
    detail: '앱과 PC 중계의 제어 버전이 다릅니다.',
    action: '앱과 PC 중계를 같은 배포 버전으로 업데이트하세요.',
  },
  expired: {
    title: '초대 만료',
    detail: '이 초대는 더 사용할 수 없습니다.',
    action: '새 방의 초대 링크나 코드를 받으세요.',
  },
  invalid: {
    title: '주소 또는 코드 오류',
    detail: '입력한 중계 주소나 초대 코드를 확인할 수 없습니다.',
    action: '주소와 코드를 다시 확인하세요.',
  },
  unavailable: {
    title: '원격 대전 이용 불가',
    detail: '중계가 현재 방을 받을 수 없습니다.',
    action: 'PC의 중계 상태를 확인하고 잠시 뒤 다시 시도하세요.',
  },
  denied: {
    title: '참여 거절',
    detail: '방장이 참여 요청을 거절했습니다.',
    action: '방장에게 확인한 뒤 새 초대를 요청하세요.',
  },
};

export const UNKNOWN_REMOTE_ERROR: RemoteMessage = {
  title: '연결 확인 실패',
  detail: '원인을 확인할 수 없습니다.',
  action: 'PC 전원, Docker Desktop, Tailscale Funnel을 차례로 확인하고 다시 시도하세요.',
};

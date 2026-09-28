// 인앱 진단 로그 (spec FR-30). 시간순 링 버퍼. 진단 화면이 반응형으로 보여 주고 선택 가능한 텍스트로 내보낸다.
// 게스트 로그 업로드(NP-09)와 Android 공유 시트 연동은 M4(bridge·protocol)에서 붙인다.

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  readonly t: string;
  readonly level: LogLevel;
  readonly msg: string;
}

const MAX_LINES = 400;
/** 한 줄 상한 (NP-09 줄당 2KB와 같은 규모) */
const MAX_LINE_CHARS = 2000;

function timestamp(date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

class AppLog {
  lines = $state.raw<readonly LogLine[]>([]);

  private push(level: LogLevel, msg: string): void {
    const line: LogLine = { t: timestamp(), level, msg: msg.slice(0, MAX_LINE_CHARS) };
    const next = [...this.lines, line];
    this.lines = next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
  }

  info(msg: string): void {
    this.push('info', msg);
  }

  warn(msg: string): void {
    this.push('warn', msg);
  }

  error(msg: string): void {
    this.push('error', msg);
  }

  /** 복사용 텍스트 (진단 화면의 전체 선택 텍스트 영역) */
  text(): string {
    return this.lines.map((l) => `${l.t} ${l.level.toUpperCase()} ${l.msg}`).join('\n');
  }
}

export const log = new AppLog();

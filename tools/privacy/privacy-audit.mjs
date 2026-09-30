// #208 · spec NF-01/NF-RP-06 · plan §1.8/§1.9. 원문·일치 값을 출력하지 않는다.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rules = [
  [
    'personal-path',
    /(?:\/home\/|\/Users\/|\/mnt\/[a-z]\/Users\/)[^\s/`"'<>]+|[A-Za-z]:[\\/]+(?:Users|home)[\\/]+[^\s\\/`"'<>]+|\\\\wsl(?:\$|\.localhost)\\[^\s`"'<>]+|~[A-Za-z][\w.-]+\//g,
  ],
  ['worktree-path', /\.(?:paseo|orca|codex)[\\/]worktrees[\\/][^\s`"'<>]+/g],
  ['tailnet-host', /\b[\w.-]+\.ts\.net\b/g],
  ['network-address', /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g],
  [
    'credential',
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9_-]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ],
  ['url-credential', /\b[a-z]+:\/\/[^\s/@`"'<>]+:[^\s/@`"'<>]+@/gi],
  ['invite-secret', /[#?&](?:g|t|s|secret|token|password|key)=[^\s`"'<>]+/g],
  [
    'literal-credential',
    /\b(?:creationSecret|inviteSecret|hostSecret|guestSecret|sessionToken|accessToken|refreshToken|guestToken|hostToken|password|passwd|secret|token|api[_-]?key|authorization)\b["']?\s*[:=]\s*["'][^"'\n]+["']/gi,
  ],
  ['email', /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g],
  ['ssh-account', /\b[\w.-]+@[\w.-]+(?=[:\s`])/g],
];

export function restrictedPath(path) {
  return /(?:^|\/)(?:secrets?|private|passwords?|keys?|creation-secret|\.git-credentials|\.env(?:\..*)?|id_rsa|id_ed25519|credentials)(?:[./]|$)|\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(
    path,
  );
}

function isGeneralized(type, value, line, path) {
  if (type === 'personal-path')
    return (
      path === 'packages/web/e2e/fonts.conf' &&
      value === '/home/*' &&
      /^\s*<glob>\/home\/\*<\/glob>\s*$/.test(line)
    );
  if (type === 'worktree-path') return false;
  if (type === 'network-address') {
    const parts = value.split('.').map(Number);
    if (parts.some((part) => part > 255)) return true; // SVG 소수 좌표·버전은 IP가 아니다.
    return (
      parts[0] === 127 ||
      value === '0.0.0.0' ||
      value === '255.255.255.255' ||
      /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(value) ||
      /^(?:100\.64\.0\.0|172\.16\.0\.0|192\.168\.0\.0)\//.test(line.slice(line.indexOf(value)))
    );
  }
  if (type === 'invite-secret') return /=[.…]+(?:&|$)/.test(value) || /=[<$]/.test(value);
  // npm 버전·Actions uses·Kotlin return@ 라벨은 개인 SSH 계정이 아니다.
  if (type === 'ssh-account')
    return (
      /^[\w-]+@\d+\.\d+\.\d+$/.test(value) ||
      /^(?:checkout|setup-node|setup-java|setup-gradle|upload-artifact|download-artifact|cache|action-gh-release)@v\d+\.?$/.test(
        value,
      )
    );
  if (type === 'email')
    return (
      /^[^@]+@(?:example\.(?:com|org|net)|[^.]+\.invalid)$/.test(value) || /^this@[A-Z]/.test(value)
    );
  return false;
}

// IPv4처럼 보이는 compact 소수 좌표는 실제 .svg의 path d 문법 안에서만 구별한다.
function validPathData(data) {
  const tokens = [
    ...data.matchAll(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g),
  ];
  if (!tokens.length || !/^[Mm]$/.test(tokens[0][0])) return false;
  let end = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const betweenNumbers =
      i > 0 && !/^[A-Za-z]$/.test(tokens[i - 1][0]) && !/^[A-Za-z]$/.test(token[0]);
    const delimiter = betweenNumbers ? /^[ \t\r\n]*,?[ \t\r\n]*$/ : /^[ \t\r\n]*$/;
    if (!delimiter.test(data.slice(end, token.index))) return false;
    end = token.index + token[0].length;
  }
  if (!/^[ \t\r\n]*$/.test(data.slice(end))) return false;
  const arities = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++][0].toUpperCase();
    const arity = arities[command];
    if (arity === undefined) return false;
    const values = [];
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index][0]))
      values.push(Number(tokens[index++][0]));
    if (!values.every(Number.isFinite)) return false;
    if (arity === 0 ? values.length !== 0 : values.length < arity || values.length % arity !== 0)
      return false;
    if (command === 'A')
      for (let i = 0; i < values.length; i += 7) {
        if (
          values[i] < 0 ||
          values[i + 1] < 0 ||
          ![0, 1].includes(values[i + 3]) ||
          ![0, 1].includes(values[i + 4])
        )
          return false;
      }
  }
  return true;
}

function svgCoordinateRanges(text, path) {
  if (!path.endsWith('.svg')) return [];
  // 주석을 공백으로 바꿔 위치를 유지하고 주석의 가짜 요소는 면제하지 않는다.
  const markup = text
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/^\s*<\?xml[^>]*>\s*/, (declaration) => declaration.replace(/[^\n]/g, ' '));
  // CDATA/DTD/처리 명령·접두 namespace 등 입증하지 않은 XML 문맥은 면제하지 않는다.
  if (!/^\s*<svg(?=[\s>])[\s\S]*<\/svg>\s*$/.test(markup) || /<!|<\?/.test(markup)) return [];
  const ranges = [];
  const stack = [];
  let end = 0;
  let rootSeen = false;
  // 인용된 속성을 포함한 완전한 태그만 소비한다. 속성 안 가짜 태그는 요소가 아니다.
  const name = '[A-Za-z_][\\w:.-]*';
  const attribute = new RegExp(
    `[ \\t\\r\\n]+(${name})[ \\t\\r\\n]*=[ \\t\\r\\n]*("[^"<]*"|'[^'<]*')`,
    'y',
  );
  const tags = new RegExp(`<\\/?(${name})((?:${attribute.source})*)[ \\t\\r\\n]*\\/?>`, 'g');
  const closeTag = new RegExp(`^<\\/${name}[ \\t\\r\\n]*>$`);
  for (const element of markup.matchAll(tags)) {
    if (markup.slice(end, element.index).includes('<')) return [];
    end = element.index + element[0].length;
    if (element[1].includes(':')) return [];
    const closing = element[0].startsWith('</');
    if (closing) {
      if (!closeTag.test(element[0]) || stack.pop() !== element[1]) return [];
      continue;
    }
    if (stack.length === 0) {
      if (rootSeen || element[1] !== 'svg') return [];
      rootSeen = true;
    }
    const attrs = [];
    let consumed = 0;
    // 태그 검증과 같은 문법을 시작 위치에 고정해 속성 부분 전체를 소비한다.
    while (consumed < element[2].length) {
      attribute.lastIndex = consumed;
      const attr = attribute.exec(element[2]);
      if (!attr) return [];
      attrs.push(attr);
      consumed = attribute.lastIndex;
    }
    if (new Set(attrs.map((attr) => attr[1])).size !== attrs.length) return [];
    if (attrs.some((attr) => attr[1].includes(':'))) return [];
    if (
      attrs.some(
        (attr) =>
          attr[1].startsWith('xmlns') &&
          !(
            stack.length === 0 &&
            element[1] === 'svg' &&
            attr[1] === 'xmlns' &&
            attr[2].slice(1, -1) === 'http://www.w3.org/2000/svg'
          ),
      )
    )
      return [];
    if (!element[0].endsWith('/>')) stack.push(element[1]);
    if (element[1] !== 'path') continue;
    for (const attr of attrs) {
      if (attr[1] !== 'd' || !validPathData(attr[2].slice(1, -1))) continue;
      const start =
        element.index + 1 + element[1].length + attr.index + attr[0].indexOf(attr[2]) + 1;
      ranges.push([start, start + attr[2].length - 2]);
    }
  }
  return stack.length || markup.slice(end).includes('<') ? [] : ranges;
}

// 허용은 파일·유형·합성 문자열 전체의 정확한 일치만. 테스트 파일 전체를 면제하지 않는다.
export function scanText(text, path, allowances = [], lineOffset = 0) {
  const findings = [];
  const coordinateRanges = svgCoordinateRanges(text, path);
  let allowed = 0;
  for (const [type, pattern] of rules) {
    for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
      const localLine = text.slice(0, match.index).split('\n').length;
      const line = localLine + lineOffset;
      const sourceLine = text.split('\n')[localLine - 1] ?? '';
      if (
        (type === 'network-address' &&
          coordinateRanges.some(
            ([start, end]) => match.index >= start && match.index + match[0].length <= end,
          )) ||
        (type === 'ssh-account' && /(?:return|this)@/.test(match[0])) ||
        isGeneralized(type, match[0], sourceLine, path) ||
        allowances.some(
          (entry) =>
            entry.path === path &&
            entry.type === type &&
            entry.line === line &&
            entry.sha256 === createHash('sha256').update(match[0]).digest('hex'),
        )
      ) {
        allowed += 1;
      } else findings.push({ line, type });
    }
  }
  return { findings, allowed };
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}
function emit(path, result, extra = {}) {
  // 악의적인 파일명에서도 경로/자격값을 출력하지 않는다.
  const displayPath = scanText(path, '').findings.length ? '<redacted-path>' : path;
  if (result.findings.length)
    process.stdout.write(`${JSON.stringify({ path: displayPath, ...result, ...extra })}\n`);
}

export function scanTracked({ allowances = [], pending = [] } = {}) {
  const paths = run('git', ['ls-files', '-z']).split('\0').filter(Boolean);
  const summary = {
    tracked: paths.length,
    text: 0,
    binary: 0,
    restricted: 0,
    findings: 0,
    pending: 0,
    allowed: 0,
  };
  for (const path of paths) {
    if (restrictedPath(path) || lstatSync(path).isSymbolicLink()) {
      summary.restricted += 1;
      emit(path, { findings: [{ line: 0, type: 'restricted-path-not-opened' }], allowed: 0 });
      continue;
    }
    const buffer = readFileSync(path);
    const text = buffer.toString('utf8');
    if (buffer.includes(0) || !Buffer.from(text).equals(buffer)) {
      summary.binary += 1;
      continue;
    }
    summary.text += 1;
    const result = scanText(text, path, allowances);
    const applicablePending = pending.filter((entry) => {
      if (entry.path !== path || !/^[0-9a-f]{40}$/.test(entry.baseline ?? '')) return false;
      // 기존 소유 잔존은 기준 blob과 파일 전체가 같을 때만 보류한다. 값을 해시/출력하지 않는다.
      return run('git', ['show', `${entry.baseline}:${path}`]) === text;
    });
    const known = result.findings.filter((finding) =>
      applicablePending.some(
        (entry) => entry.type === finding.type && entry.lines.includes(finding.line),
      ),
    );
    summary.pending += known.length;
    summary.findings += result.findings.length - known.length;
    summary.allowed += result.allowed;
    emit(path, result, { pending: known.length });
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.findings + summary.restricted;
}

export function scanDiff(diff, allowances = []) {
  let path = '',
    line = 0;
  const results = [];
  for (const text of diff.split('\n')) {
    if (text.startsWith('+++ b/')) path = text.slice(6);
    else if (text.startsWith('@@ ')) line = Number(/\+(\d+)/.exec(text)?.[1] ?? 0);
    else if (text.startsWith('+') && !text.startsWith('+++')) {
      const result = restrictedPath(path)
        ? { findings: [{ line: 0, type: 'restricted-path-not-opened' }], allowed: 0 }
        : scanText(text.slice(1), path, allowances, line - 1);
      results.push(...result.findings.map((finding) => ({ path, line, type: finding.type })));
      line += 1;
    } else if (text.startsWith(' ')) line += 1;
  }
  return results;
}

function main() {
  const policy = JSON.parse(readFileSync('tools/privacy/privacy-audit-allowlist.json', 'utf8'));
  let errors = scanTracked(policy);
  const base =
    process.argv[2] === '--base'
      ? process.argv[3]
      : process.env.GITHUB_BASE_REF
        ? `origin/${process.env.GITHUB_BASE_REF}`
        : 'HEAD';
  if (!base || base.startsWith('-') || !/^[\w./-]+$/.test(base)) throw new Error('invalid-base');
  // 전체 파일의 알려진 잔존 허용은 추가 행에는 적용하지 않는다.
  const safePaths = run('git', ['ls-files', '-z'])
    .split('\0')
    .filter((path) => path && !restrictedPath(path) && !lstatSync(path).isSymbolicLink());
  for (const args of [
    [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--unified=0',
      `${base}...HEAD`,
      '--',
      ...safePaths,
    ],
    [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--unified=0',
      'HEAD',
      '--',
      ...safePaths,
    ],
  ]) {
    for (const finding of scanDiff(run('git', args), policy.allowances)) {
      emit(
        finding.path,
        { findings: [{ line: finding.line, type: finding.type }], allowed: 0 },
        { surface: 'added-line' },
      );
      errors += 1;
    }
  }
  process.exitCode = errors ? 1 : 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch {
    process.stdout.write('{"type":"audit-read-error","count":1}\n');
    process.exitCode = 1;
  }
}

package com.kywoo26.p2pgostop.server

/**
 * M0 테스트 페이지. 외부 리소스 없이 한 파일로 끝난다(NP-08). M4에서 assets/web의 웹 앱으로 대체된다.
 * iPhone Safari(비보안 컨텍스트)에서 동작해야 하므로 clipboard·share·wakeLock 등은 쓰지 않는다.
 */
object SmokePage {
    fun escapeHtml(s: String): String = buildString(s.length) {
        for (c in s) {
            when (c) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                '\'' -> append("&#39;")
                else -> append(c)
            }
        }
    }

    fun render(env: ServerEnv): String {
        val rows = buildString {
            val info = linkedMapOf("앱 버전" to env.appVersion, "빌드" to "${env.gitSha} · ${env.buildTime}") + env.deviceInfo()
            for ((k, v) in info) append("<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>")
        }
        return TEMPLATE.replace("{{ROWS}}", rows)
            .replace("{{SHA}}", escapeHtml(env.gitSha))
            .replace("{{UPLOAD_MAX}}", GUEST_UPLOAD_MAX_BYTES.toString())
    }

    private val TEMPLATE = """
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>맞고 P2P · 연결 성공</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 16px; padding-top: max(16px, env(safe-area-inset-top)); background: #f4f6f4; color: #1b1f1b; }
  h1 { font-size: 28px; margin: 8px 0 4px; color: #0a7a2f; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; background: #fff; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e3e6e3; vertical-align: top; }
  th { width: 34%; color: #555; font-weight: 600; }
  button { font-size: 17px; padding: 12px 16px; margin: 8px 8px 0 0; border-radius: 10px; border: 0; background: #0a7a2f; color: #fff; }
  button.secondary { background: #4a5a4a; }
  #status { font-weight: 700; margin-top: 12px; }
  #rtt { font-size: 22px; font-weight: 700; margin: 8px 0; }
  textarea { width: 100%; height: 260px; font: 12px ui-monospace, Menlo, monospace; box-sizing: border-box; margin-top: 8px; }
  .muted { color: #666; font-size: 13px; }
</style>
</head>
<body>
<h1>연결 성공</h1>
<p class="muted">이 페이지가 보이면 iPhone이 호스트 폰의 핫스팟과 내장 서버(포트 17777)에 접속한 것입니다. 빌드 {{SHA}}</p>
<table>{{ROWS}}<tbody id="client"></tbody></table>
<div id="status">WebSocket: 연결 안 됨</div>
<div id="rtt">왕복 시간: -</div>
<button id="echo">WS 에코 테스트</button>
<button id="reconnect" class="secondary">다시 연결</button>
<button id="sendlog" class="secondary">로그를 호스트로 보내기</button>
<p class="muted">화면을 잠갔다 풀면 자동으로 다시 연결합니다. 아래 로그는 길게 눌러 전체 선택·복사할 수 있습니다.</p>
<textarea id="log" readonly></textarea>
<script>
(function () {
  'use strict';
  var logEl = document.getElementById('log');
  var statusEl = document.getElementById('status');
  var rttEl = document.getElementById('rtt');
  var ws = null, seq = 0, sent = {}, queued = [];
  function ts() { var d = new Date(); return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
  function log(m) { logEl.value += ts() + ' ' + m + '\n'; logEl.scrollTop = logEl.scrollHeight; }
  function setStatus(s) { statusEl.textContent = 'WebSocket: ' + s; }
  function row(k, v) { var tr = document.createElement('tr'); var th = document.createElement('th'); var td = document.createElement('td'); th.textContent = k; td.textContent = v; tr.appendChild(th); tr.appendChild(td); document.getElementById('client').appendChild(tr); }
  row('이 기기 UA', navigator.userAgent);
  row('주소', location.href);
  row('보안 컨텍스트', String(window.isSecureContext));
  row('navigator.wakeLock', typeof navigator.wakeLock);
  log('페이지 로드 ' + location.href + ' secure=' + window.isSecureContext + ' wakeLock=' + typeof navigator.wakeLock);

  function connect(reason) {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) { try { ws.close(); } catch (e) {} }
    log('WS 연결 시도 (' + reason + ')');
    setStatus('연결 중…');
    var s = new WebSocket('ws://' + location.host + '/ws');
    ws = s;
    s.onopen = function () { if (ws !== s) return; setStatus('연결됨'); log('WS 열림'); while (queued.length) s.send(queued.shift()); };
    s.onmessage = function (e) {
      var text = String(e.data);
      var m = /^ping:(\d+):(\d+)$/.exec(text);
      if (m && sent[m[1]]) { var rtt = Date.now() - sent[m[1]]; delete sent[m[1]]; rttEl.textContent = '왕복 시간: ' + rtt + ' ms (#' + m[1] + ')'; log('에코 수신 #' + m[1] + ' ' + rtt + 'ms'); }
      else if (text.indexOf('ack:log:') === 0) { log('호스트가 로그를 받았습니다 (' + text.slice(8) + '바이트)'); }
      else if (text.indexOf('nack:log:') === 0) { log('호스트가 로그를 거절했습니다(너무 잦음). 5초 뒤 다시 누르세요.'); }
      else { log('수신: ' + text.slice(0, 80)); }
    };
    s.onclose = function (e) { if (ws === s) setStatus('닫힘 (code ' + e.code + ')'); log('WS 닫힘 code=' + e.code + ' clean=' + e.wasClean); };
    s.onerror = function () { log('WS 오류'); };
  }
  function sendOrQueue(text) {
    if (ws && ws.readyState === 1) ws.send(text); else { queued.push(text); connect('전송 대기'); }
  }
  document.getElementById('echo').onclick = function () { seq += 1; sent[seq] = Date.now(); log('에코 전송 #' + seq); sendOrQueue('ping:' + seq + ':' + sent[seq]); };
  document.getElementById('reconnect').onclick = function () { connect('버튼'); };
  // 서버 상한은 UTF-8 바이트(spec NP-09)라서 문자 수가 아니라 바이트로 자른다. 한국어는 글자당 3바이트.
  // TextEncoder/TextDecoder는 비보안 컨텍스트(http://)에서도 쓸 수 있다.
  var UPLOAD_MAX = {{UPLOAD_MAX}};
  function tailBytes(str, max) {
    var bytes = new TextEncoder().encode(str);
    if (bytes.length <= max) return str;
    var i = bytes.length - max;
    while (i < bytes.length && (bytes[i] & 0xC0) === 0x80) i++; // UTF-8 연속 바이트에서 시작하지 않게
    return '(앞부분 생략)\n' + new TextDecoder().decode(bytes.subarray(i));
  }
  document.getElementById('sendlog').onclick = function () { sendOrQueue('log:' + tailBytes(logEl.value, UPLOAD_MAX - 64)); log('로그 전송 요청'); };
  document.addEventListener('visibilitychange', function () { log('visibility=' + document.visibilityState); if (document.visibilityState === 'visible') connect('화면 복귀'); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) connect('pageshow(bfcache)'); });
  window.addEventListener('online', function () { log('online 이벤트'); });
  window.addEventListener('offline', function () { log('offline 이벤트'); });
  connect('페이지 로드');
})();
</script>
</body>
</html>
""".trimIndent()
}

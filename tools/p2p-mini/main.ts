// MVP P2P 페이지: ?role=host(Galaxy WebView, 권위) / ?role=guest(iPhone Safari). 릴레이 /ws?role= 로 연결.
import { Game, type Proj } from './game.ts';
import type { Action, Seat } from '../../packages/engine/src/state.ts';

const q = new URLSearchParams(location.search);
const role: 'host' | 'guest' = q.get('role') === 'host' ? 'host' : 'guest';
const mySeat: Seat = role === 'host' ? 0 : 1;
const $ = (id: string) => document.getElementById(id)!;
const wsUrl = `ws://${location.host}/ws?role=${role}`;

let ws: WebSocket | null = null;
let peer = false;

const game = role === 'host' ? new Game() : null;
let sockId = 0;

function status(t: string) {
  $('status').textContent = t;
}
function send(obj: unknown) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const id = ++sockId;
  status(`연결 중 (${role})…`);
  const s = new WebSocket(wsUrl);
  ws = s;
  s.onopen = () => {
    status(`연결됨 (${role}) #${id}`);
    if (role === 'host') broadcast();
    else send({ t: 'hello' });
  };
  s.onmessage = (ev) => {
    let m: any;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (m.type === 'relay' || m.t === 'relay') {
      peer = m.peer === 'joined' || m.peer === 'present';
      if (m.peer === 'left' || m.peer === 'absent') peer = false;
      status(peer ? '상대 접속됨' : '상대 없음');
      if (role === 'host') broadcast();
      return;
    }
    if (role === 'host') {
      if (m.t === 'hello') {
        peer = true;
        broadcast();
      } else if (m.t === 'action' && game) {
        game.act(1, m.action as Action);
        broadcast();
      } else if (m.t === 'next' && game) {
        if (game.state?.phase === 'end') game.start();
        broadcast();
      }
    } else if (m.t === 'view') {
      peer = true;
      render(m.proj as Proj);
    }
  };
  s.onclose = () => {
    if (id === sockId) {
      status('끊김 — 재연결 중');
      setTimeout(connect, 1000);
    }
  };
  s.onerror = () => {};
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') connect();
});
window.addEventListener('pageshow', () => connect());

function broadcast() {
  if (!game) return;
  send({ t: 'view', proj: game.proj(1, true) });
  render(game.proj(0, peer));
}
function act(a: Action) {
  if (role === 'host' && game) {
    game.act(0, a);
    broadcast();
  } else send({ t: 'action', action: a });
}

const MON = [
  '',
  '1월 송학',
  '2월 매조',
  '3월 벚꽃',
  '4월 흑싸리',
  '5월 난초',
  '6월 모란',
  '7월 홍싸리',
  '8월 공산',
  '9월 국진',
  '10월 단풍',
  '11월 오동',
  '12월 비',
];
function img(id: number, cls = 'card', onClick?: () => void, enabled = true): HTMLElement {
  const b = document.createElement(onClick ? 'button' : 'div');
  b.className = cls + (onClick && !enabled ? ' dim' : '');
  const i = document.createElement('img');
  i.src = `/cards/${id}.svg`;
  i.alt = String(id);
  i.draggable = false;
  b.appendChild(i);
  if (onClick) {
    (b as HTMLButtonElement).disabled = !enabled;
    b.addEventListener('click', onClick);
  }
  return b;
}
function pile(el: HTMLElement, c: Proj['captured']) {
  el.innerHTML = '';
  for (const [k, ids] of Object.entries(c)) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = ({ gwang: '광', yeol: '열', tti: '띠', pi: '피' } as any)[k] + ids.length;
    row.appendChild(lab);
    for (const id of ids) row.appendChild(img(id, 'mini'));
    el.appendChild(row);
  }
}
function btn(label: string, on: () => void, cls = 'act'): HTMLElement {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.onclick = on;
  return b;
}

function render(p: Proj) {
  const me = mySeat === 0 ? '호스트' : '게스트';
  $('top').textContent =
    `${p.round}판 · 더미 ${p.deck} · 이월 ×${p.carry} · 잔액 나 ${p.balances[mySeat]!.toLocaleString()} / 상대 ${p.balances[1 - mySeat]!.toLocaleString()}냥`;
  $('opp').textContent =
    `상대 ${p.oppScore}점${p.oppGo ? ' ' + p.oppGo + '고' : ''} · 손패 ${p.oppHandCount}장`;
  $('me').textContent =
    `${me} ${p.score}점${p.go ? ' ' + p.go + '고' : ''}${p.myTurn ? ' · 내 차례' : ' · 상대 차례'}`;
  pile($('oppPile'), p.oppCaptured);
  pile($('myPile'), p.captured);
  const floor = $('floor');
  floor.innerHTML = '';
  const targets = new Set(
    p.legal.filter((a) => a.type === 'chooseTarget').map((a: any) => a.card as number),
  );
  for (const g of p.floor) {
    const grp = document.createElement('div');
    grp.className = 'grp' + (g.kind !== 'loose' ? ' ppeok' : '');
    for (const id of g.cards)
      grp.appendChild(
        targets.has(id)
          ? img(id, 'card pick', () =>
              act({ type: 'chooseTarget', seat: mySeat, card: id as never }),
            )
          : img(id, 'card'),
      );
    floor.appendChild(grp);
  }
  const hand = $('hand');
  hand.innerHTML = '';
  const playable = new Set(
    p.legal.filter((a) => a.type === 'play').map((a: any) => a.card as number),
  );
  for (const id of p.hand)
    hand.appendChild(
      img(
        id,
        'card',
        () => act({ type: 'play', seat: mySeat, card: id as never }),
        playable.has(id),
      ),
    );
  const pr = $('prompt');
  pr.innerHTML = '';
  const pend: any = p.pending;
  if (p.phase === 'end') {
    pr.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'msg',
        textContent: p.result?.text ?? '판 종료',
      }),
    );
    pr.appendChild(
      btn('다음 판', () =>
        role === 'host' && game ? (game.start(), broadcast()) : send({ t: 'next' }),
      ),
    );
  } else if (p.firstPick) {
    pr.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'msg',
        textContent: p.firstPick.picked
          ? '상대가 고르는 중…'
          : '선 정하기: 카드를 하나 고르세요 (높은 월이 선)',
      }),
    );
    for (const a of p.legal.filter((x) => x.type === 'pickFirst'))
      pr.appendChild(btn(`카드 ${(a as any).index + 1}`, () => act(a)));
  } else if (!p.myTurn) {
    pr.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'msg',
        textContent: p.peer ? '상대 차례…' : '상대 접속 대기 중',
      }),
    );
  } else {
    for (const a of p.legal) {
      const t: any = a;
      if (t.type === 'go')
        pr.appendChild(btn(`고! (현재 ${pend?.score ?? p.score}점)`, () => act(a), 'act go'));
      else if (t.type === 'stop')
        pr.appendChild(
          btn(
            `스톱${p.stopMoney !== null ? ' → +' + p.stopMoney.toLocaleString() + '냥' : ''}`,
            () => act(a),
            'act stop',
          ),
        );
      else if (t.type === 'shake')
        pr.appendChild(
          btn(t.accept ? `흔들기 (${MON[pend?.month] ?? ''} 3장, ×2)` : '흔들지 않음', () =>
            act(a),
          ),
        );
      else if (t.type === 'chongtong')
        pr.appendChild(
          btn(t.choice === 'end' ? '총통! 끝내기(10점)' : '총통 들고 계속', () => act(a)),
        );
      else if (t.type === 'gukjin')
        pr.appendChild(btn(t.asPi ? '국진을 쌍피로' : '국진을 열끗으로', () => act(a)));
      else if (t.type === 'bomb')
        pr.appendChild(btn(`폭탄! ${MON[t.month] ?? t.month}`, () => act(a)));
      else if (t.type === 'flipOnly') pr.appendChild(btn('폭탄패: 뒤집기만', () => act(a)));
      else if (t.type === 'chooseTarget') {
        /* 바닥에서 선택 */
      }
    }
    if (targets.size)
      pr.appendChild(
        Object.assign(document.createElement('div'), {
          className: 'msg',
          textContent: '바닥에서 먹을 카드를 고르세요',
        }),
      );
  }
  $('log').textContent = p.log.slice(-10).join('\n');
}

$('role').textContent = role === 'host' ? '호스트 (Galaxy)' : '게스트 (iPhone)';
if (role === 'host' && game) {
  game.start();
  render(game.proj(0, false));
}
connect();

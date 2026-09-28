// Node 자가 테스트: 두 좌석이 무작위 합법 수로 5판 완주 + 잔액 제로섬.
import { Game } from './game.ts';
const g = new Game(42);
let steps = 0;
for (let r = 0; r < 5; r++) {
  g.start();
  while (g.state && g.state.phase !== 'end' && steps < 5000) {
    let moved = false;
    for (const seat of [0, 1] as const) {
      const legal = g.legal(seat);
      if (legal.length) { const a = legal[Math.floor(Math.random() * legal.length)]!; if (!g.act(seat, a)) throw new Error('reject ' + JSON.stringify(a)); moved = true; steps++; break; }
    }
    if (!moved) throw new Error('no legal action for either seat: ' + JSON.stringify(g.state.pending));
    void g.proj(0, true); void g.proj(1, true);
  }
  console.log('round', r + 1, g.result?.text, 'balances', g.balances.join('/'));
}
if (g.balances[0]! + g.balances[1]! !== 300000) throw new Error('not zero-sum');
console.log('SELFTEST OK steps=' + steps);

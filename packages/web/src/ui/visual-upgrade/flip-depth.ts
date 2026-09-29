// 프로토타입 전용 표시 어댑터. 기존 FLIP의 시간/취소/면 전환은 소유자가 그대로 관리한다.
// 정식 채택 시 anim 소유자와 키프레임 주입 API로 교체한다(plan 1.8 VU-02).
export function flipDepth(root: HTMLElement) {
  if (document.documentElement.dataset['visual'] !== 'upgrade') return {};
  const changed = new WeakSet<Animation>();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target;
      if (!(el instanceof HTMLElement) || !el.matches('.card > .inner')) continue;
      for (const animation of el.getAnimations()) {
        if (changed.has(animation) || !(animation.effect instanceof KeyframeEffect)) continue;
        const frames = animation.effect.getKeyframes();
        if (!frames.some((frame) => String(frame['transform']).includes('scaleX(0)'))) continue;
        changed.add(animation);
        // opacity 기반 앞/뒷면 교대는 그대로 두어 WebKit backface 문제를 다시 만들지 않는다.
        animation.effect.setKeyframes([
          { transform: 'perspective(600px) rotateY(-180deg)' },
          { transform: 'perspective(600px) rotateY(-90deg)', offset: 0.5 },
          { transform: 'perspective(600px) rotateY(0deg)' },
        ]);
        el.dataset['depthFlip'] = 'true';
        const clear = () => {
          delete el.dataset['depthFlip'];
        };
        void animation.finished.then(clear, clear);
      }
    }
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
  return { destroy: () => observer.disconnect() };
}

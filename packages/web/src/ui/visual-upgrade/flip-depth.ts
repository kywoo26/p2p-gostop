// 프로토타입 전용 표시 어댑터. 기존 FLIP의 시간/취소/면 전환은 소유자가 그대로 관리한다.
// 정식 채택 시 anim 소유자와 키프레임 주입 API로 교체한다(plan 1.8 VU-02).
export function flipDepth(root: HTMLElement) {
  if (document.documentElement.dataset['visual'] !== 'upgrade') return {};
  const rich = document.documentElement.dataset['visualVariant'] === 'rich';
  const changed = new WeakSet<Animation>();
  const cleanups = new Set<() => void>();
  function light(el: HTMLElement, owner: Animation, moving: boolean) {
    if (!rich || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timing = owner.effect!.getTiming();
    if (Number(timing.duration) <= 0) return;
    const layer = document.createElement('span');
    layer.className = moving ? 'vu-motion-trail' : 'vu-sheen';
    layer.setAttribute('aria-hidden', 'true');
    if (moving && owner.effect instanceof KeyframeEffect) {
      const transform = String(owner.effect.getKeyframes()[0]?.['transform']);
      const offset = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
      if (offset)
        layer.style.rotate = `${(Math.atan2(Number(offset[2]), Number(offset[1])) * 180) / Math.PI - 180}deg`;
    }
    el.append(layer);
    el.dataset['motionGlow'] = 'true';
    const decoration = layer.animate(
      moving
        ? [
            { opacity: 0, transform: 'scaleX(0.3)' },
            { opacity: 0.7, transform: 'scaleX(1)', offset: 0.35 },
            { opacity: 0, transform: 'scaleX(0.1)' },
          ]
        : [
            { opacity: 0, transform: 'translateX(-100%)' },
            { opacity: 0.55, transform: 'translateX(0)', offset: 0.5 },
            { opacity: 0, transform: 'translateX(100%)' },
          ],
      {
        duration: Number(timing.duration),
        delay: timing.delay ?? 0,
        easing: timing.easing ?? 'linear',
        fill: 'both',
      },
    );
    void owner.ready.then(
      () => {
        if (decoration.playState === 'idle') return;
        if (owner.playState === 'paused') {
          decoration.pause();
          decoration.currentTime = owner.currentTime;
        } else decoration.startTime = owner.startTime;
      },
      () => {
        /* pending 중 취소 시 owner.finished가 장식을 회수한다. */
      },
    );
    const clear = () => {
      decoration.cancel();
      layer.remove();
      delete el.dataset['motionGlow'];
      cleanups.delete(clear);
    };
    cleanups.add(clear);
    void owner.finished.then(clear, clear);
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target;
      if (!(el instanceof HTMLElement) || !el.matches('.card, .card > .inner')) continue;
      for (const animation of el.getAnimations()) {
        if (changed.has(animation) || !(animation.effect instanceof KeyframeEffect)) continue;
        const frames = animation.effect.getKeyframes();
        if (
          el.matches('.card') &&
          frames.some((frame) => String(frame['transform']).includes('translate('))
        ) {
          changed.add(animation);
          light(el, animation, true);
          continue;
        }
        if (!frames.some((frame) => String(frame['transform']).includes('scaleX(0)'))) continue;
        changed.add(animation);
        // opacity 기반 앞/뒷면 교대는 그대로 두어 WebKit backface 문제를 다시 만들지 않는다.
        animation.effect.setKeyframes([
          { transform: 'perspective(600px) rotateY(-180deg)' },
          { transform: 'perspective(600px) rotateY(-90deg)', offset: 0.5 },
          { transform: 'perspective(600px) rotateY(0deg)' },
        ]);
        el.dataset['depthFlip'] = 'true';
        light(el, animation, false);
        const clear = () => {
          delete el.dataset['depthFlip'];
        };
        void animation.finished.then(clear, clear);
      }
    }
  });
  observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
  return {
    destroy: () => {
      observer.disconnect();
      for (const clear of cleanups) clear();
    },
  };
}

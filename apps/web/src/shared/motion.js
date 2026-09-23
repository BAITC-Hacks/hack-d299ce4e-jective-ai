export function createMotion() {
  let observer;
  const frames = new Set();

  function dispose() {
    observer?.disconnect();
    for (const frame of frames) cancelAnimationFrame(frame);
    frames.clear();
  }

  function schedule(callback) {
    const frame = requestAnimationFrame((now) => {
      frames.delete(frame);
      callback(now);
    });
    frames.add(frame);
  }

  function init(root) {
    dispose();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          if (!reduce) {
            entry.target.querySelectorAll('[data-count]').forEach((element) => {
              const end = Number(element.dataset.count);
              const start = performance.now();
              const tick = (now) => {
                const progress = Math.min((now - start) / 1100, 1);
                element.textContent = Math.round(end * (1 - Math.pow(1 - progress, 3)));
                if (progress < 1) schedule(tick);
              };
              schedule(tick);
            });
          }
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    root.querySelectorAll('.reveal').forEach((element) => {
      element.classList.add('motion-ready');
      observer.observe(element);
    });
  }

  return { init, dispose };
}

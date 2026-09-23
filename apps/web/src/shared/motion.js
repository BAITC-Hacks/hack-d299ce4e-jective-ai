export function createMotion() {
  let observer;
  let topbar;
  let onScroll;
  const frames = new Set();

  function dispose() {
    observer?.disconnect();
    observer = undefined;
    if (onScroll) window.removeEventListener('scroll', onScroll);
    onScroll = undefined;
    topbar?.classList.remove('is-scrolled');
    topbar = undefined;
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

  function setupLandingMotion(root) {
    const landing = root.querySelector('.landing-v2');
    if (!landing) return;

    topbar = landing.querySelector('.topbar');
    if (topbar) {
      onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 12);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    landing.querySelectorAll('section:not(.hero-v2), .landing-footer').forEach((element) => {
      element.classList.add('reveal-on-scroll');
    });

    landing.querySelectorAll('.flow-cards, .landing-stats').forEach((grid) => {
      grid.classList.add('reveal-stagger');
      for (const item of grid.children) item.classList.add('reveal-on-scroll');
    });
  }

  function setupWorkspaceMotion(root) {
    root.querySelectorAll('.content > *').forEach((element) => {
      element.classList.add('reveal-on-scroll');
    });

    root.querySelectorAll('.stats, .task-list, .catalog-grid, .role-grid').forEach((grid) => {
      grid.classList.add('reveal-stagger');
      for (const item of grid.children) item.classList.add('reveal-on-scroll');
    });
  }

  function init(root) {
    dispose();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setupLandingMotion(root);
    setupWorkspaceMotion(root);

    const revealElements = new Set([
      ...root.querySelectorAll('.reveal'),
      ...root.querySelectorAll('.reveal-on-scroll'),
    ]);
    revealElements.forEach((element) => element.classList.add('motion-ready'));

    if (reduce || !('IntersectionObserver' in window)) {
      revealElements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          if (entry.target.classList.contains('reveal')) {
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
    revealElements.forEach((element) => observer.observe(element));
  }

  return { init, dispose };
}

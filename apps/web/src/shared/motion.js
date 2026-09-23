export function createMotion() {
  let observer;
  let topbar;
  let onScroll;
  let pointerLanding;
  let onPointerMove;
  let onPointerLeave;
  let pointerFrame;
  let pointerPosition;
  const frames = new Set();

  function dispose() {
    observer?.disconnect();
    observer = undefined;
    if (onScroll) window.removeEventListener('scroll', onScroll);
    onScroll = undefined;
    topbar?.classList.remove('is-scrolled');
    topbar = undefined;

    if (pointerLanding) {
      if (onPointerMove) pointerLanding.removeEventListener('pointermove', onPointerMove);
      if (onPointerLeave) pointerLanding.removeEventListener('pointerleave', onPointerLeave);
      pointerLanding.style.removeProperty('--pointer-x');
      pointerLanding.style.removeProperty('--pointer-y');
    }
    pointerLanding = undefined;
    onPointerMove = undefined;
    onPointerLeave = undefined;
    pointerPosition = undefined;
    if (pointerFrame !== undefined) {
      cancelAnimationFrame(pointerFrame);
      frames.delete(pointerFrame);
      pointerFrame = undefined;
    }

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

  function setupPointerMotion(landing, reduce) {
    const canTrackPointer =
      !reduce &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      'PointerEvent' in window;
    if (!canTrackPointer) return;

    pointerLanding = landing;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const queuePointerUpdate = () => {
      if (pointerFrame !== undefined) return;

      const frame = requestAnimationFrame(() => {
        frames.delete(frame);
        if (pointerFrame === frame) pointerFrame = undefined;
        if (!pointerLanding) return;

        if (!pointerPosition) {
          pointerLanding.style.setProperty('--pointer-x', '50%');
          pointerLanding.style.setProperty('--pointer-y', '16%');
          return;
        }

        const rect = pointerLanding.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const x = clamp(((pointerPosition.x - rect.left) / rect.width) * 100, 0, 100);
        const y = clamp(((pointerPosition.y - rect.top) / rect.height) * 100, 0, 100);
        pointerLanding.style.setProperty('--pointer-x', `${x.toFixed(2)}%`);
        pointerLanding.style.setProperty('--pointer-y', `${y.toFixed(2)}%`);
      });

      pointerFrame = frame;
      frames.add(frame);
    };

    onPointerMove = (event) => {
      if (
        event.pointerType === 'touch' ||
        !Number.isFinite(event.clientX) ||
        !Number.isFinite(event.clientY)
      ) {
        return;
      }
      pointerPosition = { x: event.clientX, y: event.clientY };
      queuePointerUpdate();
    };
    onPointerLeave = () => {
      pointerPosition = undefined;
      queuePointerUpdate();
    };

    pointerLanding.addEventListener('pointermove', onPointerMove, { passive: true });
    pointerLanding.addEventListener('pointerleave', onPointerLeave, { passive: true });
    queuePointerUpdate();
  }

  function setupHeroTypewriter(landing, reduce) {
    const title = landing.querySelector('.hero-type-title');
    const lines = [...landing.querySelectorAll('.hero-type-line')];
    if (!title || !lines.length || reduce || typeof window.requestAnimationFrame !== 'function')
      return;

    const text = lines.map((line) => line.dataset.typewriterText || line.textContent.trim());
    if (!text.every(Boolean)) return;

    const characters = text.map((line) => Array.from(line));
    lines.forEach((line) => {
      line.textContent = '';
      line.classList.remove('is-typing');
    });

    let activeLine = 0;
    let character = 0;
    let lastCharacterAt = 0;
    let pauseUntil = 0;
    let characterDelay = 34;

    const type = (now) => {
      if (!pauseUntil) pauseUntil = now + 260;
      if (now < pauseUntil) {
        schedule(type);
        return;
      }

      if (lastCharacterAt && now - lastCharacterAt < characterDelay) {
        schedule(type);
        return;
      }

      lastCharacterAt = now;
      const line = lines[activeLine];
      const lineCharacters = characters[activeLine];
      line.classList.add('is-typing');
      character += 1;
      line.textContent = lineCharacters.slice(0, character).join('');
      const typedCharacter = lineCharacters[character - 1];
      characterDelay = /[.!?]/.test(typedCharacter) ? 160 : typedCharacter === ' ' ? 50 : 34;

      if (character < lineCharacters.length) {
        schedule(type);
        return;
      }

      line.classList.remove('is-typing');
      activeLine += 1;
      character = 0;
      lastCharacterAt = 0;
      pauseUntil = now + 240;

      if (activeLine >= lines.length) {
        return;
      }

      schedule(type);
    };

    schedule(type);
  }

  function setupLandingMotion(root, reduce) {
    const landing = root.querySelector('.landing-v2');
    if (!landing) return;

    topbar = landing.querySelector('.topbar');
    if (topbar) {
      onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 12);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    setupPointerMotion(landing, reduce);
    setupHeroTypewriter(landing, reduce);

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
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setupLandingMotion(root, reduce);
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

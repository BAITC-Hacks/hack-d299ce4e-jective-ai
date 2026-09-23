const CARD_SELECTOR = '.flow-card, .catalog-card, .task-row, .proposal-card';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const DESKTOP_POINTER = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';

/** Remove listeners explicitly as well as aborting, including older browser fallbacks. */
function eventScope(view) {
  const controller = typeof view.AbortController === 'function' ? new view.AbortController() : null;
  const cleanups = [];
  return {
    listen(target, type, listener, options = {}) {
      if (typeof target?.addEventListener === 'function') {
        try {
          target.addEventListener(
            type,
            listener,
            controller ? { ...options, signal: controller.signal } : options,
          );
        } catch {
          target.addEventListener(type, listener, options);
        }
        cleanups.push(() => target.removeEventListener(type, listener, options.capture ?? false));
      } else if (type === 'change' && typeof target?.addListener === 'function') {
        target.addListener(listener);
        cleanups.push(() => target.removeListener(listener));
      }
    },
    dispose() {
      controller?.abort();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

function media(view, query) {
  return typeof view.matchMedia === 'function' ? view.matchMedia(query) : null;
}

/** Optional visual enhancement only; normal content stays usable without motion APIs. */
export function createMotion() {
  let cleanup = null;

  function dispose() {
    cleanup?.();
    cleanup = null;
  }

  function init(root) {
    dispose();
    if (typeof window === 'undefined' || !root) return;
    const view = window;
    const scope = eventScope(view);
    const reduced = media(view, REDUCED_MOTION);
    const desktop = media(view, DESKTOP_POINTER);
    const frames = new Set();
    const counting = new Map();
    const counted = new Set();
    const counters = [...root.querySelectorAll('[data-count]')];
    const elements = [...root.querySelectorAll(`.reveal, ${CARD_SELECTOR}`)];
    const original = elements.map((element) => ({
      element,
      reveal: element.classList.contains('reveal'),
      ready: element.classList.contains('motion-ready'),
      visible: element.classList.contains('is-visible'),
      delay: element.style.getPropertyValue('--reveal-delay'),
      priority: element.style.getPropertyPriority('--reveal-delay'),
    }));
    const header = root.querySelector('.landing-v2 .topbar');
    const wasScrolled = header?.classList.contains('is-scrolled') ?? false;
    const hero = root.querySelector('.hero-v2');
    let alive = true;
    let observer = null;
    let pointerScope = null;
    let pointerFrame = null;
    let scrollFrame = null;

    function cancel(frame) {
      if (frame === null) return;
      view.cancelAnimationFrame?.(frame);
      frames.delete(frame);
    }

    function schedule(callback) {
      if (typeof view.requestAnimationFrame !== 'function') return null;
      const frame = view.requestAnimationFrame((now) => {
        frames.delete(frame);
        if (alive) callback(now);
      });
      frames.add(frame);
      return frame;
    }

    function settleCounter(element) {
      const end = Number(element.dataset.count);
      if (Number.isFinite(end)) element.textContent = String(end);
      counted.add(element);
    }

    function finishCounting() {
      for (const { frame } of counting.values()) cancel(frame);
      counting.clear();
      counters.forEach(settleCounter);
    }

    function count(element) {
      if (counted.has(element) || counting.has(element)) return;
      const end = Number(element.dataset.count);
      if (!Number.isFinite(end)) return;
      if (reduced?.matches || typeof view.requestAnimationFrame !== 'function') {
        settleCounter(element);
        return;
      }
      const start = view.performance?.now() ?? performance.now();
      const state = { frame: null };
      counting.set(element, state);
      const tick = (now) => {
        if (!counting.has(element)) return;
        const progress = Math.max(0, Math.min((now - start) / 1100, 1));
        element.textContent = String(Math.round(end * (1 - (1 - progress) ** 3)));
        if (progress < 1) state.frame = schedule(tick);
        else {
          counting.delete(element);
          settleCounter(element);
        }
      };
      state.frame = schedule(tick);
    }

    function revealAll() {
      observer?.disconnect();
      observer = null;
      elements.forEach((element) => {
        element.classList.remove('motion-ready');
        element.classList.add('is-visible');
      });
      finishCounting();
    }

    function setupReveals() {
      if (reduced?.matches || typeof view.IntersectionObserver !== 'function') {
        revealAll();
        return;
      }
      try {
        const activeObserver = new view.IntersectionObserver(
          (entries) => {
            if (!alive || observer !== activeObserver || reduced?.matches) return;
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              entry.target.classList.add('is-visible');
              if (entry.target.matches('[data-count]')) count(entry.target);
              entry.target.querySelectorAll('[data-count]').forEach(count);
              activeObserver.unobserve(entry.target);
            }
          },
          { threshold: 0.12, rootMargin: '0px 0px -16px 0px' },
        );
        observer = activeObserver;
        const positions = new Map();
        for (const element of elements) {
          element.classList.add('reveal', 'motion-ready');
          if (element.matches(CARD_SELECTOR)) {
            const position = positions.get(element.parentElement) ?? 0;
            positions.set(element.parentElement, position + 1);
            element.style.setProperty('--reveal-delay', `${Math.min(position, 5) * 70}ms`);
          }
          activeObserver.observe(element);
        }
      } catch {
        // Browser privacy modes/polyfills must never leave content hidden.
        revealAll();
      }
    }

    function centerPointer() {
      hero?.style.setProperty('--pointer-x', '50%');
      hero?.style.setProperty('--pointer-y', '50%');
    }

    function stopPointer() {
      pointerScope?.dispose();
      pointerScope = null;
      cancel(pointerFrame);
      pointerFrame = null;
      centerPointer();
    }

    function setupPointer() {
      stopPointer();
      if (!hero || reduced?.matches || !desktop?.matches) return;
      pointerScope = eventScope(view);
      let bounds = null;
      let next = { x: 50, y: 50 };
      const measure = () => {
        const rect = hero.getBoundingClientRect();
        // Document coordinates remain valid while scrolling without reading layout on move.
        bounds = {
          left: rect.left + (view.scrollX || 0),
          top: rect.top + (view.scrollY || 0),
          width: rect.width,
          height: rect.height,
        };
      };
      const paint = () => {
        pointerFrame = null;
        hero.style.setProperty('--pointer-x', `${next.x.toFixed(2)}%`);
        hero.style.setProperty('--pointer-y', `${next.y.toFixed(2)}%`);
      };
      measure();
      pointerScope.listen(
        hero,
        'pointerenter',
        (event) => {
          if (event.pointerType === 'mouse') measure();
        },
        { passive: true },
      );
      pointerScope.listen(
        hero,
        'pointermove',
        (event) => {
          if (
            event.pointerType !== 'mouse' ||
            !bounds?.width ||
            !bounds?.height ||
            !Number.isFinite(event.clientX) ||
            !Number.isFinite(event.clientY)
          )
            return;
          next = {
            x: Math.max(
              0,
              Math.min(
                100,
                ((event.clientX + (view.scrollX || 0) - bounds.left) / bounds.width) * 100,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                100,
                ((event.clientY + (view.scrollY || 0) - bounds.top) / bounds.height) * 100,
              ),
            ),
          };
          if (pointerFrame === null) {
            pointerFrame = schedule(paint);
            if (pointerFrame === null) paint();
          }
        },
        { passive: true },
      );
      pointerScope.listen(
        hero,
        'pointerleave',
        () => {
          cancel(pointerFrame);
          pointerFrame = null;
          centerPointer();
        },
        { passive: true },
      );
      pointerScope.listen(view, 'resize', measure, { passive: true });
    }

    const updateHeader = () => {
      scrollFrame = null;
      header?.classList.toggle('is-scrolled', (view.scrollY || 0) > 16);
    };
    if (header) {
      updateHeader();
      scope.listen(
        view,
        'scroll',
        () => {
          if (scrollFrame !== null) return;
          scrollFrame = schedule(updateHeader);
          if (scrollFrame === null) updateHeader();
        },
        { passive: true },
      );
    }
    scope.listen(reduced, 'change', () => {
      if (reduced.matches) revealAll();
      setupPointer();
    });
    scope.listen(desktop, 'change', setupPointer);
    setupReveals();
    setupPointer();

    cleanup = () => {
      alive = false;
      observer?.disconnect();
      observer = null;
      scope.dispose();
      stopPointer();
      finishCounting();
      for (const frame of frames) view.cancelAnimationFrame?.(frame);
      frames.clear();
      header?.classList.toggle('is-scrolled', wasScrolled);
      for (const { element, reveal, ready, visible, delay, priority } of original) {
        element.classList.toggle('reveal', reveal);
        element.classList.toggle('motion-ready', ready);
        element.classList.toggle('is-visible', visible);
        if (delay) element.style.setProperty('--reveal-delay', delay, priority);
        else element.style.removeProperty('--reveal-delay');
      }
    };
  }

  return { init, dispose };
}

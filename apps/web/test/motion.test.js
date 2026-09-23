import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotion } from '../src/shared/motion.js';

class Events {
  listeners = new Map();
  registrations = [];
  rejectSignal = false;

  addEventListener(type, callback, options = {}) {
    if (this.rejectSignal && options.signal) throw new TypeError('Signal unsupported');
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
    this.registrations.push({ type, options });
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  emit(type, event = {}) {
    for (const callback of [...(this.listeners.get(type) ?? [])]) callback(event);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class Element extends Events {
  constructor(classes = '', children = []) {
    super();
    const names = new Set(classes.split(' ').filter(Boolean));
    this.classList = {
      add: (...values) => values.forEach((value) => names.add(value)),
      remove: (...values) => values.forEach((value) => names.delete(value)),
      contains: (value) => names.has(value),
      toggle(value, enabled = !names.has(value)) {
        if (enabled) names.add(value);
        else names.delete(value);
        return enabled;
      },
    };
    const styles = new Map();
    this.style = {
      setProperty: (key, value, priority = '') => styles.set(key, { value, priority }),
      getPropertyValue: (key) => styles.get(key)?.value ?? '',
      getPropertyPriority: (key) => styles.get(key)?.priority ?? '',
      removeProperty: (key) => styles.delete(key),
    };
    this.dataset = {};
    this.textContent = '';
    this.children = children;
    this.parentElement = null;
    this.rect = { left: 100, top: 100, width: 400, height: 200 };
    this.measurements = 0;
    for (const child of children) child.parentElement = this;
  }

  matches(selector) {
    return selector.split(',').some((part) => {
      const pieces = part.trim().split(/\s+/);
      const last = pieces.pop();
      const matches =
        last === '[data-count]'
          ? Object.hasOwn(this.dataset, 'count')
          : this.classList.contains(last.slice(1));
      if (!matches) return false;
      let ancestor = this.parentElement;
      for (const piece of pieces.reverse()) {
        while (ancestor && !ancestor.matches(piece)) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
  }

  querySelectorAll(selector) {
    const descendants = this.children.flatMap((child) => [child, ...child.descendants()]);
    return descendants.filter((child) => child.matches(selector));
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  getBoundingClientRect() {
    this.measurements += 1;
    return this.rect;
  }
}

function setup(
  t,
  {
    reduced = false,
    desktop = true,
    intersection = true,
    legacyMedia = false,
    abort = true,
    raf = true,
  } = {},
) {
  const previousWindow = globalThis.window;
  const view = new Events();
  const mediaQueries = new Map();
  function query(matches) {
    const result = new Events();
    result.matches = matches;
    result.set = (value) => {
      result.matches = value;
      result.emit('change', { matches: value });
    };
    if (legacyMedia) {
      result.addListener = (callback) =>
        Events.prototype.addEventListener.call(result, 'change', callback);
      result.removeListener = (callback) =>
        Events.prototype.removeEventListener.call(result, 'change', callback);
      result.addEventListener = undefined;
      result.removeEventListener = undefined;
    }
    return result;
  }
  const reducedQuery = query(reduced);
  const desktopQuery = query(desktop);
  view.matchMedia = (value) => {
    mediaQueries.set(value, true);
    return value.includes('reduced-motion') ? reducedQuery : desktopQuery;
  };
  view.AbortController = abort ? globalThis.AbortController : undefined;
  const frames = new Map();
  let id = 0;
  let now = 0;
  view.performance = { now: () => now };
  if (raf)
    view.requestAnimationFrame = (callback) => {
      frames.set(++id, callback);
      return id;
    };
  view.cancelAnimationFrame = (frame) => frames.delete(frame);
  const flush = (time = now + 16) => {
    now = time;
    const ready = [...frames.values()];
    frames.clear();
    ready.forEach((callback) => callback(now));
  };
  const observers = [];
  if (intersection)
    view.IntersectionObserver = class {
      targets = new Set();
      disconnected = false;
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        observers.push(this);
      }
      observe(target) {
        this.targets.add(target);
      }
      unobserve(target) {
        this.targets.delete(target);
      }
      disconnect() {
        this.disconnected = true;
        this.targets.clear();
      }
      enter(...targets) {
        this.callback(targets.map((target) => ({ target, isIntersecting: true })));
      }
    };
  view.scrollY = 0;
  view.scrollX = 0;
  globalThis.window = view;
  const count = new Element();
  count.dataset.count = '91';
  count.textContent = '91';
  const reveal = new Element('reveal', [count]);
  const cards = Array.from({ length: 7 }, () => new Element('flow-card'));
  const catalog = new Element('catalog-card');
  const task = new Element('task-row');
  const proposal = new Element('proposal-card');
  const hero = new Element('hero-v2');
  const header = new Element('topbar');
  const landing = new Element('landing-v2', [
    header,
    hero,
    reveal,
    new Element('flow-cards', cards),
  ]);
  const root = new Element('', [landing, new Element('workspace', [catalog, task, proposal])]);
  const motion = createMotion();
  t.after(() => {
    motion.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  return {
    motion,
    root,
    view,
    reducedQuery,
    desktopQuery,
    mediaQueries,
    frames,
    flush,
    observers,
    count,
    reveal,
    cards,
    catalog,
    task,
    proposal,
    hero,
    header,
  };
}

test('reveal observes existing sections and staggered card groups without changing their content', (t) => {
  const env = setup(t);
  env.motion.init(env.root);
  const observer = env.observers[0];
  assert.equal(observer.targets.size, 11);
  assert.equal(env.reveal.classList.contains('motion-ready'), true);
  assert.equal(env.reveal.classList.contains('is-visible'), false);
  assert.deepEqual(
    env.cards.map((card) => card.style.getPropertyValue('--reveal-delay')),
    ['0ms', '70ms', '140ms', '210ms', '280ms', '350ms', '350ms'],
  );
  assert.equal(env.catalog.style.getPropertyValue('--reveal-delay'), '0ms');
  assert.equal(env.task.style.getPropertyValue('--reveal-delay'), '70ms');
  assert.equal(env.proposal.style.getPropertyValue('--reveal-delay'), '140ms');
  observer.callback([{ target: env.reveal, isIntersecting: false }]);
  assert.equal(env.reveal.classList.contains('is-visible'), false);
  observer.enter(env.reveal, env.catalog);
  assert.equal(env.reveal.classList.contains('is-visible'), true);
  assert.equal(env.catalog.classList.contains('is-visible'), true);
  assert.equal(observer.targets.has(env.reveal), false);
  assert.equal(env.frames.size, 1);
  env.flush(550);
  assert.equal(env.count.textContent, '80');
  env.flush(1100);
  assert.equal(env.count.textContent, '91');
  assert.equal(env.frames.size, 0);
  observer.enter(env.reveal);
  assert.equal(env.frames.size, 0);
});

test('unsupported intersection API leaves all content visible and counters at their final value', (t) => {
  const env = setup(t, { intersection: false, desktop: false });
  env.count.textContent = '0';
  env.motion.init(env.root);
  assert.equal(env.observers.length, 0);
  assert.equal(env.reveal.classList.contains('motion-ready'), false);
  assert.equal(env.reveal.classList.contains('is-visible'), true);
  assert.equal(env.cards[0].classList.contains('motion-ready'), false);
  assert.equal(env.count.textContent, '91');
  assert.equal(env.frames.size, 0);
});

test('reduced motion disables animated reveals and pointer effects while keeping sticky header functional', (t) => {
  const env = setup(t, { reduced: true });
  env.motion.init(env.root);
  assert.equal(env.observers.length, 0);
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '50%');
  assert.equal(env.reveal.classList.contains('motion-ready'), false);
  assert.equal(env.count.textContent, '91');
  env.view.scrollY = 17;
  env.view.emit('scroll');
  env.flush();
  assert.equal(env.header.classList.contains('is-scrolled'), true);
});

test('coarse, touch and pen interaction never activate mouse hero effects', (t) => {
  const env = setup(t, { desktop: false });
  env.motion.init(env.root);
  assert.ok(env.mediaQueries.has('(hover: hover) and (pointer: fine) and (min-width: 1024px)'));
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.hero.measurements, 0);
  env.desktopQuery.set(true);
  for (const pointerType of ['touch', 'pen', undefined]) {
    env.hero.emit('pointerenter', { pointerType });
    env.hero.emit('pointermove', { pointerType, clientX: 500, clientY: 100 });
  }
  assert.equal(env.frames.size, 0);
  assert.equal(env.hero.measurements, 1);
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '50%');
});

test('desktop mouse hero updates are frame-throttled and reuse bounds until resize or entry', (t) => {
  const env = setup(t);
  env.motion.init(env.root);
  assert.equal(env.hero.measurements, 1);
  const move = (clientX, clientY) =>
    env.hero.emit('pointermove', { pointerType: 'mouse', clientX, clientY });
  move(200, 150);
  move(400, 250);
  assert.equal(env.frames.size, 1);
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '50%');
  env.flush();
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '75.00%');
  assert.equal(env.hero.style.getPropertyValue('--pointer-y'), '75.00%');
  assert.equal(env.hero.measurements, 1);
  assert.equal(env.frames.size, 0);
  env.view.scrollY = 50;
  move(400, 200);
  env.flush();
  assert.equal(env.hero.style.getPropertyValue('--pointer-y'), '75.00%');
  assert.equal(env.hero.measurements, 1);
  env.view.emit('resize');
  env.hero.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(env.hero.measurements, 3);
  move(-1000, 5000);
  env.flush();
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '0.00%');
  assert.equal(env.hero.style.getPropertyValue('--pointer-y'), '100.00%');
  move(300, 200);
  env.hero.emit('pointerleave');
  assert.equal(env.frames.size, 0);
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '50%');
  assert.equal(env.hero.style.getPropertyValue('--pointer-y'), '50%');
});

test('sticky header uses passive scroll listener and one frame per scroll burst', (t) => {
  const env = setup(t);
  env.view.scrollY = 120;
  env.motion.init(env.root);
  assert.equal(env.header.classList.contains('is-scrolled'), true);
  assert.equal(env.view.registrations.find(({ type }) => type === 'scroll').options.passive, true);
  env.view.scrollY = 16;
  env.view.emit('scroll');
  env.view.emit('scroll');
  assert.equal(env.frames.size, 1);
  env.flush();
  assert.equal(env.header.classList.contains('is-scrolled'), false);
  assert.equal(env.frames.size, 0);
});

test('changing reduced motion cancels active effects and settles counts; re-enabling never re-hides content', (t) => {
  const env = setup(t);
  env.motion.init(env.root);
  env.observers[0].enter(env.reveal);
  env.flush(200);
  assert.notEqual(env.count.textContent, '91');
  env.hero.emit('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 });
  assert.equal(env.frames.size, 2);
  env.reducedQuery.set(true);
  assert.equal(env.observers[0].disconnected, true);
  assert.equal(env.frames.size, 0);
  assert.equal(env.count.textContent, '91');
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.reveal.classList.contains('motion-ready'), false);
  env.reducedQuery.set(false);
  assert.equal(env.hero.listenerCount('pointermove'), 1);
  assert.equal(env.observers.length, 1);
  assert.equal(env.reveal.classList.contains('is-visible'), true);
  env.desktopQuery.set(false);
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.view.listenerCount('resize'), 0);
});

test('dispose and route reinitialization remove every old listener/frame and settle counters', (t) => {
  const env = setup(t);
  env.cards[0].style.setProperty('--reveal-delay', '12ms', 'important');
  env.motion.init(env.root);
  const observer = env.observers[0];
  observer.enter(env.reveal);
  env.flush(150);
  env.view.emit('scroll');
  env.hero.emit('pointermove', { pointerType: 'mouse', clientX: 500, clientY: 100 });
  assert.equal(env.frames.size, 3);
  const pending = [...env.frames.values()];
  env.motion.dispose();
  env.motion.dispose();
  assert.equal(env.frames.size, 0);
  assert.equal(env.count.textContent, '91');
  assert.equal(observer.disconnected, true);
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.view.listenerCount('scroll'), 0);
  assert.equal(env.view.listenerCount('resize'), 0);
  assert.equal(env.reducedQuery.listenerCount('change'), 0);
  assert.equal(env.desktopQuery.listenerCount('change'), 0);
  assert.equal(env.reveal.classList.contains('reveal'), true);
  assert.equal(env.reveal.classList.contains('motion-ready'), false);
  assert.equal(env.cards[0].classList.contains('reveal'), false);
  assert.equal(env.cards[0].style.getPropertyValue('--reveal-delay'), '12ms');
  assert.equal(env.cards[0].style.getPropertyPriority('--reveal-delay'), 'important');
  pending.forEach((callback) => callback(500));
  observer.enter(env.reveal);
  assert.equal(env.frames.size, 0);
  assert.equal(env.count.textContent, '91');
  env.motion.init(env.root);
  assert.equal(env.view.listenerCount('scroll'), 1);
  assert.equal(env.hero.listenerCount('pointermove'), 1);
  env.motion.init(new Element('', [new Element('catalog-card')]));
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.view.listenerCount('scroll'), 0);
  assert.equal(env.observers[1].disconnected, true);
  assert.equal(env.reducedQuery.listenerCount('change'), 1);
});

test('legacy media listeners, unsupported event signals and missing animation frames have safe fallbacks', (t) => {
  const env = setup(t, { legacyMedia: true, raf: false });
  env.view.rejectSignal = true;
  env.hero.rejectSignal = true;
  env.motion.init(env.root);
  env.observers[0].enter(env.reveal);
  assert.equal(env.count.textContent, '91');
  env.hero.emit('pointermove', { pointerType: 'mouse', clientX: 500, clientY: 100 });
  assert.equal(env.hero.style.getPropertyValue('--pointer-x'), '100.00%');
  env.view.scrollY = 100;
  env.view.emit('scroll');
  assert.equal(env.header.classList.contains('is-scrolled'), true);
  env.reducedQuery.set(true);
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  env.motion.dispose();
  assert.equal(env.view.listenerCount('scroll'), 0);
  assert.equal(env.reducedQuery.listenerCount('change'), 0);
});

test('missing AbortController and failing intersection observers cannot hide content or leak handlers', (t) => {
  const env = setup(t, { abort: false });
  env.view.IntersectionObserver = class {
    constructor() {
      throw new Error('Unavailable');
    }
  };
  env.motion.init(env.root);
  assert.equal(env.reveal.classList.contains('motion-ready'), false);
  assert.equal(env.count.textContent, '91');
  env.motion.dispose();
  assert.equal(env.hero.listenerCount('pointermove'), 0);
  assert.equal(env.view.listenerCount('scroll'), 0);
});

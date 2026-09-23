import './styles/main.css';
import { readConfig } from './app/config.js';
import { createInitialState } from './app/initial-state.js';
import { createStore } from './app/store.js';
import { createRouter } from './app/router.js';
import { bindEvents } from './app/events.js';
import { createFeedback } from './shared/feedback.js';
import { createMotion } from './shared/motion.js';
import { createTasksRepository } from './features/tasks/repository.js';
import { createCatalogController } from './features/tasks/catalog-controller.js';

const root = document.querySelector('#app');
const store = createStore(createInitialState());
const feedback = createFeedback({
  overlay: document.querySelector('#overlay'),
  toastElement: document.querySelector('#toast'),
});
const motion = createMotion();
const router = createRouter({ root, store, feedback, motion });
const catalog = createCatalogController({
  store,
  repository: createTasksRepository(readConfig()),
  render: () => {
    if (['#/catalog', '#/detail'].some((route) => window.location.hash.startsWith(route)))
      router.render();
  },
});
const unbind = bindEvents({ store, router, feedback, catalog });

router.start();
void catalog.load();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    catalog.dispose();
    unbind();
    router.dispose();
    motion.dispose();
    feedback.dispose();
  });
}

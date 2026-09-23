import { createAnalysisController } from '../features/tasks/analysis-controller.js';
import { createScoringController } from '../features/tasks/scoring-controller.js';
import { createVoiceController } from '../features/tasks/voice-controller.js';
import { missingFeedback } from '../pages/task-editor.js';
import { createTaskActions } from '../features/tasks/actions.js';
import { createProposalActions } from '../features/proposals/actions.js';
import { createAuthActions } from '../features/auth/actions.js';
import { createTranscriptionClient } from '../services/ai/transcription.js';

/** One delegated event layer; feature modules own business actions. */
export function bindEvents(context) {
  const { store, router, feedback, attachments, workspace, publication } = context;
  const scoring = createScoringController(context);
  const tasks = createTaskActions({ ...context, scoring });
  const analysis = createAnalysisController({ ...context, scoring });
  const voice = createVoiceController({
    ...context,
    service: createTranscriptionClient({ getAccessToken: context.getAccessToken }),
    appendText(target, text) {
      const state = store.getState();
      const questionId = target.startsWith('answer:') ? target.slice(7) : null;
      if (questionId && !state.taskAnalysis?.questions.some((q) => q.id === questionId)) return;
      const existing = questionId
        ? state.taskAnalysis.answers[questionId] || ''
        : state.description;
      const combined = [existing.trimEnd(), text].filter(Boolean).join('\n');
      if (combined.length > 10000)
        throw new Error(
          'В поле получится больше 10 000 символов. Сократите текст и повторите распознавание.',
        );
      if (questionId) analysis.setAnswer(questionId, combined);
      else store.update((state) => ({ ...state, description: combined }));
    },
  });
  const auth = createAuthActions(context);
  const actions = {
    ...context.profiles?.actions,
    ...tasks.actions,
    ...analysis.actions,
    'score-task': () => scoring.score(),
    'voice-start': (element) => voice.start(element.dataset.voiceTarget),
    'voice-stop': () => voice.stop(),
    'voice-cancel': () => voice.cancel(),
    'voice-retry': () => voice.retry(),
    'attachments-reload': () => attachments.load(true),
    'attachment-retry': (element) => attachments.retry(element.dataset.id),
    'attachment-remove': (element) => attachments.remove(element.dataset.id),
    'attachment-download': async (element) => {
      const data = await attachments.download(element.dataset.id);
      if (data) {
        const link = document.createElement('a');
        link.href = data.url;
        link.download = data.name;
        link.rel = 'noopener';
        link.target = '_blank';
        document.body.append(link);
        link.click();
        link.remove();
      }
    },
    ...createProposalActions(context),
    forgot: auth.forgot,
    logout: auth.logout,
    'force-logout': auth.forceLogout,
    'retry-auth': auth.retry,
    close: feedback.closeModal,
  };
  const controller = new AbortController();
  const listen = (type, handler) =>
    document.addEventListener(type, handler, { signal: controller.signal });
  window.addEventListener(
    'beforeunload',
    (event) => {
      if (!workspace.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { signal: controller.signal },
  );
  listen('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void workspace.flush();
  });

  function dispatch(name, element, values) {
    const publicActions = [
      'forgot',
      'close',
      'logout',
      'force-logout',
      'retry-auth',
      'retry-catalog',
    ];
    if (
      (Object.hasOwn(actions, name) || name === 'edit-task') &&
      !publicActions.includes(name) &&
      store.getState().auth.status !== 'authenticated'
    ) {
      router.navigate('login');
      return;
    }
    if (name === 'edit-task') return publication.edit(element.dataset.taskId);
    if (['accept-proposal', 'reject-proposal'].includes(name))
      return actions[name](element.dataset.proposalId);
    if (name === 'offer-success') return actions[name](values);
    if (Object.hasOwn(actions, name)) actions[name](element);
    else router.navigate(name);
  }

  listen('click', (event) => {
    const element = event.target.closest(
      '[data-action],[data-route],[data-role],[data-edit],[data-close],[data-scroll]',
    );
    if (!element) return;
    if (element.disabled || element.getAttribute?.('aria-disabled') === 'true') return;
    const { action, route, role, edit, close, scroll } = element.dataset;
    if ((action && !action.startsWith('voice-')) || route || edit) voice.cancel(false);
    if (close && event.target === element) return feedback.closeModal();
    if (scroll) {
      document.getElementById(scroll)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      return;
    }
    if (edit) return tasks.editField(edit);
    if (role && ['business', 'student'].includes(role)) {
      store.update((state) => ({ ...state, role }));
      document.querySelectorAll('.role').forEach((item) => {
        const selected = item.dataset.role === role;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      return;
    }
    if ((route || action) === 'create' && store.getState().taskSave.task) {
      if (!workspace.newDraft()) return;
    }
    if (route) return router.navigate(route);
    if (action) dispatch(action, element);
  });

  listen('submit', (event) => {
    if (event.target.id === 'profile-form' || event.target.id === 'members-search') {
      event.preventDefault();
      if (event.target.id === 'profile-form') void context.profiles.save(event.target);
      else void context.profiles.search(event.target);
      return;
    }
    if (['login-form', 'register-form'].includes(event.target.id)) {
      event.preventDefault();
      void auth.submit(event.target);
    } else if (event.target.id === 'offer-form') {
      event.preventDefault();
      dispatch('offer-success', undefined, Object.fromEntries(new FormData(event.target)));
    }
  });

  listen('input', (event) => {
    if (event.target.closest('#profile-form'))
      context.profiles.capture(event.target.closest('form'));
    const input = event.target;
    const meta = input.dataset.taskMeta;
    if (['industry', 'direction', 'tags'].includes(meta)) {
      store.update((state) => ({
        ...state,
        taskMetadata: {
          ...state.taskMetadata,
          [meta]:
            meta === 'tags'
              ? [
                  ...new Set(
                    input.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  ),
                ]
              : input.value,
        },
      }));
    }
    if (input.dataset.analysisAnswer !== undefined)
      analysis.setAnswer(input.dataset.analysisAnswer, input.value);
    if (input.dataset.analysisField !== undefined) {
      analysis.setResultField(input.dataset.analysisField, input.value);
      const feedback = document.querySelector('#analysis-missing');
      if (feedback)
        feedback.innerHTML = missingFeedback(store.getState().taskAnalysis.analysisResult);
    }
    if (input.dataset.answer !== undefined) {
      store.update((state) => ({
        ...state,
        answers: { ...state.answers, [input.dataset.answer]: input.value },
      }));
    }
    if (input.id === 'description')
      store.update((state) => ({ ...state, description: input.value }));
    if (input.id === 'search') {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      store.update((state) => ({ ...state, filters: { ...state.filters, search: input.value } }));
      router.render();
      const next = document.querySelector('#search');
      next?.focus();
      next?.setSelectionRange(start, end);
    }
  });

  listen('change', (event) => {
    if (event.target.id === 'profile-avatar') {
      void context.profiles.upload(event.target.files[0]);
      return;
    }
    if (event.target.id === 'task-attachments') {
      void attachments.add(event.target.files);
      return;
    }
    if (event.target.dataset.attachmentSelect) {
      attachments.toggle(event.target.dataset.attachmentSelect, event.target.checked);
      return;
    }
    const filter = event.target.dataset.filter;
    if (!['industry', 'direction', 'level', 'sort'].includes(filter)) return;
    store.update((state) => ({
      ...state,
      filters: { ...state.filters, [filter]: event.target.value },
    }));
    router.render();
  });
  listen('keydown', (event) => {
    if (event.key === 'Escape') feedback.closeModal();
  });
  listen('dragover', (event) => {
    const zone = event.target.closest('[data-attachment-drop]');
    if (zone) {
      event.preventDefault();
      zone.classList.add('dragging');
    }
  });
  listen('dragleave', (event) =>
    event.target.closest('[data-attachment-drop]')?.classList.remove('dragging'),
  );
  listen('drop', (event) => {
    const zone = event.target.closest('[data-attachment-drop]');
    if (zone) {
      event.preventDefault();
      zone.classList.remove('dragging');
      void attachments.add(event.dataTransfer.files);
    }
  });
  listen('paste', (event) => {
    if (!document.querySelector('#task-attachments')) return;
    const images = Array.from(event.clipboardData?.files || []).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length) {
      event.preventDefault();
      void attachments.add(
        images.map(
          (file) =>
            new File(
              [file],
              `screenshot-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'}`,
              { type: file.type },
            ),
        ),
      );
    }
  });

  window.addEventListener('hashchange', () => voice.cancel(false), { signal: controller.signal });
  window.addEventListener('pagehide', () => voice.cancel(false), { signal: controller.signal });
  return () => {
    voice.dispose();
    controller.abort();
  };
}

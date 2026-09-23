import assert from 'node:assert/strict';
import test from 'node:test';
import { landing } from '../src/pages/landing.js';

test('landing omits the hero tagline and placeholder statistics while preserving its main content', () => {
  const html = landing();

  assert.doesNotMatch(html, /Бизнес × студенты × AI|landing-stats/);
  assert.doesNotMatch(html, /Активных задач|Команды|Выбранных решений/);
  assert.doesNotMatch(html, /data-count="(?:48|24|17)"/);

  assert.match(html, /Реальные бизнес-задачи\./);
  assert.match(html, /Реальный опыт студентов\./);
  assert.match(html, /data-action="create"[^>]*>\s*Разместить задачу/);
  assert.match(html, /data-action="catalog"[^>]*>\s*Смотреть каталог/);
  assert.match(html, /id="product-preview"/);
  assert.match(html, /Анализ оттока клиентов/);
  assert.match(html, /data-count="91">91/);
});

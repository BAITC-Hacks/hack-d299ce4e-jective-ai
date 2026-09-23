import { FileText, ListChecks, Users } from 'lucide-react';

const steps = [
  { icon: FileText, title: 'Опишите задачу', text: 'Начните с проблемы бизнеса. AI поможет уточнить недостающую информацию.' },
  { icon: ListChecks, title: 'Подготовьте карточку', text: 'Проверьте факты и дополните задачу. Прозрачные правила определят её готовность.' },
  { icon: Users, title: 'Выберите команду', text: 'Опубликуйте задачу и рассмотрите предложения. Решение остаётся за вами.' },
];

export default function Dashboard() {
  return (
    <>
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-700">От бизнес-проблемы к готовой задаче</p>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Ясная задача.<br />Уверенный старт команды.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">Рабочее пространство для бизнеса и студенческих команд: уточняйте ожидания, оценивайте готовность и договаривайтесь о результате.</p>
      <div className="my-12 grid gap-5 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-7">
            <div className="mb-7 flex items-center justify-between"><Icon className="text-brand-700" size={26} aria-hidden="true" /><span className="text-sm text-slate-400">0{index + 1}</span></div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
          </article>
        ))}
      </div>
      <aside className="mb-12 rounded-2xl border border-brand-100 bg-brand-50 p-6">
        <h2 className="font-semibold text-brand-700">Каркас приложения готов</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Это первая итерация. Создание задач, AI-анализ и каталог появятся в следующих шагах. Сейчас подключены интерфейс, маршрутизация, модели данных и локальное хранилище.</p>
      </aside>
    </>
  );
}

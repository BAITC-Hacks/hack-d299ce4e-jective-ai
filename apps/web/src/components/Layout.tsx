import { Layers3 } from 'lucide-react';
import { Link, Outlet } from 'react-router';

export default function Layout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link to="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="rounded-xl bg-brand-700 p-2 text-white"><Layers3 size={22} aria-hidden="true" /></span>
            Task achievment AI SANA
          </Link>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">MVP · Итерация 1</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-14"><Outlet /></main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-sm text-slate-500">AI структурирует. Rating engine считает. Человек принимает решение.</footer>
    </div>
  );
}

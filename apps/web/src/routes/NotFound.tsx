import { Link } from 'react-router';

export default function NotFound() {
  return <div className="py-20"><p className="text-sm text-brand-700">404</p><h1 className="my-4 text-3xl font-semibold">Страница не найдена</h1><Link to="/" className="text-brand-700 underline">Вернуться на главную</Link></div>;
}

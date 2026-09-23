import { Route, Routes } from 'react-router';
import Layout from './components/Layout';
import Dashboard from './routes/Dashboard';
import NotFound from './routes/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

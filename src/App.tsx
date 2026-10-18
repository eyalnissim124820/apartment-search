import { Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './state';
import { BottomNav } from './components/BottomNav';
import { Toast } from './components/ui';
import Login from './pages/Login';
import Home from './pages/Home';
import Detail from './pages/Detail';
import ApartmentForm from './pages/ApartmentForm';
import Match from './pages/Match';
import Board from './pages/Board';
import Calendar from './pages/Calendar';

export default function App() {
  const { user } = useApp();
  const { pathname } = useLocation();
  if (!user) return <><Login /><Toast /></>;
  const hideNav = pathname.startsWith('/new') || pathname.includes('/edit');
  return (
    <div className="mx-auto max-w-2xl px-4 pb-32">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/match" element={<Match />} />
        <Route path="/board" element={<Board />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/new" element={<ApartmentForm />} />
        <Route path="/apt/:id" element={<Detail />} />
        <Route path="/apt/:id/edit" element={<ApartmentForm />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!hideNav && <BottomNav />}
      <Toast />
    </div>
  );
}

import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Search from './pages/Search.jsx';
import AuthForm from './pages/AuthForm.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DomainDetail from './pages/DomainDetail.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Search />} />
        <Route path="login" element={<AuthForm mode="login" />} />
        <Route path="register" element={<AuthForm mode="register" />} />
        <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="domains/:id" element={<ProtectedRoute><DomainDetail /></ProtectedRoute>} />
        <Route path="orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

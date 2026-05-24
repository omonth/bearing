import { Routes, Route, Navigate } from 'react-router-dom';
import AdminGuard from './shared/AdminGuard';
import Layout from './shared/Layout';
import Login from './modules/auth/Login';
import Dashboard from './modules/dashboard/Dashboard';
import ProductList from './modules/products/ProductList';
import OrderList from './modules/orders/OrderList';

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<Login />} />
      <Route
        element={
          <AdminGuard>
            <Layout />
          </AdminGuard>
        }
      >
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/products" element={<ProductList />} />
        <Route path="/admin/orders" element={<OrderList />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}

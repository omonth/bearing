import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminGuard from './shared/AdminGuard';
import Layout from './shared/Layout';

const Login = lazy(() => import('./modules/auth/Login'));
const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'));
const ProductList = lazy(() => import('./modules/products/ProductList'));
const OrderList = lazy(() => import('./modules/orders/OrderList'));

export default function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">加载中...</div>}>
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
    </Suspense>
  );
}

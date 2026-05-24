import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './lib/authStore';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const token = useAuthStore((s) => s.token);

  if (!token) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

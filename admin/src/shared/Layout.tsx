import { ProLayout } from '@ant-design/pro-layout';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const menuData = [
  { path: '/admin/dashboard', name: '数据看板' },
  { path: '/admin/products', name: '商品管理' },
  { path: '/admin/orders', name: '订单管理' },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <ProLayout
      title="轴承销售系统"
      logo={false}
      route={{ path: '/admin', children: menuData }}
      location={{ pathname: location.pathname }}
      menuItemRender={(item) => (
        <div onClick={() => item.path && navigate(item.path)} style={{ cursor: 'pointer' }}>
          {item.name}
        </div>
      )}
      onMenuHeaderClick={() => navigate('/admin/dashboard')}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Outlet />
      </div>
    </ProLayout>
  );
}

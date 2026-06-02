import { Layout as AntLayout, Menu, Typography } from 'antd';
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
    <AntLayout style={{ minHeight: '100vh' }}>
      <AntLayout.Sider width={220} breakpoint="lg" collapsedWidth="0">
        <div
          onClick={() => navigate('/admin/dashboard')}
          className="h-14 px-5 flex items-center cursor-pointer border-b border-neutral-800"
        >
          <Typography.Text className="text-neutral-100 font-semibold">轴承销售系统</Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuData.map(item => ({ key: item.path, label: item.name }))}
          onClick={({ key }) => navigate(key)}
        />
      </AntLayout.Sider>
      <AntLayout.Content className="min-w-0 bg-neutral-950 p-6">
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Outlet />
        </div>
      </AntLayout.Content>
    </AntLayout>
  );
}

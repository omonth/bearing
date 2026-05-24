import { useState, useEffect, useRef } from 'react';
import { Card, Statistic, Table, Tag, message, List } from 'antd';
import { DollarOutlined, ShoppingCartOutlined, UserOutlined, RiseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import adminApi from '@/shared/lib/adminApi';
import AdminChat from '@/shared/components/AdminChat';

interface SalesTrendItem { day: string; orders: number; revenue: number; }
interface DashboardData {
  totalSales: number; totalOrders: number; totalCustomers: number; monthlyRevenue: number;
  salesTrend: SalesTrendItem[];
  recentOrders: { id: number; customer_name: string; total_price: number; status: string; created_at: string }[];
}
interface AlertProduct { id: number; name: { zh?: string } | string; model: string; stock: number; }

const statusColors: Record<string, string> = { pending: 'default', paid: 'processing', shipped: 'blue', completed: 'green', cancelled: 'error' };
const statusLabels: Record<string, string> = { pending: '待处理', paid: '已支付', shipped: '已发货', completed: '已完成', cancelled: '已取消' };

function ln(v: { zh?: string } | string) { return typeof v === 'object' ? v?.zh || '' : v; }

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [lowStock, setLowStock] = useState<AlertProduct[]>([]);
  const [outOfStock, setOutOfStock] = useState<AlertProduct[]>([]);
  const [liveOrders, setLiveOrders] = useState<{ id: number; customer_name: string; created_at: string; status: string }[]>([]);
  const loading = !data;
  const wsRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes, lowRes, outRes] = await Promise.all([
          adminApi.get('/analytics/dashboard'),
          adminApi.get('/inventory/low-stock'),
          adminApi.get('/inventory/out-of-stock'),
        ]);
        setData(dashRes.data);
        setLowStock(Array.isArray(lowRes.data) ? lowRes.data : lowRes.data?.data || []);
        setOutOfStock(Array.isArray(outRes.data) ? outRes.data : outRes.data?.data || []);
      } catch { /* polling - silent fail */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let socket: ReturnType<typeof import('socket.io-client').io> | null = null;
    try {
      import('socket.io-client').then(m => {
        socket = m.io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
        socket.emit('join-admin');
        socket.on('new-order', (order: { id: number; customer_name: string; created_at: string; status: string }) => {
          setLiveOrders(prev => [order, ...prev].slice(0, 8));
        });
        socket.on('low-stock-alert', () => {
          message.warning('有产品库存不足');
        });
        wsRef.current = socket;
      });
    } catch { /* ws failed silently */ }
    return () => { socket?.disconnect(); };
  }, []);

  const alertColumns: ColumnsType<AlertProduct> = [
    { title: '名称', dataIndex: 'name', render: (_: unknown, r: AlertProduct) => ln(r.name) },
    { title: '型号', dataIndex: 'model', width: 90, render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: '库存', dataIndex: 'stock', width: 60, render: (v: number) => <Tag color={v === 0 ? 'red' : 'orange'}>{v}</Tag> },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-200 mb-4">数据看板</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card size="small"><Statistic title="总销售额" value={data?.totalSales || 0} prefix={<DollarOutlined />} suffix="元" precision={2} loading={loading} /></Card>
        <Card size="small"><Statistic title="总订单" value={data?.totalOrders || 0} prefix={<ShoppingCartOutlined />} loading={loading} /></Card>
        <Card size="small"><Statistic title="总客户" value={data?.totalCustomers || 0} prefix={<UserOutlined />} loading={loading} /></Card>
        <Card size="small"><Statistic title="本月收入" value={data?.monthlyRevenue || 0} prefix={<RiseOutlined />} suffix="元" precision={2} loading={loading} /></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card title="销售趋势 (近30天)" size="small">
          {data?.salesTrend && (
            <div className="flex items-end gap-0.5 h-32">
              {data.salesTrend.map((d, i) => {
                const max = Math.max(...data.salesTrend.map(s => s.revenue), 1);
                const h = (d.revenue / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ¥${d.revenue}`}>
                    <div className="w-full bg-amber-500/70 hover:bg-amber-400 rounded-t" style={{ height: `${Math.max(h, 1)}%` }} />
                    {data.salesTrend.length < 15 && (
                      <span className="text-[9px] text-neutral-500 -rotate-45 origin-top-left">{d.day.slice(5)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="实时订单" size="small">
          {liveOrders.length === 0 && <p className="text-neutral-500 text-sm">暂无新订单</p>}
          <List
            size="small"
            dataSource={liveOrders}
            renderItem={o => (
              <List.Item className="text-xs">
                <span className="font-mono text-neutral-400">#{o.id}</span>
                <span className="ml-2 text-neutral-300">{o.customer_name}</span>
                <Tag className="ml-auto" color={statusColors[o.status]}>{statusLabels[o.status]}</Tag>
              </List.Item>
            )}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card title="库存预警" size="small">
          <h5 className="text-xs font-medium text-orange-400 mb-2">低库存 ({lowStock.length})</h5>
          <Table columns={alertColumns} dataSource={lowStock} rowKey="id" size="small" pagination={false} className="mb-3" />
          <h5 className="text-xs font-medium text-red-400 mb-2">缺货 ({outOfStock.length})</h5>
          <Table columns={alertColumns} dataSource={outOfStock} rowKey="id" size="small" pagination={false} />
        </Card>

        <Card title="最近订单" size="small">
          <Table
            dataSource={data?.recentOrders || []}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: '订单', dataIndex: 'id', width: 60, render: (v: number) => <span className="font-mono text-xs">#{v}</span> },
              { title: '客户', dataIndex: 'customer_name', width: 90, ellipsis: true },
              { title: '金额', dataIndex: 'total_price', width: 80, render: (v: number) => <span className="font-mono text-xs">¥{v}</span> },
              { title: '状态', dataIndex: 'status', width: 70, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag> },
            ]}
          />
        </Card>
      </div>
      <AdminChat />
    </div>
  );
}

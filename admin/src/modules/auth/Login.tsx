import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import adminApi from '@/shared/lib/adminApi';
import { useAuthStore } from '@/shared/lib/authStore';
import type { AxiosError } from 'axios';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await adminApi.post('/auth/login', values);
      const { token, user } = res.data;
      login(token, user || { id: 0, username: values.username, role: 'admin' });
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string }>;
      message.error(axiosErr.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <Card className="w-[400px]" title="轴承销售系统 - 管理后台">
        <Form onFinish={onFinish} size="large" initialValues={{ username: 'admin' }}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

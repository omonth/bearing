import { useState, useRef, useEffect } from 'react';
import { Button, Input } from 'antd';
import { RobotOutlined, CloseOutlined } from '@ant-design/icons';
import adminApi from '@/shared/lib/adminApi';

interface Msg { role: 'user' | 'bot'; content: string; data?: Record<string, unknown>[]; }

export default function AdminChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'bot', content: '您好！我是AI助手，可以帮您查询数据。试试问"今天销售额"或"缺货的型号"。' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await adminApi.post('/ai/admin-chat', { message: msg });
      const d = res.data.data || res.data;
      const content = d.type === 'result' && d.data?.length
        ? `${d.message}\n${d.data.slice(0, 10).map((r: Record<string,unknown>) => JSON.stringify(r).slice(0, 120)).join('\n')}`
        : d.message;
      setMessages(prev => [...prev, { role: 'bot', content, data: d.data }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: '查询失败，请重试。' }]);
    } finally { setLoading(false); }
  };

  return (
    <>
      <Button
        type="primary"
        shape="circle"
        icon={<RobotOutlined />}
        size="large"
        className="fixed bottom-6 right-6 z-50 shadow-lg"
        onClick={() => setOpen(!open)}
      />

      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[480px] max-h-[60vh] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-200">AI 数据助手</span>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] px-3 py-2 rounded-lg text-xs ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-neutral-800 text-neutral-200 rounded-bl-sm'
                }`}>
                  <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                </div>
              </div>
            ))}
            {loading && <div className="text-neutral-500 text-xs px-3">查询中…</div>}
            <div ref={bottomRef} />
          </div>

          <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onPressEnter={() => send(input)}
              placeholder="问销售/库存数据…"
              size="small"
            />
            <Button type="primary" size="small" onClick={() => send(input)} loading={loading} disabled={!input.trim()}>
              查询
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

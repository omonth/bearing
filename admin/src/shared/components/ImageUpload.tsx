import { useState } from 'react';
import { Upload, Button, Image, message } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/shared/lib/authStore';

export default function ImageUpload({ value, onChange }: { value?: string; onChange?: (url: string) => void }) {
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((s) => s.token);

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        message.error(err.error || '上传失败');
        return;
      }
      const data = await res.json();
      onChange?.(data.url);
      message.success('上传成功');
    } catch {
      message.error('上传失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    onChange?.('');
  };

  return (
    <div>
      {value ? (
        <div className="flex items-start gap-3">
          <Image alt="产品图片" src={value} width={120} height={120} className="object-cover rounded-md" />
          <Button icon={<DeleteOutlined />} danger size="small" onClick={handleDelete} />
        </div>
      ) : (
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />} loading={loading}>
            上传图片
          </Button>
        </Upload>
      )}
    </div>
  );
}

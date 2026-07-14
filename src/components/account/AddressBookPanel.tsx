import { useCallback, useEffect, useState } from 'react';
import {
  createCustomerAddress,
  deleteCustomerAddress,
  getCustomerAddresses,
  updateCustomerAddress,
} from '@/lib/api';
import type { CustomerAddress, CustomerAddressInput } from '@/types';

type AddressForm = Required<Omit<CustomerAddressInput, 'isDefault'>> & { isDefault: boolean };

const emptyAddress: AddressForm = {
  recipientName: '',
  recipientPhone: '',
  province: '',
  city: '',
  district: '',
  addressDetail: '',
  postalCode: '',
  isDefault: false,
};

function toAddressForm(address: CustomerAddress): AddressForm {
  return {
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    province: address.province,
    city: address.city,
    district: address.district,
    addressDetail: address.addressDetail,
    postalCode: address.postalCode ?? '',
    isDefault: address.isDefault,
  };
}

export default function AddressBookPanel() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [form, setForm] = useState<AddressForm>(emptyAddress);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAddresses(await getCustomerAddresses());
    } catch {
      setError('地址加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateForm = <K extends keyof AddressForm>(field: K, value: AddressForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyAddress);
    setError(null);
  };

  const openCreate = () => {
    setForm({ ...emptyAddress, isDefault: addresses.length === 0 });
    setEditingId(null);
    setOpen(true);
    setError(null);
  };

  const openEdit = (address: CustomerAddress) => {
    setForm(toAddressForm(address));
    setEditingId(address.id);
    setOpen(true);
    setError(null);
  };

  const toPayload = (): CustomerAddressInput => ({
    ...form,
    postalCode: form.postalCode || undefined,
  });

  const saveAddress = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editingId === null) {
        await createCustomerAddress(toPayload());
      } else {
        await updateCustomerAddress(editingId, toPayload());
      }
      closeForm();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '地址保存失败，请检查后重试');
    } finally {
      setSaving(false);
    }
  };

  const removeAddress = async (addressId: number) => {
    setError(null);
    try {
      await deleteCustomerAddress(addressId);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '地址删除失败，请稍后重试');
    }
  };

  return (
    <section data-testid="address-book" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-white">收货地址</h2>
        <button
          type="button"
          data-testid="address-create"
          onClick={openCreate}
          className="px-3 py-2 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
        >
          新增地址
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">正在加载地址…</p>
      ) : addresses.length === 0 ? (
        <div className="py-10 text-center bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-500">
          暂无收货地址，请新增地址。
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <article
              key={address.id}
              data-testid={`address-card-${address.id}`}
              className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
            >
              <div className="flex items-center gap-2 text-sm text-white">
                <strong>{address.recipientName}</strong>
                <span className="text-neutral-400">{address.recipientPhone}</span>
                {address.isDefault && <span className="text-xs text-amber-400">默认地址</span>}
              </div>
              <p className="mt-2 text-sm text-neutral-400">
                {address.province} {address.city} {address.district} {address.addressDetail}
              </p>
              <div className="mt-3 flex gap-3 text-xs">
                <button
                  type="button"
                  data-testid={`address-edit-${address.id}`}
                  onClick={() => openEdit(address)}
                  className="text-amber-400 hover:text-amber-300"
                >
                  编辑
                </button>
                <button
                  type="button"
                  data-testid={`address-delete-${address.id}`}
                  onClick={() => void removeAddress(address.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 space-y-4">
          <h3 className="font-medium text-white">{editingId === null ? '新增地址' : '编辑地址'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input data-testid="address-recipient-name" value={form.recipientName} onChange={(event) => updateForm('recipientName', event.target.value)} placeholder="收货人姓名" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
            <input data-testid="address-recipient-phone" value={form.recipientPhone} onChange={(event) => updateForm('recipientPhone', event.target.value)} placeholder="收货人手机号" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
            <input data-testid="address-province" value={form.province} onChange={(event) => updateForm('province', event.target.value)} placeholder="省份" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
            <input data-testid="address-city" value={form.city} onChange={(event) => updateForm('city', event.target.value)} placeholder="城市" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
            <input data-testid="address-district" value={form.district} onChange={(event) => updateForm('district', event.target.value)} placeholder="区县" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
            <input data-testid="address-postal-code" value={form.postalCode} onChange={(event) => updateForm('postalCode', event.target.value)} placeholder="邮政编码（可选）" className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
          </div>
          <textarea data-testid="address-detail" value={form.addressDetail} onChange={(event) => updateForm('addressDetail', event.target.value)} placeholder="详细地址" rows={2} className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-white" />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input data-testid="address-default" type="checkbox" checked={form.isDefault} onChange={(event) => updateForm('isDefault', event.target.checked)} />
            设为默认地址
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeForm} className="px-3 py-2 text-sm text-neutral-300">取消</button>
            <button type="button" data-testid="address-save" disabled={saving} onClick={() => void saveAddress()} className="px-3 py-2 text-sm font-medium text-neutral-950 bg-amber-500 disabled:opacity-50 rounded-md">
              {saving ? '保存中…' : '保存地址'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

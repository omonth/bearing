import { inputClass, labelClass, primaryBtnClass, secondaryBtnClass } from "./shared";

export interface ShippingAddress {
  customerName: string;
  customerPhone: string;
  province: string;
  city: string;
  district: string;
  addressDetail: string;
  paymentMethod: string;
}

interface AddressFormStepProps {
  values: ShippingAddress;
  provinces: string[];
  cities: string[];
  finalPrice: number;
  discountAmount: number;
  submitting: boolean;
  formError: string | null;
  onChangeField: (field: keyof ShippingAddress, value: string) => void;
  onSelectProvince: (province: string) => void;
  onSelectPaymentMethod: (method: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function AddressFormStep({
  values,
  provinces,
  cities,
  finalPrice,
  discountAmount,
  submitting,
  formError,
  onChangeField,
  onSelectProvince,
  onSelectPaymentMethod,
  onSubmit,
  onBack,
}: AddressFormStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">收货信息</h2>

      {formError && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-sm text-red-400">
          {formError}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>收货人 *</label>
            <input
              type="text"
              value={values.customerName}
              onChange={(e) => onChangeField("customerName", e.target.value)}
              placeholder="请输入收货人姓名"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>手机号 *</label>
            <input
              type="tel"
              value={values.customerPhone}
              onChange={(e) => onChangeField("customerPhone", e.target.value)}
              placeholder="请输入手机号"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>省份 *</label>
            <select
              value={values.province}
              onChange={(e) => onSelectProvince(e.target.value)}
              className={inputClass}
            >
              <option value="">请选择省份</option>
              {provinces.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>城市 *</label>
            <select
              value={values.city}
              onChange={(e) => onChangeField("city", e.target.value)}
              disabled={!values.province}
              className={inputClass}
            >
              <option value="">请选择城市</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>区/县 *</label>
            <input
              type="text"
              value={values.district}
              onChange={(e) => onChangeField("district", e.target.value)}
              placeholder="请输入区/县"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>详细地址 *</label>
          <textarea
            value={values.addressDetail}
            onChange={(e) => onChangeField("addressDetail", e.target.value)}
            placeholder="街道、门牌号等详细信息"
            rows={2}
            className={inputClass}
          />
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-xs text-neutral-400 mb-2">支付方式</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { value: "alipay", label: "支付宝" },
              { value: "wechat", label: "微信" },
              { value: "unionpay", label: "银联" },
              { value: "cod", label: "货到付款" },
            ].map((m) => (
              <label
                key={m.value}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border cursor-pointer text-sm transition-colors ${
                  values.paymentMethod === m.value
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-neutral-700 text-neutral-400 hover:border-neutral-600"
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={m.value}
                  checked={values.paymentMethod === m.value}
                  onChange={() => onSelectPaymentMethod(m.value)}
                  className="accent-amber-500"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex gap-3 justify-between">
        <button onClick={onBack} className={secondaryBtnClass}>
          ← 返回
        </button>
        <div className="text-right">
          {discountAmount > 0 && (
            <p className="text-xs text-emerald-400 mb-0.5">
              已优惠 ¥{discountAmount.toFixed(2)}
            </p>
          )}
          <p className="text-xs text-neutral-500 mb-1" suppressHydrationWarning>
            合计 ¥{finalPrice.toFixed(2)}
          </p>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className={primaryBtnClass}
          >
            {submitting ? "提交中..." : "确认下单"}
          </button>
        </div>
      </div>
    </div>
  );
}

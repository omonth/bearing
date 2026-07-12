import { primaryBtnClass } from "./shared";

interface PaymentInfo {
  orderNo: string;
  amount: number;
  qrUrl?: string;
  sandbox?: boolean;
  message?: string;
  paymentMethod?: string;
  payUrl?: string;
  formParams?: Record<string, unknown>;
}

interface PaymentStepProps {
  paymentStatus: string;
  paymentInfo: PaymentInfo | null;
  paymentMethod: string;
  onComplete: () => void;
}

export default function PaymentStep({
  paymentStatus,
  paymentInfo,
  paymentMethod,
  onComplete,
}: PaymentStepProps) {
  if (!paymentInfo) return null;

  const isPaid = paymentStatus === "paid";
  const isCashOnDelivery = paymentInfo.paymentMethod === "cod" || paymentMethod === "cod";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">支付</h2>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center space-y-4">
        {isCashOnDelivery ? (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 text-2xl flex items-center justify-center mx-auto">
              ¥
            </div>
            <h3 className="text-lg font-bold text-white">货到付款</h3>
            <p className="text-sm text-neutral-400">订单已提交，配送时支付即可。</p>
            <p className="text-sm text-neutral-400">订单号: {paymentInfo.orderNo}</p>
            <p className="text-sm text-neutral-400">
              应付金额: ¥{paymentInfo.amount.toFixed(2)}
            </p>
          </>
        ) : isPaid ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
              ✓
            </div>
            <h3 className="text-lg font-bold text-white">支付成功</h3>
            <p className="text-sm text-neutral-400">订单号: {paymentInfo.orderNo}</p>
            <p className="text-sm text-neutral-400">
              支付金额: ¥{paymentInfo.amount.toFixed(2)}
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white">等待支付</h3>
            <p className="text-sm text-neutral-400">订单号: {paymentInfo.orderNo}</p>
            {paymentInfo.qrUrl && (
              <div>
                <p className="text-sm text-neutral-400 mb-3">
                  请使用{paymentMethod === "alipay" ? "支付宝" : "微信"}扫码支付:
                </p>
                <img
                  src={paymentInfo.qrUrl}
                  alt="支付二维码"
                  className="w-[200px] h-[200px] border border-neutral-800 rounded-lg mx-auto"
                />
              </div>
            )}
            {paymentInfo.paymentMethod === "unionpay" && paymentInfo.formParams && (
              <div>
                <p className="text-sm text-neutral-400 mb-3">
                  点击下方按钮跳转到银联支付页面:
                </p>
                <form method="POST" action={paymentInfo.payUrl}>
                  {Object.entries(paymentInfo.formParams).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value as string} />
                  ))}
                  <button
                    type="submit"
                    className="w-full py-3 text-sm font-medium text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors"
                  >
                    前往银联支付
                  </button>
                </form>
              </div>
            )}
            {paymentInfo.sandbox && (
              <p className="text-xs text-amber-400">沙箱模式 - {paymentInfo.message}</p>
            )}
            <p className="text-xs text-neutral-600">支付完成后页面将自动更新...</p>
          </>
        )}
        <button onClick={onComplete} className={`w-full py-3 text-sm font-medium ${primaryBtnClass}`}>
          {isPaid || isCashOnDelivery ? "完成订单" : "查看订单"}
        </button>
      </div>
    </div>
  );
}

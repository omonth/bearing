import Link from 'next/link';
import InformationPage from '@/components/InformationPage';

const sections = [
  {
    title: '异常订单人工处理',
    paragraphs: [
      '登录顾客中心后，可从订单详情提交售后或异常订单申请。请提供订单号、问题类型、期望处理方式和必要凭证；请勿在描述中填写密码、验证码、银行卡完整号码或支付密钥。',
      '付款已扣款但订单仍待支付、退款到账异常、重复订单、物流停滞或商品问题会进入人工队列。客服会在工单中更新进度，避免通过多个渠道重复提交。',
    ],
  },
  {
    title: '安全提醒',
    paragraphs: [
      '客服不会索要登录密码、短信验证码或支付密钥，也不会要求通过非官方链接远程控制设备。涉及退款时以顾客中心显示的订单和退款状态为准。',
      '如当前尚未登录，请先登录或注册；无法登录时使用找回密码流程。生产联系方式由运营方在上线配置中提供并经过人工值守验证。',
    ],
  },
];

export default function SupportPage() {
  return (
    <>
      <InformationPage title="联系客服与异常订单" description="通过可追踪的顾客中心工单处理支付、退款、物流和商品异常。" sections={sections} />
      <div className="fixed bottom-5 right-5">
        <Link href="/account" className="rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-neutral-950 shadow-xl hover:bg-amber-300">
          进入顾客中心
        </Link>
      </div>
    </>
  );
}

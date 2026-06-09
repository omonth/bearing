import { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "@/components/AdminLayout";

interface ForecastDay {
  date: string;
  predictedRevenue: number;
  predictedOrders: number;
}

interface Prediction {
  productId: number;
  productName: string;
  model: string;
  currentStock: number;
  avgDailySales: number;
  predictedDemand: number;
  trend: string;
  daysUntilEmpty: number;
  needsRestock: boolean;
  recommendedRestock: number;
}

export default function AdminDashboard() {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ai_token");
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch("/api/ai/forecast?days=14", { headers }).then((r) => r.json()),
      fetch("/api/ai/predict-demand", { headers }).then((r) => r.json()),
    ])
      .then(([f, p]) => {
        setForecast(f.forecast || []);
        setPredictions(Array.isArray(p) ? p : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const restockItems = predictions.filter((p) => p.needsRestock).sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);

  return (
    <>
      <Head>
        <title>数据看板 - AI 管理后台</title>
      </Head>
      <AdminLayout title="数据看板">
        {loading ? (
          <div className="text-neutral-500 text-sm">加载中…</div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <p className="text-xs text-neutral-500">产品总数</p>
                <p className="text-2xl font-semibold text-neutral-200 mt-1">{predictions.length}</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <p className="text-xs text-neutral-500">需补货产品</p>
                <p className="text-2xl font-semibold text-red-400 mt-1">{restockItems.length}</p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <p className="text-xs text-neutral-500">14 天预测订单数</p>
                <p className="text-2xl font-semibold text-amber-400 mt-1">
                  {forecast.reduce((s, f) => s + f.predictedOrders, 0)}
                </p>
              </div>
            </div>

            {/* Restock alerts */}
            {restockItems.length > 0 && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg">
                <div className="px-4 py-3 border-b border-neutral-800">
                  <h2 className="text-sm font-medium text-neutral-200">补货预警</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                        <th className="text-left px-4 py-2">产品</th>
                        <th className="text-left px-4 py-2">型号</th>
                        <th className="text-right px-4 py-2">当前库存</th>
                        <th className="text-right px-4 py-2">日均销量</th>
                        <th className="text-right px-4 py-2">预计耗尽</th>
                        <th className="text-right px-4 py-2">建议补货</th>
                      </tr>
                    </thead>
                    <tbody>
                      {restockItems.map((p) => (
                        <tr key={p.productId} className="border-b border-neutral-800/50 hover:bg-neutral-800/30">
                          <td className="px-4 py-2 text-neutral-300">{p.productName}</td>
                          <td className="px-4 py-2 text-neutral-400">{p.model}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={p.currentStock <= 3 ? "text-red-400" : "text-neutral-300"}>
                              {p.currentStock}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-neutral-400">{p.avgDailySales}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={p.daysUntilEmpty <= 7 ? "text-red-400" : "text-amber-400"}>
                              {p.daysUntilEmpty}天
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-green-400">{p.recommendedRestock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Forecast chart placeholder */}
            {forecast.length > 0 && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
                <h2 className="text-sm font-medium text-neutral-200 mb-3">14 天销售预测</h2>
                <div className="grid grid-cols-7 gap-2">
                  {forecast.map((f) => {
                    const maxRev = Math.max(...forecast.map((x) => x.predictedRevenue));
                    const height = maxRev > 0 ? (f.predictedRevenue / maxRev) * 100 : 0;
                    return (
                      <div key={f.date} className="flex flex-col items-center gap-1">
                        <div className="w-full h-24 flex items-end justify-center">
                          <div
                            className="w-full bg-amber-500/60 rounded-t"
                            style={{ height: `${height}%` }}
                            title={`¥${f.predictedRevenue}`}
                          />
                        </div>
                        <span className="text-[10px] text-neutral-600">
                          {f.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </AdminLayout>
    </>
  );
}

import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface PriceData {
  date: string;
  panda: number;
  othaim: number;
  danube: number;
  carrefour: number;
  amazon: number;
  promo: string;
}

const data: PriceData[] = [
  { date: '1 سبتمبر', panda: 13.77, othaim: 10.45, danube: 13.26, carrefour: 11.50, amazon: 13.77, promo: 'عروض الخميس الأسبوعية' },
  { date: '3 سبتمبر', panda: 12.60, othaim: 10.45, danube: 13.26, carrefour: 11.50, amazon: 13.77, promo: 'عروض الخميس الأسبوعية' },
  { date: '5 سبتمبر', panda: 11.28, othaim: 10.56, danube: 13.13, carrefour: 10.92, amazon: 13.09, promo: 'مهرجان التوفير - بنده كليك' },
  { date: '7 سبتمبر', panda: 11.40, othaim: 10.23, danube: 12.61, carrefour: 10.92, amazon: 12.42, promo: 'خصومات برايم أمازون للأغذية' },
  { date: '9 سبتمبر', panda: 13.50, othaim: 12.13, danube: 14.30, carrefour: 11.00, amazon: 13.50, promo: 'السعر المرصد حالياً' },
  { date: '12 سبتمبر (اليوم)', panda: 11.40, othaim: 10.23, danube: 12.61, carrefour: 10.92, amazon: 12.42, promo: 'التحديث التلقائي اليومي' },
];

export default function PriceHistoryHubView() {
  return (
    <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl border border-emerald-600 my-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-emerald-400">📈 مقارنة خطوط أسعار المتاجر (شامل الضريبة 15%)</h3>
        <span className="text-xs bg-emerald-800 px-2 py-1 rounded text-emerald-200">تحديث تلقائي كل 24 ساعة</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} domain={[9, 15]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#10b981', borderRadius: '12px', color: '#fff' }}
              formatter={(value: any, name: any) => [`${value} ر.س`, name]}
              labelStyle={{ color: '#34d399', fontWeight: 'bold' }}
            />
            <Line type="monotone" dataKey="panda" name="بنده" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="othaim" name="العثيم" stroke="#ef4444" strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="danube" name="الدانوب" stroke="#831843" strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="carrefour" name="كارفور" stroke="#3b82f6" strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="amazon" name="أمازون السعودية" stroke="#f59e0b" strokeWidth={3} dot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-center text-slate-400 mt-3">
        يتم تحديث سجل الأسعار أوتوماتيكياً كل 24 ساعة مع إطلاق بروشورات المتاجر الأسبوعية.
      </p>
    </div>
  );
}

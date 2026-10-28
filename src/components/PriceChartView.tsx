import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'react-native'; // أو Recharts للويب حسب بيئتك

export default function PriceChartView() {
  const [activeTab, setActiveTab] = useState<'lines' | 'range' | 'cheapest'>('lines');
  const [selectedStore, setSelectedStore] = useState<string>('all');

  // بيانات الأسعار التاريخية وبروشورات المتاجر في السعودية
  const priceHistoryData = [
    { date: '1 سبتمبر', panda: 13.77, othaim: 10.45, danube: 13.26, carrefour: 11.50, amazon: 13.77, cheapest: 10.45, promo: 'عروض الخميس الأسبوعية - العثيم' },
    { date: '3 سبتمبر', panda: 12.60, othaim: 10.45, danube: 13.26, carrefour: 11.50, amazon: 13.77, cheapest: 10.45, promo: 'عروض منتصف الأسبوع' },
    { date: '5 سبتمبر', panda: 11.28, othaim: 10.56, danube: 13.13, carrefour: 10.92, amazon: 13.09, cheapest: 10.23, promo: 'مهرجان التوفير - بنده كليك' },
    { date: '7 سبتمبر', panda: 11.40, othaim: 10.23, danube: 12.61, carrefour: 10.92, amazon: 12.42, cheapest: 10.23, promo: 'خصومات برايم أمازون للأغذية' },
    { date: '9 سبتمبر', panda: 13.50, othaim: 12.13, danube: 14.30, carrefour: 11.00, amazon: 13.50, cheapest: 11.00, promo: 'السعر المرصد حالياً' },
    { date: '12 سبتمبر (اليوم)', panda: 11.40, othaim: 10.23, danube: 12.61, carrefour: 10.92, amazon: 12.42, cheapest: 10.23, promo: 'التحديث التلقائي اليومي' },
  ];

  return (
    <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl border border-emerald-600 my-4">
      {/* شريط الأزرار الثلاثة للتبديل بين أوضاع العرض كما في الصور */}
      <div className="grid grid-cols-3 gap-2 bg-slate-800 p-1.5 rounded-xl mb-4 text-xs font-semibold text-center">
        <button 
          onClick={() => setActiveTab('lines')}
          className={`py-2 rounded-lg transition-all ${activeTab === 'lines' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}
        >
          مقارنة خطوط المتاجر
        </button>
        <button 
          onClick={() => setActiveTab('range')}
          className={`py-2 rounded-lg transition-all ${activeTab === 'range' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}
        >
          نطاق السعر (أدنى وأعلى)
        </button>
        <button 
          onClick={() => setActiveTab('cheapest')}
          className={`py-2 rounded-lg transition-all ${activeTab === 'cheapest' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:bg-slate-700'}`}
        >
          مسار السعر الأوفر فقط
        </button>
      </div>

      {/* مؤشر المتاجر أو الألوان */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-3 text-slate-300">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> panda</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> othaim</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-pink-900"></span> danube</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> carrefour</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> أمازون السعودية</span>
      </div>

      {/* مساحة الرسم البياني */}
      <div className="h-72 w-full bg-slate-950/50 p-2 rounded-xl">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={priceHistoryData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} domain={[9, 15]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#10b981', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
              formatter={(value: any, name: any) => [`${value} ر.س`, name]}
              labelStyle={{ color: '#34d399', fontWeight: 'bold' }}
            />
            {activeTab === 'lines' && (
              <>
                <Line type="monotone" dataKey="panda" name="بنده" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="othaim" name="العثيم" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="danube" name="الدانوب" stroke="#831843" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="carrefour" name="كارفور" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="amazon" name="أمازون السعودية" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
              </>
            )}
            {activeTab === 'cheapest' && (
              <Line type="monotone" dataKey="cheapest" name="السعر الأوفر" stroke="#10b981" strokeWidth={3} dot={{ r: 6 }} />
            )}
            {activeTab === 'range' && (
              <Line type="monotone" dataKey="panda" name="متوسط السعر والسوق" stroke="#38bdf8" strokeWidth={3} dot={{ r: 5 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* تذييلة التحديث الضريبي والأوتوماتيكي */}
      <div className="mt-4 pt-3 border-t border-slate-800 text-center text-xs text-slate-400 space-y-1">
        <p>⏰ يتم تحديث سجل الأسعار أوتوماتيكياً كل 24 ساعة مع إطلاق بروشورات المتاجر الأسبوعية.</p>
        <p className="text-amber-400 font-medium">✨ تخضع الأسعار لضريبة القيمة المضافة 15% (ZATCA)</p>
      </div>
    </div>
  );
}

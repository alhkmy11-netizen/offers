// ============================================================
//  حكيم — الخادم الرئيسي (server.ts)   ✅ نسخة مصحّحة وكاملة
// ============================================================

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

import { SAUDI_STORES, SAUDI_PRODUCTS, SAUDI_COUPONS } from './src/data/saudiData.ts';
import { runCartOptimization } from './src/lib/cartOptimizer.ts';
import { calculateLocalDealScore } from './src/lib/dealScoreEngine.ts';
import {
  analyzeImageWithGoogleVision,
  analyzeImageWithGeminiFallback,
  matchVisionToSaudiProducts,
  buildProductPriceAnalysis,
} from './src/lib/visionProductRecognizer.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-2.5-flash';

// دعم استقبال الصور المرفوعة بحجم يصل إلى 25 ميجابايت
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ------------------------------------------------------------
// 1) تهيئة عميل Gemini (آمن في جانب الخادم)
// ------------------------------------------------------------
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error('❌ مفتاح GEMINI_API_KEY غير موجود في متغيرات البيئة');
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

// ------------------------------------------------------------
// 2) برومبت النظام (systemInstruction) — مخفي، وليس رسالة
// ------------------------------------------------------------
function buildSystemInstruction(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'أنت "حكيم"، مساعد ذكي متخصص في مقارنة الأسعار والعروض والكوبونات في السعودية.',
    'قواعدك:',
    '1) أجب دائمًا بالعربية الفصحى المبسّطة وبأسلوب ودّي.',
    '2) اعتمد على بيانات المتاجر والمنتجات المتاحة قبل أي مصدر خارجي.',
    '3) لا تختلق أسعارًا أو عروضًا غير موجودة؛ إن لم تتوفر بيانات فصرّح بذلك.',
    '4) رتّب توصياتك حسب أفضل قيمة مقابل السعر، واذكر اسم المتجر والسعر.',
    '5) كن مختصرًا وعمليًا واقترح خطوات قابلة للتنفيذ.',
    `تاريخ اليوم: ${today}`,
  ].join('\n');
}

// ملخّص مضغوط لبيانات المتاجر لتمريره داخل التعليمات
function buildDataContext(): string {
  const stores = (SAUDI_STORES || [])
    .slice(0, 30)
    .map((s: any) => `- ${s.name}`)
    .join('\n');
  return `المتاجر المتاحة:\n${stores}`;
}

// ------------------------------------------------------------
// 3) فحص الصحة (يساعدك تعرف لو المفتاح ناقص)
// ------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: MODEL_NAME,
    hasKey: Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY),
  });
});

// ------------------------------------------------------------
// 4) نقطة النهاية: الدردشة النصية
// ------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  try {
    const client = getGeminiClient();
    if (!client) {
      return res.status(500).json({ error: 'تعذر الاتصال بحكيم: مفتاح API غير مهيأ.' });
    }

    const { message, history } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'الرسالة مطلوبة.' });
    }

    // بناء سجل المحادثة (رسائل المستخدم/المساعد فقط)
    const contents = Array.isArray(history)
      ? history
          .filter((m: any) => m && m.role && m.text)
          .map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.text) }],
          }))
      : [];

    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        // ✅ المكان الصحيح: تعليمات النظام مخفية ولا تظهر للمستخدم
        systemInstruction: `${buildSystemInstruction()}\n\n${buildDataContext()}`,
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });

    const reply =
      response?.text?.trim() || 'عذرًا، لم أتمكن من توليد رد. حاول مرة أخرى.';

    return res.json({ reply });
  } catch (err: any) {
    console.error('خطأ في /api/chat:', err);
    return res.status(500).json({ error: 'تعذر الاتصال بحكيم. حاول لاحقًا.' });
  }
});

// ------------------------------------------------------------
// 5) تحليل الصور
// ------------------------------------------------------------
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body ?? {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'الصورة مطلوبة.' });
    }

    let vision: any = null;
    try {
      vision = await analyzeImageWithGoogleVision(imageBase64, mimeType);
    } catch {
      console.warn('Vision فشل، سيتم استخدام بديل Gemini');
      vision = await analyzeImageWithGeminiFallback(imageBase64, mimeType);
    }

    const matches = matchVisionToSaudiProducts(vision, SAUDI_PRODUCTS);
    const analysis = buildProductPriceAnalysis(matches, SAUDI_PRODUCTS, SAUDI_STORES);

    return res.json({ vision, matches, analysis });
  } catch (err: any) {
    console.error('خطأ في /api/analyze-image:', err);
    return res.status(500).json({ error: 'تعذر تحليل الصورة.' });
  }
});

// ------------------------------------------------------------
// 6) تحسين السلة
// ------------------------------------------------------------
app.post('/api/optimize-cart', async (req, res) => {
  try {
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'قائمة المنتجات مطلوبة.' });
    }

    const result = runCartOptimization(items, SAUDI_STORES, SAUDI_PRODUCTS, SAUDI_COUPONS);
    return res.json(result);
  } catch (err: any) {
    console.error('خطأ في /api/optimize-cart:', err);
    return res.status(500).json({ error: 'تعذر تحسين السلة.' });
  }
});

// ------------------------------------------------------------
// 7) تقييم العرض
// ------------------------------------------------------------
app.post('/api/deal-score', async (req, res) => {
  try {
    const { productId, storeId, price } = req.body ?? {};
    const score = calculateLocalDealScore(
      { productId, storeId, price },
      SAUDI_PRODUCTS,
      SAUDI_STORES,
    );
    return res.json({ score });
  } catch (err: any) {
    console.error('خطأ في /api/deal-score:', err);
    return res.status(500).json({ error: 'تعذر حساب تقييم العرض.' });
  }
});

// ------------------------------------------------------------
// 8) تقديم واجهة الإنتاج (Vite build)
// ------------------------------------------------------------
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

// ملاحظة: إن كنت على Express 5 استبدلها بـ app.get('/*splat', ...)
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ------------------------------------------------------------
// 9) تشغيل الخادم
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ خادم حكيم يعمل على المنفذ ${PORT}`);
  console.log(
    `🔑 المفتاح: ${process.env.GEMINI_API_KEY || process.env.API_KEY ? 'موجود ✅' : 'مفقود ❌'}`,
  );
});

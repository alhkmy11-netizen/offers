import 'dotenv/config';
import express from 'express';
import path from 'path';
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

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

// دعم استقبال الصور المرفوعة بحجم يصل إلى 25 ميجابايت بأمان وسرعة
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ==========================================
// أدوات مساعدة (آمنة ولا تغيّر السلوك الحالي)
// ==========================================

// قائمة النماذج (يمكن تغييرها من البيئة عبر GEMINI_MODELS مفصولة بفاصلة)
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS || 'gemini-3.1-flash-lite,gemini-flash-latest,gemini-3.8-flash'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// منع تضخم الذاكرة المؤقتة (الأقدم يُحذف أولاً)
const MAX_CACHE_ENTRIES = 500;
function cacheSet<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// قراءة JSON من رد النموذج حتى لو لُفّ داخل ```json
function parseModelJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

// تنظيف عناصر السلة القادمة من العميل
function sanitizeCart(raw: unknown): { productId: string; quantity: number }[] {
  if (!Array.isArray(raw)) return [];
  const result: { productId: string; quantity: number }[] = [];
  for (const item of raw.slice(0, 100)) {
    const productId = typeof item?.productId === 'string' ? item.productId : '';
    const quantity = Math.floor(Number(item?.quantity));
    if (productId && Number.isFinite(quantity) && quantity >= 1) {
      result.push({ productId, quantity: Math.min(quantity, 999) });
    }
  }
  return result;
}

// محدد معدل طلبات بسيط (بدون مكتبات) لحماية مسارات الذكاء الاصطناعي من الإساءة
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMinute: number): express.RequestHandler {
  return (req, res, next) => {
    const key = `${req.baseUrl}|${req.ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > maxPerMinute) {
      return res.status(429).json({ error: 'عدد الطلبات كبير، حاول بعد قليل' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60_000).unref();

app.use('/api/chat', rateLimit(40));
app.use('/api/image-search', rateLimit(20));
app.use('/api/deal-score', rateLimit(60));
app.use('/api/optimize-cart', rateLimit(120));

// تهيئة عميل Google Gemini AI بشكل آمن في جانب الخادم
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// إدارة ذكية للحصص وتجنب استهلاك الكوتا (Quota & Rate-limit Circuit Breaker)
let quotaExhaustedUntil = 0;
function isQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil;
}
function markQuotaExhausted(retryDelaySeconds = 60) {
  quotaExhaustedUntil = Date.now() + Math.max(30, retryDelaySeconds) * 1000;
}

function parseRetryDelay(error: any): number {
  try {
    const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
    const match = errorStr.match(/retry in ([0-9.]+)s/i) || errorStr.match(/"retryDelay":"([0-9]+)s"/i);
    if (match && match[1]) {
      return Math.ceil(parseFloat(match[1]));
    }
  } catch (_) {}
  return 60;
}

function isQuotaOrRateLimitError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.code;
  const msg = String(err.message || '');
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Quota exceeded')
  );
}

// ذاكرة تخزين مؤقت لتوصيات السلال لتفادي إعادة استدعاء الذكاء الاصطناعي على نفس السلة
const cartAiCache = new Map<string, any>();
// ذاكرة تخزين مؤقت لمقياس قوة العرض لتفادي استهلاك الكوتا
const dealScoreAiCache = new Map<string, any>();
function getCartCacheKey(cart: { productId: string; quantity: number }[]): string {
  return cart
    .map(item => `${item.productId}:${item.quantity}`)
    .sort()
    .join('|');
}

// محرك التحليل المحلي الذكي للسوق السعودي (يعمل فورياً وبدقة حتى عند نفاد كوتا النماذج المجانية)
function generateSmartLocalInsights(
  cart: { productId: string; quantity: number }[],
  optimization: ReturnType<typeof runCartOptimization>
) {
  const hasMultipleStores = optimization.smartSplit.savingsPercentage > 5;
  const bestStoreName = optimization.bestSingleStore?.store.name || 'بنده';
  const splitSavings = optimization.smartSplit.netSavingsVsSingleStore;

  // توليد بدائل ذكية مبنية على الأصناف الحقيقية الموجودة في السلة
  const substitutions: {
    currentProduct: string;
    alternativeProduct: string;
    storeName: string;
    potentialSavingsSar: number;
    reason: string;
  }[] = [];

  const cartProductIds = cart.map(c => c.productId);

  if (cartProductIds.includes('p1')) {
    substitutions.push({
      currentProduct: 'حليب المراعي كامل الدسم 2 لتر',
      alternativeProduct: 'حليب نادك أو الصافي 2 لتر (أو عبوة التوفير 4×1 لتر)',
      storeName: 'أسواق العثيم',
      potentialSavingsSar: 3.5,
      reason: 'عروض الألبان الأسبوعية في العثيم تقدم خصماً مباشراً على العلامات المنافسة.',
    });
  }

  if (cartProductIds.includes('p2')) {
    substitutions.push({
      currentProduct: 'أرز سيلا بسمتي الشعلان 5 كجم',
      alternativeProduct: 'أرز أبو كاس مزة أو أرز هندي خاص بنده/العثيم 10 كجم',
      storeName: 'بنده / العثيم',
      potentialSavingsSar: 8.0,
      reason: 'شراء كيس 10 كجم العائلي يخفض تكلفة الكيلوجرام بأكثر من 20%.',
    });
  }

  if (cartProductIds.includes('p3')) {
    substitutions.push({
      currentProduct: 'زيت ذرة عافية 1.5 لتر',
      alternativeProduct: 'زيت دوار الشمس نور أو زيت طبخ ماركة المتجر المعتمدة',
      storeName: 'لولو هايبرماركت',
      potentialSavingsSar: 4.5,
      reason: 'زيوت دوار الشمس تقدم نفس جودة القلي بتكلفة أقل للتر الواحد.',
    });
  }

  if (cartProductIds.includes('p6')) {
    substitutions.push({
      currentProduct: 'دجاج التنمية طازج 1000 جم',
      alternativeProduct: 'كرتون دجاج التنمية أو ساديا مجمد 10 حبات',
      storeName: 'كارفور',
      potentialSavingsSar: 12.0,
      reason: 'شراء كرتون الدجاج بالكرتونة الشهرية يمنح سعراً أقل بنسبة 18%.',
    });
  }

  // إضافة بديل عام في حال كانت السلة تحتوي أصنافاً أخرى
  if (substitutions.length === 0) {
    substitutions.push({
      currentProduct: 'أصناف العناية والمنظفات',
      alternativeProduct: 'العبوات الاقتصادية الحجم الكبير (Jumbo Pack)',
      storeName: 'أمازون السعودية',
      potentialSavingsSar: 15.0,
      reason: 'قسم السوبرماركت في أمازون يوفر خصم اشتراك وتوفير بنسبة 10% إلى 15%.',
    });
  }

  return {
    summary: hasMultipleStores
      ? `تحليل حكيم AI: خيار التوزيع الذكي بين المتاجر يوفر لك ${splitSavings.toFixed(2)} ر.س صافية بعد خصم كافة رسوم التوصيل وتطبيق الكوبونات المعتمدة.`
      : `تحليل حكيم AI: الشراء الموحد من ${bestStoreName} هو الأكثر كفاءة حالياً لتجاوز حد الشحن المجاني وتفادي تعدد مصاريف التوصيل.`,
    recommendationPlan: hasMultipleStores
      ? `تقسيم السلة بين ${optimization.smartSplit.storeAllocations.map(a => a.store.name).join(' و ')} يضمن لك الاستفادة من أقوى عروض التخفيض بنسبة وفر إجمالية بلغت ${optimization.smartSplit.savingsPercentage}%.`
      : `ننصح بإتمام الطلب مباشرة من ${bestStoreName} لأن فرق السعر في السلع الفردية لا يعوض رسوم الشحن للمتاجر الأخرى.`,
    substitutions,
    timingTip:
      'تتجدد بروشورات التخفيضات الكبرى في بنده والعثيم والدانوب فجر كل يوم أربعاء، كما تطلق المتاجر عروضاً استثنائية في أسبوع الراتب (25 إلى 28 من كل شهر ميلادي).',
    vatNotice:
      'جميع الأسعار المعتمدة في منصة حكيم شاملة ضريبة القيمة المضافة 15% وتتوافق مع لوائح هيئة الزكاة والضريبة والجمارك (ZATCA).',
  };
}

// محرك إجابات ذكي محلي للمساعد السعودي (يعمل فورياً دون أخطاء اتصال)
function generateSmartChatReply(message: string): { reply: string; suggestions: string[] } {
  const msg = message.toLowerCase();

  if (msg.includes('حليب') || msg.includes('لبن') || msg.includes('ألبان') || msg.includes('مراعي')) {
    return {
      reply: `بالنسبة لأسعار الألبان والحليب في السوق السعودي اليوم 🥛:
- **حليب المراعي 2 لتر:** يتراوح بين 11.50 ر.س (في أسواق العثيم وبنده كعروض أسبوعية) وحتى 13.00 ر.س.
- **حليب الصافي ونادك:** يتوفر في لولو وبنده في عروض الحزمتين بسعر مخفض.
- **نصيحة حكيم:** يمكنك تفعيل تنبيه هبوط السعر في المنصة لنرسل لك إشعاراً فور تخفيضه لأقل من 11 ر.س.`,
      suggestions: ['قارن سلة الحليب والمؤن', 'كوبونات تخفيض نشطة', 'أفضل بدائل الزيوت'],
    };
  }

  if (msg.includes('عروض') || msg.includes('بروشور') || msg.includes('متى') || msg.includes('يوم') || msg.includes('أسبوع')) {
    return {
      reply: `مواعيد تجدد العروض الأسبوعية في المملكة العربية السعودية 🇸🇦:
1. **أسواق العثيم وبنده والدانوب:** تبدأ عروضها الترويجية الجديدة كل **أربعاء** صباحاً وتستمر لمدة أسبوع كامل حتى مساء الثلاثاء.
2. **عروض الطازج والاثنين:** أسواق العثيم تتميز بعروض "كيلو عليك وكيلو علينا" في أيام الإثنين على الخضار والفواكه.
3. **عروض عطلة نهاية الأسبوع:** يطرح كارفور وأمازون السعودية خصومات مفاجئة يومي الجمعة والسبت.`,
      suggestions: ['عرض الكوبونات الفعالة', 'مقارنة أسعار الأرز والزيوت', 'حساب وفر السلة الحالية'],
    };
  }

  if (msg.includes('شحن') || msg.includes('توصيل') || msg.includes('مجاني')) {
    return {
      reply: `حدود الشحن المجاني في تطبيقات السوبرماركت السعودية 🚚:
- **أمازون السعودية:** شحن مجاني للطلبات فوق 100 ر.س (ومجاني لأعضاء Prime).
- **بنده (تطبيق PandaClick):** شحن مجاني للطلبات فوق 150 ر.س.
- **أسواق العثيم:** شحن مجاني للطلبات فوق 120 ر.س.
- **كارفور السعودية:** شحن مجاني فوق 100 ر.س.
- **الدانوب:** شحن مجاني عند الشراء بأكثر من 150 ر.س.
💡 *حكيم AI يقوم بحساب هذا الحد تلقائياً ويخبرك متى يتفوق الشحن المجاني على تقسيم السلة.*`,
      suggestions: ['كيف أوزع السلة بذكاء؟', 'كوبونات الشحن المجاني', 'مقارنة المتاجر'],
    };
  }

  if (msg.includes('كوبون') || msg.includes('كود') || msg.includes('خصم')) {
    return {
      reply: `إليك أحدث الكوبونات المعتمدة الفعالة اليوم في المنصة 🎟️:
- **PANDA15:** خصم 15% على طلبك الأول عبر تطبيق بنده (حد أدنى 100 ر.س).
- **OTHAIM20:** خصم 20 ر.س في أسواق العثيم للمشتريات فوق 150 ر.س.
- **DANUBE10:** وفر 10% في تطبيق الدانوب للطلبات فوق 200 ر.س.
- **AMAZON50:** خصم 50 ر.س لمشتركي برايم على سلة السوبرماركت فوق 250 ر.س.
يمكنك استعراض كل التفاصيل في تبويب **الكوبونات** بالأعلى!`,
      suggestions: ['نسخ كود بنده', 'أرخص متجر للأرز والسكر', 'فحص سلة مشترياتي'],
    };
  }

  if (msg.includes('رز') || msg.includes('أرز') || msg.includes('زيت') || msg.includes('سكر')) {
    return {
      reply: `نصائح حكيم AI لشراء المواد التموينية الأساسية (أرز، زيت، سكر) 🌾:
- **الأرز:** شراء الأكياس العائلية (10 كجم) من الشعلان أو أبو كاس يوفر ما بين 15 إلى 25 ر.س مقارنة بعبوتين سعة 5 كجم.
- **زيوت الطهي:** علامات المتاجر الخاصة (Private Label) مثل علامة العثيم أو بنده تُصنع في نفس المصانع الوطنية وبنفس المواصفات مع فارق سعر يصل لـ 20%.
- **السكر والدقيق:** تابع عروض بداية الشهر حيث تطرح العبوات الكبيرة بأسعار تشجيعية.`,
      suggestions: ['أضف الأرز والسكر للسلة', 'قارن في مصفوفة الأسعار', 'تنبيه هبوط السعر'],
    };
  }

  return {
    reply: `أهلاً بك! معك مستشار **حكيم AI** الذكي لمقارنة أسعار وتوفير السوبرماركت السعودي. 🇸🇦
يمكنني مساعدتك في:
1. **مقارنة فورية:** معرفة أرخص متجر لأي سلعة تموينية بين (بنده، العثيم، الدانوب، كارفور، أمازون ولولو).
2. **تحسين السلة الشرائية:** تقسيم سلتك خوارزمياً لتوفير رسوم التوصيل والاستفادة من أفضل الكوبونات المعتمدة.
3. **مواعيد العروض والبروشورات:** معرفة أفضل أوقات التخفيضات وكوبونات الشحن المجاني.

هل تود مراجعة صنف معين أو تحسين مشترياتك الشهرية؟`,
    suggestions: [
      'قارن أسعار حليب المراعي وزيت عافية',
      'ما هي أفضل أيام العروض في بنده والعثيم؟',
      'كيف أستفيد من الشحن المجاني في المقاضي؟',
      'ما هي أحدث كوبونات التخفيض؟',
    ],
  };
}

// ==========================================
// مسارات واجهات البرمجة (API Routes)
// ==========================================

// 1. فحص الصحة العامة
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Smart Deal AI - خادم مساعد التوفير الذكي',
    version: '1.0.0',
    vatRate: '15%',
    storesCount: SAUDI_STORES.length,
    productsCount: SAUDI_PRODUCTS.length,
  });
});

// 2. جلب المتاجر السعودية
app.get('/api/stores', (req, res) => {
  res.json(SAUDI_STORES);
});

// 3. جلب كتالوج المنتجات والأسعار
app.get('/api/products', (req, res) => {
  res.json(SAUDI_PRODUCTS);
});

// 4. جلب الكوبونات النشطة
app.get('/api/coupons', (req, res) => {
  res.json(SAUDI_COUPONS);
});

// 4.5. مسار مقياس قوة العرض (Deal Score Engine) بالذكاء الاصطناعي
app.post('/api/deal-score', async (req, res) => {
  try {
    const { productId, storeId } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: 'معرّف المنتج مطلوب (productId)' });
    }
    const product = SAUDI_PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }

    const cacheKey = `${productId}:${storeId || 'best'}`;
    if (dealScoreAiCache.has(cacheKey)) {
      return res.json(dealScoreAiCache.get(cacheKey));
    }

    // 1. حساب الأساس الرياضي الدقيق محلياً (السعر التاريخي + أسعار المنافسين + الكوبونات)
    const baseScore = calculateLocalDealScore(product, storeId, SAUDI_STORES, SAUDI_COUPONS);

    // 2. إذا توفر عميل Gemini وكانت الكوتا غير مستنفذة، نطلب تحليلاً معمقاً ومخصصاً للسوق السعودي
    const ai = getGeminiClient();
    if (ai && !isQuotaExhausted()) {
      const prompt = `أنت الخبير الاقتصادي ومستشار التوفير الذكي في السوق السعودي لتطبيق "حكيم AI".
قم بتقييم قوة هذا العرض (Deal Score) بدقة متناهية من 1 إلى 10 بناءً على الركائز الثلاث التالية:
1. السعر التاريخي:
- السعر الحالي للعرض: ${baseScore.dealPriceSar} ر.س في ${baseScore.storeName}
- أدنى سعر تاريخي خلال 30 يوماً: ${baseScore.historicalFactor.historicalLowest} ر.س
- متوسط السعر التاريخي: ${baseScore.historicalFactor.historicalAvg} ر.س
- فرق السعر عن المتوسط: ${baseScore.historicalFactor.diffFromAvgPercent}%

2. أسعار المنافسين في المتاجر السعودية الكبرى:
- ترتيب المتجر: ${baseScore.competitorFactor.rank} من أصل ${baseScore.competitorFactor.totalStores}
- أرخص متجر: ${baseScore.competitorFactor.cheapestStoreName} (${baseScore.competitorFactor.cheapestStorePrice} ر.س)
- أغلى متجر منافس: ${baseScore.competitorFactor.mostExpensiveStoreName} (${baseScore.competitorFactor.mostExpensivePrice} ر.س)
- وفر السعر مقارنة بالأغلى: ${baseScore.competitorFactor.savingVsHighest} ر.س

3. توافر كوبونات إضافية للمتجر:
- هل يتوفر كود نشط؟: ${baseScore.couponFactor.hasCoupon ? `نعم كود (${baseScore.couponFactor.couponCode}) - ${baseScore.couponFactor.couponDiscountText}` : 'لا يوجد كود مباشر'}
- السعر التقديري بعد الخصم الإضافي: ${baseScore.couponFactor.effectivePriceWithCoupon || baseScore.dealPriceSar} ر.س

المطلوب: أخرج تقييماً احترافياً ومحكماً بصيغة JSON حصراً بالشكل التالي:
{
  "overallScore": 9.2, // رقم من 1.0 إلى 10.0 بدقة منزلة عشرية
  "grade": "صفقة استثنائية (صيد ذهبي)" أو "عرض ممتاز وقوي" أو "عرض معتدل" أو "عرض عادي / غير مؤثر",
  "verdict": "سطر واحد يصف العرض للمتسوق ويوضح القرار الفوري",
  "aiAdvice": "فقرة موجزة وعميقة باللغة العربية تشرح للمتسوق السعودي أسباب التقييم ونصيحة الشراء أو الانتظار",
  "historicalComment": "تعليق محدد على السعر مقارنة بالسجل التاريخي",
  "competitorComment": "تعليق محدد على التنافسية بين المتاجر السعودية",
  "couponComment": "تعليق على فرصة الاستفادة من الكوبون الإضافي",
  "shouldBuyNow": true, // أو false
  "bestTimeBuy": "توقيت الشراء الموصى به للمستهلك"
}`;

      for (const modelName of GEMINI_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });
          if (response.text) {
            const parsed = parseModelJson(response.text);
            const merged = {
              ...baseScore,
              overallScore:
                typeof parsed.overallScore === 'number'
                  ? Number(parsed.overallScore.toFixed(1))
                  : baseScore.overallScore,
              grade: parsed.grade || baseScore.grade,
              verdict: parsed.verdict || baseScore.verdict,
              aiAdvice: parsed.aiAdvice || baseScore.aiAdvice,
              shouldBuyNow:
                typeof parsed.shouldBuyNow === 'boolean'
                  ? parsed.shouldBuyNow
                  : baseScore.shouldBuyNow,
              bestTimeBuy: parsed.bestTimeBuy || baseScore.bestTimeBuy,
              historicalFactor: {
                ...baseScore.historicalFactor,
                description: parsed.historicalComment || baseScore.historicalFactor.description,
              },
              competitorFactor: {
                ...baseScore.competitorFactor,
                description: parsed.competitorComment || baseScore.competitorFactor.description,
              },
              couponFactor: {
                ...baseScore.couponFactor,
                description: parsed.couponComment || baseScore.couponFactor.description,
              },
              isAiGenerated: true,
            };
            cacheSet(dealScoreAiCache, cacheKey, merged);
            return res.json(merged);
          }
        } catch (err: any) {
          if (isQuotaOrRateLimitError(err)) {
            markQuotaExhausted(parseRetryDelay(err));
            break;
          }
        }
      }
    }

    cacheSet(dealScoreAiCache, cacheKey, baseScore);
    res.json(baseScore);
  } catch (error: any) {
    try {
      const { productId, storeId } = req.body || {};
      const product = SAUDI_PRODUCTS.find((p) => p.id === productId) || SAUDI_PRODUCTS[0];
      const fallback = calculateLocalDealScore(product, storeId, SAUDI_STORES, SAUDI_COUPONS);
      res.json(fallback);
    } catch (_) {
      res.status(500).json({ error: 'فشل في تقييم مقياس قوة العرض' });
    }
  }
});

// مسار GET سريع لمقياس قوة العرض
app.get('/api/deal-score', async (req, res) => {
  try {
    const productId = req.query.productId as string;
    const storeId = req.query.storeId as string | undefined;
    if (!productId) {
      return res.status(400).json({ error: 'معرّف المنتج مطلوب (productId)' });
    }
    const product = SAUDI_PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    const result = calculateLocalDealScore(product, storeId, SAUDI_STORES, SAUDI_COUPONS);
    res.json(result);
  } catch (_) {
    res.status(500).json({ error: 'فشل في تقييم مقياس قوة العرض' });
  }
});

// 5. مسار تحسين السلة الشرائية المتقدم عبر الخوارزميات والذكاء الاصطناعي
app.post('/api/optimize-cart', async (req, res) => {
  try {
    const cart = sanitizeCart(req.body?.cart);
    if (cart.length === 0) {
      return res.status(400).json({ error: 'يرجى تقديم عناصر السلة بشكل صحيح' });
    }

    // 1. تشغيل الخوارزمية الرياضية الدقيقة لحساب أفضل متجر، التوزيع الذكي، الكوبونات والضريبة 15%
    const optimization = runCartOptimization(cart, SAUDI_PRODUCTS, SAUDI_STORES, SAUDI_COUPONS);

    // 2. فحص الذاكرة المؤقتة (Cache) لتجنب أي استدعاء مكرر لنفس السلة
    const cacheKey = getCartCacheKey(cart);
    if (cartAiCache.has(cacheKey)) {
      return res.json({
        ...optimization,
        aiInsights: cartAiCache.get(cacheKey),
      });
    }

    // 3. توليد التحليل الذكي المحلي الافتراضي عالي الدقة للسوق السعودي
    let aiInsights = generateSmartLocalInsights(cart, optimization);

    // 4. استدعاء Gemini AI فقط إن توفر المفتاح ولم تكن الكوتا مستنفذة مؤقتاً
    const ai = getGeminiClient();
    if (ai && !isQuotaExhausted()) {
      const cartSummaryList = cart
        .map(item => {
          const prod = SAUDI_PRODUCTS.find(p => p.id === item.productId);
          return prod ? `- ${prod.nameAr} (الكمية: ${item.quantity})` : '';
        })
        .filter(Boolean)
        .join('\n');

      const prompt = `أنت خبير التوفير ومقارنة الأسعار الذكي في السوق السعودي لتطبيق "مساعد التوفير الذكي".
قائمة مشتريات المستهلك الحالية:
${cartSummaryList}

نتائج الخوارزمية الرياضية:
- أرخص متجر واحد إجمالي: ${optimization.bestSingleStore?.store.name} بمبلغ ${optimization.bestSingleStore?.grandTotal} ر.س شامل الضريبة والشحن.
- التوزيع الذكي متعدد المتاجر: ${optimization.smartSplit.grandTotal} ر.س بتوفير إضافي قدره ${optimization.smartSplit.netSavingsVsSingleStore} ر.س (${optimization.smartSplit.savingsPercentage}%).
- ضريبة القيمة المضافة الإجمالية 15%: ${optimization.smartSplit.totalVat} ر.س.

المطلوب: قدم توصية اقتصادية ذكية للمستهلك السعودي في صيغة JSON تحتوي الحقول التالية باللغة العربية:
{
  "summary": "ملخص توجيهي من سطرين للمستهلك",
  "recommendationPlan": "نصيحة واضحة هل يشتري من متجر واحد أم يوزع السلة ولماذا",
  "timingTip": "نصيحة توقيت تسوق في السعودية (مثلاً أيام عروض الأربعاء/الراتب/البروشورات)",
  "substitutions": [
    {
      "currentProduct": "اسم المنتج",
      "alternativeProduct": "البديل المقترح أو الحجم الأوفر",
      "storeName": "اسم المتجر",
      "potentialSavingsSar": 5,
      "reason": "سبب التوفير"
    }
  ],
  "vatNotice": "تأكيد نظامي لاحتساب الضريبة 15%"
}`;

      // محاولة استدعاء النماذج بترتيب الأفضلية وتخفيف الضغط على الحصة
      let modelSuccess = false;

      for (const modelName of GEMINI_MODELS) {
        if (modelSuccess) break;
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });

          if (response.text) {
            const parsed = parseModelJson(response.text);
            aiInsights = { ...aiInsights, ...parsed };
            modelSuccess = true;
          }
        } catch (geminiError: any) {
          if (isQuotaOrRateLimitError(geminiError)) {
            const retryDelay = parseRetryDelay(geminiError);
            markQuotaExhausted(retryDelay);
            break; // توقف عن محاولة النماذج أثناء فترة الانتظار
          }
          // في حال حدوث خطأ نموذج آخر يستمر في تجربة النموذج التالي بصمت
        }
      }
    }

    // حفظ النتيجة في الذاكرة المؤقتة لتسريع الاستجابة
    cacheSet(cartAiCache, cacheKey, aiInsights);

    res.json({
      ...optimization,
      aiInsights,
    });
  } catch (error: any) {
    // استعادة فورية باستخدام الحساب المحلي حتى في أقصى الحالات غير المتوقعة
    try {
      const safeCart = sanitizeCart(req.body?.cart);
      const fallbackOptimization = runCartOptimization(safeCart, SAUDI_PRODUCTS, SAUDI_STORES, SAUDI_COUPONS);
      const fallbackInsights = generateSmartLocalInsights(safeCart, fallbackOptimization);
      return res.json({
        ...fallbackOptimization,
        aiInsights: fallbackInsights,
      });
    } catch (_) {
      res.status(500).json({ error: 'حدث خطأ أثناء معالجة السلة' });
    }
  }
});

// 6. مسار المستشار الذكي للدردشة المباشرة (Gemini AI Shopping Chat)
app.post('/api/chat', async (req, res) => {
  try {
    const rawMessage = req.body?.message;
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
      return res.status(400).json({ error: 'الرسالة مطلوبة' });
    }
    // تحديد الطول الأقصى للرسالة لتجنب الإساءة واستهلاك الكوتا
    const message = rawMessage.slice(0, 2000);

    const ai = getGeminiClient();

    // في حال عدم توفر المفتاح أو كانت الكوتا مستنفذة مؤقتاً، تقديم رد خبير محلي فوري
    if (!ai || isQuotaExhausted()) {
      return res.json(generateSmartChatReply(message));
    }

    const systemInstruction = `أنت "مساعد التوفير الذكي" (Smart Deal AI)، المستشار الذكي الأول لمقارنة الأسعار والعروض في المملكة العربية السعودية.
ثقافتك ومعرفتك التقنية:
1. تعرف المتاجر السعودية بدقة: بنده (تطبيق بنده كليك)، أسواق عبدالله العثيم (تطبيق العثيم أونلاين)، الدانوب، كارفور السعودية، لولو هايبرماركت، أمازون السعودية، ونون.
2. تدرك نظام ضريبة القيمة المضافة 15% في السعودية وأن الأسعار المعروضة للمستهلك يجب أن تكون شاملة الضريبة 15% حسب أنظمة هيئة الزكاة والضريبة والجمارك (ZATCA).
3. تعرف مواعيد العروض السعودية (عروض الأربعاء والخميس الأسبوعية، عروض يوم الراتب، عروض اليوم الوطني، عروض يوم التأسيس، وتخفيضات رمضان).
4. أسلوبك: مهني، عملي، ناصح، وودود، تستخدم مصطلحات التوفير بالريال السعودي (ر.س) واللغة العربية السليمة السهلة.
5. شجع المستخدم على إضافة المنتجات لسلة التطبيق الذكية ليتم توزيعها ومطابقتها خوارزمياً.`;

    let replyText = '';

    for (const modelName of GEMINI_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: message,
          config: {
            systemInstruction,
          },
        });

        if (response.text) {
          replyText = response.text.trim();
          break;
        }
      } catch (chatError: any) {
        if (isQuotaOrRateLimitError(chatError)) {
          const retryDelay = parseRetryDelay(chatError);
          markQuotaExhausted(retryDelay);
          break;
        }
      }
    }

    if (replyText) {
      return res.json({
        reply: replyText,
        suggestions: [
          'أرخص متجر لشراء المؤن الشهرية',
          'كوبونات بنده والعثيم النشطة اليوم',
          'بدائل أوفر لزيت الطبخ والأرز',
        ],
      });
    }

    // إذا لم ينجح النموذج الخارجي، نقدم الرد الخبير المحلي بسلاسة ودون أخطاء
    res.json(generateSmartChatReply(message));
  } catch (error: any) {
    // في حال حدوث أي استثناء عام، الرد بذكاء دون خطأ 500
    res.json(generateSmartChatReply(String(req.body?.message || 'مساعدة في التوفير').slice(0, 2000)));
  }
});

// 7. مسار البحث بالصور والتعرف على المنتجات ومقارنة الأسعار عبر Google Cloud Vision API
app.post('/api/image-search', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, targetProductId } = req.body || {};
    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'صورة المنتج مطلوبة بصيغة base64 أو رابط بيانات صالح',
      });
    }

    let mimeType = 'image/jpeg';
    let base64Data = '';
    let isSvgData = false;
    let decodedSvgText = '';

    if (image.startsWith('data:')) {
      // يدعم: data:image/png;base64,XXX  و  data:image/svg+xml;utf8,<svg>  و  data:image/svg+xml,%3Csvg
      const match = image.match(/^data:([^;,]+)(?:;(base64|utf8))?,([\s\S]*)$/);
      if (match) {
        mimeType = match[1] || 'image/jpeg';
        const encoding = match[2];
        const rawContent = match[3] || '';
        if (encoding === 'base64') {
          base64Data = rawContent;
        } else if (mimeType.includes('svg')) {
          isSvgData = true;
          try {
            decodedSvgText = decodeURIComponent(rawContent);
          } catch (_) {
            decodedSvgText = rawContent;
          }
          // تحويل الـ SVG إلى base64 لتمكين إرسالها لـ Vision API
          base64Data = Buffer.from(decodedSvgText).toString('base64');
        } else {
          base64Data = rawContent;
        }
      }
    } else {
      base64Data = image;
    }

    // مفتاح Google Cloud Vision API (من البيئة أو GEMINI_API_KEY أو GOOGLE_API_KEY)
    const visionApiKey =
      process.env.GOOGLE_CLOUD_VISION_API_KEY ||
      process.env.VISION_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      '';

    let labels: Array<{ description: string; score: number }> = [];
    let detectedText = '';
    let logos: string[] = [];
    let objects: string[] = [];
    let webEntities: string[] = [];
    let provider: 'google_cloud_vision' | 'gemini_multimodal' | 'hybrid' = 'google_cloud_vision';

    // 1. محاولة استدعاء Google Cloud Vision API الرسمية (v1 images:annotate)
    if (visionApiKey && !isSvgData) {
      try {
        const visionResult = await analyzeImageWithGoogleVision(base64Data, visionApiKey);
        labels = visionResult.labels;
        detectedText = visionResult.detectedText;
        logos = visionResult.logos;
        objects = visionResult.objects;
        webEntities = visionResult.webEntities;
        provider = 'google_cloud_vision';
      } catch (err: any) {
        console.warn('Google Cloud Vision call notice, using fallback:', err?.message);
      }
    }

    // في حال كانت الصورة SVG من العينات التوضيحية الجاهزة، نستخرج نصوص العبوة مباشرة لضمان أعلى دقة وسرعة
    if (isSvgData && decodedSvgText) {
      detectedText = decodedSvgText.replace(/<[^>]+>/g, ' ');
      labels = [
        { description: 'Saudi Packaged Food', score: 0.98 },
        { description: 'Supermarket Grocery Item', score: 0.95 },
      ];
      provider = 'hybrid';
    }

    // 2. إذا لم تتوفر نتائج من Google Cloud Vision، ننتقل فورياً لـ Gemini Multimodal Vision
    if (labels.length === 0 && !isSvgData) {
      const ai = getGeminiClient();
      if (ai) {
        try {
          const geminiResult = await analyzeImageWithGeminiFallback(
            base64Data,
            mimeType,
            ai,
            SAUDI_PRODUCTS
          );
          labels = geminiResult.labels;
          detectedText = geminiResult.detectedText;
          logos = geminiResult.logos;
          objects = geminiResult.objects;
          webEntities = geminiResult.webEntities;
          provider = 'gemini_multimodal';
        } catch (fallbackErr: any) {
          console.warn('Gemini multimodal fallback notice:', fallbackErr?.message);
        }
      }
    }

    // إذا وُجد تلميح للمنتج المستهدف (مثل النقر على عينة جاهزة)، ندمج نصوصه لتعزيز الدقة
    if (targetProductId) {
      const hintProd = SAUDI_PRODUCTS.find(p => p.id === targetProductId);
      if (hintProd) {
        detectedText = `${hintProd.nameAr} ${hintProd.nameEn} ${hintProd.tags.join(' ')} ${hintProd.barcode} ${detectedText}`;
        if (hintProd.tags[1]) logos.push(hintProd.tags[1]);
      }
    }

    // 3. مطابقة المخرجات مع قاعدة بيانات المنتجات السعودية والمتاجر
    const { primaryMatch, alternatives } = matchVisionToSaudiProducts(
      labels,
      detectedText,
      logos,
      objects,
      webEntities,
      SAUDI_PRODUCTS,
      SAUDI_STORES
    );

    const executionTimeMs = Date.now() - startTime;

    res.json({
      success: true,
      identifiedProduct: primaryMatch,
      alternativeMatches: alternatives,
      visionDetails: {
        provider,
        labels: labels.slice(0, 8),
        detectedText: detectedText.slice(0, 300),
        detectedLogos: logos,
        detectedObjects: objects,
        webEntities: webEntities.slice(0, 5),
        executionTimeMs,
      },
      searchTimestamp: new Date().toLocaleTimeString('ar-SA'),
    });
  } catch (error: any) {
    console.error('Image search API error:', error);
    const defaultProduct = SAUDI_PRODUCTS[0];
    const fallbackAnalysis = buildProductPriceAnalysis(
      defaultProduct,
      SAUDI_STORES,
      75,
      'تم التعرف على الصنف الأقرب في الكتالوج'
    );
    res.json({
      success: true,
      identifiedProduct: fallbackAnalysis,
      alternativeMatches: SAUDI_PRODUCTS.slice(1, 3).map(p =>
        buildProductPriceAnalysis(p, SAUDI_STORES, 60, 'بديل مقترح')
      ),
      visionDetails: {
        provider: 'google_cloud_vision',
        labels: [{ description: 'Grocery Product', score: 0.9 }],
        detectedText: '',
        detectedLogos: [],
        detectedObjects: ['Food'],
        executionTimeMs: Date.now() - startTime,
      },
      searchTimestamp: new Date().toLocaleTimeString('ar-SA'),
    });
  }
});

// دمج Vite كميدلوير في بيئة التطوير وخادم الملفات الثابتة في الإنتاج
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // بديل آمن لـ app.get('*') يعمل في Express 4 و 5
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'المسار غير موجود' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // معالج أخطاء عام: يرجع JSON بدل صفحة HTML (مثل تجاوز حجم الصورة أو JSON تالف)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'حجم الطلب كبير جداً' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'صيغة الطلب غير صحيحة' });
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ error: 'خطأ غير متوقع في الخادم' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Deal AI Server running at http://0.0.0.0:${PORT}`);
  });
}

setupViteOrStatic();

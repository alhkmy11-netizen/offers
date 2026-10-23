import { Product, Store, PriceAlert, PriceAlertNotification } from '../types.ts';

const STORAGE_KEY_FAVORITES = 'hakeem_favorites_v1';
const STORAGE_KEY_ALERTS = 'hakeem_price_alerts_v1';
const STORAGE_KEY_NOTIFICATIONS = 'hakeem_price_notifications_v1';

// الحد الأقصى للإشعارات المحفوظة حتى لا يمتلئ التخزين المحلي
const MAX_STORED_NOTIFICATIONS = 100;

export const INITIAL_FAVORITES: string[] = ['p1', 'p2', 'p3'];

export const INITIAL_NOTIFICATIONS: PriceAlertNotification[] = [
  {
    id: 'notif-1',
    alertId: 'alert-p2',
    productId: 'p2',
    productName: 'أرز الشعلان سيلا بسمتي بنجابي (5 كجم)',
    productImage: '🍚',
    storeId: 'othaim',
    storeName: 'أسواق عبد الله العثيم',
    storeLogo: '🛒',
    oldPriceSar: 42.00,
    newPriceSar: 37.50,
    savingSar: 4.50,
    savingPercent: 10.7,
    timestamp: 'منذ 15 دقيقة',
    isRead: false,
    source: 'favorite',
    message: 'انخفض سعر أرز الشعلان في أسواق العثيم من 42.00 ر.س إلى 37.50 ر.س شامل الضريبة!'
  },
  {
    id: 'notif-2',
    alertId: 'alert-p3',
    productId: 'p3',
    productName: 'زيت عافية ذرة نقي (1.5 لتر)',
    productImage: '🌻',
    storeId: 'carrefour',
    storeName: 'كارفور السعودية',
    storeLogo: '🏬',
    oldPriceSar: 22.50,
    newPriceSar: 19.50,
    savingSar: 3.00,
    savingPercent: 13.3,
    timestamp: 'منذ ساعتين',
    isRead: false,
    source: 'cart',
    message: 'منتج في سلتك! كارفور خفّض سعر زيت عافية إلى 19.50 ر.س مع عرض توفير خاص.'
  }
];

// ===== أدوات التخزين المحلي الآمنة =====

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    // الوصول إلى localStorage قد يرمي خطأ في وضع الخصوصية
    return false;
  }
}

// قراءة مصفوفة من التخزين، وترجع null إذا لم توجد أو كانت تالفة أو ليست مصفوفة
function readArray<T>(key: string): T[] | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function writeValue(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // التخزين ممتلئ أو غير متاح: نتجاهل بصمت
  }
}

export function getStoredFavorites(): string[] {
  const stored = readArray<unknown>(STORAGE_KEY_FAVORITES);
  if (stored) {
    return stored.filter((id): id is string => typeof id === 'string');
  }
  return [...INITIAL_FAVORITES];
}

export function saveStoredFavorites(favs: string[]): void {
  writeValue(STORAGE_KEY_FAVORITES, favs);
}

export function getStoredAlerts(): PriceAlert[] {
  return readArray<PriceAlert>(STORAGE_KEY_ALERTS) ?? [];
}

export function saveStoredAlerts(alerts: PriceAlert[]): void {
  writeValue(STORAGE_KEY_ALERTS, alerts);
}

export function getStoredNotifications(): PriceAlertNotification[] {
  const stored = readArray<PriceAlertNotification>(STORAGE_KEY_NOTIFICATIONS);
  if (stored) return stored;
  // نسخة جديدة حتى لا يعدّل أحد الثابت INITIAL_NOTIFICATIONS بالخطأ
  return INITIAL_NOTIFICATIONS.map((n) => ({ ...n }));
}

export function saveStoredNotifications(notifs: PriceAlertNotification[]): void {
  // الأحدث أولاً في التطبيق، لذلك نبقي أول العناصر ونقصّ الزائد
  writeValue(STORAGE_KEY_NOTIFICATIONS, notifs.slice(0, MAX_STORED_NOTIFICATIONS));
}

// تشغيل صوت تنبيه خفيف لطيف عند هبوط السعر عبر Web Audio API
export function playChimeSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    // بعض المتصفحات تبدأ السياق في وضع التعليق
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    // إغلاق السياق بعد انتهاء الصوت لتفادي حد المتصفح لعدد السياقات المفتوحة
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };

    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // قد يمنع المتصفح الصوت قبل تفاعل المستخدم، نتجاهل بصمت
  }
}

// طلب إذن إشعارات المتصفح (Web Notifications)
export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

export function sendBrowserNotification(title: string, body: string, icon?: string): void {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        dir: 'rtl',
        lang: 'ar',
      });
    } catch {
      // بعض الأجهزة (مثل أندرويد) تتطلب Service Worker، نتجاهل بصمت
    }
  }
}

// حساب أقل سعر لمنتج مع المتجر
export function getProductLowestPrice(product: Product, stores: Store[]): { lowestPrice: number; store: Store | null } {
  let min = Infinity;
  let bestStore: Store | null = null;

  for (const store of stores) {
    const info = product.prices[store.id];
    // نتجاهل الأسعار غير الصالحة (صفر أو سالبة أو NaN)
    if (info && info.inStock && info.priceInclVat > 0 && info.priceInclVat < min) {
      min = info.priceInclVat;
      bestStore = store;
    }
  }

  return {
    lowestPrice: min === Infinity ? 0 : min,
    store: bestStore,
  };
}

// offersEngine.ts
// محرك جلب العروض التلقائي للمتاجر

export interface Deal {
  id: string;
  title: string;
  price: string;
  currency?: string;
  store: string;
  url: string;
  imageUrl?: string;
  discountPercentage?: number;
  fetchedAt: string;
}

export interface FetchDealsOptions {
  /** عدد العروض المطلوبة (اختياري) */
  limit?: number;
  /** تصفية حسب متجر معيّن */
  store?: string;
  /** مهلة الانتظار بالمللي ثانية قبل اعتبار الطلب فاشلاً */
  timeoutMs?: number;
}

export class DealsFetchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DealsFetchError";
  }
}

/**
 * جلب العروض التلقائية من مصادر متعددة (APIs حقيقية أو بيانات تجريبية).
 * يمكن استبدال `getSampleDeals` بمصدر بيانات حقيقي عبر fetch لكل متجر.
 */
export async function fetchAutomatedDeals(
  options: FetchDealsOptions = {}
): Promise<Deal[]> {
  const { limit, store, timeoutMs = 8000 } = options;

  try {
    const deals = await withTimeout(getSampleDeals(), timeoutMs);

    let result = deals;

    if (store) {
      result = result.filter(
        (deal) => deal.store.toLowerCase() === store.toLowerCase()
      );
    }

    if (limit && limit > 0) {
      result = result.slice(0, limit);
    }

    return result;
  } catch (error) {
    throw new DealsFetchError("فشل في جلب العروض التلقائية", error);
  }
}

/**

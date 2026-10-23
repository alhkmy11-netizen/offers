import {
  Store,
  Product,
  Coupon,
  CartItem,
  StoreBasketEvaluation,
  SplitStoreAllocation,
  SmartSplitEvaluation,
  CartOptimizationResponse,
} from '../types.ts';
import { SAUDI_STORES, SAUDI_PRODUCTS, SAUDI_COUPONS } from '../data/saudiData.ts';

export const SAUDI_VAT_PERCENT = 15;

const round2 = (n: number): number => Number(n.toFixed(2));

// تجاهل الكميات غير الصالحة (صفر أو سالبة أو NaN)
function isValidQuantity(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && q > 0;
}

/**
 * دالة لحساب الخصم الأفضل بناءً على الكوبونات المتاحة للمتجر
 */
export function findBestCoupon(storeId: string, subtotalInclVat: number, coupons: Coupon[]): { coupon: Coupon | undefined; discount: number } {
  const storeCoupons = coupons.filter(c => c.storeId === storeId && subtotalInclVat >= c.minSpend);
  if (storeCoupons.length === 0) {
    return { coupon: undefined, discount: 0 };
  }

  let bestCoupon: Coupon | undefined = undefined;
  let maxDiscount = 0;

  for (const coupon of storeCoupons) {
    let discount = 0;
    if (coupon.discountType === 'FIXED') {
      discount = Math.min(coupon.discountValue, subtotalInclVat);
    } else {
      discount = (subtotalInclVat * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }

    if (discount > maxDiscount) {
      maxDiscount = discount;
      bestCoupon = coupon;
    }
  }

  return { coupon: bestCoupon, discount: round2(maxDiscount) };
}

/**
 * حساب تكلفة متجر واحد (توصيل + كوبون + إجمالي) لمبلغ معيّن
 */
function calcStoreCost(store: Store, subtotalInclVat: number, coupons: Coupon[]) {
  const deliveryFee =
    subtotalInclVat === 0 || subtotalInclVat >= store.freeDeliveryThreshold ? 0 : store.deliveryFee;
  const { coupon, discount } = findBestCoupon(store.id, subtotalInclVat, coupons);
  const total = round2(Math.max(0, subtotalInclVat + deliveryFee - discount));
  return { deliveryFee, coupon, discount, total };
}

/**
 * خوارزمية تقييم سلة المتجر الواحد لجميع المتاجر في المملكة
 */
export function evaluateSingleStoreBaskets(
  cart: CartItem[],
  products: Product[] = SAUDI_PRODUCTS,
  stores: Store[] = SAUDI_STORES,
  coupons: Coupon[] = SAUDI_COUPONS
): StoreBasketEvaluation[] {
  const evaluations: StoreBasketEvaluation[] = [];
  const productsById = new Map(products.map(p => [p.id, p]));

  for (const store of stores) {
    let itemsSubtotalInclVat = 0;
    let availableItemsCount = 0;
    const missingItems: string[] = [];

    for (const item of cart) {
      if (!isValidQuantity(item.quantity)) continue;
      const product = productsById.get(item.productId);
      if (!product) continue;

      const storePrice = product.prices[store.id];
      if (storePrice && storePrice.inStock) {
        itemsSubtotalInclVat += storePrice.priceInclVat * item.quantity;
        availableItemsCount++;
      } else {
        missingItems.push(product.nameAr);
      }
    }

    itemsSubtotalInclVat = round2(itemsSubtotalInclVat);

    // في النظام السعودي، السعر المعروض شامل الضريبة 15%
    // الضريبة = السعر الإجمالي - (السعر الإجمالي / 1.15)
    const itemsSubtotalExclVat = round2(itemsSubtotalInclVat / (1 + SAUDI_VAT_PERCENT / 100));
    const vatAmount = round2(itemsSubtotalInclVat - itemsSubtotalExclVat);

    const { deliveryFee, coupon: appliedCoupon, discount: couponDiscount, total: grandTotal } =
      calcStoreCost(store, itemsSubtotalInclVat, coupons);

    evaluations.push({
      store,
      itemsSubtotalExclVat,
      vatAmount,
      itemsSubtotalInclVat,
      deliveryFee,
      couponDiscount,
      appliedCoupon,
      grandTotal,
      availableItemsCount,
      missingItemsCount: missingItems.length,
      missingItems,
    });
  }

  // الترتيب: الأقل نقصاً في الأصناف أولاً، ثم الأقل سعراً
  // (حتى لا يُعتبر متجر ينقصه نصف السلة "الأرخص" لمجرد أن مجموعه أقل)
  evaluations.sort((a, b) => {
    if (a.missingItemsCount !== b.missingItemsCount) {
      return a.missingItemsCount - b.missingItemsCount;
    }
    return a.grandTotal - b.grandTotal;
  });

  if (evaluations.length > 0) {
    evaluations[0].isCheapestSingleStore = true;
  }

  return evaluations;
}

type AllocItem = {
  product: Product;
  quantity: number;
  unitPriceInclVat: number;
  unitPriceExclVat: number;
  totalItemPriceInclVat: number;
};

type AllocEntry = { store: Store; items: AllocItem[] };

const sumItems = (items: AllocItem[]): number =>
  round2(items.reduce((acc, curr) => acc + curr.totalItemPriceInclVat, 0));

/**
 * اختبار الجدوى الاقتصادية (Consolidation Heuristic):
 * إذا كان نقل كل سلع متجر صغير إلى متجر آخر يخفض الإجمالي (بسبب رسوم التوصيل أو الكوبونات)
 * ننقلها، ونكرر حتى لا يبقى تحسين ممكن. لا يُنقل شيء إلا إذا كانت كل السلع متوفرة في المتجر الهدف.
 */
function consolidateAllocations(entries: AllocEntry[], coupons: Coupon[]): AllocEntry[] {
  let guard = 0;

  while (entries.length > 1 && guard++ < 20) {
    const totalOf = (e: AllocEntry) => calcStoreCost(e.store, sumItems(e.items), coupons).total;
    const currentTotal = entries.reduce((acc, e) => acc + totalOf(e), 0);

    let best: { sourceIdx: number; targetIdx: number; newTargetItems: AllocItem[]; newTotal: number } | null = null;

    for (let s = 0; s < entries.length; s++) {
      for (let t = 0; t < entries.length; t++) {
        if (s === t) continue;
        const source = entries[s];
        const target = entries[t];

        const moved: AllocItem[] = [];
        let canMoveAll = true;
        for (const it of source.items) {
          const info = it.product.prices[target.store.id];
          if (!info || !info.inStock) {
            canMoveAll = false;
            break;
          }
          moved.push({
            ...it,
            unitPriceInclVat: info.priceInclVat,
            unitPriceExclVat: info.priceExclVat,
            totalItemPriceInclVat: round2(info.priceInclVat * it.quantity),
          });
        }
        if (!canMoveAll) continue;

        const newTargetItems = [...target.items, ...moved];
        const newTargetTotal = calcStoreCost(target.store, sumItems(newTargetItems), coupons).total;
        const newTotal = currentTotal - totalOf(source) - totalOf(target) + newTargetTotal;

        if (newTotal < currentTotal - 0.005 && (!best || newTotal < best.newTotal)) {
          best = { sourceIdx: s, targetIdx: t, newTargetItems, newTotal };
        }
      }
    }

    if (!best) break;

    entries[best.targetIdx].items = best.newTargetItems;
    entries.splice(best.sourceIdx, 1);
  }

  return entries;
}

/**
 * خوارزمية التوزيع الذكي (Multi-Store Smart Split)
 * تقوم بتحليل كل منتج وتوجيهه للمتجر الأرخص، مع اختبار ما إذا كانت رسوم التوصيل الإضافية تلغي التوفير
 */
export function evaluateSmartSplitBasket(
  cart: CartItem[],
  singleBestTotal: number,
  products: Product[] = SAUDI_PRODUCTS,
  stores: Store[] = SAUDI_STORES,
  coupons: Coupon[] = SAUDI_COUPONS
): SmartSplitEvaluation {
  const productsById = new Map(products.map(p => [p.id, p]));

  // الخطوة 1: تخصيص كل منتج للمتجر الذي يقدم أقل سعر شامل الضريبة
  const storeAllocationsMap: Record<string, AllocEntry> = {};

  for (const item of cart) {
    if (!isValidQuantity(item.quantity)) continue;
    const product = productsById.get(item.productId);
    if (!product) continue;

    let bestStore: Store | null = null;
    let lowestPrice = Infinity;
    let bestExclVat = 0;

    for (const store of stores) {
      const pInfo = product.prices[store.id];
      if (pInfo && pInfo.inStock && pInfo.priceInclVat < lowestPrice) {
        lowestPrice = pInfo.priceInclVat;
        bestExclVat = pInfo.priceExclVat;
        bestStore = store;
      }
    }

    if (bestStore) {
      if (!storeAllocationsMap[bestStore.id]) {
        storeAllocationsMap[bestStore.id] = {
          store: bestStore,
          items: [],
        };
      }
      storeAllocationsMap[bestStore.id].items.push({
        product,
        quantity: item.quantity,
        unitPriceInclVat: lowestPrice,
        unitPriceExclVat: bestExclVat,
        totalItemPriceInclVat: round2(lowestPrice * item.quantity),
      });
    }
  }

  // الخطوة 2: دمج المتاجر الصغيرة إذا كان ذلك يخفض الإجمالي
  const entries = consolidateAllocations(Object.values(storeAllocationsMap), coupons);

  // الخطوة 3: حساب التكاليف النهائية لكل متجر
  const finalizedAllocations: SplitStoreAllocation[] = [];
  let totalItemsCostInclVat = 0;
  let totalDeliveryFees = 0;
  let totalCouponSavings = 0;

  for (const alloc of entries) {
    const subtotalInclVat = sumItems(alloc.items);
    const subtotalExclVat = round2(subtotalInclVat / (1 + SAUDI_VAT_PERCENT / 100));
    const vatAmount = round2(subtotalInclVat - subtotalExclVat);

    const { deliveryFee, coupon: appliedCoupon, discount: couponDiscount, total: storeTotal } =
      calcStoreCost(alloc.store, subtotalInclVat, coupons);

    totalItemsCostInclVat += subtotalInclVat;
    totalDeliveryFees += deliveryFee;
    totalCouponSavings += couponDiscount;

    finalizedAllocations.push({
      store: alloc.store,
      items: alloc.items,
      subtotalInclVat,
      subtotalExclVat,
      vatAmount,
      deliveryFee,
      couponDiscount,
      appliedCoupon,
      storeTotal,
    });
  }

  const grandTotal = round2(Math.max(0, totalItemsCostInclVat + totalDeliveryFees - totalCouponSavings));
  const totalVat = round2(totalItemsCostInclVat - totalItemsCostInclVat / (1 + SAUDI_VAT_PERCENT / 100));
  const netSavingsVsSingleStore = round2(Math.max(0, singleBestTotal - grandTotal));
  const savingsPercentage = singleBestTotal > 0 ? Number(((netSavingsVsSingleStore / singleBestTotal) * 100).toFixed(1)) : 0;

  return {
    storeAllocations: finalizedAllocations,
    totalItemsCostInclVat: round2(totalItemsCostInclVat),
    totalVat,
    totalDeliveryFees: round2(totalDeliveryFees),
    totalCouponSavings: round2(totalCouponSavings),
    grandTotal,
    netSavingsVsSingleStore,
    savingsPercentage,
  };
}

/**
 * تشغيل عملية التحسين الكاملة للسلة
 */
export function runCartOptimization(
  cart: CartItem[],
  products: Product[] = SAUDI_PRODUCTS,
  stores: Store[] = SAUDI_STORES,
  coupons: Coupon[] = SAUDI_COUPONS
): CartOptimizationResponse {
  const singleStoreEvaluations = evaluateSingleStoreBaskets(cart, products, stores, coupons);
  const bestSingleStore = singleStoreEvaluations.length > 0 ? singleStoreEvaluations[0] : null;
  const singleBestTotal = bestSingleStore ? bestSingleStore.grandTotal : 0;

  const smartSplit = evaluateSmartSplitBasket(cart, singleBestTotal, products, stores, coupons);

  return {
    singleStoreEvaluations,
    bestSingleStore,
    smartSplit,
    timestamp: new Date().toISOString(),
  };
}

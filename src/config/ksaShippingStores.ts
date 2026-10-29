export type Market = "saudi" | "us" | "china";

export interface StoreConfig {
  id: string;
  name: string;
  group: "amazon" | "noon" | "jarir" | "other";
  market: Market;
  shipsToKSA: boolean;
  shippingNote?: string;
}

// أضف أو احذف متجرًا من هنا فقط
export const STORES: StoreConfig[] = [
  { id: "amazon_sa", name: "Amazon SA", group: "amazon", market: "saudi", shipsToKSA: true },
  { id: "noon", name: "Noon", group: "noon", market: "saudi", shipsToKSA: true },
  { id: "jarir", name: "Jarir", group: "jarir", market: "saudi", shipsToKSA: true },

  { id: "amazon_us", name: "Amazon US", group: "amazon", market: "us", shipsToKSA: true,
    shippingNote: "شحن دولي 7–14 يوم، وقد تُضاف جمارك 5% تقريبًا" },
  { id: "apple_us", name: "Apple", group: "other", market: "us", shipsToKSA: true },
  { id: "bestbuy", name: "Best Buy", group: "other", market: "us", shipsToKSA: false },
  { id: "walmart", name: "Walmart", group: "other", market: "us", shipsToKSA: false },
  { id: "target", name: "Target", group: "other", market: "us", shipsToKSA: false },

  { id: "aliexpress", name: "AliExpress", group: "other", market: "china", shipsToKSA: true,
    shippingNote: "10–25 يوم، قد تُطبق رسوم جمركية" },
  { id: "temu", name: "Temu", group: "other", market: "china", shipsToKSA: true },
  { id: "shein", name: "SHEIN", group: "other", market: "china", shipsToKSA: true },
  { id: "banggood", name: "Banggood", group: "other", market: "china", shipsToKSA: true },
  { id: "jd_worldwide", name: "JD Worldwide", group: "other", market: "china", shipsToKSA: true },
  { id: "xiaomi_global", name: "Xiaomi Global", group: "other", market: "china", shipsToKSA: true },
];

export const USD_TO_SAR = 3.75;

export const storeById = (id: string) => STORES.find((s) => s.id === id);

export const isAllowed = (id: string) => {
  const s = storeById(id);
  return !!s && (s.market === "saudi" || s.shipsToKSA);
};

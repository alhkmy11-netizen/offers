import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Offer = {
  id: string;
  title: string;
  image_url?: string;
  price?: number;
  url?: string;
  source: "merchant" | "external";
};

async function fetchExternal(category: string): Promise<Offer[]> {
  try {
    const res = await fetch(`/api/external-offers?category=${category}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return []; // فشل المصدر الخارجي لا يكسر الصفحة
  }
}

export function useOffers(category: string) {
  return useQuery({
    queryKey: ["offers", category],
    queryFn: async () => {
      const { data: merchant } = await supabase
        .from("offers")
        .select("id,title,image_url,price,url")
        .eq("category", category)
        .eq("status", "published")
        .eq("is_active", true);

      const external = await fetchExternal(category);

      const all: Offer[] = [
        ...(merchant ?? []).map((o) => ({ ...o, source: "merchant" as const })),
        ...external.map((o) => ({ ...o, source: "external" as const })),
      ];

      // إزالة التكرار بناءً على الرابط أو المعرف
      return Array.from(new Map(all.map((o) => [o.url ?? o.id, o])).values());
    },
    staleTime: 60_000,
  });
}

import { useOffers } from "@/hooks/useOffers";

export default function OffersSection({ category, title }: { category: string; title: string }) {
  const { data: offers = [], isLoading } = useOffers(category);

  if (isLoading) return <div className="p-6 animate-pulse text-center">جاري تحميل العروض...</div>;

  if (offers.length === 0) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold text-green-700">{title}</h2>
        <p className="mt-3 text-gray-500">
          نعمل على إضافة أفضل عروض {title} قريباً، تصفّح الأقسام الأخرى الآن.
        </p>
        <a href="/offers" className="inline-block mt-4 px-5 py-2 rounded-full bg-green-600 text-white font-medium shadow">
          تصفّح كل العروض
        </a>
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-3">
      {offers.map((o) => (
        <a key={o.id} href={o.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl border p-2 shadow-sm bg-white block">
          {o.image_url && <img src={o.image_url} alt={o.title} className="rounded-xl w-full h-32 object-cover" />}
          <div className="mt-2 text-sm font-medium line-clamp-2">{o.title}</div>
          {o.price != null && <div className="text-green-700 font-bold mt-1">${o.price}</div>}
        </a>
      ))}
    </div>
  );
}

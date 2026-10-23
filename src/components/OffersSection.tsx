import { useOffers } from "@/hooks/useOffers";

type Props = {
  category: string;
  title: string;
  hideWhenEmpty?: boolean;
};

export default function OffersSection({ category, title, hideWhenEmpty = false }: Props) {
  const { data: offers = [], isLoading, isError } = useOffers(category);

  if (isLoading) {
    return <div className="p-6 animate-pulse text-center">جاري تحميل العروض...</div>;
  }

  if (isError) {
    return <div className="p-6 text-center text-red-600">تعذّر تحميل العروض، حاول لاحقاً.</div>;
  }

  if (offers.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className="p-6 text-center">
        <h2 className="text-2xl font-bold text-green-700">{title}</h2>
        <p className="mt-3 text-gray-500">نعمل على إضافة أفضل عروض {title} قريباً.</p>
        <a href="/offers" className="inline-block mt-4 px-5 py-2 rounded-full bg-green-600 text-white font-medium shadow">
          تصفّح كل العروض
        </a>
      </div>
    );
  }

  return (
    <section>
      <h2 className="px-4 pt-4 text-2xl font-bold text-green-700">{title}</h2>
      <div className="p-4 grid grid-cols-2 gap-3">
        {offers.map((o) => {
          const card = (
            <>
              {o.image_url && (
                <img src={o.image_url} alt={o.title} loading="lazy" className="rounded-xl w-full h-32 object-cover" />
              )}
              <div className="mt-2 text-sm font-medium line-clamp-2">{o.title}</div>
              {o.price != null && <div className="text-green-700 font-bold mt-1">${o.price}</div>}
            </>
          );
          const cls = "rounded-2xl border p-2 shadow-sm bg-white block";
          return o.url ? (
            <a key={o.id} href={o.url} target="_blank" rel="noopener noreferrer" className={cls}>
              {card}
            </a>
          ) : (
            <div key={o.id} className={cls}>{card}</div>
          );
        })}
      </div>
    </section>
  );
}

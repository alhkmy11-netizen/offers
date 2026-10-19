import feedparser
import json
from datetime import datetime, timezone

# مصادر عامة للعروض (RSS). أضف/غيّر حسب حاجتك.
FEEDS = [
    "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1",
    "https://www.dealnews.com/rss/",
]

def is_discount(title: str) -> bool:
    """فلترة بسيطة: نرجّع فقط العناوين اللي فيها إشارة لخصم حقيقي."""
    keywords = ["%", "off", "deal", "discount", "coupon", "خصم", "عرض", "تخفيض"]
    t = title.lower()
    return any(k in t for k in keywords)

def fetch_deals():
    results = []
    for url in FEEDS:
        feed = feedparser.parse(url)
        for entry in feed.entries:
            title = entry.get("title", "").strip()
            if not title or not is_discount(title):
                continue
            results.append({
                "title": title,
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
                "source": feed.feed.get("title", url),
            })
    return results

def main():
    deals = fetch_deals()
    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(deals),
        "deals": deals,
    }
    with open("deals.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"✅ تم جلب {len(deals)} عرض")

if __name__ == "__main__":
    main()

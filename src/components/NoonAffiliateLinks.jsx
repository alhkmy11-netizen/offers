import React from 'react';

const NoonAffiliateLinks = () => {
  // الروابط المخصصة وحملات الشركاء المستخرجة من لوحة تحكم نون
  const affiliateLinks = [
    {
      title: 'Homepage KSA',
      url: 'https://www.noon.com/saudi-en/?af_code=...', // ضع رابط الشريك الفعلي هنا
      tag: 'Shared'
    },
    {
      title: 'Hkeeeem Custom Link',
      url: 'https://www.noon.com/...', // رابطك المخصص Hkeeeem
      tag: 'Custom Link'
    },
    {
      title: 'IPHONE18 Custom Link',
      url: 'https://www.noon.com/...', // رابطك المخصص IPHONE18
      tag: 'Custom Link'
    }
  ];

  return (
    <div className="p-4 bg-black text-gold rounded-lg border border-gold">
      <h3 className="text-xl font-bold mb-4">روابط وعروض نون (حكيم AI)</h3>
      <div className="space-y-3">
        {affiliateLinks.map((item, index) => (
          <div key={index} className="flex justify-between items-center p-3 bg-gray-900 rounded-md">
            <div>
              <span className="font-semibold text-white">{item.title}</span>
              <span className="ml-2 text-xs px-2 py-1 bg-green-800 text-white rounded">{item.tag}</span>
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gold text-black font-bold rounded hover:opacity-90"
            >
              نسخ / زيارة الرابط
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NoonAffiliateLinks;

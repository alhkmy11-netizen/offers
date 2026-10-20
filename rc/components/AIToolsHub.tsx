import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  MessageSquare,
  Brain,
  Globe,
  Zap,
  Search,
  Rocket,
  Star,
  ExternalLink,
  Heart,
  Award,
  Terminal,
  Cpu,
  Image as ImageIcon,
  Video,
  Music,
  PenTool,
  Mic,
  Layers,
  TrendingUp,
  Sparkle,
} from 'lucide-react';

// ==========================================
// 1. قائمة أدوات الذكاء الاصطناعي العالمية + تطبيقنا
// ==========================================
const globalAiTools = [
  {
    name: 'Alhkmy.app',
    description: 'منصة حكيم AI الذكية — عروض، مقارنة أسعار، سيارات، عقارات، وأدوات ذكاء اصطناعي',
    url: 'https://alhkmy.app',
    color: 'from-amber-400 via-yellow-400 to-amber-500',
    icon: <Rocket className="w-8 h-8" />,
    isFeatured: true,
    category: 'الكل',
  },
  {
    name: 'Gemini',
    description: 'مساعد جوجل الذكي',
    url: 'https://gemini.google.com',
    color: 'from-blue-500 to-purple-500',
    icon: <Sparkles className="w-6 h-6" />,
    category: 'محادثة',
  },
  {
    name: 'ChatGPT',
    description: 'مساعد OpenAI',
    url: 'https://chat.openai.com',
    color: 'from-emerald-500 to-teal-500',
    icon: <MessageSquare className="w-6 h-6" />,
    category: 'محادثة',
  },
  {
    name: 'Claude',
    description: 'مساعد Anthropic',
    url: 'https://claude.ai',
    color: 'from-orange-500 to-amber-500',
    icon: <Brain className="w-6 h-6" />,
    category: 'محادثة',
  },
  {
    name: 'Meta AI',
    description: 'مساعد ميتا الذكي',
    url: 'https://www.meta.ai',
    color: 'from-blue-600 to-indigo-600',
    icon: <Globe className="w-6 h-6" />,
    category: 'محادثة',
  },
  {
    name: 'Grok',
    description: 'مساعد xAI',
    url: 'https://grok.com',
    color: 'from-slate-700 to-slate-900',
    icon: <Zap className="w-6 h-6" />,
    category: 'محادثة',
  },
  {
    name: 'Genspark',
    description: 'محرك بحث ذكي',
    url: 'https://www.genspark.ai',
    color: 'from-pink-500 to-rose-500',
    icon: <Search className="w-6 h-6" />,
    category: 'بحث',
  },
  {
    name: 'Perplexity',
    description: 'بحث بالذكاء الاصطناعي',
    url: 'https://www.perplexity.ai',
    color: 'from-cyan-500 to-blue-500',
    icon: <Search className="w-6 h-6" />,
    category: 'بحث',
  },
  {
    name: 'Google AI Studio',
    description: 'استوديو بناء التطبيقات',
    url: 'https://aistudio.google.com',
    color: 'from-amber-500 to-orange-500',
    icon: <Terminal className="w-6 h-6" />,
    category: 'إنتاجية',
  },
  {
    name: 'Midjourney',
    description: 'توليد صور فنية احترافية',
    url: 'https://www.midjourney.com',
    color: 'from-indigo-500 to-violet-600',
    icon: <ImageIcon className="w-6 h-6" />,
    category: 'صور',
    isNew: true,
  },
  {
    name: 'DALL·E',
    description: 'توليد صور من OpenAI',
    url: 'https://openai.com/dall-e-3',
    color: 'from-teal-500 to-emerald-600',
    icon: <PenTool className="w-6 h-6" />,
    category: 'صور',
    isNew: true,
  },
  {
    name: 'Runway',
    description: 'توليد وتحرير فيديو بالذكاء الاصطناعي',
    url: 'https://runwayml.com',
    color: 'from-rose-500 to-pink-600',
    icon: <Video className="w-6 h-6" />,
    category: 'فيديو',
    isNew: true,
  },
  {
    name: 'ElevenLabs',
    description: 'توليد أصوات وتحويل نص لصوت',
    url: 'https://elevenlabs.io',
    color: 'from-purple-500 to-fuchsia-600',
    icon: <Mic className="w-6 h-6" />,
    category: 'صوت',
    isNew: true,
  },
  {
    name: 'Copilot',
    description: 'مساعد مايكروسوفت الذكي',
    url: 'https://copilot.microsoft.com',
    color: 'from-sky-500 to-blue-600',
    icon: <Cpu className="w-6 h-6" />,
    category: 'إنتاجية',
    isNew: true,
  },
  {
    name: 'Notion AI',
    description: 'مساعد ذكي للكتابة والتنظيم',
    url: 'https://www.notion.so/product/ai',
    color: 'from-slate-600 to-gray-800',
    icon: <Layers className="w-6 h-6" />,
    category: 'إنتاجية',
    isNew: true,
  },
  {
    name: 'Canva AI',
    description: 'تصميم جرافيك ذكي وسهل',
    url: 'https://www.canva.com/ai-image-generator',
    color: 'from-cyan-400 to-sky-500',
    icon: <Sparkle className="w-6 h-6" />,
    category: 'صور',
    isNew: true,
  },
];

const categories = ['الكل', 'محادثة', 'بحث', 'صور', 'فيديو', 'صوت', 'إنتاجية'];

// ==========================================
// 2. قائمة الجهات التي ساهمت في البناء
// ==========================================
const contributors = [
  { name: 'Google AI Studio', icon: <Terminal className="w-4 h-4" /> },
  { name: 'Gemini', icon: <Sparkles className="w-4 h-4" /> },
  { name: 'ChatGPT', icon: <MessageSquare className="w-4 h-4" /> },
  { name: 'Claude', icon: <Brain className="w-4 h-4" /> },
  { name: 'Meta AI', icon: <Globe className="w-4 h-4" /> },
  { name: 'Genspark', icon: <Search className="w-4 h-4" /> },
  { name: 'Grok', icon: <Zap className="w-4 h-4" /> },
  { name: 'Vercel', icon: <Cpu className="w-4 h-4" /> },
  { name: 'GitHub', icon: <Terminal className="w-4 h-4" /> },
];

// ==========================================
// 3. المكون الرئيسي
// ==========================================
export default function AiToolsHub() {
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTools = useMemo(() => {
    return globalAiTools.filter((tool) => {
      const matchesCategory =
        activeCategory === 'الكل' || tool.category === activeCategory || tool.isFeatured;
      const matchesSearch =
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tool.description.includes(searchTerm);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchTerm]);

  return (
    <div className="w-full bg-gradient-to-b from-slate-50 to-emerald-50/30 py-16 px-4" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* ========== القسم 1: أدوات الذكاء الاصطناعي ========== */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 bg-emerald-100 text-emerald-800 px-6 py-2 rounded-full mb-4">
              <Sparkles className="w-5 h-5" />
              <span className="font-bold">مركز الأدوات الذكية</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-3">
              أدوات الذكاء الاصطناعي العالمية
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              اختر أداتك المفضلة وابدأ الإبداع مباشرة — كل الأدوات في مكان واحد
            </p>

            {/* إحصائية بسيطة */}
            <div className="inline-flex items-center gap-2 mt-5 bg-white border border-emerald-200 px-5 py-2 rounded-full shadow-sm">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-slate-700 text-sm">
                {globalAiTools.length} أداة ذكاء اصطناعي متاحة الآن
              </span>
            </div>
          </div>

          {/* حقل البحث */}
          <div className="max-w-md mx-auto mb-6">
            <div className="relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن أداة..."
                className="w-full pr-12 pl-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-400 focus:outline-none transition-colors text-slate-700"
              />
            </div>
          </div>

          {/* فلاتر التصنيف */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2 rounded-full font-semibold text-sm transition-all ${
                  activeCategory === cat
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* شبكة البطاقات */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredTools.map((tool, index) => (
              <a
                key={index}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`
                  group relative bg-white rounded-2xl p-6 shadow-sm
                  transition-all duration-300 transform hover:-translate-y-2
                  ${tool.isFeatured
                    ? 'col-span-2 row-span-2 border-2 border-amber-400 shadow-xl shadow-amber-100 ring-2 ring-amber-200/50'
                    : 'border-2 border-transparent hover:border-emerald-400 hover:shadow-xl'
                  }
                `}
              >
                {/* شارة "تطبيقنا" للمميز */}
                {tool.isFeatured && (
                  <div className="absolute -top-3 -right-3 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1 z-10">
                    <Star className="w-3 h-3 fill-current" />
                    <span>تطبيقنا</span>
                  </div>
                )}

                {/* شارة "جديد" للأدوات المضافة حديثاً */}
                {tool.isNew && !tool.isFeatured && (
                  <div className="absolute -top-2 -left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md z-10">
                    جديد
                  </div>
                )}

                {/* المحتوى بتصميم مختلف للبطاقة المميزة */}
                {tool.isFeatured ? (
                  <div className="flex flex-col justify-between h-full">
                    <div>
                      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${tool.color} flex items-center justify-center text-white mb-6 shadow-lg group-hover:scale-105 transition-transform`}>
                        {tool.icon}
                      </div>
                      <h3 className="font-black text-2xl md:text-3xl mb-3 text-amber-700">
                        {tool.name}
                      </h3>
                      <p className="text-slate-600 text-base md:text-lg mb-6 leading-relaxed">
                        {tool.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold text-lg py-3 px-6 rounded-xl shadow-md group-hover:shadow-lg transition-all">
                      <Rocket className="w-5 h-5" />
                      <span>جرّب التطبيق الآن</span>
                      <ExternalLink className="w-5 h-5" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center text-white mb-4 shadow-md group-hover:scale-110 transition-transform`}>
                      {tool.icon}
                    </div>
                    <h3 className="font-bold text-lg mb-1 text-slate-900">
                      {tool.name}
                    </h3>
                    <p className="text-slate-500 text-sm mb-3">
                      {tool.description}
                    </p>
                    <div className="flex items-center gap-1 font-semibold text-sm text-emerald-600 group-hover:gap-2 transition-all">
                      <span>افتح الأداة</span>
                      <ExternalLink className="w-4 h-4" />
                    </div>
                  </>
                )}
              </a>
            ))}
          </div>

          {filteredTools.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              لا توجد أدوات مطابقة لبحثك 🔍
            </div>
          )}
        </div>

        {/* ========== القسم 2: شكر وتقدير ========== */}
        <div className="bg-gradient-to-br from-emerald-50 via-white to-amber-50 rounded-3xl p-8 md:p-12 border-2 border-emerald-100 shadow-sm">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-5 py-2 rounded-full mb-4">
              <Award className="w-5 h-5" />
              <span className="font-bold">شكر وتقدير</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3">
              شكر وتقدير
            </h2>
            <p className="text-slate-700 text-base md:text-lg font-semibold mt-3 leading-relaxed max-w-3xl mx-auto">
              تم العمل على منصتنا <span className="text-emerald-700 font-black">alhkmy.store</span> وتطبيق <span className="text-amber-700 font-black">alhkmy.app</span> بإدارة <span className="text-emerald-700 font-black">حكيم AI</span> ونائبه <span className="text-blue-700 font-black">Gemini</span>، وكلاً من:
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-8">
            {contributors.map((contributor, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-white px-4 py-3 rounded-xl shadow-sm border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all"
              >
                <span className="text-emerald-600">{contributor.icon}</span>
                <span className="font-semibold text-slate-700 text-sm md:text-base">
                  {contributor.name}
                </span>
              </div>
            ))}
          </div>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-amber-600 transition-colors">
              <Heart className="w-5 h-5 fill-current" />
              <span>وتطبيقنا الخاص:</span>
              <a
                href="https://alhkmy.app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white/90 transition-colors"
              >
                Alhkmy.app
              </a>
              <Rocket className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* ========== Footer ========== */}
        <div className="text-center mt-14 text-slate-400 text-sm">
          © {new Date().getFullYear()} Alhkmy.app — جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  );
}

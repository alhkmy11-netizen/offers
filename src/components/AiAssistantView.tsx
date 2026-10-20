import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../types.ts';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';

const STORAGE_KEY = 'smart_deal_ai_chat_history';
const MAX_INPUT_LENGTH = 500;

const WELCOME_MESSAGE: ChatMessage = {
  id: '1',
  role: 'model',
  text: `مرحباً بك! أنا **مستشار التوفير الذكي (Smart Deal AI)** المدعوم بنماذج Google Gemini.
أنا هنا لمساعدتك في استراتيجيات خفض فاتورة مقاضيك الشهرية، متابعة عروض البروشورات الأسبوعية في بنده والعثيم والدانوب، واختيار أفضل بدائل السلع بأعلى جودة وأوفر سعر في المملكة. 🇸🇦

كيف أستطيع مساعدتك اليوم؟`,
  timestamp: 'الآن',
  suggestions: [
    'ما هي مواعيد تجدد العروض الأسبوعية في بنده والعثيم؟',
    'كيف أوزع مقاضي الشهر بين السوبرماركت وأمازون؟',
    'ما هي أفضل المنتجات البديلة لحليب وزيوت الطبخ المرتفعة؟',
    'كيف أستفيد من حد الشحن المجاني في تطبيقات التوصيل؟',
  ],
};

type ExtendedMessage = ChatMessage & {
  failed?: boolean;
  originalQuery?: string;
  feedback?: 'up' | 'down' | null;
};

const getTimestamp = () =>
  new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

const loadInitialMessages = (): ExtendedMessage[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // تجاهل أي خطأ بالقراءة من localStorage
  }
  return [WELCOME_MESSAGE];
};

export const AiAssistantView: React.FC = () => {
  const [messages, setMessages] = useState<ExtendedMessage[]>(loadInitialMessages);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // تجاهل أي خطأ بالكتابة في localStorage
    }
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputMessage]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSendMessage = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? inputMessage).trim();
      if (!query || isLoading) return;

      const userMsgId = Date.now().toString();
      const userMsg: ExtendedMessage = {
        id: userMsgId,
        role: 'user',
        text: query,
        timestamp: getTimestamp(),
      };

      setMessages(prev => [...prev, userMsg]);
      setInputMessage('');
      setIsLoading(true);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: query,
            history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`فشل الطلب برمز الحالة ${response.status}`);
        }

        const data = await response.json();

        const botMsg: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: data.reply || 'تمت معالجة استفسارك بنجاح.',
          timestamp: getTimestamp(),
          suggestions: data.suggestions || [],
          feedback: null,
        };

        setMessages(prev => [...prev, botMsg]);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;

        const botMsg: ExtendedMessage = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: 'أعتذر، حدث تأخير في الاتصال. يمكنك إعادة المحاولة أو الاستفادة من مصفوفة الأسعار ورادار الكوبونات بالأعلى.',
          timestamp: getTimestamp(),
          failed: true,
          originalQuery: query,
        };

        setMessages(prev => [...prev, botMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [inputMessage, isLoading, messages],
  );

  const handleRetry = (originalQuery?: string) => {
    if (!originalQuery) return;
    handleSendMessage(originalQuery);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1800);
    } catch {
      // تجاهل فشل النسخ
    }
  };

  const handleFeedback = (id: string, value: 'up' | 'down') => {
    setMessages(prev =>
      prev.map(m => (m.id === id ? { ...m, feedback: m.feedback === value ? null : value } : m)),
    );
  };

  const handleNewChat = () => {
    if (isLoading) return;
    setMessages([WELCOME_MESSAGE]);
    setInputMessage('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    handleSendMessage(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const remainingChars = MAX_INPUT_LENGTH - inputMessage.length;

  return (
    <div className="max-w-4xl mx-auto space-y-4" id="ai-assistant-container">
      {/* بطاقة الرأس الإرشادية */}
      <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base">مستشار التوفير الذكي (Gemini Shopping Agent)</h3>
            <p className="text-xs text-slate-300">
              استشارات فورية لتحليل عروض السوبرماركت السعودية، المقارنة الذكية، وبدائل السلع
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="ai-chat-new-btn"
            onClick={handleNewChat}
            disabled={isLoading}
            title="بدء محادثة جديدة"
            className="hidden sm:inline-flex items-center gap-1.5 bg-slate-700/60 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-600/50 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            محادثة جديدة
          </button>
          <span className="hidden sm:inline-flex bg-emerald-900/80 text-emerald-300 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-700/50">
            متصل بخادم Gemini 3
          </span>
        </div>
      </div>

      {/* صندوق المحادثة الرئيسي */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs h-[540px] flex flex-col overflow-hidden">
        {/* شريط الرسائل */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* أيقونة المرسل */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white'
                    : msg.failed
                    ? 'bg-red-100 text-red-500'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                {msg.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : msg.failed ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              {/* فقاعة الرسالة */}
              <div className={`flex flex-col max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-slate-800 text-white rounded-tl-sm'
                      : msg.failed
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-tr-sm'
                      : 'bg-slate-100 text-slate-800 rounded-tr-sm'
                  }`}
                >
                  {msg.text}
                </div>

                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>

                  {msg.role === 'model' && !msg.failed && (
                    <>
                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title="نسخ الرد"
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleFeedback(msg.id, 'up')}
                        title="رد مفيد"
                        className={`transition-colors ${
                          msg.feedback === 'up' ? 'text-emerald-500' : 'text-slate-400 hover:text-emerald-500'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleFeedback(msg.id, 'down')}
                        title="رد غير مفيد"
                        className={`transition-colors ${
                          msg.feedback === 'down' ? 'text-red-500' : 'text-slate-400 hover:text-red-500'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {msg.failed && (
                    <button
                      onClick={() => handleRetry(msg.originalQuery)}
                      className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700"
                    >
                      <RefreshCw className="w-3 h-3" />
                      إعادة المحاولة
                    </button>
                  )}
                </div>

                {/* اقتراحات الأسئلة */}
                {msg.role === 'model' && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        disabled={isLoading}
                        onClick={() => handleSuggestionClick(s)}
                        className="text-xs bg-white border border-slate-300 hover:border-amber-400 hover:bg-amber-50 disabled:opacity-40 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* مؤشر الكتابة */}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-100 rounded-2xl rounded-tr-sm px-4 py-3 flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* شريط الإدخال */}
        <div className="border-t border-slate-200 p-3 bg-slate-50">
          <div className="flex items-end gap-2 bg-white border border-slate-300 rounded-2xl px-3 py-2 focus-within:border-amber-400 transition-colors">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder="اكتب سؤالك عن المقاضي والعروض هنا..."
              rows={1}
              className="flex-1 resize-none outline-none text-sm bg-transparent max-h-[120px] py-1.5"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputMessage.trim()}
              className="shrink-0 bg-amber-400 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              title="إرسال"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-slate-400">
              اضغط Enter للإرسال، Shift + Enter لسطر جديد
            </span>
            <span
              className={`text-[10px] ${
                remainingChars < 50 ? 'text-red-500' : 'text-slate-400'
              }`}
            >
              {remainingChars}/{MAX_INPUT_LENGTH}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

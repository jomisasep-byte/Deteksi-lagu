import {
  AlertCircle,
  Bot,
  Brain,
  CornerDownLeft,
  RotateCcw,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, GeminiModelId, ScanRecord } from '../types.ts';

interface ChatbotViewProps {
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  scans: ScanRecord[];
  selectedScanId: string | null;
  onSelectScanId: (id: string | null) => void;
}

const MODEL_OPTIONS: Array<{
  id: GeminiModelId;
  label: string;
  description: string;
}> = [
  {
    id: 'gemini-4-hydrogen',
    label: 'gemini-4-hydrogen (Umum)',
    description: 'Konsultasi umum hak cipta & pemeriksaan standar',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite (Cepat)',
    description: 'Jawaban ringkas & pengecekan definisi cepat',
  },
  {
    id: 'gemini-4-argon',
    label: 'gemini-4-argon (Interaktif Kompleks)',
    description: 'Skenario multi-langkah, sengketa klaim, dan atribusi rumit (API key berbayar)',
  },
  {
    id: 'gemini-4-carbon',
    label: 'gemini-4-carbon (High Thinking)',
    description: 'Penalaran mendalam audit lisensi & cakupan wilayah/monetisasi (API key berbayar)',
  },
];

const STARTER_QUESTIONS = [
  'Apa perbedaan Content ID claim dan Copyright Takedown di YouTube?',
  'Mengapa lagu berlabel royalty-free tetap bisa terkena klaim di YouTube?',
  'Bagaimana alur aman mengunggah video dengan YouTube Checks sebelum publikasi?',
  'Apakah menurunkan pitch atau mempercepat lagu membuatnya aman dari Content ID?',
];

export function ChatbotView({
  messages,
  setMessages,
  scans,
  selectedScanId,
  onSelectScanId,
}: ChatbotViewProps) {
  const [model, setModel] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textToSend: string, overrideModel?: GeminiModelId) => {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    const activeModel = overrideModel ?? model;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(() => nextHistory);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: messages,
          message: trimmed,
          model: activeModel,
          scanId: selectedScanId,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        modelUsed?: GeminiModelId;
        thinkingUsed?: boolean;
        error?: string;
        isPaidModelError?: boolean;
      };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'model',
            text: data.error || 'Gagal mendapatkan respons dari Asisten Gemini.',
            model: activeModel,
            timestamp: new Date().toISOString(),
            error: data.isPaidModelError ? 'PAID_MODEL_REQUIRED' : 'API_ERROR',
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text: data.reply || '',
          model: data.modelUsed ?? activeModel,
          thinkingUsed: Boolean(data.thinkingUsed),
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'model',
          text:
            err instanceof Error
              ? err.message
              : 'Koneksi ke server asisten gagal.',
          model: activeModel,
          timestamp: new Date().toISOString(),
          error: 'NETWORK_ERROR',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const activeScan = scans.find((s) => s.id === selectedScanId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[540px] bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header Controls */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Asisten Kepatuhan Hak Cipta &amp; Lisensi YouTube
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Konsultasi multi-putaran berbasis aturan pra-pemeriksaan musik, Content ID, dan audit lisensi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Pilih model Gemini"
            value={model}
            onChange={(e) => setModel(e.target.value as GeminiModelId)}
            className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Konteks pemindaian"
            value={selectedScanId ?? ''}
            onChange={(e) => onSelectScanId(e.target.value || null)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 max-w-[220px] truncate focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="">Tanpa konteks file</option>
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.filename} ({s.overall_status})
              </option>
            ))}
          </select>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages(() => [])}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Percakapan</span>
            </button>
          )}
        </div>
      </div>

      {activeScan && (
        <div className="px-5 py-2 bg-slate-100 border-b border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-2">
          <span className="truncate">
            Konteks aktif: <strong className="font-medium">{activeScan.filename}</strong> ·{' '}
            {activeScan.duration_label} · Status {activeScan.overall_status}
          </span>
          <button
            type="button"
            onClick={() => onSelectScanId(null)}
            className="text-slate-600 hover:text-slate-900 underline shrink-0 cursor-pointer"
          >
            Lepas
          </button>
        </div>
      )}

      {/* Scrollable Thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto py-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center mx-auto">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                Tanyakan Risiko Musik, Lisensi, atau YouTube Checks
              </h3>
              <p className="text-sm text-slate-600">
                Pilih model di kanan atas ({MODEL_OPTIONS.find((m) => m.id === model)?.description}). Gunakan{' '}
                <span className="font-mono text-xs">gemini-4-carbon</span> untuk penalaran mendalam (ThinkingLevel.HIGH).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="text-left p-3.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.error
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : 'bg-slate-900 text-white'
                    }`}
                  >
                    {msg.error ? <AlertCircle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-slate-900 text-white'
                      : msg.error
                        ? 'bg-red-50 text-red-900 border border-red-200'
                        : 'bg-slate-50 text-slate-800 border border-slate-200'
                  }`}
                >
                  {!isUser && msg.model && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1.5 font-mono">
                      <span>{msg.model}</span>
                      {msg.thinkingUsed && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <Brain className="w-3 h-3" />
                            <span>Thinking HIGH</span>
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>

                  {msg.error === 'PAID_MODEL_REQUIRED' && (
                    <div className="mt-3 pt-2.5 border-t border-red-200 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setModel('gemini-4-hydrogen');
                          const lastUser = [...messages]
                            .reverse()
                            .find((m) => m.role === 'user');
                          if (lastUser) {
                            sendMessage(lastUser.text, 'gemini-4-hydrogen');
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer"
                      >
                        Ulangi dengan gemini-4-hydrogen
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
              {model === 'gemini-4-carbon'
                ? 'Menjalankan penalaran mendalam (ThinkingLevel.HIGH)...'
                : 'Menyusun jawaban...'}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="p-3.5 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pertanyaan tentang hak cipta, lisensi lagu, atau hasil pemindaian..."
            disabled={sending}
            className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Kirim</span>
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

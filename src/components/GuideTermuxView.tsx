import { Check, Copy, ExternalLink, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TermuxFile {
  path: string;
  description: string;
  content: string;
}

const YOUTUBE_REFS = [
  {
    title: 'How Content ID works',
    url: 'https://support.google.com/youtube/answer/2797370',
    desc: 'Cara sistem referensi otomatis YouTube mencocokkan audio/video dan menerapkan kebijakan pemegang hak.',
  },
  {
    title: 'Learn about copyright claims',
    url: 'https://support.google.com/youtube/answer/6013276',
    desc: 'Perbedaan dampak Content ID claim (monetisasi, pelacakan, blokir) dan copyright takedown/strike.',
  },
  {
    title: 'Tips to find safe music',
    url: 'https://support.google.com/youtube/answer/15577610',
    desc: 'Panduan resmi YouTube untuk memilih sumber musik yang aman dan memverifikasi lisensi.',
  },
  {
    title: 'Restrictions on claimed music',
    url: 'https://support.google.com/youtube/answer/6364458',
    desc: 'Informasi pembatasan wilayah dan kebijakan pada musik yang terkena klaim.',
  },
];

export function GuideTermuxView() {
  const [files, setFiles] = useState<TermuxFile[]>([]);
  const [activePath, setActivePath] = useState<string>('app.py');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/termux-bundle')
      .then((r) => r.json())
      .then((d: { files?: TermuxFile[] }) => {
        if (d.files && d.files.length > 0) {
          setFiles(d.files);
          setActivePath(d.files[d.files.length - 1].path);
        }
      })
      .catch(() => {
        // handled silently if offline
      });
  }, []);

  const activeFile = files.find((f) => f.path === activePath) ?? files[0] ?? null;

  const handleCopy = async (path: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Panduan Kepatuhan &amp; Skrip Termux (Python)
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Ringkasan aturan hak cipta YouTube, sumber musik aman, dan paket kode Python + FFmpeg siap pakai untuk lingkungan Termux Android.
        </p>
      </div>

      {/* Section 1: Legal & Honest Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            Aturan Dasar Hak Cipta &amp; Batasan Sistem
          </h3>
          <ul className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
            <li>
              <strong className="text-slate-900">Content ID Claim vs Takedown:</strong> Content ID adalah pencocokan otomatis (monetisasi/lacak/blokir), sedangkan Copyright Takedown adalah permintaan penghapusan resmi yang dapat memicu copyright strike.
            </li>
            <li>
              <strong className="text-slate-900">Royalty-Free Bukan Otomatis Aman:</strong> Tetap periksa apakah lisensi mencakup YouTube, monetisasi, wilayah tayang, dan kewajiban atribusi.
            </li>
            <li>
              <strong className="text-slate-900">Dilarang Mengakali Deteksi:</strong> Mengubah pitch, mempercepat/memperlambat tempo, memotong pendek, atau mengecilkan volume bukan cara legal memperoleh hak penggunaan.
            </li>
            <li>
              <strong className="text-slate-900">Tidak Ditemukan ≠ Hijau:</strong> Jika lagu tidak teridentifikasi oleh API pihak ketiga, statusnya adalah ABU-ABU (wajib pemeriksaan sumber &amp; YouTube Checks).
            </li>
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            Sumber Musik Aman &amp; Referensi Resmi YouTube
          </h3>
          <p className="text-xs text-slate-600">
            Prioritaskan YouTube Audio Library di YouTube Studio, musik karya sendiri, lisensi tertulis resmi, atau Creator Music.
          </p>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {YOUTUBE_REFS.map((ref) => (
              <a
                key={ref.url}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{ref.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{ref.desc}</div>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Termux Setup & Code Explorer */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-slate-700" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Paket Proyek Termux Android (music-checker/)
              </h3>
              <p className="text-xs text-slate-600">
                Siapkan lingkungan Termux dengan <span className="font-mono">pkg install python ffmpeg git -y</span> lalu salin modul di bawah ini.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200 p-3 space-y-1 bg-slate-50/50">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setActivePath(file.path)}
                className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                  activeFile?.path === file.path
                    ? 'bg-slate-900 text-white font-medium'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {file.path}
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 p-4 space-y-3">
            {activeFile && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-mono font-medium text-slate-900">
                      {activeFile.path}
                    </div>
                    <div className="text-xs text-slate-600">{activeFile.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeFile.path, activeFile.content)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedPath === activeFile.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono rounded-lg overflow-x-auto leading-relaxed max-h-[420px]">
                  <code>{activeFile.content}</code>
                </pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

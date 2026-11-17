import { Download, Eye, FileAudio, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RiskLevel, ScanRecord } from '../types.ts';
import { RiskIndicator } from './RiskIndicator.tsx';

interface HistoryViewProps {
  scans: ScanRecord[];
  loading: boolean;
  onSelectScan: (scan: ScanRecord) => void;
  onDeleteScan: (id: string) => Promise<void>;
  onStartNewScan: () => void;
}

const FILTERS: Array<{ value: 'ALL' | RiskLevel; label: string }> = [
  { value: 'ALL', label: 'Semua' },
  { value: 'MERAH', label: 'Merah' },
  { value: 'KUNING', label: 'Kuning' },
  { value: 'HIJAU', label: 'Hijau' },
  { value: 'ABU-ABU', label: 'Abu-abu' },
];

export function HistoryView({
  scans,
  loading,
  onSelectScan,
  onDeleteScan,
  onStartNewScan,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scans.filter((scan) => {
      if (filter !== 'ALL' && scan.overall_status !== filter) return false;
      if (!q) return true;
      return (
        scan.filename.toLowerCase().includes(q) ||
        scan.summary_reason.toLowerCase().includes(q) ||
        scan.segments.some(
          (s) =>
            (s.detected_title || '').toLowerCase().includes(q) ||
            (s.detected_artist || '').toLowerCase().includes(q)
        )
      );
    });
  }, [scans, search, filter]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteScan(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
        <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
        <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Riwayat Pemindaian &amp; Laporan</h2>
          <p className="text-sm text-slate-600 mt-1">
            Semua laporan tersimpan lokal dalam database SQLite beserta ekspor JSON dan Markdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama file atau judul lagu..."
              className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === f.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {scans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <FileAudio className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">Belum ada riwayat pemindaian</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-5">
            Unggah file video atau audio pertama Anda untuk mengekstrak audio, memecah segmen, dan menyusun laporan risiko hak cipta.
          </p>
          <button
            type="button"
            onClick={onStartNewScan}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Mulai Pemindaian Pertama
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-600">
            Tidak ada pemindaian yang cocok dengan pencarian atau filter status saat ini.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-4">File Media</th>
                  <th className="py-3 px-4">Durasi</th>
                  <th className="py-3 px-4">Segmen</th>
                  <th className="py-3 px-4">Status Risiko</th>
                  <th className="py-3 px-4">YouTube Checks</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 truncate max-w-[260px]">
                        {scan.filename}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                        {new Date(scan.created_at).toLocaleString('id-ID')} ·{' '}
                        {(scan.file_size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {scan.duration_label}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {scan.has_audio_stream ? `${scan.segments.length} segmen` : 'Tanpa audio'}
                    </td>
                    <td className="py-3 px-4">
                      <RiskIndicator level={scan.overall_status} compact />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {scan.youtube_checks.final_youtube_result === 'BELUM'
                        ? 'Belum dijalankan'
                        : scan.youtube_checks.final_youtube_result.replaceAll('_', ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectScan(scan)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Buka</span>
                        </button>
                        <a
                          href={`/api/scans/${scan.id}/export/md`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                          title="Unduh Markdown"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>MD</span>
                        </a>
                        <a
                          href={`/api/scans/${scan.id}/export/json`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                          title="Unduh JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>JSON</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDelete(scan.id)}
                          disabled={deletingId === scan.id}
                          aria-label={`Hapus pemindaian ${scan.filename}`}
                          className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

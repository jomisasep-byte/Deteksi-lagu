import {
  AlertCircle,
  Brain,
  CheckSquare,
  Download,
  FileAudio,
  FileText,
  FolderPlus,
  Link2,
  Loader2,
  MessageSquare,
  Play,
  SlidersHorizontal,
  Square,
  Upload,
} from 'lucide-react';
import { useState, type DragEvent, type FormEvent } from 'react';
import type { LicenseRecord, ScanRecord, YoutubeCheckState } from '../types.ts';
import { RiskIndicator } from './RiskIndicator.tsx';
import { WaveformTimeline } from './WaveformTimeline.tsx';

interface ScanWorkspaceProps {
  activeScan: ScanRecord | null;
  licenses: LicenseRecord[];
  onScanCreated: (scan: ScanRecord) => void;
  onScanUpdated: (scan: ScanRecord) => void;
  onClearActiveScan: () => void;
  onAskAssistant: (scanId: string) => void;
}

export function ScanWorkspace({
  activeScan,
  licenses,
  onScanCreated,
  onScanUpdated,
  onClearActiveScan,
  onAskAssistant,
}: ScanWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState<number>(20);
  const [declaredTitle, setDeclaredTitle] = useState('');
  const [declaredArtist, setDeclaredArtist] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [selectedSegIdx, setSelectedSegIdx] = useState<number | null>(null);
  const [segTitleInput, setSegTitleInput] = useState('');
  const [segArtistInput, setSegArtistInput] = useState('');
  const [segLicenseId, setSegLicenseId] = useState('');
  const [savingSegment, setSavingSegment] = useState(false);

  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<{
    message: string;
    isPaidModelError: boolean;
  } | null>(null);

  const [reportTab, setReportTab] = useState<'visual' | 'markdown' | 'json'>('visual');

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setSelectedFile(f);
      setScanError(null);
    }
  };

  const runScan = async (sampleKind?: 'no_audio_video' | 'melodic_demo' | 'ambient_speech_sim') => {
    if (!sampleKind && !selectedFile) {
      setScanError('Pilih file video atau audio terlebih dahulu.');
      return;
    }

    setScanning(true);
    setScanError(null);
    setDeepError(null);

    try {
      const fd = new FormData();
      if (sampleKind) {
        fd.append('sampleKind', sampleKind);
      } else if (selectedFile) {
        fd.append('media', selectedFile);
      }
      fd.append('windowSeconds', String(windowSeconds));
      if (declaredTitle.trim()) fd.append('declaredTitle', declaredTitle.trim());
      if (declaredArtist.trim()) fd.append('declaredArtist', declaredArtist.trim());

      const res = await fetch('/api/scans', { method: 'POST', body: fd });
      const data = (await res.json()) as { scan?: ScanRecord; error?: string };
      if (!res.ok || !data.scan) {
        throw new Error(data.error || 'Pemindaian media gagal.');
      }

      setSelectedFile(null);
      setDeclaredTitle('');
      setDeclaredArtist('');
      setSelectedSegIdx(data.scan.segments[0]?.index ?? null);
      onScanCreated(data.scan);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses media.');
    } finally {
      setScanning(false);
    }
  };

  const handleUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    runScan();
  };

  const openSegmentEditor = (segIndex: number) => {
    if (!activeScan) return;
    const seg = activeScan.segments.find((s) => s.index === segIndex);
    setSelectedSegIdx(segIndex);
    if (seg) {
      setSegTitleInput(seg.detected_title ?? '');
      setSegArtistInput(seg.detected_artist ?? '');
      setSegLicenseId(seg.license_id ?? '');
    }
  };

  const handleSaveSegmentMatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeScan || selectedSegIdx === null) return;
    setSavingSegment(true);
    try {
      const res = await fetch(
        `/api/scans/${activeScan.id}/segment/${selectedSegIdx}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            detected_title: segTitleInput.trim() || null,
            detected_artist: segArtistInput.trim() || null,
            license_id: segLicenseId || null,
          }),
        }
      );
      const data = (await res.json()) as { scan?: ScanRecord };
      if (res.ok && data.scan) {
        onScanUpdated(data.scan);
      }
    } finally {
      setSavingSegment(false);
    }
  };

  const handleDeepAudit = async (model: 'gemini-4-carbon' | 'gemini-4-hydrogen' = 'gemini-4-carbon') => {
    if (!activeScan) return;
    setDeepLoading(true);
    setDeepError(null);
    try {
      const res = await fetch(`/api/scans/${activeScan.id}/deep-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = (await res.json()) as {
        scan?: ScanRecord;
        error?: string;
        isPaidModelError?: boolean;
      };
      if (!res.ok || !data.scan) {
        setDeepError({
          message: data.error || 'Gagal menjalankan audit mendalam.',
          isPaidModelError: Boolean(data.isPaidModelError),
        });
        return;
      }
      onScanUpdated(data.scan);
    } catch (err) {
      setDeepError({
        message: err instanceof Error ? err.message : 'Koneksi ke server gagal.',
        isPaidModelError: false,
      });
    } finally {
      setDeepLoading(false);
    }
  };

  const updateYoutubeChecks = async (patch: Partial<YoutubeCheckState>) => {
    if (!activeScan) return;
    const res = await fetch(`/api/scans/${activeScan.id}/youtube-checks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { scan?: ScanRecord };
    if (res.ok && data.scan) {
      onScanUpdated(data.scan);
    }
  };

  const buildClientMarkdownPreview = (scan: ScanRecord) => {
    const lines = [
      `VIDEO       : ${scan.filename}`,
      `DURASI      : ${scan.duration_label}`,
      `STATUS      : ${scan.overall_status}`,
      '',
      'KANDIDAT MUSIK:',
    ];
    if (scan.segments.length === 0) {
      lines.push('(Tidak ada segmen audio yang dianalisis)');
    } else {
      for (const s of scan.segments) {
        lines.push(`${s.index}. ${s.start_label} - ${s.end_label}`);
        lines.push(`   Judul     : ${s.detected_title ?? 'Tidak teridentifikasi'}`);
        lines.push(`   Artis     : ${s.detected_artist ?? '-'}`);
        lines.push(`   Pengenalan: ${s.recognition_note}`);
        lines.push(`   Lisensi   : ${s.license_status}`);
        lines.push(`   Risiko    : ${s.risk_level}`);
        lines.push('');
      }
    }
    lines.push('REKOMENDASI:');
    for (const r of scan.recommendations) {
      lines.push(`- ${r}`);
    }
    return lines.join('\n');
  };

  if (!activeScan) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 lg:p-8">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Pra-Pemeriksaan Musik Video &amp; Audio
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Ekstrak jalur audio tanpa mengubah file asli, pecah ke segmen ber-timestamp dengan FFmpeg, periksa indikasi musik, dan cocokkan terhadap Database Lisensi Anda sebelum unggah ke YouTube.
            </p>
          </div>

          <form onSubmit={handleUploadSubmit} className="mt-6 space-y-6">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`block border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-slate-900 bg-slate-100'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <Upload className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              {selectedFile ? (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">
                    {selectedFile.name}
                  </div>
                  <div className="text-xs text-slate-600 font-mono tabular-nums">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Klik atau jatuhkan file lain untuk mengganti
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-900">
                    Jatuhkan file video atau audio di sini, atau klik untuk memilih
                  </div>
                  <div className="text-xs text-slate-500">
                    Mendukung MP4, MOV, MKV, WebM, MP3, WAV, M4A, AAC, FLAC (maks. 250 MB)
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="video/*,audio/*,.mkv,.flac,.aac,.m4a,.mp4,.mov,.webm,.mp3,.wav"
                className="hidden"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] ?? null);
                  setScanError(null);
                }}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Durasi Segmen Pemotongan
                </label>
                <div className="relative">
                  <SlidersHorizontal className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={windowSeconds}
                    onChange={(e) => setWindowSeconds(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value={15}>15 detik per segmen</option>
                    <option value={20}>20 detik per segmen</option>
                    <option value={30}>30 detik per segmen</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Judul Lagu yang Digunakan (Opsional)
                </label>
                <input
                  type="text"
                  value={declaredTitle}
                  onChange={(e) => setDeclaredTitle(e.target.value)}
                  placeholder="Untuk pencocokan ke Database Lisensi"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Artis / Pencipta (Opsional)
                </label>
                <input
                  type="text"
                  value={declaredArtist}
                  onChange={(e) => setDeclaredArtist(e.target.value)}
                  placeholder="Opsional"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {scanError && (
              <div className="p-3.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                File sementara di direktori <span className="font-mono">temp/</span> dibersihkan otomatis setelah pemindaian selesai.
              </div>
              <button
                type="submit"
                disabled={scanning || !selectedFile}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {scanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengekstrak &amp; Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Mulai Pemeriksaan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Real FFmpeg Test Cases matching Tahap 5 */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Uji Pipeline FFmpeg dengan Sampel Media Nyata
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Buat file MP4/WAV nyata secara langsung via FFmpeg untuk menguji skenario tanpa audio, segmen musik, dan latar ambien.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={scanning}
              onClick={() => runScan('no_audio_video')}
              className="text-left p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <div className="text-sm font-medium text-slate-900">Uji Video Tanpa Audio</div>
              <div className="text-xs text-slate-600 mt-1">
                Menghasilkan MP4 8 detik tanpa stream audio untuk memverifikasi penanganan ABU-ABU.
              </div>
            </button>

            <button
              type="button"
              disabled={scanning}
              onClick={() => runScan('melodic_demo')}
              className="text-left p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <div className="text-sm font-medium text-slate-900">Uji Klip Musik 24 Detik</div>
              <div className="text-xs text-slate-600 mt-1">
                Menghasilkan WAV 24 detik dengan segmen senyap dan akor harmonik untuk uji segmentasi.
              </div>
            </button>

            <button
              type="button"
              disabled={scanning}
              onClick={() => runScan('ambient_speech_sim')}
              className="text-left p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <div className="text-sm font-medium text-slate-900">Uji Latar Ambien 18 Detik</div>
              <div className="text-xs text-slate-600 mt-1">
                Menghasilkan WAV derau latar pelan untuk memverifikasi evaluasi energi dBFS dan laporan.
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedSegment =
    activeScan.segments.find((s) => s.index === selectedSegIdx) ?? null;

  return (
    <div className="space-y-6">
      {/* Top Report Summary */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <RiskIndicator level={activeScan.overall_status} />
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {activeScan.duration_label} · {(activeScan.file_size / (1024 * 1024)).toFixed(2)} MB
                {activeScan.has_audio_stream
                  ? ` · ${activeScan.audio_codec ?? 'audio'} · ${activeScan.sample_rate ?? '-'} Hz · ${activeScan.channels ?? '-'} ch`
                  : ' · Tanpa stream audio'}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 break-all">
              {activeScan.filename}
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">
              {activeScan.summary_reason}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleDeepAudit('gemini-4-carbon')}
              disabled={deepLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {deepLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
              <span>Audit Mendalam (High Thinking)</span>
            </button>

            <button
              type="button"
              onClick={() => onAskAssistant(activeScan.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 text-slate-800 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Tanya Asisten</span>
            </button>

            <a
              href={`/api/scans/${activeScan.id}/export/md`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>MD</span>
            </a>

            <a
              href={`/api/scans/${activeScan.id}/export/json`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </a>

            <button
              type="button"
              onClick={onClearActiveScan}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Pindai Baru</span>
            </button>
          </div>
        </div>

        {/* Waveform Timeline */}
        {activeScan.has_audio_stream && (
          <WaveformTimeline
            peaks={activeScan.waveform_peaks}
            durationSeconds={activeScan.duration_seconds}
            segments={activeScan.segments}
            selectedSegmentIndex={selectedSegIdx}
            onSelectSegment={openSegmentEditor}
          />
        )}
      </div>

      {/* High Thinking Deep Audit Result / Error */}
      {(deepError || activeScan.deep_analysis) && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-slate-900" />
              <h3 className="text-base font-semibold text-slate-900">
                Hasil Audit Kepatuhan Mendalam (ThinkingLevel.HIGH)
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">gemini-4-carbon</span>
          </div>

          {deepError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2.5 text-sm text-red-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{deepError.message}</span>
              </div>
              {deepError.isPaidModelError && (
                <div>
                  <button
                    type="button"
                    disabled={deepLoading}
                    onClick={() => handleDeepAudit('gemini-4-hydrogen')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer"
                  >
                    Jalankan Audit Thinking HIGH dengan gemini-4-hydrogen
                  </button>
                </div>
              )}
            </div>
          )}

          {activeScan.deep_analysis && (
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {activeScan.deep_analysis}
            </div>
          )}
        </div>
      )}

      {/* Segments Table + Inline License Matcher */}
      {activeScan.has_audio_stream && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Rincian Segmen &amp; Kandidat Musik
              </h3>
              <span className="text-xs text-slate-500">
                Klik baris segmen untuk mencocokkan atau memperbarui kandidat lagu
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {activeScan.segments.map((seg) => {
                const isSelected = selectedSegIdx === seg.index;
                return (
                  <div
                    key={seg.index}
                    onClick={() => openSegmentEditor(seg.index)}
                    className={`p-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                          #{seg.index} · {seg.start_label} - {seg.end_label}
                        </span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {seg.rms_db} dBFS
                        </span>
                      </div>
                      <RiskIndicator level={seg.risk_level} compact />
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Kandidat: </span>
                        <span className="font-medium text-slate-900">
                          {seg.detected_title
                            ? `${seg.detected_title}${seg.detected_artist ? ` — ${seg.detected_artist}` : ''}`
                            : 'Tidak teridentifikasi'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Lisensi: </span>
                        <span className="font-medium text-slate-800">{seg.license_status}</span>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                      {seg.acoustic_profile} · {seg.risk_reason}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Segment Editor & License Linker */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 h-fit space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <Link2 className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                Verifikasi Segmen &amp; Tautkan Lisensi
              </h3>
            </div>

            {selectedSegment ? (
              <form onSubmit={handleSaveSegmentMatch} className="space-y-3.5">
                <div className="text-xs font-mono text-slate-600 tabular-nums">
                  Segmen #{selectedSegment.index} ({selectedSegment.start_label} -{' '}
                  {selectedSegment.end_label})
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tautkan dari Database Lisensi
                  </label>
                  <select
                    value={segLicenseId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSegLicenseId(id);
                      const lic = licenses.find((l) => l.id === id);
                      if (lic) {
                        setSegTitleInput(lic.title);
                        setSegArtistInput(lic.artist);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">-- Pilih catatan lisensi tersimpan --</option>
                    {licenses.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title} — {l.artist} ({l.verified ? 'Terverifikasi' : 'Belum Lengkap'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Judul Lagu
                  </label>
                  <input
                    type="text"
                    value={segTitleInput}
                    onChange={(e) => {
                      setSegTitleInput(e.target.value);
                      setSegLicenseId('');
                    }}
                    placeholder="Masukkan judul jika diketahui"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Artis / Pencipta
                  </label>
                  <input
                    type="text"
                    value={segArtistInput}
                    onChange={(e) => {
                      setSegArtistInput(e.target.value);
                      setSegLicenseId('');
                    }}
                    placeholder="Nama artis"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSegment}
                  className="w-full px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {savingSegment ? 'Memperbarui Risiko...' : 'Simpan & Evaluasi Ulang Risiko'}
                </button>
              </form>
            ) : (
              <div className="text-xs text-slate-600 py-4">
                Pilih salah satu segmen di sebelah kiri atau di lini masa audio untuk menetapkan judul lagu atau menautkan bukti lisensi.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Grid: Report Viewer + YouTube Checks Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Report Formats */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-semibold text-slate-900">Rekomendasi &amp; Format Laporan</h3>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['visual', 'markdown', 'json'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReportTab(t)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                    reportTab === t
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {reportTab === 'visual' && (
            <ul className="space-y-2.5 text-sm text-slate-700">
              {activeScan.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-slate-400 mt-1">{i + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          )}

          {reportTab === 'markdown' && (
            <pre className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono rounded-lg overflow-x-auto max-h-72 leading-relaxed">
              <code>{buildClientMarkdownPreview(activeScan)}</code>
            </pre>
          )}

          {reportTab === 'json' && (
            <pre className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono rounded-lg overflow-x-auto max-h-72 leading-relaxed">
              <code>{JSON.stringify(activeScan, null, 2)}</code>
            </pre>
          )}
        </div>

        {/* YouTube Checks Final Verification */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Pemeriksaan Akhir di YouTube Studio (YouTube Checks)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Sistem eksternal tidak memiliki akses ke Content ID privat YouTube. Lakukan langkah berikut sebelum publikasi:
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            {[
              {
                key: 'uploaded_private_or_unlisted' as const,
                label: '1. Unggah video di YouTube Studio sebagai Private atau Unlisted',
              },
              {
                key: 'waited_checks_complete' as const,
                label: '2. Tunggu tahap Checks / pemeriksaan hak cipta selesai sepenuhnya',
              },
              {
                key: 'inspected_claim_details' as const,
                label: '3. Jika ada klaim, periksa detail segmen, pemilik klaim, dan pembatasan wilayah',
              },
              {
                key: 'verified_attribution_and_proof' as const,
                label: '4. Verifikasi atribusi deskripsi & siapkan bukti lisensi sebelum rilis',
              },
            ].map((item) => {
              const checked = activeScan.youtube_checks[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => updateYoutubeChecks({ [item.key]: !checked })}
                  className="w-full flex items-start gap-2.5 text-left p-2 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <span className={checked ? 'text-slate-900 line-through decoration-slate-400' : 'text-slate-700'}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Hasil YouTube Checks
              </label>
              <select
                value={activeScan.youtube_checks.final_youtube_result}
                onChange={(e) =>
                  updateYoutubeChecks({
                    final_youtube_result: e.target.value as YoutubeCheckState['final_youtube_result'],
                  })
                }
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="BELUM">Belum Dijalankan</option>
                <option value="TIDAK_ADA_MASALAH">Tidak Ada Masalah Ditemukan</option>
                <option value="ADA_KLAIM">Ada Content ID Claim</option>
                <option value="DIBLOKIR">Diblokir / Takedown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Verifikasi
              </label>
              <input
                type="text"
                defaultValue={activeScan.youtube_checks.notes}
                onBlur={(e) => updateYoutubeChecks({ notes: e.target.value })}
                placeholder="Catat hasil klaim / false positive..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Empty visual safety footer */}
      {!activeScan.has_audio_stream && (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 flex items-center gap-3 text-sm text-slate-700">
          <FileAudio className="w-5 h-5 text-slate-500 shrink-0" />
          <span>
            Media ini tidak memiliki stream audio sehingga tidak ada segmen musik yang diekstrak. Tetap jalankan YouTube Checks saat mengunggah video final.
          </span>
        </div>
      )}
    </div>
  );
}

import type { RiskLevel, SegmentResult } from '../types.ts';

interface WaveformTimelineProps {
  peaks: number[];
  durationSeconds: number;
  segments: SegmentResult[];
  selectedSegmentIndex: number | null;
  onSelectSegment: (index: number) => void;
}

const BAND_STYLES: Record<RiskLevel, string> = {
  MERAH: 'bg-red-500/20 border-red-500/60 hover:bg-red-500/30',
  KUNING: 'bg-amber-500/20 border-amber-500/60 hover:bg-amber-500/30',
  HIJAU: 'bg-emerald-500/20 border-emerald-500/60 hover:bg-emerald-500/30',
  'ABU-ABU': 'bg-slate-400/20 border-slate-400/50 hover:bg-slate-400/30',
};

export function WaveformTimeline({
  peaks,
  durationSeconds,
  segments,
  selectedSegmentIndex,
  onSelectSegment,
}: WaveformTimelineProps) {
  const safePeaks = peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.05);
  const safeDuration = Math.max(durationSeconds, 1);

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
        <span className="font-medium text-slate-200">Lini Masa Amplitudo &amp; Segmen Audio</span>
        <span className="font-mono tabular-nums">
          {segments.length} segmen · {durationSeconds.toFixed(1)} detik
        </span>
      </div>

      <div className="relative h-24 w-full bg-slate-950 rounded border border-slate-800 overflow-hidden">
        {/* Real extracted waveform bars */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-2 pointer-events-none">
          {safePeaks.map((peak, idx) => {
            const heightPct = Math.max(6, Math.min(92, Math.round(peak * 100)));
            return (
              <div
                key={idx}
                className="flex-1 bg-slate-600/80 rounded-xs"
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>

        {/* Clickable segment overlays */}
        {segments.map((seg) => {
          const leftPct = (seg.start_seconds / safeDuration) * 100;
          const widthPct = Math.max(
            2,
            ((seg.end_seconds - seg.start_seconds) / safeDuration) * 100
          );
          const isSelected = selectedSegmentIndex === seg.index;
          return (
            <button
              key={seg.index}
              type="button"
              onClick={() => onSelectSegment(seg.index)}
              title={`Segmen ${seg.index}: ${seg.start_label} - ${seg.end_label} (${seg.risk_level})`}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              className={`absolute top-0 bottom-0 border-x transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white ${
                BAND_STYLES[seg.risk_level]
              } ${isSelected ? 'ring-2 ring-inset ring-white' : ''}`}
            >
              <span className="absolute top-1 left-1.5 text-[10px] font-mono tabular-nums text-white/90 bg-slate-950/75 px-1 rounded-xs">
                #{seg.index}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>Klik segmen pada lini masa untuk memeriksa atau menautkan lisensi.</span>
        <div className="flex items-center gap-4 font-mono tabular-nums">
          <span>00:00:00</span>
          <span>{segments[segments.length - 1]?.end_label ?? '00:00:00'}</span>
        </div>
      </div>
    </div>
  );
}

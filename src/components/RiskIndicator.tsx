import { AlertOctagon, AlertTriangle, HelpCircle, ShieldCheck } from 'lucide-react';
import type { RiskLevel } from '../types.ts';

interface RiskIndicatorProps {
  level: RiskLevel;
  compact?: boolean;
}

const CONFIG: Record<
  RiskLevel,
  {
    shortLabel: string;
    fullLabel: string;
    containerClass: string;
    dotClass: string;
    Icon: typeof AlertOctagon;
  }
> = {
  MERAH: {
    shortLabel: 'MERAH',
    fullLabel: 'MERAH — Risiko Tinggi',
    containerClass: 'bg-red-50 text-red-800 border-red-200',
    dotClass: 'bg-red-600',
    Icon: AlertOctagon,
  },
  KUNING: {
    shortLabel: 'KUNING',
    fullLabel: 'KUNING — Perlu Verifikasi',
    containerClass: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-600',
    Icon: AlertTriangle,
  },
  HIJAU: {
    shortLabel: 'HIJAU',
    fullLabel: 'HIJAU — Bukti Tersedia',
    containerClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-600',
    Icon: ShieldCheck,
  },
  'ABU-ABU': {
    shortLabel: 'ABU-ABU',
    fullLabel: 'ABU-ABU — Tidak Teridentifikasi',
    containerClass: 'bg-slate-100 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-500',
    Icon: HelpCircle,
  },
};

export function RiskIndicator({ level, compact = false }: RiskIndicatorProps) {
  const { shortLabel, fullLabel, containerClass, Icon } = CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${containerClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? shortLabel : fullLabel}</span>
    </span>
  );
}

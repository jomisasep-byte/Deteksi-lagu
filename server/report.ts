import fs from 'node:fs';
import path from 'node:path';
import type { ScanRecord } from '../src/types.ts';
import { REPORTS_DIR } from './db.ts';

export function buildMarkdownReport(scan: ScanRecord): string {
  const lines: string[] = [];
  lines.push('# Laporan Pra-Pemeriksaan Musik YouTube');
  lines.push('');
  lines.push('```text');
  lines.push(`VIDEO       : ${scan.filename}`);
  lines.push(`DURASI      : ${scan.duration_label}`);
  lines.push(`STATUS      : ${scan.overall_status}`);
  lines.push(`RINGKASAN   : ${scan.summary_reason}`);
  lines.push('');
  lines.push('KANDIDAT MUSIK:');
  if (scan.segments.length === 0) {
    lines.push('(Tidak ada segmen audio yang dianalisis)');
  } else {
    for (const seg of scan.segments) {
      lines.push(`${seg.index}. ${seg.start_label} - ${seg.end_label}`);
      lines.push(`   Judul     : ${seg.detected_title ?? 'Tidak teridentifikasi'}`);
      lines.push(`   Artis     : ${seg.detected_artist ?? '-'}`);
      lines.push(`   Pengenalan: ${seg.recognition_note}`);
      lines.push(`   Lisensi   : ${seg.license_status}`);
      lines.push(`   Risiko    : ${seg.risk_level} (${seg.risk_reason})`);
      lines.push('');
    }
  }
  lines.push('REKOMENDASI:');
  for (const rec of scan.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Catatan Penting');
  lines.push(
    '- Sistem pra-pemeriksaan ini memberikan indikasi awal, **bukan jaminan bebas Content ID claim atau copyright takedown**.'
  );
  lines.push(
    '- Mengubah pitch, mempercepat/memperlambat, atau mengecilkan volume bukan cara legal memperoleh hak penggunaan.'
  );
  lines.push(
    `- Status YouTube Checks saat ini: **${scan.youtube_checks.final_youtube_result}**`
  );
  return lines.join('\n');
}

export function saveReportFiles(scan: ScanRecord): { jsonPath: string; mdPath: string } {
  const jsonPath = path.join(REPORTS_DIR, `${scan.id}.json`);
  const mdPath = path.join(REPORTS_DIR, `${scan.id}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(scan, null, 2), 'utf-8');
  fs.writeFileSync(mdPath, buildMarkdownReport(scan), 'utf-8');
  return { jsonPath, mdPath };
}

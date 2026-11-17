import type { LicenseRecord, RiskLevel, SegmentResult, YoutubeCheckState } from '../src/types.ts';
import { findMatchingLicense } from './db.ts';

export function evaluateSegmentRisk(params: {
  hasAudioActivity: boolean;
  detectedTitle: string | null;
  detectedArtist: string | null;
  apiError: string | null;
  manualLicenseId?: string | null;
  explicitLicenseLookup?: LicenseRecord | null;
}): {
  risk_level: RiskLevel;
  risk_reason: string;
  license_id: string | null;
  license_status: string;
} {
  const { hasAudioActivity, detectedTitle, detectedArtist, apiError, explicitLicenseLookup } = params;

  if (apiError) {
    return {
      risk_level: 'ABU-ABU',
      risk_reason: `Layanan pengenalan gagal (${apiError}). Kegagalan API tidak pernah dianggap aman; periksa sumber musik dan jalankan YouTube Checks.`,
      license_id: null,
      license_status: 'Tidak diperiksa (API gagal)',
    };
  }

  if (!hasAudioActivity) {
    return {
      risk_level: 'ABU-ABU',
      risk_reason: 'Segmen senyap atau energi audio sangat rendah. Tetap jalankan YouTube Checks jika terdapat audio latar sangat pelan.',
      license_id: null,
      license_status: 'Tidak diperlukan (segmen senyap)',
    };
  }

  const matchFound = Boolean(detectedTitle && detectedTitle.trim().length > 0);

  if (!matchFound) {
    return {
      risk_level: 'ABU-ABU',
      risk_reason: 'Lagu tidak teridentifikasi oleh pengenalan otomatis. "Tidak ditemukan" bukan bukti bebas copyright.',
      license_id: null,
      license_status: 'Tidak dapat dicocokkan otomatis',
    };
  }

  const matchedLicense = explicitLicenseLookup ?? findMatchingLicense(detectedTitle, detectedArtist);

  if (!matchedLicense) {
    return {
      risk_level: 'MERAH',
      risk_reason: 'Lagu teridentifikasi, namun belum ada catatan maupun bukti lisensi yang sesuai di database lisensi.',
      license_id: null,
      license_status: 'Belum ada bukti izin',
    };
  }

  if (matchedLicense.verified) {
    return {
      risk_level: 'HIJAU',
      risk_reason: `Bukti izin tersimpan (${matchedLicense.license_type}) dan mencakup YouTube (${matchedLicense.monetization}). Tetap jalankan YouTube Checks.`,
      license_id: matchedLicense.id,
      license_status: `Terverifikasi: ${matchedLicense.license_type}`,
    };
  }

  return {
    risk_level: 'KUNING',
    risk_reason: 'Catatan lisensi ditemukan, tetapi bukti dokumen belum lengkap atau cakupan platform/monetisasi/wilayah perlu verifikasi manual.',
    license_id: matchedLicense.id,
    license_status: 'Perlu verifikasi cakupan & bukti',
  };
}

export function aggregateScanRisk(
  hasAudioStream: boolean,
  segments: SegmentResult[]
): {
  overall_status: RiskLevel;
  summary_reason: string;
  recommendations: string[];
} {
  if (!hasAudioStream) {
    return {
      overall_status: 'ABU-ABU',
      summary_reason: 'File media tidak memiliki stream audio. Tidak ada musik yang dapat diekstrak; tetap jalankan YouTube Checks saat unggah.',
      recommendations: [
        'Pastikan memang tidak ada jalur musik lain sebelum menggabungkan audio saat rendering final.',
        'Unggah video sebagai Private atau Unlisted dan tunggu YouTube Checks selesai sebelum publikasi.',
      ],
    };
  }

  if (segments.length === 0) {
    return {
      overall_status: 'ABU-ABU',
      summary_reason: 'Tidak ada segmen audio yang berhasil dievaluasi.',
      recommendations: [
        'Periksa keutuhan file media dan coba ulangi pemindaian.',
        'Jalankan YouTube Checks saat upload di YouTube Studio.',
      ],
    };
  }

  const hasRed = segments.some((s) => s.risk_level === 'MERAH');
  const hasYellow = segments.some((s) => s.risk_level === 'KUNING');
  const hasGray = segments.some((s) => s.risk_level === 'ABU-ABU');
  const hasGreen = segments.some((s) => s.risk_level === 'HIJAU');

  const baseRecommendations = [
    'Jangan menganggap lagu bebas copyright hanya karena pengenalan otomatis tidak menemukan kecocokan.',
    'Jalankan YouTube Checks saat upload sebagai Private/Unlisted dan tunggu proses selesai sebelum publikasi.',
  ];

  if (hasRed) {
    return {
      overall_status: 'MERAH',
      summary_reason: 'Terdeteksi segmen musik tanpa bukti izin/lisensi yang sah. Publikasi berisiko Content ID claim atau takedown.',
      recommendations: [
        'Jangan publikasikan video sebelum hak penggunaan segmen berstatus MERAH diselesaikan.',
        'Ganti musik bermasalah dengan trek dari YouTube Audio Library, karya sendiri, atau musik dengan lisensi tertulis yang mencakup YouTube & monetisasi.',
        'Jika Anda sudah memiliki izin resmi, catat dan unggah bukti dokumennya di Database Lisensi lalu evaluasi ulang.',
        ...baseRecommendations,
      ],
    };
  }

  if (hasYellow) {
    return {
      overall_status: 'KUNING',
      summary_reason: 'Terdapat segmen musik yang catatannya ada tetapi bukti dokumen atau cakupan lisensinya belum lengkap.',
      recommendations: [
        'Periksa ulang dokumen lisensi untuk memastikan izin mencakup platform YouTube, wilayah penayangan, durasi, dan monetisasi.',
        'Unggah bukti invoice, kontrak, atau halaman lisensi ke Database Lisensi.',
        ...baseRecommendations,
      ],
    };
  }

  if (hasGreen && !hasGray) {
    return {
      overall_status: 'HIJAU',
      summary_reason: 'Seluruh segmen musik teridentifikasi memiliki bukti lisensi terverifikasi di database Anda.',
      recommendations: [
        'Simpan bukti lisensi dan ikuti kewajiban atribusi pada deskripsi video bila dipersyaratkan.',
        'Tetap jalankan YouTube Checks di YouTube Studio karena klaim keliru atau perubahan kebijakan pemegang hak masih dapat terjadi.',
      ],
    };
  }

  return {
    overall_status: 'ABU-ABU',
    summary_reason: hasGreen
      ? 'Sebagian segmen memiliki bukti lisensi terverifikasi, namun terdapat segmen yang tidak teridentifikasi otomatis.'
      : 'Tidak ada lagu komersial yang teridentifikasi secara pasti. Status ABU-ABU bukan jaminan bebas copyright.',
    recommendations: [
      'Verifikasi secara manual asal seluruh musik/audio latar yang digunakan pada segmen berstatus ABU-ABU.',
      'Jika menggunakan musik yang sudah Anda ketahui judulnya, masukkan kandidat lagu pada segmen untuk dicocokkan dengan Database Lisensi.',
      ...baseRecommendations,
    ],
  };
}

export function defaultYoutubeChecks(): YoutubeCheckState {
  return {
    uploaded_private_or_unlisted: false,
    waited_checks_complete: false,
    inspected_claim_details: false,
    verified_attribution_and_proof: false,
    final_youtube_result: 'BELUM',
    notes: '',
  };
}

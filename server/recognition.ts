import crypto from 'node:crypto';
import fs from 'node:fs';
import type { SegmentResult } from '../src/types.ts';
import { extractGeminiErrorInfo, inspectAudioSegmentWithGemini } from './gemini.ts';
import { evaluateSegmentRisk } from './risk.ts';
import type { AudioSegmentSlice } from './segment.ts';

async function recognizeWithAudd(
  clipPath: string,
  apiKey: string
): Promise<{
  title: string | null;
  artist: string | null;
  confidence: number | null;
  note: string;
}> {
  const form = new FormData();
  const bytes = fs.readFileSync(clipPath);
  form.append('api_token', apiKey);
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'segment.wav');
  form.append('return', 'apple_music,spotify');

  const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`AudD HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    status?: string;
    error?: { error_message?: string };
    result?: { title?: string; artist?: string } | null;
  };
  if (data.status === 'error') {
    throw new Error(data.error?.error_message || 'AudD API error');
  }
  if (!data.result) {
    return {
      title: null,
      artist: null,
      confidence: 0,
      note: 'AudD tidak menemukan kecocokan referensi untuk segmen ini.',
    };
  }
  return {
    title: data.result.title ?? null,
    artist: data.result.artist ?? null,
    confidence: 90,
    note: 'Cocok terdeteksi via AudD Fingerprinting API.',
  };
}

async function recognizeWithAcrCloud(
  clipPath: string,
  accessKey: string,
  accessSecret: string,
  host: string
): Promise<{
  title: string | null;
  artist: string | null;
  confidence: number | null;
  note: string;
}> {
  const bytes = fs.readFileSync(clipPath);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = ['POST', '/v1/identify', accessKey, 'audio', '1', timestamp].join('\n');
  const signature = crypto
    .createHmac('sha1', accessSecret)
    .update(Buffer.from(stringToSign, 'utf-8'))
    .digest('base64');

  const form = new FormData();
  form.append('sample', new Blob([bytes], { type: 'audio/wav' }), 'segment.wav');
  form.append('access_key', accessKey);
  form.append('data_type', 'audio');
  form.append('signature_version', '1');
  form.append('signature', signature);
  form.append('sample_bytes', String(bytes.length));
  form.append('timestamp', timestamp);

  const endpoint = host.startsWith('http') ? `${host}/v1/identify` : `https://${host}/v1/identify`;
  const res = await fetch(endpoint, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`ACRCloud HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    status?: { code?: number; msg?: string };
    metadata?: {
      music?: Array<{
        title?: string;
        artists?: Array<{ name?: string }>;
        score?: number;
      }>;
    };
  };
  const code = data.status?.code ?? -1;
  if (code === 1001) {
    return {
      title: null,
      artist: null,
      confidence: 0,
      note: 'ACRCloud tidak menemukan kecocokan referensi untuk segmen ini.',
    };
  }
  if (code !== 0) {
    throw new Error(data.status?.msg || `ACRCloud error code ${code}`);
  }
  const top = data.metadata?.music?.[0];
  if (!top) {
    return {
      title: null,
      artist: null,
      confidence: 0,
      note: 'ACRCloud tidak mengembalikan kandidat lagu.',
    };
  }
  return {
    title: top.title ?? null,
    artist: top.artists?.[0]?.name ?? null,
    confidence: top.score ?? 85,
    note: 'Cocok terdeteksi via ACRCloud Fingerprinting API.',
  };
}

export async function analyzeSegments(
  slices: AudioSegmentSlice[],
  declaredTrack?: { title?: string; artist?: string }
): Promise<SegmentResult[]> {
  const provider = (process.env.MUSIC_API_PROVIDER || '').trim().toLowerCase();
  const apiKey = (process.env.MUSIC_API_KEY || '').trim();
  const apiSecret = (process.env.MUSIC_API_SECRET || '').trim();
  const acrHost = (process.env.ACRCLOUD_HOST || 'identify-ap-southeast-1.acrcloud.com').trim();

  const results: SegmentResult[] = [];

  for (const slice of slices) {
    if (!slice.hasAudioActivity) {
      const risk = evaluateSegmentRisk({
        hasAudioActivity: false,
        detectedTitle: null,
        detectedArtist: null,
        apiError: null,
      });
      results.push({
        index: slice.index,
        start_seconds: slice.startSeconds,
        end_seconds: slice.endSeconds,
        start_label: slice.startLabel,
        end_label: slice.endLabel,
        rms_db: slice.rmsDb,
        has_audio_activity: false,
        detected_title: null,
        detected_artist: null,
        recognition_source: 'NONE',
        recognition_note: 'Segmen senyap atau di bawah ambang aktivitas audio (-54 dBFS).',
        confidence: null,
        acoustic_profile: 'Tidak ada sinyal musik atau ucapan yang signifikan.',
        license_id: risk.license_id,
        license_status: risk.license_status,
        risk_level: risk.risk_level,
        risk_reason: risk.risk_reason,
        api_error: null,
      });
      continue;
    }

    let detectedTitle: string | null = null;
    let detectedArtist: string | null = null;
    let recognitionSource: SegmentResult['recognition_source'] = 'NONE';
    let recognitionNote = 'Tidak ada layanan pengenalan yang cocok.';
    let confidence: number | null = null;
    let acousticProfile = 'Segmen audio aktif terdeteksi.';
    let apiError: string | null = null;

    if (provider === 'audd' && apiKey) {
      try {
        const res = await recognizeWithAudd(slice.clipPath, apiKey);
        detectedTitle = res.title;
        detectedArtist = res.artist;
        confidence = res.confidence;
        recognitionNote = res.note;
        recognitionSource = 'AUDD_API';
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
        recognitionSource = 'AUDD_API';
        recognitionNote = `Gagal menghubungi AudD API: ${apiError}`;
      }
    } else if (provider === 'acrcloud' && apiKey && apiSecret) {
      try {
        const res = await recognizeWithAcrCloud(slice.clipPath, apiKey, apiSecret, acrHost);
        detectedTitle = res.title;
        detectedArtist = res.artist;
        confidence = res.confidence;
        recognitionNote = res.note;
        recognitionSource = 'ACRCLOUD_API';
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err);
        recognitionSource = 'ACRCLOUD_API';
        recognitionNote = `Gagal menghubungi ACRCloud API: ${apiError}`;
      }
    } else {
      try {
        const inspection = await inspectAudioSegmentWithGemini(slice.clipPath);
        acousticProfile = inspection.acousticProfile;
        detectedTitle = inspection.suspectedTitle;
        detectedArtist = inspection.suspectedArtist;
        confidence = inspection.confidence;
        recognitionSource = 'GEMINI_AUDIO';
        recognitionNote = inspection.suspectedTitle
          ? `Indikasi AI Audio (${inspection.confidence}%): ${inspection.honestNote}`
          : inspection.honestNote;
      } catch (err) {
        const info = extractGeminiErrorInfo(err);
        apiError = info.message;
        recognitionSource = 'GEMINI_AUDIO';
        recognitionNote = `Analisis audio AI gagal: ${info.message}`;
      }
    }

    // If user explicitly declared a track title used in the video and automated API did not identify one,
    // allow matching against their declared track so License DB verification still works honestly!
    if (!detectedTitle && declaredTrack?.title?.trim()) {
      detectedTitle = declaredTrack.title.trim();
      detectedArtist = declaredTrack.artist?.trim() || null;
      recognitionSource = 'MANUAL_INPUT';
      recognitionNote = 'Menggunakan judul trek yang dicatat pengguna untuk pencocokan Database Lisensi.';
      apiError = null;
    }

    const risk = evaluateSegmentRisk({
      hasAudioActivity: true,
      detectedTitle,
      detectedArtist,
      apiError,
    });

    results.push({
      index: slice.index,
      start_seconds: slice.startSeconds,
      end_seconds: slice.endSeconds,
      start_label: slice.startLabel,
      end_label: slice.endLabel,
      rms_db: slice.rmsDb,
      has_audio_activity: true,
      detected_title: detectedTitle,
      detected_artist: detectedArtist,
      recognition_source: recognitionSource,
      recognition_note: recognitionNote,
      confidence,
      acoustic_profile: acousticProfile,
      license_id: risk.license_id,
      license_status: risk.license_status,
      risk_level: risk.risk_level,
      risk_reason: risk.risk_reason,
      api_error: apiError,
    });
  }

  return results;
}

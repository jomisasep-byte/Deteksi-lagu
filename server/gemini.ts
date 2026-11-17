import fs from 'node:fs';
import { GoogleGenAI, ThinkingLevel, Type, type Content } from '@google/genai';
import type { ChatMessage, GeminiModelId, LicenseRecord, ScanRecord } from '../src/types.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error('GEMINI_API_KEY belum dikonfigurasi pada panel Settings > Secrets.'),
      { statusCode: 400 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function extractGeminiErrorInfo(err: unknown): {
  status: number;
  message: string;
  isPaidModelError: boolean;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const statusMatch = raw.match(/\b(400|403|404|429|500|503)\b/);
  const explicitStatus =
    typeof err === 'object' && err !== null && 'statusCode' in err
      ? Number((err as { statusCode: unknown }).statusCode)
      : typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status: unknown }).status)
        : statusMatch
          ? Number(statusMatch[1])
          : 500;

  const isPaidModelError =
    explicitStatus === 429 ||
    explicitStatus === 403 ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('PERMISSION_DENIED');

  if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return {
      status: 400,
      message: 'API key Gemini tidak valid. Periksa kunci Anda di panel Settings > Secrets.',
      isPaidModelError: false,
    };
  }

  if (isPaidModelError) {
    return {
      status: explicitStatus === 403 ? 403 : 429,
      message:
        'Model berbayar (gemini-4-carbon / gemini-4-argon) membutuhkan API key dengan billing aktif di Settings > Secrets, atau kuota sedang penuh. Anda dapat beralih ke gemini-4-hydrogen.',
      isPaidModelError: true,
    };
  }

  return {
    status: explicitStatus >= 400 && explicitStatus < 600 ? explicitStatus : 500,
    message: raw,
    isPaidModelError: false,
  };
}

export interface GeminiAudioInspection {
  containsMusic: boolean;
  acousticProfile: string;
  suspectedTitle: string | null;
  suspectedArtist: string | null;
  confidence: number;
  honestNote: string;
}

export async function inspectAudioSegmentWithGemini(
  wavPath: string
): Promise<GeminiAudioInspection> {
  const ai = getClient();
  const base64Audio = fs.readFileSync(wavPath).toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: base64Audio,
          },
        },
        {
          text:
            'Analisis segmen audio ini secara objektif untuk pra-pemeriksaan hak cipta YouTube. ' +
            'Jelaskan karakteristik akustik (misalnya ucapan/narasi, musik instrumental, vokal bernyanyi, suara sintetis/nada uji, atau ambien). ' +
            'ATURAN KETAT: Jangan pernah menebak atau mengarang judul lagu/artis jika Anda tidak 100% yakin dari lirik atau melodi rekaman komersial yang sangat jelas. Jika tidak yakin atau bukan lagu rekaman komersial yang dapat dipastikan, isi suspectedTitle dan suspectedArtist dengan null.',
        },
      ],
    },
    config: {
      systemInstruction:
        'Anda adalah analis audio forensik untuk pra-pemeriksaan musik YouTube. Selalu jujur tentang ketidakpastian; ketidakmampuan mengenali lagu tidak boleh dianggap aman.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          containsMusic: {
            type: Type.BOOLEAN,
            description: 'Apakah terdapat unsur musik, melodi, atau ritme musikal di segmen ini.',
          },
          acousticProfile: {
            type: Type.STRING,
            description: 'Ringkasan singkat isi audio dalam Bahasa Indonesia (maks 1-2 kalimat).',
          },
          suspectedTitle: {
            type: Type.STRING,
            nullable: true,
            description: 'Judul lagu jika benar-benar yakin teridentifikasi, atau null jika tidak pasti.',
          },
          suspectedArtist: {
            type: Type.STRING,
            nullable: true,
            description: 'Nama artis/pencipta jika benar-benar yakin, atau null jika tidak pasti.',
          },
          confidence: {
            type: Type.INTEGER,
            description: 'Skor keyakinan identifikasi judul/artis dari 0 sampai 100 (0 jika null).',
          },
          honestNote: {
            type: Type.STRING,
            description: 'Catatan singkat keterbatasan pengenalan dalam Bahasa Indonesia.',
          },
        },
        required: ['containsMusic', 'acousticProfile', 'confidence', 'honestNote'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<GeminiAudioInspection>;
  return {
    containsMusic: Boolean(parsed.containsMusic),
    acousticProfile: parsed.acousticProfile || 'Audio terdeteksi tanpa deskripsi rinci.',
    suspectedTitle: parsed.suspectedTitle ? String(parsed.suspectedTitle) : null,
    suspectedArtist: parsed.suspectedArtist ? String(parsed.suspectedArtist) : null,
    confidence: Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0,
    honestNote:
      parsed.honestNote ||
      'Pemeriksaan audio AI bersifat indikatif dan bukan pengganti database Content ID YouTube.',
  };
}

export async function runHighThinkingDeepAudit(params: {
  scan: ScanRecord;
  licenses: LicenseRecord[];
  model?: 'gemini-4-carbon' | 'gemini-4-hydrogen';
}): Promise<{ analysis: string; modelUsed: string }> {
  const ai = getClient();
  const model = params.model ?? 'gemini-4-carbon';

  const prompt = [
    'Lakukan audit mendalam pra-unggah hak cipta musik YouTube terhadap hasil pemindaian berikut:',
    '',
    `Nama File: ${params.scan.filename}`,
    `Durasi: ${params.scan.duration_label}`,
    `Stream Audio: ${params.scan.has_audio_stream ? `Ada (${params.scan.audio_codec}, ${params.scan.sample_rate} Hz)` : 'Tidak ada stream audio'}`,
    `Status Agregat Saat Ini: ${params.scan.overall_status}`,
    `Ringkasan Awal: ${params.scan.summary_reason}`,
    '',
    'Segmen Audio:',
    JSON.stringify(
      params.scan.segments.map((s) => ({
        index: s.index,
        waktu: `${s.start_label} - ${s.end_label}`,
        rms_db: s.rms_db,
        aktivitas_audio: s.has_audio_activity,
        judul: s.detected_title,
        artis: s.detected_artist,
        sumber_pengenalan: s.recognition_source,
        profil_akustik: s.acoustic_profile,
        status_lisensi: s.license_status,
        risiko: s.risk_level,
      })),
      null,
      2
    ),
    '',
    'Database Lisensi Pengguna Saat Ini:',
    JSON.stringify(
      params.licenses.map((l) => ({
        title: l.title,
        artist: l.artist,
        source: l.source,
        license_type: l.license_type,
        allowed_platforms: l.allowed_platforms,
        monetization: l.monetization,
        territory: l.territory,
        validity: l.validity,
        attribution: l.attribution,
        has_proof_file: Boolean(l.proof_path),
        verified: l.verified,
      })),
      null,
      2
    ),
    '',
    'Berikan evaluasi komprehensif dalam Bahasa Indonesia yang terstruktur:',
    '1. Analisis risiko per segmen (bedakan Content ID claim vs Copyright Takedown/Strike).',
    '2. Audit kecukupan cakupan lisensi (platform YouTube, monetisasi, wilayah, masa berlaku, atribusi).',
    '3. Peringatan khusus untuk segmen ABU-ABU (ingat: tidak teridentifikasi BUKAN berarti aman) dan larangan modifikasi audio (pitch/speed/volume) untuk mengakali deteksi.',
    '4. Rencana tindakan konkret sebelum publikasi dan langkah verifikasi YouTube Checks (Private/Unlisted).',
  ].join('\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'Anda adalah auditor kepatuhan hak cipta musik untuk kreator YouTube. Anda wajib bersikap jujur secara hukum dan teknis: tidak pernah menjamin bebas Content ID, tidak pernah menyarankan modifikasi pitch/tempo untuk menghindari deteksi, dan selalu mengingatkan tahap akhir YouTube Checks di YouTube Studio. Jawab ringkas, terstruktur, dan langsung dapat ditindaklanjuti dalam Bahasa Indonesia.',
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    },
  });

  return {
    analysis: response.text || 'Tidak ada ringkasan analisis yang dihasilkan.',
    modelUsed: model,
  };
}

const CHAT_SYSTEM_INSTRUCTION = `Anda adalah Asisten Kepatuhan Hak Cipta Musik YouTube untuk aplikasi PraCek Musik.
Tugas Anda membantu kreator memahami risiko musik sebelum mengunggah video ke YouTube berdasarkan rancangan sistem pra-pemeriksaan.

Prinsip wajib yang harus selalu Anda pegang:
1. Bedakan dengan jelas antara Content ID Claim (otomatis: monetisasi, pelacakan, atau pemblokiran wilayah) dan Copyright Takedown / Strike (penghapusan hukum).
2. Tegaskan bahwa sistem pihak ketiga (termasuk pengenalan audio dan asisten ini) hanya memberi indikasi awal — BUKAN jaminan bebas klaim YouTube Content ID.
3. Tegaskan bahwa "tidak teridentifikasi" (ABU-ABU) TIDAK PERNAH berarti otomatis aman / HIJAU.
4. Tolak dengan tegas trik penghindaran deteksi (mengubah pitch, mempercepat/memperlambat, memotong pendek, menambah noise, atau mengecilkan volume) karena bukan cara legal memperoleh hak penggunaan.
5. Jelaskan bahwa label "royalty-free", "no copyright", atau "free download" tetap wajib diperiksa dokumen lisensinya (cakupan platform YouTube, monetisasi, wilayah, masa berlaku, dan kewajiban atribusi).
6. Arahkan pengguna ke sumber lebih aman (YouTube Audio Library, musik karya sendiri, lisensi tertulis resmi, Creator Music) dan wajib menunggu YouTube Checks selesai dengan unggahan Private/Unlisted sebelum publikasi.
7. Gunakan Bahasa Indonesia yang jelas, praktis, jujur, dan tidak memberikan nasihat hukum final (ingatkan untuk konsultasi profesional hukum bila menghadapi sengketa serius).`;

export async function sendChatMessage(params: {
  history: ChatMessage[];
  message: string;
  model: GeminiModelId;
  scanContext?: ScanRecord | null;
}): Promise<{ reply: string; modelUsed: GeminiModelId; thinkingUsed: boolean }> {
  const ai = getClient();

  const geminiHistory: Content[] = params.history
    .filter((m) => !m.error && m.text.trim().length > 0)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

  let systemInstruction = CHAT_SYSTEM_INSTRUCTION;
  if (params.scanContext) {
    systemInstruction += `\n\nKonteks pemindaian aktif pengguna saat ini:\n- Video/Audio: ${params.scanContext.filename}\n- Durasi: ${params.scanContext.duration_label}\n- Status: ${params.scanContext.overall_status}\n- Ringkasan: ${params.scanContext.summary_reason}\n- Segmen: ${JSON.stringify(
      params.scanContext.segments.map((s) => ({
        waktu: `${s.start_label}-${s.end_label}`,
        judul: s.detected_title,
        artis: s.detected_artist,
        risiko: s.risk_level,
        lisensi: s.license_status,
      }))
    )}`;
  }

  const useHighThinking = params.model === 'gemini-4-carbon';

  const chat = ai.chats.create({
    model: params.model,
    history: geminiHistory,
    config: {
      systemInstruction,
      ...(useHighThinking
        ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
        : {}),
    },
  });

  const response = await chat.sendMessage({ message: params.message });
  return {
    reply: response.text || 'Maaf, tidak ada respons teks yang dikembalikan oleh model.',
    modelUsed: params.model,
    thinkingUsed: useHighThinking,
  };
}

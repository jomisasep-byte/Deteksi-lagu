import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  createLicense,
  deleteLicense,
  deleteScan,
  getLicenseById,
  getScanById,
  LICENSES_DIR,
  listLicenses,
  listScans,
  saveScan,
  TEMP_DIR,
  updateLicense,
  updateScan,
} from './server/db.ts';
import {
  extractGeminiErrorInfo,
  runHighThinkingDeepAudit,
  sendChatMessage,
} from './server/gemini.ts';
import {
  cleanupTempFiles,
  computeWaveformPeaks,
  extractAudioToWav,
  probeMedia,
  synthesizeTestMedia,
} from './server/media.ts';
import { analyzeSegments } from './server/recognition.ts';
import { buildMarkdownReport, saveReportFiles } from './server/report.ts';
import {
  aggregateScanRisk,
  defaultYoutubeChecks,
  evaluateSegmentRisk,
} from './server/risk.ts';
import { createAudioSegments } from './server/segment.ts';
import { TERMUX_PROJECT_FILES } from './server/termux_bundle.ts';
import type { ChatMessage, GeminiModelId, LicenseRecord, ScanRecord } from './src/types.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '4mb' }));

const uploadMedia = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 250 * 1024 * 1024 },
});

const uploadProof = multer({
  dest: LICENSES_DIR,
  limits: { fileSize: 25 * 1024 * 1024 },
});

function reevaluateAllScansAgainstLicenses(): void {
  const scans = listScans();
  for (const scan of scans) {
    let changed = false;
    const updatedSegments = scan.segments.map((seg) => {
      if (!seg.has_audio_activity || !seg.detected_title || seg.api_error) {
        return seg;
      }
      const nextRisk = evaluateSegmentRisk({
        hasAudioActivity: seg.has_audio_activity,
        detectedTitle: seg.detected_title,
        detectedArtist: seg.detected_artist,
        apiError: seg.api_error,
      });
      if (
        nextRisk.risk_level !== seg.risk_level ||
        nextRisk.license_id !== seg.license_id ||
        nextRisk.license_status !== seg.license_status
      ) {
        changed = true;
        return {
          ...seg,
          license_id: nextRisk.license_id,
          license_status: nextRisk.license_status,
          risk_level: nextRisk.risk_level,
          risk_reason: nextRisk.risk_reason,
        };
      }
      return seg;
    });

    if (changed) {
      const agg = aggregateScanRisk(scan.has_audio_stream, updatedSegments);
      const updatedScan: ScanRecord = {
        ...scan,
        segments: updatedSegments,
        overall_status: agg.overall_status,
        summary_reason: agg.summary_reason,
        recommendations: agg.recommendations,
      };
      updateScan(updatedScan);
      saveReportFiles(updatedScan);
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasExternalFingerprintApi: Boolean(
      process.env.MUSIC_API_PROVIDER && process.env.MUSIC_API_KEY
    ),
  });
});

app.get('/api/scans', (_req, res) => {
  res.json({ scans: listScans() });
});

app.get('/api/scans/:id', (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Riwayat pemindaian tidak ditemukan.' });
    return;
  }
  res.json({ scan });
});

app.post('/api/scans', uploadMedia.single('media'), async (req, res) => {
  const scanId = crypto.randomUUID();
  const tempFilesToClean: string[] = [];

  try {
    const windowSeconds = Number(req.body?.windowSeconds) || 20;
    const declaredTitle = typeof req.body?.declaredTitle === 'string' ? req.body.declaredTitle : '';
    const declaredArtist = typeof req.body?.declaredArtist === 'string' ? req.body.declaredArtist : '';
    const sampleKind = req.body?.sampleKind as
      | 'no_audio_video'
      | 'melodic_demo'
      | 'ambient_speech_sim'
      | undefined;

    let inputPath = '';
    let originalFilename = '';
    let mediaType = '';
    let fileSize = 0;

    if (req.file) {
      inputPath = req.file.path;
      tempFilesToClean.push(inputPath);
      originalFilename = req.file.originalname || 'media_unggah';
      mediaType = req.file.mimetype || 'application/octet-stream';
      fileSize = req.file.size;
    } else if (sampleKind) {
      const ext = sampleKind === 'no_audio_video' ? 'mp4' : 'wav';
      inputPath = path.join(TEMP_DIR, `${scanId}_sample.${ext}`);
      tempFilesToClean.push(inputPath);
      const synth = await synthesizeTestMedia(sampleKind, inputPath);
      originalFilename = synth.filename;
      mediaType = synth.mimeType;
      fileSize = fs.statSync(inputPath).size;
    } else {
      res.status(400).json({ error: 'Pilih file video/audio atau gunakan sampel uji.' });
      return;
    }

    const probe = await probeMedia(inputPath);
    let waveformPeaks: number[] = [];
    let segments = [] as ScanRecord['segments'];

    if (probe.hasAudioStream && probe.durationSeconds > 0) {
      const extractedWav = path.join(TEMP_DIR, `${scanId}_audio.wav`);
      tempFilesToClean.push(extractedWav);
      await extractAudioToWav(inputPath, extractedWav);
      waveformPeaks = computeWaveformPeaks(extractedWav, 96);

      const slices = await createAudioSegments(
        extractedWav,
        scanId,
        probe.durationSeconds,
        windowSeconds
      );
      for (const s of slices) {
        tempFilesToClean.push(s.clipPath);
      }

      segments = await analyzeSegments(slices, {
        title: declaredTitle,
        artist: declaredArtist,
      });
    }

    const agg = aggregateScanRisk(probe.hasAudioStream, segments);

    const scan: ScanRecord = {
      id: scanId,
      filename: originalFilename,
      file_size: fileSize,
      media_type: mediaType,
      duration_seconds: probe.durationSeconds,
      duration_label: probe.durationLabel,
      has_audio_stream: probe.hasAudioStream,
      audio_codec: probe.audioCodec,
      sample_rate: probe.sampleRate,
      channels: probe.channels,
      waveform_peaks: waveformPeaks,
      overall_status: agg.overall_status,
      summary_reason: agg.summary_reason,
      recommendations: agg.recommendations,
      segments,
      youtube_checks: defaultYoutubeChecks(),
      deep_analysis: null,
      created_at: new Date().toISOString(),
    };

    saveScan(scan);
    saveReportFiles(scan);

    res.status(201).json({ scan });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memproses file media.';
    res.status(500).json({ error: `Pemrosesan media gagal: ${message}` });
  } finally {
    cleanupTempFiles(tempFilesToClean);
  }
});

app.patch('/api/scans/:id/segment/:index', (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Pemindaian tidak ditemukan.' });
    return;
  }

  const segIndex = Number(req.params.index);
  const { detected_title, detected_artist, license_id } = req.body as {
    detected_title?: string | null;
    detected_artist?: string | null;
    license_id?: string | null;
  };

  const explicitLicense = license_id ? getLicenseById(license_id) : null;
  const effectiveTitle =
    explicitLicense && !detected_title ? explicitLicense.title : detected_title ?? null;
  const effectiveArtist =
    explicitLicense && !detected_artist ? explicitLicense.artist : detected_artist ?? null;

  const updatedSegments = scan.segments.map((seg) => {
    if (seg.index !== segIndex) return seg;
    const risk = evaluateSegmentRisk({
      hasAudioActivity: seg.has_audio_activity,
      detectedTitle: effectiveTitle,
      detectedArtist: effectiveArtist,
      apiError: null,
      explicitLicenseLookup: explicitLicense,
    });
    return {
      ...seg,
      detected_title: effectiveTitle,
      detected_artist: effectiveArtist,
      recognition_source: effectiveTitle ? ('MANUAL_INPUT' as const) : ('NONE' as const),
      recognition_note: effectiveTitle
        ? 'Kandidat lagu ditetapkan/dikonfirmasi pengguna untuk pencocokan lisensi.'
        : 'Kandidat lagu dikosongkan.',
      api_error: null,
      license_id: risk.license_id,
      license_status: risk.license_status,
      risk_level: risk.risk_level,
      risk_reason: risk.risk_reason,
    };
  });

  const agg = aggregateScanRisk(scan.has_audio_stream, updatedSegments);
  const updated: ScanRecord = {
    ...scan,
    segments: updatedSegments,
    overall_status: agg.overall_status,
    summary_reason: agg.summary_reason,
    recommendations: agg.recommendations,
  };

  updateScan(updated);
  saveReportFiles(updated);
  res.json({ scan: updated });
});

app.patch('/api/scans/:id/youtube-checks', (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Pemindaian tidak ditemukan.' });
    return;
  }
  const updated: ScanRecord = {
    ...scan,
    youtube_checks: {
      ...scan.youtube_checks,
      ...(req.body || {}),
    },
  };
  updateScan(updated);
  saveReportFiles(updated);
  res.json({ scan: updated });
});

app.get('/api/scans/:id/export/:format', (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Pemindaian tidak ditemukan.' });
    return;
  }
  const safeBase = scan.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (req.params.format === 'md') {
    const md = buildMarkdownReport(scan);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeBase}_laporan.md"`);
    res.send(md);
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeBase}_laporan.json"`);
  res.send(JSON.stringify(scan, null, 2));
});

app.delete('/api/scans/:id', (req, res) => {
  const deleted = deleteScan(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Pemindaian tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/scans/:id/deep-audit', async (req, res) => {
  const scan = getScanById(req.params.id);
  if (!scan) {
    res.status(404).json({ error: 'Pemindaian tidak ditemukan.' });
    return;
  }
  try {
    const requestedModel =
      req.body?.model === 'gemini-4-hydrogen' ? 'gemini-4-hydrogen' : 'gemini-4-carbon';
    const licenses = listLicenses();
    const { analysis, modelUsed } = await runHighThinkingDeepAudit({
      scan,
      licenses,
      model: requestedModel,
    });
    const updated: ScanRecord = {
      ...scan,
      deep_analysis: analysis,
    };
    updateScan(updated);
    saveReportFiles(updated);
    res.json({ scan: updated, modelUsed });
  } catch (err) {
    const info = extractGeminiErrorInfo(err);
    res.status(info.status).json({
      error: info.message,
      isPaidModelError: info.isPaidModelError,
    });
  }
});

app.get('/api/licenses', (_req, res) => {
  res.json({ licenses: listLicenses() });
});

app.post('/api/licenses', uploadProof.single('proof'), (req, res) => {
  const body = req.body as Record<string, string | undefined>;
  if (!body.title?.trim() || !body.artist?.trim()) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: 'Judul musik dan nama artis/pencipta wajib diisi.' });
    return;
  }

  const monetization =
    body.monetization === 'TIDAK_BOLEH' || body.monetization === 'BERSYARAT'
      ? body.monetization
      : 'BOLEH';

  const record: LicenseRecord = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    artist: body.artist.trim(),
    source: (body.source || '').trim(),
    license_type: (body.license_type || 'Lisensi Tertulis').trim(),
    allowed_platforms: (body.allowed_platforms || 'YouTube').trim(),
    monetization,
    territory: (body.territory || 'Seluruh Dunia').trim(),
    validity: (body.validity || 'Permanen').trim(),
    attribution: (body.attribution || 'Tidak diperlukan').trim(),
    proof_path: req.file ? req.file.path : (body.proof_path || '').trim(),
    proof_original_name: req.file ? req.file.originalname : '',
    notes: (body.notes || '').trim(),
    verified: false,
    created_at: new Date().toISOString(),
  };

  const created = createLicense(record);
  reevaluateAllScansAgainstLicenses();
  res.status(201).json({ license: created });
});

app.patch('/api/licenses/:id', uploadProof.single('proof'), (req, res) => {
  const existing = getLicenseById(req.params.id);
  if (!existing) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(404).json({ error: 'Catatan lisensi tidak ditemukan.' });
    return;
  }

  const body = req.body as Record<string, string | undefined>;
  if (req.file && existing.proof_path && fs.existsSync(existing.proof_path)) {
    try {
      fs.unlinkSync(existing.proof_path);
    } catch {
      // ignore
    }
  }

  const updated = updateLicense(req.params.id, {
    title: body.title?.trim() ?? existing.title,
    artist: body.artist?.trim() ?? existing.artist,
    source: body.source?.trim() ?? existing.source,
    license_type: body.license_type?.trim() ?? existing.license_type,
    allowed_platforms: body.allowed_platforms?.trim() ?? existing.allowed_platforms,
    monetization:
      body.monetization === 'BOLEH' ||
      body.monetization === 'TIDAK_BOLEH' ||
      body.monetization === 'BERSYARAT'
        ? body.monetization
        : existing.monetization,
    territory: body.territory?.trim() ?? existing.territory,
    validity: body.validity?.trim() ?? existing.validity,
    attribution: body.attribution?.trim() ?? existing.attribution,
    proof_path: req.file ? req.file.path : body.proof_path?.trim() ?? existing.proof_path,
    proof_original_name: req.file ? req.file.originalname : existing.proof_original_name,
    notes: body.notes?.trim() ?? existing.notes,
  });

  reevaluateAllScansAgainstLicenses();
  res.json({ license: updated });
});

app.get('/api/licenses/:id/proof', (req, res) => {
  const lic = getLicenseById(req.params.id);
  if (!lic || !lic.proof_path || !fs.existsSync(lic.proof_path)) {
    res.status(404).json({ error: 'File bukti lisensi tidak tersedia.' });
    return;
  }
  res.download(lic.proof_path, lic.proof_original_name || path.basename(lic.proof_path));
});

app.delete('/api/licenses/:id', (req, res) => {
  const ok = deleteLicense(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Catatan lisensi tidak ditemukan.' });
    return;
  }
  reevaluateAllScansAgainstLicenses();
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { history, message, model, scanId } = req.body as {
      history?: ChatMessage[];
      message?: string;
      model?: GeminiModelId;
      scanId?: string | null;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
      return;
    }

    const allowedModels: GeminiModelId[] = [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-4-carbon',
    ];
    const selectedModel: GeminiModelId = allowedModels.includes(model as GeminiModelId)
      ? (model as GeminiModelId)
      : 'gemini-4-hydrogen';

    const scanContext = scanId ? getScanById(scanId) : null;
    const result = await sendChatMessage({
      history: Array.isArray(history) ? history : [],
      message: message.trim(),
      model: selectedModel,
      scanContext,
    });

    res.json(result);
  } catch (err) {
    const info = extractGeminiErrorInfo(err);
    res.status(info.status).json({
      error: info.message,
      isPaidModelError: info.isPaidModelError,
    });
  }
});

app.get('/api/termux-bundle', (_req, res) => {
  res.json({ files: TERMUX_PROJECT_FILES });
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`PraCek Musik server running on http://0.0.0.0:${port}`);
  });
}

startServer();

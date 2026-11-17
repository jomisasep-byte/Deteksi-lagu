import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface MediaProbeInfo {
  durationSeconds: number;
  durationLabel: string;
  hasAudioStream: boolean;
  hasVideoStream: boolean;
  audioCodec: string | null;
  sampleRate: number | null;
  channels: number | null;
  formatName: string;
}

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export async function probeMedia(filePath: string): Promise<MediaProbeInfo> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
    { maxBuffer: 1024 * 1024 * 4 }
  );

  const parsed = JSON.parse(stdout || '{}') as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      sample_rate?: string;
      channels?: number;
      duration?: string;
    }>;
  };

  const streams = parsed.streams ?? [];
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  const videoStream = streams.find((s) => s.codec_type === 'video');

  const rawDuration =
    Number(parsed.format?.duration) ||
    Number(audioStream?.duration) ||
    Number(videoStream?.duration) ||
    0;
  const durationSeconds = Number.isFinite(rawDuration) ? rawDuration : 0;

  return {
    durationSeconds,
    durationLabel: formatTimestamp(durationSeconds),
    hasAudioStream: Boolean(audioStream),
    hasVideoStream: Boolean(videoStream),
    audioCodec: audioStream?.codec_name ?? null,
    sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
    channels: audioStream?.channels ?? null,
    formatName: parsed.format?.format_name ?? 'unknown',
  };
}

export async function extractAudioToWav(inputPath: string, outputWavPath: string): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', outputWavPath],
    { maxBuffer: 1024 * 1024 * 8 }
  );
}

export function computeWaveformPeaks(wavPath: string, targetPeaks = 96): number[] {
  if (!fs.existsSync(wavPath)) return [];
  const buf = fs.readFileSync(wavPath);
  const headerSize = 44;
  if (buf.length <= headerSize + 2) return [];

  const totalSamples = Math.floor((buf.length - headerSize) / 2);
  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / targetPeaks));
  const peaks: number[] = [];

  for (let b = 0; b < targetPeaks; b++) {
    const startSample = b * samplesPerBucket;
    const endSample = Math.min(totalSamples, startSample + samplesPerBucket);
    if (startSample >= totalSamples) {
      peaks.push(0);
      continue;
    }
    let maxAbs = 0;
    const step = Math.max(1, Math.floor((endSample - startSample) / 120));
    for (let s = startSample; s < endSample; s += step) {
      const offset = headerSize + s * 2;
      if (offset + 1 < buf.length) {
        const val = Math.abs(buf.readInt16LE(offset)) / 32768;
        if (val > maxAbs) maxAbs = val;
      }
    }
    peaks.push(Number(maxAbs.toFixed(3)));
  }

  return peaks;
}

export async function synthesizeTestMedia(
  kind: 'no_audio_video' | 'melodic_demo' | 'ambient_speech_sim',
  outputPath: string
): Promise<{ filename: string; mimeType: string }> {
  if (kind === 'no_audio_video') {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x0f172a:s=640x360:d=8',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-an',
      outputPath,
    ]);
    return { filename: 'uji_video_tanpa_audio.mp4', mimeType: 'video/mp4' };
  }

  if (kind === 'melodic_demo') {
    // 24 seconds: 0-6s quiet ambient, 6-18s clear harmonic chord progression, 18-24s fade out
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      "aevalsrc='if(between(t,5,19), 0.25*sin(2*PI*261.63*t)+0.20*sin(2*PI*329.63*t)+0.18*sin(2*PI*392.00*t), 0.002*sin(2*PI*110*t))':s=44100:d=24",
      '-c:a',
      'pcm_s16le',
      outputPath,
    ]);
    return { filename: 'uji_klip_musik_24dtk.wav', mimeType: 'audio/wav' };
  }

  // ambient_speech_sim: subtle low-level noise floor
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=18:c=pink:r=44100:a=0.04',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
  return { filename: 'uji_latar_ambien_18dtk.wav', mimeType: 'audio/wav' };
}

export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        // ignore cleanup error
      }
    }
  }
}

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { TEMP_DIR } from './db.ts';
import { formatTimestamp } from './media.ts';

const execFileAsync = promisify(execFile);

export interface AudioSegmentSlice {
  index: number;
  startSeconds: number;
  endSeconds: number;
  startLabel: string;
  endLabel: string;
  rmsDb: number;
  hasAudioActivity: boolean;
  clipPath: string;
}

function measureWavRmsDb(wavPath: string): number {
  if (!fs.existsSync(wavPath)) return -100;
  const buf = fs.readFileSync(wavPath);
  const headerSize = 44;
  if (buf.length <= headerSize + 2) return -100;

  let sumSquares = 0;
  let count = 0;
  for (let offset = headerSize; offset + 1 < buf.length; offset += 2) {
    const sample = buf.readInt16LE(offset) / 32768;
    sumSquares += sample * sample;
    count++;
  }
  if (count === 0) return -100;
  const rms = Math.sqrt(sumSquares / count);
  if (rms <= 1e-6) return -100;
  return Number((20 * Math.log10(rms)).toFixed(1));
}

export async function createAudioSegments(
  wavPath: string,
  scanId: string,
  durationSeconds: number,
  windowSeconds = 20
): Promise<AudioSegmentSlice[]> {
  if (durationSeconds <= 0 || !fs.existsSync(wavPath)) {
    return [];
  }

  const effectiveWindow = Math.max(8, Math.min(30, windowSeconds));
  const maxSegments = 12;
  const stepSeconds =
    durationSeconds / effectiveWindow > maxSegments
      ? Math.ceil(durationSeconds / maxSegments)
      : effectiveWindow;

  const slices: AudioSegmentSlice[] = [];
  let cursor = 0;
  let index = 1;

  while (cursor < durationSeconds && slices.length < maxSegments) {
    const end = Math.min(durationSeconds, cursor + stepSeconds);
    if (end - cursor < 0.5 && slices.length > 0) break;

    const clipPath = path.join(TEMP_DIR, `${scanId}_seg_${index}.wav`);
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(cursor),
        '-t',
        String(Math.max(1, end - cursor)),
        '-i',
        wavPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'pcm_s16le',
        clipPath,
      ],
      { maxBuffer: 1024 * 1024 * 4 }
    );

    const rmsDb = measureWavRmsDb(clipPath);
    const hasAudioActivity = rmsDb > -54;

    slices.push({
      index,
      startSeconds: Number(cursor.toFixed(1)),
      endSeconds: Number(end.toFixed(1)),
      startLabel: formatTimestamp(cursor),
      endLabel: formatTimestamp(end),
      rmsDb,
      hasAudioActivity,
      clipPath,
    });

    cursor = end;
    index++;
  }

  return slices;
}

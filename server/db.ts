import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LicenseRecord, ScanRecord } from '../src/types.ts';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const SCANS_DIR = path.join(DATA_DIR, 'scans');
export const REPORTS_DIR = path.join(DATA_DIR, 'reports');
export const LICENSES_DIR = path.join(DATA_DIR, 'licenses');
export const TEMP_DIR = path.resolve(process.cwd(), 'temp');

for (const dir of [DATA_DIR, SCANS_DIR, REPORTS_DIR, LICENSES_DIR, TEMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'pracek.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    source TEXT NOT NULL,
    license_type TEXT NOT NULL,
    allowed_platforms TEXT NOT NULL,
    monetization TEXT NOT NULL,
    territory TEXT NOT NULL,
    validity TEXT NOT NULL,
    attribution TEXT NOT NULL,
    proof_path TEXT NOT NULL,
    proof_original_name TEXT NOT NULL,
    notes TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    duration_seconds REAL NOT NULL,
    duration_label TEXT NOT NULL,
    has_audio_stream INTEGER NOT NULL,
    audio_codec TEXT,
    sample_rate INTEGER,
    channels INTEGER,
    waveform_peaks TEXT NOT NULL,
    overall_status TEXT NOT NULL,
    summary_reason TEXT NOT NULL,
    recommendations TEXT NOT NULL,
    segments TEXT NOT NULL,
    youtube_checks TEXT NOT NULL,
    deep_analysis TEXT,
    created_at TEXT NOT NULL
  );
`);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export function computeLicenseVerified(input: {
  allowed_platforms: string;
  monetization: string;
  proof_path: string;
  license_type: string;
}): boolean {
  const platforms = input.allowed_platforms.toLowerCase();
  const allowsYoutube =
    platforms.includes('youtube') || platforms.includes('semua') || platforms.includes('all');
  const hasProofOrOriginal =
    Boolean(input.proof_path && input.proof_path.trim().length > 0) ||
    input.license_type.toLowerCase().includes('karya sendiri') ||
    input.license_type.toLowerCase().includes('original');
  return allowsYoutube && hasProofOrOriginal && input.monetization !== 'TIDAK_BOLEH';
}

function rowToLicense(row: Record<string, unknown>): LicenseRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    artist: String(row.artist),
    source: String(row.source),
    license_type: String(row.license_type),
    allowed_platforms: String(row.allowed_platforms),
    monetization: String(row.monetization) as LicenseRecord['monetization'],
    territory: String(row.territory),
    validity: String(row.validity),
    attribution: String(row.attribution),
    proof_path: String(row.proof_path),
    proof_original_name: String(row.proof_original_name),
    notes: String(row.notes),
    verified: Boolean(row.verified),
    created_at: String(row.created_at),
  };
}

function rowToScan(row: Record<string, unknown>): ScanRecord {
  return {
    id: String(row.id),
    filename: String(row.filename),
    file_size: Number(row.file_size),
    media_type: String(row.media_type),
    duration_seconds: Number(row.duration_seconds),
    duration_label: String(row.duration_label),
    has_audio_stream: Boolean(row.has_audio_stream),
    audio_codec: row.audio_codec ? String(row.audio_codec) : null,
    sample_rate: row.sample_rate !== null && row.sample_rate !== undefined ? Number(row.sample_rate) : null,
    channels: row.channels !== null && row.channels !== undefined ? Number(row.channels) : null,
    waveform_peaks: JSON.parse(String(row.waveform_peaks || '[]')),
    overall_status: String(row.overall_status) as ScanRecord['overall_status'],
    summary_reason: String(row.summary_reason),
    recommendations: JSON.parse(String(row.recommendations || '[]')),
    segments: JSON.parse(String(row.segments || '[]')),
    youtube_checks: JSON.parse(String(row.youtube_checks || '{}')),
    deep_analysis: row.deep_analysis ? String(row.deep_analysis) : null,
    created_at: String(row.created_at),
  };
}

export function listLicenses(): LicenseRecord[] {
  const stmt = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC');
  return (stmt.all() as Record<string, unknown>[]).map(rowToLicense);
}

export function getLicenseById(id: string): LicenseRecord | null {
  const stmt = db.prepare('SELECT * FROM licenses WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  return row ? rowToLicense(row) : null;
}

export function findMatchingLicense(title: string | null, artist: string | null): LicenseRecord | null {
  if (!title && !artist) return null;
  const all = listLicenses();
  const normTitle = normalizeText(title || '');
  const normArtist = normalizeText(artist || '');

  for (const lic of all) {
    const licTitle = normalizeText(lic.title);
    const licArtist = normalizeText(lic.artist);
    const titleMatches =
      normTitle.length > 0 &&
      (licTitle === normTitle || licTitle.includes(normTitle) || normTitle.includes(licTitle));
    const artistMatches =
      normArtist.length === 0 ||
      licArtist === normArtist ||
      licArtist.includes(normArtist) ||
      normArtist.includes(licArtist);

    if (titleMatches && artistMatches) {
      return lic;
    }
  }
  return null;
}

export function createLicense(lic: LicenseRecord): LicenseRecord {
  const verified = computeLicenseVerified(lic);
  const stmt = db.prepare(`
    INSERT INTO licenses (
      id, title, artist, source, license_type, allowed_platforms,
      monetization, territory, validity, attribution, proof_path,
      proof_original_name, notes, verified, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    lic.id,
    lic.title,
    lic.artist,
    lic.source,
    lic.license_type,
    lic.allowed_platforms,
    lic.monetization,
    lic.territory,
    lic.validity,
    lic.attribution,
    lic.proof_path,
    lic.proof_original_name,
    lic.notes,
    verified ? 1 : 0,
    lic.created_at
  );
  return { ...lic, verified };
}

export function updateLicense(id: string, patch: Partial<LicenseRecord>): LicenseRecord | null {
  const existing = getLicenseById(id);
  if (!existing) return null;
  const merged: LicenseRecord = { ...existing, ...patch, id };
  merged.verified = computeLicenseVerified(merged);
  const stmt = db.prepare(`
    UPDATE licenses SET
      title = ?, artist = ?, source = ?, license_type = ?, allowed_platforms = ?,
      monetization = ?, territory = ?, validity = ?, attribution = ?,
      proof_path = ?, proof_original_name = ?, notes = ?, verified = ?
    WHERE id = ?
  `);
  stmt.run(
    merged.title,
    merged.artist,
    merged.source,
    merged.license_type,
    merged.allowed_platforms,
    merged.monetization,
    merged.territory,
    merged.validity,
    merged.attribution,
    merged.proof_path,
    merged.proof_original_name,
    merged.notes,
    merged.verified ? 1 : 0,
    id
  );
  return merged;
}

export function deleteLicense(id: string): boolean {
  const existing = getLicenseById(id);
  if (!existing) return false;
  if (existing.proof_path && fs.existsSync(existing.proof_path)) {
    try {
      fs.unlinkSync(existing.proof_path);
    } catch {
      // ignore missing file
    }
  }
  const stmt = db.prepare('DELETE FROM licenses WHERE id = ?');
  stmt.run(id);
  return true;
}

export function listScans(): ScanRecord[] {
  const stmt = db.prepare('SELECT * FROM scans ORDER BY created_at DESC');
  return (stmt.all() as Record<string, unknown>[]).map(rowToScan);
}

export function getScanById(id: string): ScanRecord | null {
  const stmt = db.prepare('SELECT * FROM scans WHERE id = ?');
  const row = stmt.get(id) as Record<string, unknown> | undefined;
  return row ? rowToScan(row) : null;
}

export function saveScan(scan: ScanRecord): ScanRecord {
  const stmt = db.prepare(`
    INSERT INTO scans (
      id, filename, file_size, media_type, duration_seconds, duration_label,
      has_audio_stream, audio_codec, sample_rate, channels, waveform_peaks,
      overall_status, summary_reason, recommendations, segments,
      youtube_checks, deep_analysis, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    scan.id,
    scan.filename,
    scan.file_size,
    scan.media_type,
    scan.duration_seconds,
    scan.duration_label,
    scan.has_audio_stream ? 1 : 0,
    scan.audio_codec,
    scan.sample_rate,
    scan.channels,
    JSON.stringify(scan.waveform_peaks),
    scan.overall_status,
    scan.summary_reason,
    JSON.stringify(scan.recommendations),
    JSON.stringify(scan.segments),
    JSON.stringify(scan.youtube_checks),
    scan.deep_analysis,
    scan.created_at
  );
  return scan;
}

export function updateScan(scan: ScanRecord): ScanRecord {
  const stmt = db.prepare(`
    UPDATE scans SET
      overall_status = ?,
      summary_reason = ?,
      recommendations = ?,
      segments = ?,
      youtube_checks = ?,
      deep_analysis = ?
    WHERE id = ?
  `);
  stmt.run(
    scan.overall_status,
    scan.summary_reason,
    JSON.stringify(scan.recommendations),
    JSON.stringify(scan.segments),
    JSON.stringify(scan.youtube_checks),
    scan.deep_analysis,
    scan.id
  );
  return scan;
}

export function deleteScan(id: string): boolean {
  const stmt = db.prepare('DELETE FROM scans WHERE id = ?');
  const info = stmt.run(id);
  for (const ext of ['json', 'md']) {
    const reportPath = path.join(REPORTS_DIR, `${id}.${ext}`);
    if (fs.existsSync(reportPath)) {
      try {
        fs.unlinkSync(reportPath);
      } catch {
        // ignore
      }
    }
  }
  return info.changes > 0;
}

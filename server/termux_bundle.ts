export interface TermuxScriptFile {
  path: string;
  description: string;
  content: string;
}

export const TERMUX_PROJECT_FILES: TermuxScriptFile[] = [
  {
    path: 'requirements.txt',
    description: 'Dependensi Python minimal sesuai rancangan Termux.',
    content: `requests
python-dotenv
`,
  },
  {
    path: 'config.example.env',
    description: 'Template kredensial API pengenalan musik (jangan bagikan .env asli).',
    content: `MUSIC_API_PROVIDER=
MUSIC_API_KEY=
MUSIC_API_SECRET=
`,
  },
  {
    path: 'src/media.py',
    description: 'Inspeksi durasi/stream via ffprobe dan ekstraksi audio PCM WAV via ffmpeg.',
    content: `import json
import subprocess
from pathlib import Path


def probe_media(input_path: str) -> dict:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        input_path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(res.stdout or "{}")
    streams = data.get("streams", [])
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = float(data.get("format", {}).get("duration") or 0)
    return {
        "duration": duration,
        "has_audio": audio_stream is not None,
        "codec": audio_stream.get("codec_name") if audio_stream else None,
        "sample_rate": audio_stream.get("sample_rate") if audio_stream else None,
    }


def extract_audio(input_path: str, output_wav: str) -> Path:
    out = Path(output_wav)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-vn",
        "-ac", "1",
        "-ar", "44100",
        "-c:a", "pcm_s16le",
        str(out),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
    return out
`,
  },
  {
    path: 'src/segment.py',
    description: 'Pemecahan audio menjadi segmen ber-timestamp agar musik singkat tidak terlewat.',
    content: `import subprocess
from pathlib import Path


def format_ts(seconds: float) -> str:
    s = max(0, int(seconds))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def slice_segments(wav_path: str, temp_dir: str, duration: float, window: int = 20) -> list[dict]:
    segments = []
    cursor = 0.0
    idx = 1
    out_dir = Path(temp_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    while cursor < duration:
        end = min(duration, cursor + window)
        if end - cursor < 1.0 and segments:
            break
        clip_path = out_dir / f"seg_{idx}.wav"
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-ss", str(cursor),
                "-t", str(end - cursor),
                "-i", wav_path,
                "-ac", "1", "-ar", "16000",
                "-c:a", "pcm_s16le",
                str(clip_path),
            ],
            capture_output=True,
            check=True,
        )
        segments.append({
            "index": idx,
            "start": cursor,
            "end": end,
            "start_label": format_ts(cursor),
            "end_label": format_ts(end),
            "clip_path": str(clip_path),
        })
        cursor = end
        idx += 1

    return segments
`,
  },
  {
    path: 'src/recognition.py',
    description: 'Pemanggilan API fingerprinting resmi (mis. AudD) dengan penanganan error jujur.',
    content: `import os
import requests


def recognize_segment(clip_path: str) -> dict:
    provider = os.getenv("MUSIC_API_PROVIDER", "").strip().lower()
    api_key = os.getenv("MUSIC_API_KEY", "").strip()

    if not provider or not api_key:
        return {
            "match_found": False,
            "title": None,
            "artist": None,
            "api_error": True,
            "note": "API pengenalan musik belum dikonfigurasi pada .env",
        }

    if provider == "audd":
        try:
            with open(clip_path, "rb") as fh:
                resp = requests.post(
                    "https://api.audd.io/",
                    data={"api_token": api_key},
                    files={"file": fh},
                    timeout=20,
                )
            resp.raise_for_status()
            payload = resp.json()
            result = payload.get("result")
            if not result:
                return {"match_found": False, "title": None, "artist": None, "api_error": False, "note": "Tidak ditemukan"}
            return {
                "match_found": True,
                "title": result.get("title"),
                "artist": result.get("artist"),
                "api_error": False,
                "note": "Cocok terdeteksi via AudD",
            }
        except Exception as exc:
            return {"match_found": False, "title": None, "artist": None, "api_error": True, "note": str(exc)}

    return {
        "match_found": False,
        "title": None,
        "artist": None,
        "api_error": True,
        "note": f"Provider '{provider}' belum diimplementasikan.",
    }
`,
  },
  {
    path: 'src/license_db.py',
    description: 'Database SQLite lisensi lagu yang dimiliki pengguna beserta bukti dokumen.',
    content: `import sqlite3
from pathlib import Path

DB_PATH = Path("data/licenses/licenses.db")


def init_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            source TEXT,
            license_type TEXT,
            allowed_platforms TEXT,
            monetization TEXT,
            territory TEXT,
            validity TEXT,
            attribution TEXT,
            proof_path TEXT,
            notes TEXT
        )
        """
    )
    conn.commit()
    return conn


def find_license(conn: sqlite3.Connection, title: str | None, artist: str | None) -> dict | None:
    if not title:
        return None
    cur = conn.execute(
        "SELECT title, artist, allowed_platforms, monetization, proof_path FROM licenses WHERE lower(title) = lower(?)",
        (title.strip(),),
    )
    row = cur.fetchone()
    if not row:
        return None
    platforms = (row[2] or "").lower()
    verified = ("youtube" in platforms or "all" in platforms) and bool(row[4])
    return {"title": row[0], "artist": row[1], "verified": verified}
`,
  },
  {
    path: 'src/risk.py',
    description: 'Mesin penilaian risiko jujur 4 kategori (MERAH, KUNING, HIJAU, ABU-ABU).',
    content: `def assess_music(match_found: bool, license_verified: bool, license_exists: bool, api_error: bool = False) -> tuple[str, str]:
    if api_error:
        return ("ABU-ABU", "Layanan pengenalan gagal/tidak tersedia; bukan bukti bebas copyright")

    if not match_found:
        return ("ABU-ABU", "Lagu tidak teridentifikasi; bukan bukti bebas copyright")

    if match_found and not license_exists:
        return ("MERAH", "Lagu teridentifikasi, bukti izin belum tersedia")

    if match_found and license_exists and not license_verified:
        return ("KUNING", "Catatan lisensi ada, periksa cakupan YouTube dan simpan bukti izin")

    return ("HIJAU", "Bukti izin tersimpan; tetap jalankan YouTube Checks sebelum publikasi")
`,
  },
  {
    path: 'src/report.py',
    description: 'Pembuat laporan JSON dan Markdown sesuai format rancangan §3.2.',
    content: `import json
from pathlib import Path


def save_reports(report_data: dict, out_dir: str = "data/reports", stem: str = "laporan") -> None:
    target = Path(out_dir)
    target.mkdir(parents=True, exist_ok=True)
    (target / f"{stem}.json").write_text(json.dumps(report_data, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        f"VIDEO       : {report_data['video']}",
        f"DURASI      : {report_data['duration_label']}",
        f"STATUS      : {report_data['overall_status']}",
        "",
        "KANDIDAT MUSIK:",
    ]
    for seg in report_data["segments"]:
        lines.extend([
            f"{seg['index']}. {seg['start_label']} - {seg['end_label']}",
            f"   Judul     : {seg['title'] or 'Tidak teridentifikasi'}",
            f"   Artis     : {seg['artist'] or '-'}",
            f"   Pengenalan: {seg['note']}",
            f"   Risiko    : {seg['risk']} ({seg['reason']})",
            "",
        ])
    lines.append("REKOMENDASI:")
    lines.append("- Jangan menganggap lagu aman hanya karena hasil pengenalan tidak menemukan kecocokan.")
    lines.append("- Jalankan YouTube Checks saat upload dan tunggu sampai selesai sebelum publikasi.")
    (target / f"{stem}.md").write_text("\\n".join(lines), encoding="utf-8")
`,
  },
  {
    path: 'app.py',
    description: 'Entrypoint CLI Termux/Desktop untuk menjalankan alur pra-pemeriksaan end-to-end.',
    content: `import shutil
import sys
from pathlib import Path
from dotenv import load_dotenv

from src.license_db import find_license, init_db
from src.media import extract_audio, probe_media
from src.recognition import recognize_segment
from src.report import save_reports
from src.risk import assess_music
from src.segment import format_ts, slice_segments


def main() -> None:
    load_dotenv()
    if len(sys.argv) < 2:
        print("Pemakaian: python app.py <path_video_atau_audio>")
        sys.exit(1)

    input_path = sys.argv[1]
    meta = probe_media(input_path)
    if not meta["has_audio"]:
        print("ABU-ABU: File tidak memiliki stream audio. Tetap jalankan YouTube Checks.")
        sys.exit(0)

    temp_dir = Path("temp")
    wav_path = extract_audio(input_path, str(temp_dir / "audio.wav"))
    slices = slice_segments(str(wav_path), str(temp_dir), meta["duration"])
    conn = init_db()

    segments_out = []
    for seg in slices:
        rec = recognize_segment(seg["clip_path"])
        lic = find_license(conn, rec["title"], rec["artist"])
        risk, reason = assess_music(
            match_found=rec["match_found"],
            license_verified=bool(lic and lic["verified"]),
            license_exists=bool(lic),
            api_error=rec["api_error"],
        )
        segments_out.append({
            "index": seg["index"],
            "start_label": seg["start_label"],
            "end_label": seg["end_label"],
            "title": rec["title"],
            "artist": rec["artist"],
            "note": rec["note"],
            "risk": risk,
            "reason": reason,
        })

    overall = "MERAH" if any(s["risk"] == "MERAH" for s in segments_out) else (
        "KUNING" if any(s["risk"] == "KUNING" for s in segments_out) else "ABU-ABU"
    )
    save_reports({
        "video": Path(input_path).name,
        "duration_label": format_ts(meta["duration"]),
        "overall_status": overall,
        "segments": segments_out,
    })
    shutil.rmtree(temp_dir, ignore_errors=True)
    print(f"Selesai. Status: {overall}. Laporan tersimpan di data/reports/")


if __name__ == "__main__":
    main()
`,
  },
];

export type RiskLevel = 'MERAH' | 'KUNING' | 'HIJAU' | 'ABU-ABU';

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export interface LicenseRecord {
  id: string;
  title: string;
  artist: string;
  source: string;
  license_type: string;
  allowed_platforms: string;
  monetization: 'BOLEH' | 'TIDAK_BOLEH' | 'BERSYARAT';
  territory: string;
  validity: string;
  attribution: string;
  proof_path: string;
  proof_original_name: string;
  notes: string;
  verified: boolean;
  created_at: string;
}

export interface SegmentResult {
  index: number;
  start_seconds: number;
  end_seconds: number;
  start_label: string;
  end_label: string;
  rms_db: number;
  has_audio_activity: boolean;
  detected_title: string | null;
  detected_artist: string | null;
  recognition_source: 'AUDD_API' | 'ACRCLOUD_API' | 'GEMINI_AUDIO' | 'MANUAL_INPUT' | 'NONE';
  recognition_note: string;
  confidence: number | null;
  acoustic_profile: string;
  license_id: string | null;
  license_status: string;
  risk_level: RiskLevel;
  risk_reason: string;
  api_error: string | null;
}

export interface YoutubeCheckState {
  uploaded_private_or_unlisted: boolean;
  waited_checks_complete: boolean;
  inspected_claim_details: boolean;
  verified_attribution_and_proof: boolean;
  final_youtube_result: 'BELUM' | 'TIDAK_ADA_MASALAH' | 'ADA_KLAIM' | 'DIBLOKIR';
  notes: string;
}

export interface ScanRecord {
  id: string;
  filename: string;
  file_size: number;
  media_type: string;
  duration_seconds: number;
  duration_label: string;
  has_audio_stream: boolean;
  audio_codec: string | null;
  sample_rate: number | null;
  channels: number | null;
  waveform_peaks: number[];
  overall_status: RiskLevel;
  summary_reason: string;
  recommendations: string[];
  segments: SegmentResult[];
  youtube_checks: YoutubeCheckState;
  deep_analysis: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: GeminiModelId;
  thinkingUsed?: boolean;
  timestamp: string;
  error?: string;
}

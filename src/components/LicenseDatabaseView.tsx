import {
  CheckCircle2,
  Download,
  FileCheck2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { LicenseRecord } from '../types.ts';

interface LicenseDatabaseViewProps {
  licenses: LicenseRecord[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

interface LicenseFormState {
  title: string;
  artist: string;
  source: string;
  license_type: string;
  allowed_platforms: string;
  monetization: 'BOLEH' | 'TIDAK_BOLEH' | 'BERSYARAT';
  territory: string;
  validity: string;
  attribution: string;
  notes: string;
}

const INITIAL_FORM: LicenseFormState = {
  title: '',
  artist: '',
  source: '',
  license_type: 'Lisensi Komersial Tertulis',
  allowed_platforms: 'YouTube',
  monetization: 'BOLEH',
  territory: 'Seluruh Dunia',
  validity: 'Permanen',
  attribution: 'Tidak diperlukan',
  notes: '',
};

export function LicenseDatabaseView({
  licenses,
  loading,
  onRefresh,
}: LicenseDatabaseViewProps) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LicenseFormState>(INITIAL_FORM);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return licenses;
    return licenses.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.artist.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q) ||
        l.license_type.toLowerCase().includes(q)
    );
  }, [licenses, search]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.artist.trim()) {
      setError('Judul musik dan nama pencipta/artis wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('artist', form.artist.trim());
      fd.append('source', form.source.trim());
      fd.append('license_type', form.license_type.trim());
      fd.append('allowed_platforms', form.allowed_platforms.trim());
      fd.append('monetization', form.monetization);
      fd.append('territory', form.territory.trim());
      fd.append('validity', form.validity.trim());
      fd.append('attribution', form.attribution.trim());
      fd.append('notes', form.notes.trim());
      if (proofFile) {
        fd.append('proof', proofFile);
      }

      const res = await fetch('/api/licenses', { method: 'POST', body: fd });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan catatan lisensi.');
      }

      setForm(INITIAL_FORM);
      setProofFile(null);
      setShowForm(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/licenses/${id}`, { method: 'DELETE' });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Database Lisensi Musik</h2>
          <p className="text-sm text-slate-600 mt-1">
            Catat musik karya sendiri atau berlisensi lengkap dengan bukti izin, cakupan platform, monetisasi, dan wilayah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul, artis, sumber..."
              className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-60"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            <span>{showForm ? 'Tutup Form' : 'Tambah Lisensi'}</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-700">
        Jangan menandai musik sebagai berlisensi hanya berdasarkan nama file, label &ldquo;no copyright&rdquo;, atau komentar pengunggah. Unggah invoice, kontrak, atau halaman bukti izin resmi agar verifikasi berstatus terkonfirmasi.
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-semibold text-slate-900">
              Catat Lisensi &amp; Bukti Izin Baru
            </h3>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Judul Musik *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Contoh: Morning Horizon"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Pencipta / Artis *
              </label>
              <input
                type="text"
                required
                value={form.artist}
                onChange={(e) => setForm({ ...form, artist: e.target.value })}
                placeholder="Contoh: Studio Nada"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sumber Pembelian / Unduhan
              </label>
              <input
                type="text"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="YouTube Audio Library / Epidemic / Karya Sendiri"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Jenis Lisensi
              </label>
              <input
                type="text"
                value={form.license_type}
                onChange={(e) => setForm({ ...form, license_type: e.target.value })}
                placeholder="Lisensi Komersial / Karya Sendiri / CC-BY 4.0"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Platform yang Diizinkan
              </label>
              <input
                type="text"
                value={form.allowed_platforms}
                onChange={(e) => setForm({ ...form, allowed_platforms: e.target.value })}
                placeholder="YouTube, YouTube Shorts"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Monetisasi
              </label>
              <select
                value={form.monetization}
                onChange={(e) =>
                  setForm({
                    ...form,
                    monetization: e.target.value as LicenseFormState['monetization'],
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="BOLEH">Diizinkan (Boleh Monetisasi)</option>
                <option value="BERSYARAT">Bersyarat (Periksa Ketentuan)</option>
                <option value="TIDAK_BOLEH">Tidak Diizinkan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Wilayah (Territory)
              </label>
              <input
                type="text"
                value={form.territory}
                onChange={(e) => setForm({ ...form, territory: e.target.value })}
                placeholder="Seluruh Dunia"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Masa Berlaku
              </label>
              <input
                type="text"
                value={form.validity}
                onChange={(e) => setForm({ ...form, validity: e.target.value })}
                placeholder="Permanen / s.d. Des 2027"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kewajiban Atribusi
              </label>
              <input
                type="text"
                value={form.attribution}
                onChange={(e) => setForm({ ...form, attribution: e.target.value })}
                placeholder="Cantumkan kredit di deskripsi / Tidak perlu"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bukti Invoice / Kontrak / Izin (PDF, PNG, JPG, TXT)
              </label>
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="truncate">
                  {proofFile ? proofFile.name : 'Pilih file bukti dokumen izin...'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt,.md"
                  className="hidden"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Ketentuan Tambahan
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Catatan khusus mis. batas jumlah channel atau proyek"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Catatan Lisensi'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
          <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
          <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <FileCheck2 className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            {licenses.length === 0
              ? 'Database lisensi masih kosong'
              : 'Tidak ada lisensi yang cocok dengan pencarian'}
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-5">
            Tambahkan musik yang izinnya Anda miliki beserta bukti invoice atau kontrak agar sistem dapat mencocokkan kandidat lagu secara akurat.
          </p>
          {licenses.length === 0 && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Catat Lisensi Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-3 px-4">Judul &amp; Artis</th>
                  <th className="py-3 px-4">Sumber &amp; Lisensi</th>
                  <th className="py-3 px-4">Cakupan</th>
                  <th className="py-3 px-4">Status Bukti</th>
                  <th className="py-3 px-4 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((lic) => (
                  <tr key={lic.id} className="hover:bg-slate-50/80 transition-colors align-top">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{lic.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{lic.artist}</div>
                      {lic.notes && (
                        <div className="text-xs text-slate-500 mt-1 max-w-xs">{lic.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-900">{lic.license_type}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {lic.source || 'Sumber tidak dicatat'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Atribusi: {lic.attribution}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 space-y-1">
                      <div>Platform: {lic.allowed_platforms}</div>
                      <div>Monetisasi: {lic.monetization.replaceAll('_', ' ')}</div>
                      <div>
                        Wilayah: {lic.territory} · Berlaku: {lic.validity}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {lic.verified ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 rounded whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Terverifikasi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded whitespace-nowrap">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Bukti / Cakupan Belum Lengkap</span>
                        </span>
                      )}
                      {lic.proof_original_name && (
                        <div className="mt-1.5">
                          <a
                            href={`/api/licenses/${lic.id}/proof`}
                            className="inline-flex items-center gap-1 text-xs text-slate-700 underline hover:text-slate-900"
                          >
                            <Download className="w-3 h-3" />
                            <span className="truncate max-w-[160px]">
                              {lic.proof_original_name}
                            </span>
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(lic.id)}
                        aria-label={`Hapus lisensi ${lic.title}`}
                        className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

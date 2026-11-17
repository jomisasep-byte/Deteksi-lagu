# Rancangan Sistem Deteksi Musik Berisiko Copyright untuk YouTube

**Versi:** 1.0\
**Tanggal:** 17 November 2026\
**Tujuan:** memeriksa audio dalam video sebelum diunggah, mengenali lagu
yang mungkin digunakan, menandai risiko hak penggunaan, dan membantu
kreator memilih tindakan yang sah.

------------------------------------------------------------------------

## 1. Ringkasan

Sistem ini dirancang sebagai **pra-pemeriksa musik (pre-upload music
checker)**. Pengguna memasukkan video atau audio, lalu sistem:

1.  Mengekstrak audio dari video.
2.  Memecah audio menjadi beberapa segmen agar musik yang hanya muncul
    sebentar tidak terlewat.
3.  Mengirim sampel audio ke layanan pengenalan musik yang sah (jika API
    tersedia).
4.  Menampilkan kemungkinan judul, artis, dan waktu kemunculan lagu.
5.  Membandingkan hasil pengenalan dengan daftar musik yang lisensinya
    dimiliki pengguna.
6.  Memberikan status risiko dan laporan.
7.  Menyarankan tindakan aman: mengganti lagu, menghapus segmen,
    memperoleh lisensi, atau menggunakan musik dari sumber yang sesuai.

**Penting:** sistem pihak ketiga tidak dapat memastikan apakah YouTube
akan memberi Content ID claim atau memblokir video. Hanya pemeriksaan
YouTube pada proses upload yang dapat memberi hasil pemeriksaan YouTube
untuk video tersebut. Hasil sistem ini adalah indikasi, bukan jaminan
bebas klaim.

## 2. Memahami masalah hak cipta

YouTube menggunakan Content ID untuk mencocokkan audio/video yang
diunggah dengan referensi yang diserahkan pemegang hak. Jika ada
kecocokan, pemegang hak dapat memilih kebijakan seperti memonetisasi,
melacak, atau memblokir video; kebijakan dapat berbeda menurut wilayah.

Bedakan istilah berikut:

-   **Content ID claim:** klaim otomatis atas kecocokan materi.
    Dampaknya bisa monetisasi, pelacakan, atau pemblokiran.
-   **Copyright takedown:** permintaan penghapusan yang sah; dapat
    berujung pada copyright strike.
-   **Musik berlisensi:** musik yang penggunaannya diizinkan berdasarkan
    lisensi tertentu. Lisensi harus mencakup platform, wilayah, durasi,
    monetisasi, dan jenis penggunaan yang diperlukan.
-   **Royalty-free:** bukan berarti bebas semua hak atau otomatis aman
    di YouTube. Ketentuan lisensi tetap harus diperiksa.

Mengubah pitch, mempercepat/memperlambat, memotong lagu, menambah noise,
atau mengecilkan volume **bukan cara legal untuk memperoleh hak
penggunaan** dan tidak menjamin lolos Content ID. Sistem ini tidak akan
mengubah audio untuk menghindari deteksi.

## 3. Fitur yang ditargetkan

### 3.1 Fitur utama

  -----------------------------------------------------------------------
  Fitur                               Fungsi
  ----------------------------------- -----------------------------------
  Input video                         Memeriksa MP4, MOV, MKV, WebM, dan
                                      format yang didukung FFmpeg

  Input audio                         Memeriksa MP3, WAV, M4A, AAC, FLAC,
                                      dan format yang didukung FFmpeg

  Ekstraksi audio                     Mengambil jalur audio dari video
                                      tanpa mengubah file asli

  Segmentasi                          Memeriksa beberapa bagian audio
                                      dengan penanda waktu

  Pengenalan lagu                     Mengidentifikasi kandidat
                                      judul/artis melalui API
                                      fingerprinting

  Daftar lisensi                      Menyimpan lagu yang memang sudah
                                      dimiliki izin pengguna

  Penilaian risiko                    Menggabungkan hasil pengenalan dan
                                      bukti lisensi

  Laporan                             Menyimpan hasil ke JSON dan
                                      Markdown

  Riwayat                             Menyimpan hasil pemeriksaan
                                      sebelumnya

  Pemeriksaan akhir                   Mengingatkan pengguna untuk
                                      menunggu YouTube Checks selesai
                                      sebelum publikasi
  -----------------------------------------------------------------------

### 3.2 Format laporan

Contoh hasil:

``` text
VIDEO       : video_final.mp4
DURASI      : 00:03:42
STATUS      : PERLU DITINJAU

KANDIDAT MUSIK:
1. 00:00:18 - 00:00:48
   Judul     : Contoh Track
   Artis     : Contoh Artist
   Pengenalan: Cocok terdeteksi
   Lisensi   : Belum ada bukti
   Risiko    : TINGGI / PERLU VERIFIKASI

REKOMENDASI:
- Jangan menganggap lagu aman hanya karena hasil pengenalan tidak menemukan kecocokan.
- Periksa lisensi dan simpan bukti izin.
- Ganti bagian musik dengan musik yang izin penggunaannya jelas.
- Jalankan YouTube Checks saat upload dan tunggu sampai selesai.
```

Nama lagu pada contoh di atas hanya data ilustrasi.

## 4. Arsitektur sistem

``` text
[Video / Audio]
      |
      v
[Validasi file dan metadata]
      |
      v
[FFmpeg: ekstraksi audio]
      |
      v
[Segmentasi audio + timestamp]
      |
      v
[Music Recognition API]
      |
      v
[Normalisasi hasil pengenalan]
      |
      +----------------------+
      |                      |
      v                      v
[Database lisensi]     [Hasil kandidat lagu]
      |                      |
      +----------+-----------+
                 |
                 v
        [Mesin penilaian risiko]
                 |
                 v
        [Laporan JSON / Markdown]
                 |
                 v
        [Pemeriksaan YouTube Checks]
```

### Komponen

1.  **Python:** mengatur proses dan membuat laporan.
2.  **FFmpeg / FFprobe:** membaca media dan mengekstrak audio.
3.  **Layanan fingerprinting:** mengenali kandidat lagu dari sampel
    audio. Contoh layanan yang dapat dievaluasi: ACRCloud atau AudD.
    Periksa harga, batas penggunaan, wilayah, privasi, dan ketentuan API
    sebelum memilih.
4.  **SQLite:** menyimpan riwayat pemindaian dan data lisensi.
5.  **JSON/Markdown:** format keluaran yang mudah dibaca dan
    dicadangkan.

Pengenalan lagu bukan pemeriksaan status hak cipta. API dapat mengenali
lagu tanpa mengetahui apakah pengguna memiliki lisensi untuk video
YouTube-nya.

## 5. Penilaian risiko yang jujur

Gunakan kategori berikut, bukan klaim "pasti aman".

  -----------------------------------------------------------------------
  Status                  Kondisi                 Tindakan
  ----------------------- ----------------------- -----------------------
  MERAH --- Risiko tinggi Lagu dikenal dan bukti  Jangan publikasikan
                          izin tidak ada/tidak    sebelum hak penggunaan
                          sesuai                  jelas; ganti atau
                                                  dapatkan izin

  KUNING --- Perlu        Lagu dikenal, tetapi    Periksa dokumen
  verifikasi              lisensi belum diperiksa lisensi, monetisasi,
                          atau cakupannya tidak   wilayah, dan platform
                          jelas                   

  HIJAU --- Bukti         Musik dibuat sendiri    Tetap jalankan YouTube
  tersedia                atau dokumen izin yang  Checks; klaim keliru
                          relevan tersimpan dan   atau perubahan
                          sudah diperiksa         kebijakan masih mungkin
                                                  terjadi

  ABU-ABU --- Tidak       API tidak menemukan     Bukan berarti bebas
  teridentifikasi         lagu atau layanan gagal copyright; lakukan
                                                  pemeriksaan sumber
                                                  musik dan YouTube
                                                  Checks
  -----------------------------------------------------------------------

**Aturan penting:** "tidak ditemukan" tidak boleh otomatis diberi status
hijau.

## 6. Rancangan folder proyek

``` text
music-checker/
├── app.py
├── config.example.env
├── requirements.txt
├── README.md
├── data/
│   ├── scans/
│   ├── reports/
│   └── licenses/
├── src/
│   ├── media.py
│   ├── segment.py
│   ├── recognition.py
│   ├── license_db.py
│   ├── risk.py
│   └── report.py
└── temp/
```

File `temp/` sebaiknya dibersihkan setelah proses selesai. Jangan
mengunggah file video pribadi ke layanan pihak ketiga tanpa memahami
kebijakan privasinya.

## 7. Persiapan di Termux (Android)

Perintah berikut menyiapkan lingkungan dasar. Jalankan satu per satu:

``` bash
pkg update && pkg upgrade -y
pkg install python ffmpeg git -y

mkdir -p ~/music-checker/{data/scans,data/reports,data/licenses,src,temp}
cd ~/music-checker

python -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
```

Buat `requirements.txt`:

``` text
requests
python-dotenv
```

Pasang dependensi:

``` bash
pip install -r requirements.txt
```

Periksa instalasi:

``` bash
python --version
ffmpeg -version
ffprobe -version
```

Catatan: beberapa paket atau layanan API mungkin memerlukan penyesuaian
pada versi Android/Termux. Jangan memasukkan API key ke kode yang
dibagikan atau diunggah ke Git.

## 8. Konfigurasi API pengenalan musik

Pilih satu penyedia pengenalan musik yang memiliki API resmi dan
ketentuan penggunaan yang sesuai. Buat akun langsung pada situs penyedia
dan dapatkan kredensial resmi.

Buat file `.env` (jangan dibagikan):

``` env
MUSIC_API_PROVIDER=
MUSIC_API_KEY=
MUSIC_API_SECRET=
```

Jangan mengisi nilai dengan token palsu. Nama variabel, metode
autentikasi, batas durasi, ukuran sampel, dan format respons berbeda
antarpenyedia. Modul `recognition.py` harus dibuat mengikuti dokumentasi
resmi penyedia yang dipilih; jangan menebak endpoint atau format tanda
tangan API.

**Privasi:** kirim hanya cuplikan audio yang diperlukan, jika diizinkan
oleh penyedia dan disetujui pengguna. Periksa kebijakan retensi dan
pemrosesan data.

## 9. Alur kerja pemeriksaan

1.  Pengguna memilih file video/audio.
2.  Program memeriksa apakah file ada, dapat dibaca, dan formatnya
    didukung.
3.  FFprobe membaca durasi dan stream audio.
4.  FFmpeg mengekstrak audio sementara ke format yang disyaratkan
    penyedia.
5.  Program membagi audio menjadi segmen yang sesuai batas API.
6.  Setiap segmen dikirim ke layanan pengenalan resmi.
7.  Hasil disimpan bersama timestamp dan tingkat keyakinan yang
    disediakan API.
8.  Program mencocokkan lagu dengan database lisensi pengguna.
9.  Mesin risiko membuat status MERAH/KUNING/HIJAU/ABU-ABU.
10. Laporan dibuat; file asli tidak diubah.
11. Pengguna melakukan pemeriksaan akhir melalui YouTube Studio.

### Contoh ekstraksi audio manual

``` bash
ffmpeg -i "video.mp4" -vn -ac 1 -ar 44100 -c:a pcm_s16le "temp/audio.wav"
```

Perintah ini mengekstrak audio saja. Ia tidak mendeteksi copyright dan
tidak mengubah status hak cipta lagu.

### Contoh membaca durasi

``` bash
ffprobe -v error -show_entries format=duration \
-of default=noprint_wrappers=1:nokey=1 "video.mp4"
```

## 10. Database lisensi

Setiap musik yang digunakan sebaiknya memiliki catatan:

  Kolom               Isi
  ------------------- ------------------------------------------
  title               Judul musik
  artist              Nama pencipta/artis
  source              Sumber pembelian/unduhan
  license_type        Jenis lisensi
  allowed_platforms   Platform yang diizinkan
  monetization        Boleh/tidak/bersyarat
  territory           Wilayah yang dicakup
  validity            Masa berlaku
  attribution         Kewajiban atribusi
  proof_path          Lokasi invoice, kontrak, atau bukti izin
  notes               Ketentuan tambahan

Jangan menandai musik sebagai berlisensi hanya berdasarkan nama file,
deskripsi "no copyright", atau komentar pengunggah. Simpan dokumen
lisensi dan periksa apakah lisensi mencakup penggunaan yang benar-benar
dilakukan.

## 11. Rancangan mesin penilaian

Logika awal:

``` python
def assess_music(match_found, license_verified, api_error=False):
    if api_error:
        return "ABU-ABU: layanan pengenalan gagal"

    if not match_found:
        return "ABU-ABU: lagu tidak teridentifikasi; bukan bukti bebas copyright"

    if match_found and not license_verified:
        return "MERAH: lagu teridentifikasi, bukti izin belum tersedia"

    if match_found and license_verified:
        return "KUNING/HIJAU: periksa cakupan lisensi dan simpan bukti"

    return "KUNING: perlu pemeriksaan manual"
```

Dalam implementasi akhir, `license_verified` harus berasal dari
pemeriksaan catatan lisensi dan cakupannya, bukan sekadar checkbox tanpa
bukti. Bahkan status hijau tidak menjamin YouTube tidak akan membuat
klaim.

## 12. Pemeriksaan akhir di YouTube

Setelah pra-pemeriksaan:

1.  Buka YouTube Studio.
2.  Mulai upload video sebagai **Private** atau **Unlisted** sesuai
    kebutuhan.
3.  Tunggu tahap **Checks** / pemeriksaan hak cipta selesai.
4.  Jika ada masalah, buka detail klaim dan periksa bagian konten yang
    digunakan, pemilik klaim, serta wilayah/pembatasannya.
5.  Jika musik memang tidak memiliki izin yang diperlukan, ganti/hapus
    bagian tersebut atau dapatkan izin yang sesuai.
6.  Jika kamu benar-benar memiliki hak dan klaimnya keliru, siapkan
    bukti sebelum mengajukan sengketa.
7.  Jangan publikasikan sebelum memahami hasil pemeriksaan dan
    konsekuensinya.

Pemeriksaan YouTube adalah langkah akhir yang penting. Sistem eksternal
tidak memiliki akses ke database referensi privat Content ID milik
YouTube.

## 13. Sumber musik yang lebih aman

Prioritaskan:

-   **YouTube Audio Library** di YouTube Studio; baca ketentuan atribusi
    pada setiap track.
-   Musik yang dibuat sendiri dan seluruh hak rekamannya dikuasai.
-   Musik dengan lisensi tertulis yang secara jelas mengizinkan
    penggunaan di YouTube, termasuk monetisasi bila diperlukan.
-   Creator Music jika fitur dan lisensinya tersedia untuk akun/wilayah
    serta penggunaan yang dimaksud.

Hati-hati dengan label "no copyright", "free download", atau
"royalty-free". Label tersebut sendiri bukan bukti izin. Musik yang aman
untuk satu jenis video atau Shorts belum tentu aman untuk video lain
atau penggunaan komersial.

## 14. Batasan sistem

-   API pengenalan musik bisa gagal mengenali remix, cover, musik yang
    dipercepat, suara latar, atau potongan sangat pendek.
-   Lagu yang tidak ditemukan tetap mungkin memiliki hak cipta.
-   Database layanan pihak ketiga tidak sama dengan database Content ID.
-   Pemegang hak dapat mengubah kebijakan klaim.
-   Lisensi dapat memiliki batas platform, wilayah, waktu, monetisasi,
    dan jenis penggunaan.
-   Sistem ini tidak dapat menjanjikan video bebas klaim atau bebas
    blokir.
-   Jangan menggunakan sistem untuk mengubah audio agar menghindari
    fingerprinting atau menyamarkan penggunaan musik tanpa izin.

## 15. Tahapan pembangunan

### Tahap 1 --- MVP lokal

-   Memilih file video/audio.
-   Membaca durasi.
-   Mengekstrak audio dengan FFmpeg.
-   Membuat laporan dasar.

### Tahap 2 --- Pengenalan lagu

-   Memilih penyedia API resmi.
-   Menambahkan autentikasi aman.
-   Mengirim segmen audio.
-   Menyimpan hasil dan timestamp.
-   Menangani limit, timeout, dan kegagalan API.

### Tahap 3 --- Pemeriksaan lisensi

-   Database SQLite.
-   Form pencatatan lisensi.
-   Penyimpanan lokasi bukti izin.
-   Pemeriksaan cakupan platform dan monetisasi.

### Tahap 4 --- Laporan dan antarmuka

-   Laporan terminal berwarna.
-   Laporan Markdown/JSON.
-   Riwayat pemeriksaan.
-   Pembersihan file sementara.

### Tahap 5 --- Uji dan validasi

-   Uji file tanpa audio.
-   Uji musik yang haknya dimiliki.
-   Uji lagu yang diketahui.
-   Uji potongan pendek dan musik latar.
-   Bandingkan indikasi sistem dengan hasil YouTube Checks.
-   Catat false positive dan false negative.

## 16. Kriteria selesai

Proyek dapat dianggap siap untuk pemakaian awal jika:

-   [ ] Video dan audio dapat dibaca.
-   [ ] Audio dapat diekstrak tanpa mengubah file asli.
-   [ ] Timestamp segmen akurat.
-   [ ] API resmi dapat dipanggil dengan kredensial yang aman.
-   [ ] Kegagalan API tidak dianggap sebagai hasil aman.
-   [ ] Hasil pengenalan tersimpan.
-   [ ] Bukti dan cakupan lisensi dapat dicatat.
-   [ ] Laporan menampilkan status dan alasan.
-   [ ] File sementara dibersihkan.
-   [ ] Pengguna tetap diarahkan untuk menjalankan YouTube Checks.

## 17. Referensi resmi

1.  YouTube Help --- How Content ID works:\
    https://support.google.com/youtube/answer/2797370

2.  YouTube Help --- Learn about copyright claims:\
    https://support.google.com/youtube/answer/6013276

3.  YouTube Help --- Tips to find safe music:\
    https://support.google.com/youtube/answer/15577610

4.  YouTube Help --- Restrictions on claimed music:\
    https://support.google.com/youtube/answer/6364458

5.  YouTube Audio Library dapat dibuka melalui YouTube Studio.

------------------------------------------------------------------------

## 18. Keputusan implementasi berikutnya

Agar proyek dapat dibuat menjadi program yang benar-benar berjalan,
tentukan pilihan berikut:

-   **Mode perangkat:** Termux Android atau komputer.
-   **Pemeriksaan:** video MP4 langsung, file audio, atau keduanya.
-   **Pengenalan lagu:** pilih penyedia API resmi setelah memeriksa
    biaya dan dokumentasinya.
-   **Keluaran:** terminal, laporan Markdown, atau keduanya.

Rekomendasi awal: bangun versi Termux yang menerima MP4/MP3, mengekstrak
audio, memeriksa segmen melalui API resmi, lalu membuat laporan risiko.
Setelah itu tambahkan database lisensi dan riwayat.

**Target akhir:** sebelum video dipublikasikan, pengguna mendapat
informasi lagu yang terdeteksi, bagian waktu kemunculannya, status bukti
lisensi, dan tindakan yang perlu dilakukan --- tanpa menjanjikan hasil
yang tidak dapat dipastikan.

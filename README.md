# Dashboard Pengelolaan Sampah Kota Semarang (2021–2025)

Prototipe dashboard statis (HTML + CSS + JavaScript, tanpa dependensi runtime) untuk Tugas Besar **VISDAT Kelompok 4 — Smart City: Perancangan Dashboard Pengelolaan Sampah Kota Semarang**, Universitas Diponegoro.

Dashboard menyajikan KPI agregat per tahun untuk Kota Semarang dan dirancang dengan pola **Shneiderman's Mantra** (*Overview First → Zoom & Filter → Details on Demand*):

| Zona | Isi | Idiom visual |
|---|---|---|
| ZONA ATAS | Executive scorecards (jawaban < 3 detik) | Scorecard + status warna |
| ZONA TENGAH | Tren timbulan vs terkelola; % terkelola; indeks vs 2021 | Line chart, bar chart |
| ZONA BAWAH | Komposisi kategori; kesenjangan; ringkas CBQ | Horizontal bar chart, panel ringkasan |

## Cara membuka

Langsung buka `index.html` di browser (double-click), atau sajikan via server lokal:

```bash
python -m http.server 8000
# buka http://localhost:8000
```

Tidak perlu `npm install` / build step.

## Regenerasi data dashboard

Angka di dashboard **tidak diketik manual**. Semuanya diekstrak dari CSV bersih ke `assets/data.js` oleh:

```bash
python tools/build_data.py
```

Jalankan ulang perintah itu setiap kali file di folder `data/` berubah. `index.html` tetap bisa dibuka langsung karena `data.js` sudah ikut di-commit.

## Pengujian otomatis

```bash
python tools/verify_dashboard.py
```

Script ini memvalidasi ulang angka dashboard langsung dari CSV (konsistensi rumus timbulan/terkelola/belum terkelola, komposisi NA, indeks vs 2021). Hasil terakhir: seluruh pemeriksaan lulus.

## Sumber data & keterbatasan

- **SIPSN/KLHK** — timbulan, capaian pengelolaan, komposisi (agregat Kota Semarang, 2021–2025).
- **BPS** (sesuai dokumentasi workbook kelompok) — jumlah penduduk; rekonsiliasi 16 kecamatan vs total Kota Semarang **LULUS** (`validasi_data.csv`).
- **Kategori “Kayu Ranting” 2021–2024 tidak memiliki nilai (NA)** pada sumber dan **tidak** ditampilkan sebagai 0%. Komposisi 2025 totalnya 100%.
- **Keterbandingan 2024–2025 PERLU TINJAU** — perubahan definisi/cakupan pelaporan membatasi perbandingan antartahun. Perubahan penanganan 2023→2024 (−309.924,20 ton) dan 2024→2025 (+112.227,01 ton) adalah sinyal audit pencatatan, bukan evaluasi kausal kinerja lapangan. Lihat `validasi_data.csv` dan panel *Detail & sumber* di dashboard.
- **Pertumbuhan pada `tumbuh_sampah` / `tumbuh_penduduk` bersifat kumulatif** sejak 2021 (2021 = dasar), bukan year-on-year.
- Dashboard ini **bukan** pemantauan real-time, dan data hanya agregat tingkat kota — tidak ada choropleth per kecamatan.

### Ambang alert (usulan, belum resmi)

Warna hijau/kuning/merah pada scorecard “Terkelola (%)” dan bar 2021–2025 memakai ambang **usulan**:

- hijau ≥ 90%
- kuning 60–90%
- merah < 60%

Ambang ini **bukan target resmi / kebijakan**. Pada data: 2021–2023 ≥ 90% (hijau), 2024 ≈ 27,47% (merah), 2025 ≈ 61,60% (kuning).

## Publikasi dataset

Dataset bersih dipublikasikan di Zenodo:

- **DOI:** [10.5281/zenodo.24240544](https://zenodo.org/records/24240544)
- Versi 1.0.0 · 2026-11-15
- Akses berkas **Restricted** (metadata/DOI publik); lisensi kustom pada rekaman **bukan** pengganti hak redistribusi SIPSN/KLHK dan BPS.

## Struktur repo

```
index.html              # halaman dashboard (3 zona)
assets/styles.css       # tampilan & palet warna (alert hijau/kuning/merah)
assets/app.js           # logika render chart SVG + interaksi filter
assets/data.js          # DIGENERATE dari CSV (jangan edit manual)
tools/build_data.py     # ekstraksi CSV → assets/data.js
data/                   # salinan dataset bersih yang dipakai dashboard
```

## Verifikasi cepat konsistensi angka

- `selisih_rumus` (master KPI) ≈ 0 untuk 2021–2025.
- Komposisi 2025: sisa makanan 61,0% + plastik 18,0% = 79,0% (fokus CBQ2).
- Indeks 2021 = 100 → timbulan 2025 ≈ 101,00; penduduk 2025 ≈ 103,98.

## Screenshot

- `docs/dashboard-full.png` — tampilan penuh dashboard (tahun 2025, dengan donut & tabel komposisi).
- `docs/dashboard-interaksi-tahun-2021-detail.png` — filter tahun 2021 (komposisi dengan kategori NA) + panel “Detail & sumber” terbuka.

## Kontributor

Kelompok 4 — Nawaal Hanif Mumtaz Arriye, Adam Mulya Rasyid, Fazl Nizam Priyambodho, Muhammad Nauval Fadli.
Implementasi dashboard (anggota 4): pemilihan idiom visual, encoding, layout 3 zona, implementasi & pengujian.

# Dashboard Pengelolaan Sampah Kota Semarang (2021–2025)

Prototipe dashboard statis (HTML + CSS + JavaScript, tanpa dependensi runtime) untuk Tugas Besar **VISDAT Kelompok 4 — Smart City: Perancangan Dashboard Pengelolaan Sampah Kota Semarang**, Universitas Diponegoro.

Dashboard menyajikan KPI agregat per tahun untuk Kota Semarang dan dirancang dengan pola **Shneiderman's Mantra** (*Overview First → Zoom & Filter → Details on Demand*):

| Zona | Isi | Idiom visual |
|---|---|---|
| Ringkasan Eksekutif | Enam scorecard tahun terpilih, status ambang usulan, catatan daur ulang, konteks keterbandingan | Scorecard + chip status |
| Tren & Kinerja | Timbulan vs terkelola; capaian pengelolaan; indeks timbulan vs penduduk (2021 = 100) | Line chart, bar chart, area selisih |
| Komposisi & Kesenjangan | Komposisi kategori + tabel; donut terkelola/belum; panel kesenjangan; temuan kunci | Horizontal bar, donut, panel ringkasan |

## Cara membuka

Langsung buka `index.html` di browser (double-click), atau sajikan via server lokal:

```bash
python -m http.server 8000
# buka http://localhost:8000
```

Tidak perlu `npm install` / build step.

Filter tahun di header berlaku untuk **seluruh dashboard** (scorecard, panel kesenjangan, donut, komposisi, dan penanda tahun pada chart). Pilihan tahun disimpan di URL, misalnya `?tahun=2023`, sehingga bisa dibagikan dan mendukung tombol back/forward browser. Jika parameter tidak valid, dashboard kembali ke tahun terbaru.

## Regenerasi data dashboard

Angka di dashboard **tidak diketik manual**. Semuanya diekstrak dari CSV bersih ke `assets/data.js` oleh:

```bash
python tools/build_data.py
```

Jalankan ulang perintah itu setiap kali file di folder `data/` berubah. `index.html` tetap bisa dibuka langsung karena `data.js` sudah ikut di-commit.

Metadata yang ikut digenerate antara lain `break_years` (2024–2025), `comparable_last_year` (2023), komponen daur ulang/bahan baku, dan catatan komposisi. Dengan begitu, penandaan periode “perlu tinjau” tidak hanya ditulis di JavaScript.

## Pengujian otomatis

```bash
python tools/verify_dashboard.py
```

Script ini memvalidasi ulang angka dashboard langsung dari CSV: konsistensi timbulan/terkelola/belum terkelola, `selisih_rumus`, indeks 2021 = 100, total komposisi 100% per tahun, serta NA kategori. Hasil terakhir: **GAGAL: 0**.

Status **PERLU TINJAU** pada `validasi_data.csv` adalah temuan kualitas data, bukan kegagalan aritmetika. Dashboard menampilkannya secara eksplisit alih-alih menyembunyikannya.

## Sumber data & keterbatasan

- **SIPSN/KLHK** — timbulan, capaian pengelolaan, komposisi (agregat Kota Semarang, 2021–2025).
- **BPS** (sesuai dokumentasi workbook kelompok) — jumlah penduduk; rekonsiliasi 16 kecamatan vs total Kota Semarang **LULUS** (`validasi_data.csv`).
- **Kategori “Kayu Ranting” 2021–2024 tidak memiliki nilai (NA)** pada sumber dan **tidak** ditampilkan sebagai 0%. Komposisi 2021–2024 memiliki 8 kategori terisi; 2025 memiliki 9 kategori terisi (Kayu Ranting 2,00%). Semua tahun berjumlah 100%, tetapi set kategori berubah sehingga perbandingan antar-tahun perlu hati-hati.
- **Keterbandingan 2024–2025 PERLU TINJAU** — data 2024 menunjukkan lompatan yang tidak konsisten dengan 2021–2023, sementara `validasi_data.csv` mencatat perubahan definisi pengelolaan pada 2025. Dashboard menandai kedua tahun sebagai periode perlu tinjau dan **tidak menampilkan delta 2024–2025** sebagai perubahan kinerja. Perubahan penanganan 2023→2024 (−309.924,20 ton) dan 2024→2025 (+112.227,01 ton) adalah sinyal audit pencatatan, bukan evaluasi kausal lapangan.
- **Daur ulang + bahan baku*** dihitung dari `(jml_daur_ulang + jml_bahan_baku) / timbulan`. Pada 2024–2025 komponen sumber praktis sama dengan pengurangan/penanganan, sehingga angkanya **bukan metrik daur ulang independen**. Komponen dan catatan verifikasi tersedia di panel *Detail & sumber*.
- **Pertumbuhan pada `tumbuh_sampah` / `tumbuh_penduduk` bersifat kumulatif** sejak 2021 (2021 = dasar), bukan year-on-year.
- Dashboard ini **bukan** pemantauan real-time, dan data hanya agregat tingkat kota — tidak ada choropleth per kecamatan.

### Ambang alert (usulan, belum resmi)

Warna hijau/kuning/merah pada scorecard “Terkelola (%)” dan bar 2021–2023 memakai ambang **usulan**:

- hijau ≥ 90%
- kuning 60–90%
- merah < 60%

Ambang ini **bukan target resmi / kebijakan**. Bar 2024–2025 sengaja memakai pola abu-abu bertanda `*` (perlu tinjau), bukan merah/kuning, karena perubahan definisi membuat status kinerjanya tidak sebanding.

## Aksesibilitas, responsif, dan cetak

- Chart SVG dirender ulang mengikuti lebar kontainer; label sumbu tidak lagi mengecil menjadi teks 4–6 px pada layar sempit.
- Setiap mark chart memiliki nama aksesibel, dapat difokuskan dengan keyboard, dan tooltip visual. Tabel komposisi menjadi alternatif data yang setara.
- Panel *Detail & sumber* memakai `role="dialog"`, `aria-modal`, focus trap, tombol Escape, backdrop, dan pengembalian fokus ke pemicu.
- Uji axe (WCAG 2.1 AA + best-practice) pada 1280 px, 360 px, dan dialog terbuka: **0 violation**.
- Penandaan 2024–2025 tidak hanya lewat warna: ada teks “perlu tinjau”, chip, pola arsir, dan catatan.
- Layout cetak A4 memakai 2 halaman pada data 2025 (ringkasan + tren, lalu komposisi + temuan). Chart dirender ulang mengikuti lebar cetak agar label tetap terbaca, dan kartu tidak terpotong antarhalaman.

## Publikasi dataset

Dataset bersih dipublikasikan di Zenodo:

- **DOI:** [10.5281/zenodo.24240544](https://zenodo.org/records/24240544)
- Versi 1.0.0 · 2026-11-15
- Akses berkas **Restricted** (metadata/DOI publik); lisensi kustom pada rekaman **bukan** pengganti hak redistribusi SIPSN/KLHK dan BPS.

## Struktur repo

```
index.html              # halaman dashboard (3 zona + dialog detail)
assets/styles.css       # tampilan, responsif, aksesibilitas, print
assets/app.js           # render chart SVG, filter tahun global, dialog, tooltip
assets/data.js          # DIGENERATE dari CSV (jangan edit manual)
tools/build_data.py     # ekstraksi CSV → assets/data.js
tools/verify_dashboard.py  # verifikasi independen angka dashboard
data/                   # salinan dataset bersih yang dipakai dashboard
docs/                   # screenshot untuk dokumentasi
```

## Verifikasi cepat konsistensi angka

- `selisih_rumus` (master KPI) ≈ 0 untuk 2021–2025.
- Komposisi 2025: sisa makanan 61,0% + plastik 18,0% = 79,0% (fokus CBQ2).
- Indeks 2021 = 100 → timbulan 2025 ≈ 101,00; penduduk 2025 ≈ 103,98.
- Total komposisi 100,00% untuk 2021–2025; 2021–2024 memiliki 1 NA (Kayu Ranting).

## Screenshot

- `docs/dashboard-full.png` — tampilan penuh dashboard tahun 2025: scorecard perlu tinjau, area 2024–2025, komposisi 9 kategori, donut, dan temuan kunci.
- `docs/dashboard-interaksi-tahun-2021-detail.png` — filter tahun 2021 (komposisi dengan kategori NA) + panel “Detail & sumber” terbuka.

## Kontributor

Kelompok 4 — Nawaal Hanif Mumtaz Arriye, Adam Mulya Rasyid, Fazl Nizam Priyambodho, Muhammad Nauval Fadli.
Implementasi dashboard (anggota 4): pemilihan idiom visual, encoding, layout 3 zona, implementasi & pengujian.

# Dashboard Pengelolaan Sampah Kota Semarang (2021–2025)

Prototipe dashboard statis (HTML + CSS + JavaScript, tanpa dependensi runtime) untuk Tugas Besar **VISDAT Kelompok 4 — Smart City: Perancangan Dashboard Pengelolaan Sampah Kota Semarang**, Universitas Diponegoro.

Dashboard menyajikan ringkasan agregat per tahun untuk Kota Semarang dengan pola **Shneiderman's Mantra** (*Overview First → Zoom & Filter → Details on Demand*) dan pendekatan antarmuka **Material Design 3 (Light Mode)** bergaya *Google Analytics 4 / Looker Studio*. Lapisan atas memakai bahasa ringkas yang cepat dipindai; glosarium istilah, rumus, dan tabel validasi diturunkan ke panel *slide-over drawer*.

| Lapisan | Isi | Idiom visual |
|---|---|---|
| Header & Filter Global | Judul, badge cakupan agregat kota, pemilih tahun tersegmentasi (2021–2025) + dropdown mobile, strip status keterbandingan kontekstual, serta tombol Glosarium & Catatan | Sticky light app bar, segmented pills, notice strip |
| Ringkasan KPI | Empat scorecard metrik inti: persentase tercatat terkelola, total timbulan, belum tercatat terkelola, dan timbulan per kapita beserta indikator tren/status | 4 KPI cards, progress bar, micro-sparkline 5 tahun |
| Grid Visualisasi Utama | Timbulan vs tercatat terkelola + panduan baca; persentase terkelola per tahun + proporsi jalur pengurangan/penanganan; komposisi 9 kategori + indeks timbulan vs penduduk (`2021 = 100`) | Line + gap area chart, vertical bar, 3-segment donut, horizontal bar, index line chart |
| Tabel Rincian Data | Tab *Komposisi Tahun Terpilih* (pencarian, filter chip, sorting, inline bar, paginasi) & Tab *Ringkasan Multi-Tahun 2021–2025* (klik baris untuk ganti tahun) | Interactive data table 2-tab |

## Cara membuka

Langsung buka `index.html` di browser (double-click), atau sajikan via server lokal:

```bash
python -m http.server 8000
# buka http://localhost:8000
```

Tidak perlu `npm install` / build step.

Filter tahun di header (segmented pills di desktop / dropdown di mobile, serta klik langsung pada batang grafik capaian atau baris tabel multi-tahun) berlaku untuk **seluruh dashboard** (4 kartu KPI, strip konteks, seluruh grafik, panduan baca, tabel komposisi, dan panel detail). Pilihan tahun disimpan di URL, misalnya `?tahun=2023`, sehingga bisa dibagikan dan mendukung tombol back/forward browser. Jika parameter tidak valid, dashboard kembali ke tahun terbaru.

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
- **Daur ulang + bahan baku*** dihitung dari `(jml_daur_ulang + jml_bahan_baku) / timbulan`. Pada 2024–2025 komponen sumber praktis sama dengan pengurangan/penanganan, sehingga angkanya **bukan metrik daur ulang independen**. Komponen dan catatan verifikasi tersedia di panel *Catatan & sumber*.
- **Pertumbuhan pada `tumbuh_sampah` / `tumbuh_penduduk` bersifat kumulatif** sejak 2021 (2021 = dasar), bukan year-on-year.
- Dashboard ini **bukan** pemantauan real-time, dan data hanya agregat tingkat kota — tidak ada choropleth per kecamatan.

### Penandaan 2024–2025

Grafik utama tidak memakai warna hijau/kuning/merah. Bar tahun yang sebanding memakai warna teal, sedangkan 2024–2025 memakai arsir abu-abu, label “perlu tinjau”, dan catatan pendamping. Ambang 90% / 60% / <60% hanya dijelaskan di panel *Catatan & sumber* sebagai usulan internal, bukan target kebijakan.

## Aksesibilitas, responsif, dan cetak

- Chart SVG dirender ulang mengikuti lebar kontainer; label sumbu tidak lagi mengecil menjadi teks 4–6 px pada layar sempit.
- Setiap mark chart memiliki nama aksesibel, dapat difokuskan dengan keyboard, dan tooltip visual. Tabel komposisi dan glosarium menjadi alternatif teks yang setara.
- Panel *Catatan & sumber* memakai `role="dialog"`, `aria-modal`, focus trap, tombol Escape, backdrop, dan pengembalian fokus ke pemicu.
- Uji axe (WCAG 2.1 A/AA + best-practice, axe-core 4.12.1) pada 1280 px, 360 px, dan dialog terbuka: **0 violation**. Tersisa temuan `color-contrast` dalam kategori *incomplete* (59 node) yang perlu review manual, bukan violation; belum divalidasi dengan pembaca layar sungguhan.
- Penandaan 2024–2025 tidak hanya lewat warna: ada teks “perlu tinjau”, chip, pola arsir, dan catatan.
- Layout cetak A4 (`@media print`) otomatis menampilkan seluruh baris tabel komposisi tanpa terpotong paginasi lalu mengembalikannya setelah selesai mencetak.

## Publikasi dataset

Dataset bersih dipublikasikan di Zenodo:

- **DOI:** [10.5281/zenodo.24240544](https://zenodo.org/records/24240544)
- Versi 1.0.0 · 2026-11-15
- Akses berkas **Restricted** (metadata/DOI publik); lisensi kustom pada rekaman **bukan** pengganti hak redistribusi SIPSN/KLHK dan BPS.

## Struktur repo

```
index.html              # halaman dashboard (4 lapisan UI + slide-over drawer)
assets/styles.css       # design system MD3 light mode, grid 12-kolom, responsif, aksesibilitas, print
assets/app.js           # render chart SVG, sparkline KPI, filter tahun global, tabel interaktif, dialog, tooltip
assets/data.js          # DIGENERATE dari CSV (jangan edit manual)
tools/build_data.py     # ekstraksi CSV → assets/data.js
tools/verify_dashboard.py  # verifikasi independen angka dashboard
data/                   # salinan dataset bersih yang dipakai dashboard
docs/                   # screenshot untuk dokumentasi
```

## Verifikasi cepat konsistensi angka

- `selisih_rumus` (master KPI) ≈ 0 untuk 2021–2025.
- Komposisi 2025: sisa makanan 61,0% + plastik 18,0% = 79,0% (dua kategori teratas pada Sorotan).
- Indeks 2021 = 100 → timbulan 2025 ≈ 101,00; penduduk 2025 ≈ 103,98.
- Total komposisi 100,00% untuk 2021–2025; 2021–2024 memiliki 1 NA (Kayu Ranting).

## Screenshot

- `docs/dashboard-full.png` — tampilan penuh dashboard tahun 2025 (perlu tinjau): sticky light header, 4 kartu KPI dengan micro-sparkline, tren timbulan vs terkelola, capaian per tahun, donut jalur pengelolaan, komposisi 9 kategori, indeks penduduk, dan tabel rincian interaktif.
- `docs/dashboard-interaksi-tahun-2021-detail.png` — tampilan filter tahun dasar 2021 (`?tahun=2021`): status tahun dasar, komposisi 8 kategori terisi + `Kayu Ranting (NA)`, serta tabel komposisi tahun 2021.

## Kontributor

Kelompok 4 — Nawaal Hanif Mumtaz Arriye, Adam Mulya Rasyid, Fazl Nizam Priyambodho, Muhammad Nauval Fadli.
Implementasi dashboard (anggota 4): pemilihan idiom visual, encoding, layout 3 zona, implementasi & pengujian.

# Dashboard Pengelolaan Sampah Kota Semarang (2021–2025)

Prototipe dashboard statis (HTML + CSS + JavaScript, tanpa dependensi runtime) untuk Tugas Besar **VISDAT Kelompok 4 — Smart City: Perancangan Dashboard Pengelolaan Sampah Kota Semarang**, Universitas Diponegoro.

Dashboard menyajikan ringkasan agregat per tahun untuk Kota Semarang dan dirancang dengan pola **Shneiderman's Mantra** (*Overview First → Zoom & Filter → Details on Demand*). Lapisan atas memakai bahasa awam; istilah teknis, rumus, dan validasi diturunkan ke panel detail.

| Zona | Isi | Idiom visual |
|---|---|---|
| Ringkasan | Satu angka utama “sampah tercatat terkelola”, tonase tahunan, angka per orang, tiga fakta kunci, dan glosarium | Hero + progress bar + kartu fakta |
| Perubahan dari Tahun ke Tahun | Sampah dihasilkan vs tercatat terkelola; persentase per tahun; panduan membaca; indeks timbulan vs penduduk di lapisan lanjutan | Line chart, bar chart, area selisih, `<details>` |
| Isi Sampah & Pengelolaan | Komposisi kategori + tabel angka; donut tercatat vs belum tercatat; sorotan tahun terpilih | Horizontal bar, donut, kartu sorotan |

## Cara membuka

Langsung buka `index.html` di browser (double-click), atau sajikan via server lokal:

```bash
python -m http.server 8000
# buka http://localhost:8000
```

Tidak perlu `npm install` / build step.

Filter tahun di header berlaku untuk **seluruh dashboard** (hero ringkasan, fakta kunci, panel kesenjangan, donut, komposisi, panduan membaca, dan sorotan). Pilihan tahun disimpan di URL, misalnya `?tahun=2023`, sehingga bisa dibagikan dan mendukung tombol back/forward browser. Jika parameter tidak valid, dashboard kembali ke tahun terbaru.

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
- Layout cetak A4 terverifikasi **2 halaman** pada data 2025 di Chrome headless. Glosarium dan tabel komposisi otomatis dibuka saat mencetak lalu ditutup kembali; grafik analisis lanjutan ikut tercetak hanya jika panelnya sedang dibuka.

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
- Komposisi 2025: sisa makanan 61,0% + plastik 18,0% = 79,0% (dua kategori teratas pada Sorotan).
- Indeks 2021 = 100 → timbulan 2025 ≈ 101,00; penduduk 2025 ≈ 103,98.
- Total komposisi 100,00% untuk 2021–2025; 2021–2024 memiliki 1 NA (Kayu Ranting).

## Screenshot

- `docs/dashboard-full.png` — tampilan penuh dashboard tahun 2025: hero “61,6% sampah tercatat terkelola”, tiga fakta kunci, tren 2021–2025, komposisi 9 kategori, donut, dan sorotan.
- `docs/dashboard-interaksi-tahun-2021-detail.png` — filter tahun 2021 (komposisi dengan kategori NA) + panel “Catatan & sumber” terbuka.

## Kontributor

Kelompok 4 — Nawaal Hanif Mumtaz Arriye, Adam Mulya Rasyid, Fazl Nizam Priyambodho, Muhammad Nauval Fadli.
Implementasi dashboard (anggota 4): pemilihan idiom visual, encoding, layout 3 zona, implementasi & pengujian.

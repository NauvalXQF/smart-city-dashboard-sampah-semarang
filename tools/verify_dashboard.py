"""Verifikasi independen angka yang ditampilkan dashboard vs CSV sumber.

Bukan bagian dari runtime; dipakai untuk pengujian/QA dan laporan.
Jalankan dari root repo:  python tools/verify_dashboard.py
"""

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def rows(name):
    with open(DATA / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def f(v):
    v = (v or "").strip()
    return float(v) if v else None


master = {int(r["tahun"]): r for r in rows("08_master_kpi_semarang.csv")}
long = rows("04_komposisi_bersih_long.csv")

print("== Master KPI vs turunan ==")
fails = 0
for t, r in sorted(master.items()):
    timbulan = f(r["timbulan_tahunan_ton"])
    terkelola = f(r["terkelola_tahunan_ton"])
    belum = f(r["belum_terkelola_tahunan_ton"])
    peng = f(r["pengurangan_tahunan_ton"])
    penh = f(r["penanganan_tahunan_ton"])
    selisih = f(r["selisih_rumus"])
    check = timbulan - terkelola
    ok1 = abs(check - belum) < 1e-4
    ok2 = abs((peng + penh) - terkelola) < 1e-4
    ok3 = abs(selisih) < 1e-6
    rasio = belum / timbulan * 100
    print(f"{t}: belum(timbulan-terkelola)={check:.6f} vs kolom={belum:.6f} -> {'OK' if ok1 else 'GAGAL'} | "
          f"peng+penh={peng+penh:.6f} vs terkelola={terkelola:.6f} -> {'OK' if ok2 else 'GAGAL'} | "
          f"selisih_rumus={selisih:.3e} -> {'OK' if ok3 else 'GAGAL'} | "
          f"rasio belum={rasio:.2f}%")
    fails += 0 if (ok1 and ok2 and ok3) else 1

print("\n== Indeks vs 2021 (dashboard) ==")
base_t = f(master[2021]["timbulan_tahunan_ton"])
base_p = f(master[2021]["jumlah_penduduk_jiwa"])
for t in sorted(master):
    it = f(master[t]["timbulan_tahunan_ton"]) / base_t * 100
    ip = f(master[t]["jumlah_penduduk_jiwa"]) / base_p * 100
    if t == 2021 and (abs(it - 100) > 1e-9 or abs(ip - 100) > 1e-9):
        fails += 1
    print(f"{t}: indeks timbulan={it:.2f} | indeks penduduk={ip:.2f} | tumbuh_sampah(CSV, %)={f(master[t]['tumbuh_sampah']):.4f} | tumbuh_penduduk(CSV, %)={f(master[t]['tumbuh_penduduk']):.4f}")

print("\n== Komposisi: NA & total ==")
for t in sorted({int(r["tahun"]) for r in long}):
    rs = [r for r in long if int(r["tahun"]) == t]
    vals = [f(r["komposisi_persen"]) for r in rs]
    na = [r["kategori_sampah"] for r, v in zip(rs, vals) if v is None]
    tot = sum(v for v in vals if v is not None)
    total_ok = abs(tot - 100) < 0.01
    if not total_ok:
        fails += 1
    print(f"{t}: sum(terisi)={tot:.2f}% -> {'OK' if total_ok else 'GAGAL'} | NA={na}")

print("\n== Cek dashboard-specific derived ==")
for t in sorted(master):
    r = master[t]
    belum = f(r["belum_terkelola_tahunan_ton"])
    rbl = belum / f(r["timbulan_tahunan_ton"]) * 100
    d_peng = f(r["delta_pengurangan"])
    d_penh = f(r["delta_penanganan"])
    if d_penh is not None:
        print(f"{t}: rasio belum={rbl:.2f}% | delta_penanganan={d_penh:.2f} ton | delta_pengurangan={d_peng if d_peng is not None else '—'}")

print(f"\nGAGAL: {fails}")
raise SystemExit(1 if fails else 0)

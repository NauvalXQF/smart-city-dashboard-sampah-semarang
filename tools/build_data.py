"""Menghasilkan assets/data.js dari dataset bersih (CSV).

Dashboard membaca window.DASHBOARD_DATA dari assets/data.js, dan file ini
digenerate oleh script ini supaya angka yang tampil selalu berasal dari CSV,
tidak pernah diketik manual.

Cara pakai:  python tools/build_data.py   (jalankan dari root repo)
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "assets" / "data.js"


def read_csv(name):
    with open(DATA / name, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    return rows


def to_float(value):
    value = (value or "").strip()
    if value == "":
        return None
    return float(value)


def main():
    master = read_csv("08_master_kpi_semarang.csv")
    komposisi = read_csv("04_komposisi_bersih_long.csv")
    validasi = read_csv("validasi_data.csv")

    kpi = {}
    years = []
    for row in master:
        tahun = int(row["tahun"])
        years.append(tahun)
        kpi[str(tahun)] = {
            "timbulan_tahunan_ton": to_float(row["timbulan_tahunan_ton"]),
            "pengurangan_tahunan_ton": to_float(row["pengurangan_tahunan_ton"]),
            "penanganan_tahunan_ton": to_float(row["penanganan_tahunan_ton"]),
            "persen_pengurangan": to_float(row["persen_pengurangan"]),
            "persen_penanganan": to_float(row["persen_penanganan"]),
            "terkelola_tahunan_ton": to_float(row["terkelola_tahunan_ton"]),
            "persen_kelola": to_float(row["persen_kelola"]),
            "belum_terkelola_tahunan_ton": to_float(row["belum_terkelola_tahunan_ton"]),
            "terkelola_persen": to_float(row["terkelola_persen"]),
            "persen_recycling_rate": to_float(row["persen_recycling_rate"]),
            "timbulan_kg_per_orang_hari": to_float(row["timbulan_kg_per_orang_hari"]),
            "jumlah_penduduk_jiwa": to_float(row["jumlah_penduduk_jiwa"]),
            "tumbuh_sampah": to_float(row["tumbuh_sampah"]),
            "tumbuh_penduduk": to_float(row["tumbuh_penduduk"]),
            "delta_pengurangan": to_float(row["delta_pengurangan"]),
            "delta_penanganan": to_float(row["delta_penanganan"]),
            "selisih_rumus": to_float(row["selisih_rumus"]),
        }

    komposisi_rows = []
    kategori_urut = []
    for row in komposisi:
        tahun = int(row["tahun"])
        kategori = row["kategori_sampah"].strip()
        if kategori not in kategori_urut:
            kategori_urut.append(kategori)
        komposisi_rows.append(
            {"tahun": tahun, "kategori": kategori, "persen": to_float(row["komposisi_persen"])}
        )

    payload = {
        "meta": {
            "sumber": "SIPSN/KLHK (timbulan, capaian, komposisi) dan BPS (penduduk) — Kota Semarang, 2021–2025",
            "zenodo_doi": "10.5281/zenodo.24240544",
            "zenodo_url": "https://zenodo.org/records/24240544",
            "catatan_keterbandingan": "Perubahan definisi/cakupan pelaporan 2024–2025 membatasi keterbandingan antarperiode; lihat validasi_data.csv (PERLU TINJAU).",
        },
        "years": years,
        "kpi": kpi,
        "komposisiKategori": kategori_urut,
        "komposisi": komposisi_rows,
        "validasi": [
            {"pemeriksaan": r["pemeriksaan"], "status": r["status"], "hasil": r["hasil"]}
            for r in validasi
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// DIGENERATE oleh tools/build_data.py — jangan edit manual.\n")
        f.write("window.DASHBOARD_DATA = ")
        f.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    print(f"OK -> {OUT}")


if __name__ == "__main__":
    main()

# Skill / Instruksi AI: Aturan Logika Penjadwalan & Kuota Kontrol

---
name: aturan-kuota
description: Aturan logika bisnis penjadwalan kontrol ulang pasien dan pembatasan kuota dokter/poliklinik.
---

## 1. Batasan Kuota Harian Dokter
- Setiap dokter spesialis memiliki batas kuota harian pasien kontrol (misal: maksimum 20 pasien per sesi poliklinik).
- Kuota terbagi menjadi 2 kategori:
  1. **Kuota Reguler/Umum:** 70% dari total kuota.
  2. **Kuota Pasien Post Ranap (Prioritas):** 30% dari total kuota.

## 2. Logika Pemilihan Tanggal Kontrol
- **Batas Waktu Kontrol Ulang:** Kontrol post rawat inap disarankan dalam rentang H+3 hingga H+14 setelah pemulangan (discharge).
- **Hari Libur & Non-Operasional:** Sistem tidak mengizinkan penentuan jadwal pada hari libur nasional atau jadwal libur dokter DPJP.

## 3. Aturan Penanganan Over-Quota (Kuota Penuh)
Jika kuota pasien kontrol pada tanggal yang diminta sudah penuh:
1. Tampilkan opsi **"Masukkan List Tunggu / Over-Quota Approval"** yang membutuhkan verifikasi DPJP/Manajemen Poliklinik.
2. Berikan rekomendasi tanggal kontrol terdekat berikutnya yang masih memiliki kuota tersedia.
3. Tampilkan opsi dokter spesialis pengganti dalam tim/sub-spesialisasi yang sama.

## 4. Panduan Respon AI
Saat membuat fungsi logika penjadwalan:
- Pastikan ada validasi *atomic transaction* (mencegah *race condition* / pemesanan kuota ganda pada waktu bersamaan).
- Sediakan fungsi pengecekan sisa kuota yang efisien sebelum menyimpan transaksi registrasi kontrol.

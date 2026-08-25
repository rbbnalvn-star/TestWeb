# PRD: Aplikasi Penjadwalan Kontrol Post-Rawat Inap RS

## 1. Ringkasan & Tujuan Proyek
* **Latar Belakang:** Pasien pulang rawat inap sering menunggu lama untuk mendapatkan tanggal kontrol karena perawat harus mengonfirmasi ketersediaan kuota secara manual ke petugas rawat jalan.
* **Tujuan:** Membangun aplikasi web internal (Intranet) sederhana untuk menampilkan kuota kontrol dokter secara real-time, memungkinkan perawat langsung memilih tanggal kosong, serta memotong waktu konfirmasi manual.

---

## 2. Hak Akses & Otentikasi (Authentication & User Roles)

### A. Perawat Rawat Inap (Tanpa Login / Akses Bebas Intranet)
* **Akses Langsung:** Tidak perlu login (bebas akses dari komputer LAN RS) agar proses input data pasien sangat cepat.
* **Aksi yang Dibatasi:**
  * Melihat jadwal dan sisa kuota kontrol dokter secara real-time.
  * Menginput data pasien pada tanggal yang berstatus "Buka".
  * Mengubah, mengedit, atau membatalkan jadwal kontrol pasien.

### B. Petugas Rawat Jalan / Admin (Melalui Sidebar Kiri)
* **Akses Login Khusus:** Terdapat panel/tombol **"Admin Login"** di bilah samping kiri (left sidebar).
* **Fitur Setelah Login:**
  * **Kelola Status Tanggal (Date Override):** Mengubah status tanggal tertentu menjadi "Buka" (bisa diisi perawat) atau "Tutup/Libur" (dikunci).
  * Melihat daftar rekapitulasi seluruh booking pasien per hari/per dokter.

---

## 3. Format Data Pasien (Form Input)
Saat perawat mendaftarkan pasien untuk kontrol, sistem wajib meminta data berikut:
1. **Nama Pasien** (Teks)
2. **Nomor Rekam Medis / No. RM** (Teks/Angka - Identifikator Utama)
3. **Nomor Handphone** (Angka)
4. **DPJP (Dokter Penanggung Jawab Pasien)** (Pilihan Dropdown)

---

## 4. Aturan Bisnis & Logika Kuota Dokter (Business Rules)

### Master Kuota DPJP:
* **dr. Panji Gugag B. S.PD:**
  * Senin, Rabu, Kamis: Maksimal **7 pasien / hari**
  * Selasa: Maksimal **5 pasien / hari**
  * Jumat, Sabtu, Minggu: Libur / 0 pasien
* **dr. Setyo Anestyo S.S:**
  * Senin s.d. Jumat: Maksimal **10 pasien / hari**
  * Sabtu, Minggu: Libur / 0 pasien

### Aturan Kalender & Hari Libur:
* **Blokir Otomatis:** Tanggal merah nasional Indonesia dan hari libur rutin dokter otomatis terkunci.
* **Override Admin:** Status tanggal yang diatur manual oleh Admin (lewat login Sidebar) akan selalu mengesampingkan (*override*) sistem otomatis.

### Aturan Penjadwalan & Kuota:
* **Pengurangan Kuota:** Pendaftaran baru mengurangi sisa kuota hari tersebut sebesar -1.
* **Pengeditan Jadwal:** Jika perawat mengubah tanggal kontrol pasien, kuota pada tanggal lama otomatis +1, dan tanggal baru -1.
* **Sistem Penuh:** Jika kuota `0` atau status tanggal "Tutup", form pendaftaran pada tanggal tersebut terkunci.

---

## 5. Tampilan Antarmuka (UI Layout)
* **Layout Utama:** Tampilan bersih (*clean interface*) dengan Kalender Kuota dan Form Input Pasien di area tengah.
* **Sidebar Kiri (Left Sidebar):**
  * **Area Atas:** Navigasi cepat/Pilihan Poli.
  * **Area Bawah:** Tombol **"Login Admin"**. 
  * Jika Admin sudah login, area ini berubah menampilkan panel **"Kelola Tanggal / Status Libur"**.

---

## 6. Alur Pengguna (User Journey)

### Alur Perawat (Tanpa Login):
1. Buka web -> Pilih DPJP -> Lihat Kalender Kuota.
2. Klik tanggal aktif yang tersedia.
3. Isi data pasien (Nama, No. RM, No. HP, DPJP) -> Klik **"Simpan"**.

### Alur Admin (Dengan Login Sidebar):
1. Klik tombol **"Login Admin"** di sidebar kiri -> Masukkan password.
2. Setelah berhasil login, opsi **"Kelola Tanggal"** akan muncul di sidebar.
3. Admin memilih tanggal tertentu di kalender, lalu mengubah statusnya menjadi **"Buka"** atau **"Tutup/Libur"**.
4. Perubahan langsung tersimpan dan berlaku secara real-time untuk perawat.
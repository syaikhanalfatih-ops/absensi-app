# Aplikasi Presensi Pintar (Mobile PWA + Face Recognition AI + QR + Geofence GPS)

Aplikasi absensi modern berbasis Progressive Web App (PWA) dengan validasi radius GPS (Geofencing), pemindaian wajah biometrik (Face Recognition AI on-device via TensorFlow/SSD MobileNet), dan dynamic QR code generator untuk lobi kantor.

---

## 🚀 Fitur Utama

1. **Mobile-First PWA (Aplikasi HP)**:
   - UI adaptif untuk layar smartphone (rasa aplikasi native).
   - Mendukung instalasi PWA ke layar utama HP (Add to Home Screen).
   - Indikator radar GPS live & jarak presisi ke titik kantor dalam satuan meter.
   - Tombol pengujian cepat: `[Set ke Posisi Kantor]` untuk simulasi testing dari meja kerja/rumah.

2. **Deteksi & Verifikasi Wajah AI (Biometrik)**:
   - Berjalan langsung di perangkat browser (on-device) menggunakan model SSD MobileNet & Face Landmark 68 (`@vladmandic/face-api`).
   - Ekstraksi dan pencocokan 128-dimensi vektor wajah biometrik (Euclidean Distance).
   - Halaman pendaftaran wajah mandiri (`/register-face.html`) dengan panduan oval interaktif.

3. **Layar QR Code Dinamis Lobi Kantor**:
   - Tampilan layar penuh interaktif (`/admin/qr-display.html`) untuk tablet/TV lobi kantor.
   - QR code berubah otomatis setiap 30 detik untuk mencegah kecurangan titip absen via screenshot/foto.
   - Pemindai kamera terintegrasi di HP pegawai (`html5-qrcode`).

4. **Validasi Geofencing GPS Ketat**:
   - Perhitungan jarak Haversine formula antara koordinat pegawai dan kantor.
   - Menolak presensi otomatis bila berada di luar radius meter kantor.

5. **Panel Admin & Manajemen HRD**:
   - Dashboard ringkasan: Total pegawai, hadir hari ini, tepat waktu, terlambat, belum hadir.
   - Log presensi pegawai lengkap dengan foto selfie, jam masuk, jam pulang, jarak meter, dan metode.
   - Filter tanggal & ekspor laporan kehadiran ke format **CSV / Excel**.
   - Manajemen karyawan (tambah, edit, hapus, dan reset data biometrik wajah).
   - Pengaturan lokasi geofence & tombol sekali klik *"Gunakan Lokasi Saya Saat Ini"*.

---

## 🛠️ Tech Stack

- **Backend**: Node.js & Express 5 (REST API, JWT Auth, Multer, Cookie Parser)
- **Database**: MySQL / MariaDB (XAMPP)
- **AI & Computer Vision**: `@vladmandic/face-api` (SSD MobileNet v1, Tiny Face Detector, Face Recognition Net)
- **QR Engine**: `qrcode` (backend generator) & `html5-qrcode` (frontend camera scanner)
- **Styling & UI**: Tailwind CSS, Lucide Icons, Vanilla JavaScript PWA

---

## 🔑 Akun Demo Siap Pakai

Tersedia tombol login otomatis 1-klik di halaman login:

| Peran | Email | Kata Sandi | Halaman Akses |
|---|---|---|---|
| **Administrator HRD** | `admin@absensi.local` | `admin123` | `http://localhost:3000/admin` |
| **Pegawai (Budi Santoso)** | `budi@absensi.local` | `karyawan123` | `http://localhost:3000/` |
| **Pegawai (Siti Rahma)** | `siti@absensi.local` | `karyawan123` | `http://localhost:3000/` |

---

## 🌐 Cara Akses dari HP (Satu Jaringan WiFi)

1. Cek IP lokal laptop/PC Anda di Command Prompt (`ipconfig`, misal: `192.168.1.5`).
2. Buka browser di smartphone Anda dan kunjungi:
   ```text
   http://192.168.1.5:3000
   ```
3. Izinkan akses **Kamera** dan **Lokasi (GPS)** pada browser HP.
4. Klik opsi *"Tambahkan ke Layar Utama"* pada menu browser untuk memasang icon PWA seperti aplikasi native.

---

## ⚙️ Menjalankan Server Manual

Jika ingin menjalankan server ulang:

```powershell
# Jalankan server
node server.js
```

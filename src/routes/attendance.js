const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { calculateDistance } = require('../utils/distance');
const { saveBase64Image } = require('../middleware/upload');

// Helper: Format tanggal YYYY-MM-DD lokal
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Format jam HH:mm:ss lokal
function getCurrentTimeString() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Status Absensi Hari Ini
router.get('/today', authenticate, async (req, res) => {
    try {
        const today = getTodayDateString();
        const [rows] = await db.query(
            `SELECT a.*, o.name as office_name, o.work_start, o.work_end, o.late_tolerance
             FROM attendances a
             LEFT JOIN offices o ON a.office_id = o.id
             WHERE a.user_id = ? AND a.date = ?`,
            [req.user.id, today]
        );

        const attendance = rows.length > 0 ? rows[0] : null;

        res.json({
            success: true,
            date: today,
            has_checked_in: !!(attendance && attendance.check_in_time),
            has_checked_out: !!(attendance && attendance.check_out_time),
            attendance
        });
    } catch (err) {
        console.error('Error attendance today:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil status absensi.' });
    }
});

// Riwayat Absensi Karyawan
router.get('/history', authenticate, async (req, res) => {
    try {
        const month = req.query.month || (new Date().getMonth() + 1);
        const year = req.query.year || new Date().getFullYear();

        const [rows] = await db.query(
            `SELECT a.*, o.name as office_name
             FROM attendances a
             LEFT JOIN offices o ON a.office_id = o.id
             WHERE a.user_id = ? AND MONTH(a.date) = ? AND YEAR(a.date) = ?
             ORDER BY a.date DESC`,
            [req.user.id, month, year]
        );

        res.json({
            success: true,
            month: parseInt(month),
            year: parseInt(year),
            history: rows
        });
    } catch (err) {
        console.error('Error attendance history:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil riwayat absensi.' });
    }
});

// Absen Masuk (Check-In)
router.post('/check-in', authenticate, async (req, res) => {
    try {
        const { lat, lng, method, photoBase64, qr_token, notes } = req.body;
        const today = getTodayDateString();
        const timeNow = getCurrentTimeString();

        // 1. Cek apakah sudah absen hari ini
        const [existing] = await db.query(
            'SELECT * FROM attendances WHERE user_id = ? AND date = ?',
            [req.user.id, today]
        );

        if (existing.length > 0 && existing[0].check_in_time) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah melakukan absen masuk hari ini (' + existing[0].check_in_time + ').'
            });
        }

        // 2. Ambil data kantor
        const [officeRows] = await db.query(
            `SELECT o.* FROM offices o
             JOIN users u ON u.office_id = o.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        const office = officeRows.length > 0 ? officeRows[0] : (await db.query('SELECT * FROM offices LIMIT 1'))[0][0];

        if (!office) {
            return res.status(400).json({ success: false, message: 'Data kantor belum dikonfigurasi oleh admin.' });
        }

        // 3. Validasi Geofence GPS
        let distance = null;
        if (lat !== undefined && lng !== undefined) {
            distance = calculateDistance(
                parseFloat(lat),
                parseFloat(lng),
                parseFloat(office.latitude),
                parseFloat(office.longitude)
            );

            // Validasi radius (toleransi ketat)
            if (distance > office.radius) {
                return res.status(400).json({
                    success: false,
                    distance: distance,
                    radius: office.radius,
                    message: `Lokasi Anda berada di luar radius kantor (${distance}m dari kantor, batas maksimal ${office.radius}m). Absen ditolak.`
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Koordinat GPS wajib diaktifkan.' });
        }

        // 4. Validasi QR jika metode QR
        if (method === 'qr') {
            if (!qr_token) {
                return res.status(400).json({ success: false, message: 'Token QR kantor diperlukan.' });
            }
            const [qrRows] = await db.query(
                'SELECT * FROM dynamic_qrs WHERE token = ? AND expires_at >= NOW()',
                [qr_token]
            );
            if (qrRows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'QR Code telah kedaluwarsa atau tidak valid. Silakan scan ulang layar kantor.'
                });
            }
        }

        // 5. Simpan foto selfie (Langsung Base64 / File)
        const savedPhoto = photoBase64 || null;

        // 6. Hitung Status Keterlambatan
        // Format work_start misal "08:00:00" + late_tolerance (15 menit)
        const [startH, startM] = office.work_start.split(':').map(Number);
        const lateThresholdMinutes = (startH * 60 + startM) + (office.late_tolerance || 0);

        const [currH, currM] = timeNow.split(':').map(Number);
        const currentMinutes = currH * 60 + currM;

        const status = (currentMinutes > lateThresholdMinutes) ? 'late' : 'present';

        // 7. Simpan ke database
        await db.query(
            `INSERT INTO attendances 
             (user_id, office_id, date, check_in_time, check_in_lat, check_in_lng, check_in_distance, check_in_photo, check_in_method, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             check_in_time = VALUES(check_in_time),
             check_in_lat = VALUES(check_in_lat),
             check_in_lng = VALUES(check_in_lng),
             check_in_distance = VALUES(check_in_distance),
             check_in_photo = VALUES(check_in_photo),
             check_in_method = VALUES(check_in_method),
             status = VALUES(status),
             notes = VALUES(notes)`,
            [
                req.user.id,
                office.id,
                today,
                timeNow,
                lat,
                lng,
                distance,
                savedPhoto,
                method || 'gps',
                status,
                notes || null
            ]
        );

        res.json({
            success: true,
            message: status === 'late' ? `Absen masuk berhasil (Terlambat). Jam: ${timeNow}` : `Absen masuk berhasil (Tepat Waktu). Jam: ${timeNow}`,
            status: status,
            time: timeNow,
            distance: distance,
            photo: savedPhoto ? 'Tersimpan' : null
        });
    } catch (err) {
        console.error('Error check-in:', err);
        res.status(500).json({ success: false, message: 'Gagal melakukan absen masuk.' });
    }
});

// Absen Pulang (Check-Out)
router.post('/check-out', authenticate, async (req, res) => {
    try {
        const { lat, lng, method, photoBase64, qr_token, notes } = req.body;
        const today = getTodayDateString();
        const timeNow = getCurrentTimeString();

        // 1. Cek apakah sudah absen masuk
        const [rows] = await db.query(
            'SELECT * FROM attendances WHERE user_id = ? AND date = ?',
            [req.user.id, today]
        );

        if (rows.length === 0 || !rows[0].check_in_time) {
            return res.status(400).json({
                success: false,
                message: 'Anda belum melakukan absen masuk hari ini. Tidak bisa absen pulang.'
            });
        }

        if (rows[0].check_out_time) {
            return res.status(400).json({
                success: false,
                message: 'Anda sudah melakukan absen pulang hari ini (' + rows[0].check_out_time + ').'
            });
        }

        // 2. Ambil data kantor untuk cek radius
        const [officeRows] = await db.query(
            `SELECT o.* FROM offices o
             JOIN users u ON u.office_id = o.id
             WHERE u.id = ?`,
            [req.user.id]
        );
        const office = officeRows.length > 0 ? officeRows[0] : (await db.query('SELECT * FROM offices LIMIT 1'))[0][0];

        let distance = null;
        if (lat !== undefined && lng !== undefined && office) {
            distance = calculateDistance(
                parseFloat(lat),
                parseFloat(lng),
                parseFloat(office.latitude),
                parseFloat(office.longitude)
            );

            if (distance > office.radius) {
                return res.status(400).json({
                    success: false,
                    distance: distance,
                    radius: office.radius,
                    message: `Lokasi Anda di luar radius kantor (${distance}m, maks ${office.radius}m). Absen pulang ditolak.`
                });
            }
        }

        // 3. Simpan foto jika ada
        const savedPhoto = photoBase64 || null;

        // 4. Update row attendance
        await db.query(
            `UPDATE attendances
             SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_distance = ?, 
                 check_out_photo = ?, check_out_method = ?
             WHERE id = ?`,
            [timeNow, lat, lng, distance, savedPhoto, method || 'gps', rows[0].id]
        );

        res.json({
            success: true,
            message: `Absen pulang berhasil. Jam: ${timeNow}`,
            time: timeNow,
            distance: distance
        });
    } catch (err) {
        console.error('Error check-out:', err);
        res.status(500).json({ success: false, message: 'Gagal melakukan absen pulang.' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// Generate QR Dinamis (untuk layar lobi kantor)
router.get('/dynamic', authenticate, async (req, res) => {
    try {
        const officeId = req.query.office_id || req.user.office_id || 1;
        const token = crypto.randomBytes(24).toString('hex');
        
        // QR berlaku selama 30 detik
        const expiresAt = new Date(Date.now() + 30 * 1000);

        // Hapus token lama untuk kantor ini
        await db.query('DELETE FROM dynamic_qrs WHERE office_id = ? OR expires_at < NOW()', [officeId]);

        // Simpan token baru
        await db.query(
            'INSERT INTO dynamic_qrs (office_id, token, expires_at) VALUES (?, ?, ?)',
            [officeId, token, expiresAt]
        );

        const qrPayload = JSON.stringify({
            type: 'ABSENSI_OFFICE_QR',
            office_id: officeId,
            token: token,
            ts: Date.now()
        });

        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 400,
            margin: 2,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        });

        res.json({
            success: true,
            token,
            expires_at: expiresAt,
            expires_in_seconds: 30,
            qr_image: qrDataUrl
        });
    } catch (err) {
        console.error('Error dynamic qr:', err);
        res.status(500).json({ success: false, message: 'Gagal membuat QR code.' });
    }
});

// Validasi token QR yang di-scan user
router.post('/validate', authenticate, async (req, res) => {
    try {
        const { token, office_id } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token QR tidak ditemukan.' });
        }

        const [rows] = await db.query(
            'SELECT * FROM dynamic_qrs WHERE token = ? AND expires_at >= NOW()',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'QR Code tidak valid atau sudah kedaluwarsa. Silakan scan ulang layar kantor.'
            });
        }

        res.json({
            success: true,
            message: 'QR Code valid.',
            office_id: rows[0].office_id
        });
    } catch (err) {
        console.error('Error validate qr:', err);
        res.status(500).json({ success: false, message: 'Gagal memvalidasi QR code.' });
    }
});

module.exports = router;

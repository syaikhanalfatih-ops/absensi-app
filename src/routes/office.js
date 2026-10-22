const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

// Ambil info kantor user yang login
router.get('/my', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT o.* FROM offices o
             JOIN users u ON u.office_id = o.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        if (rows.length === 0) {
            // Jika tidak ada office_id, fallback ke kantor default id=1
            const [defaultOffice] = await db.query('SELECT * FROM offices LIMIT 1');
            return res.json({ success: true, office: defaultOffice[0] || null });
        }

        res.json({ success: true, office: rows[0] });
    } catch (err) {
        console.error('Error get my office:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data kantor.' });
    }
});

// Admin: Ambil semua data kantor
router.get('/all', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM offices ORDER BY id ASC');
        res.json({ success: true, offices: rows });
    } catch (err) {
        console.error('Error all offices:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil daftar kantor.' });
    }
});

// Admin: Update kantor
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, latitude, longitude, radius, work_start, work_end, late_tolerance } = req.body;

        await db.query(
            `UPDATE offices 
             SET name = ?, address = ?, latitude = ?, longitude = ?, radius = ?, 
                 work_start = ?, work_end = ?, late_tolerance = ?
             WHERE id = ?`,
            [name, address, latitude, longitude, radius, work_start, work_end, late_tolerance, id]
        );

        res.json({ success: true, message: 'Data kantor berhasil diperbarui.' });
    } catch (err) {
        console.error('Error update office:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kantor.' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { saveBase64Image } = require('../middleware/upload');

// Register Pegawai Baru (Self-Service)
router.post('/register', async (req, res) => {
    try {
        const { employee_id, name, email, password, position, department, phone } = req.body;

        if (!employee_id || !name || !email || !password) {
            return res.status(400).json({ success: false, message: 'NIP/NIK, nama, email, dan password wajib diisi.' });
        }

        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ? OR employee_id = ?',
            [email, employee_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'NIP atau email sudah terdaftar.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `INSERT INTO users (employee_id, name, email, password, role, position, department, phone, office_id, is_active)
             VALUES (?, ?, ?, ?, 'employee', ?, ?, ?, 1, 1)`,
            [
                employee_id.trim(),
                name.trim(),
                email.trim().toLowerCase(),
                hashedPassword,
                position ? position.trim() : 'Staff',
                department ? department.trim() : 'Operasional',
                phone ? phone.trim() : null
            ]
        );

        const token = jwt.sign(
            { id: result.insertId, employee_id, name, email, role: 'employee', office_id: 1 },
            process.env.JWT_SECRET || 'super_secret_jwt_key_absensi_2026',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Pendaftaran berhasil! Akun pegawai siap digunakan.',
            token,
            user: {
                id: result.insertId,
                employee_id,
                name,
                email,
                role: 'employee',
                position: position || 'Staff',
                department: department || 'Operasional',
                has_face: false
            }
        });
    } catch (err) {
        console.error('Error register:', err);
        res.status(500).json({ success: false, message: 'Gagal mendaftarkan akun.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
        }

        const [rows] = await db.query(
            `SELECT u.*, o.name as office_name, o.latitude, o.longitude, o.radius, o.work_start, o.work_end, o.late_tolerance
             FROM users u
             LEFT JOIN offices o ON u.office_id = o.id
             WHERE u.email = ? AND u.is_active = 1`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Email atau password salah.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Email atau password salah.' });
        }

        const payload = {
            id: user.id,
            employee_id: user.employee_id,
            name: user.name,
            email: user.email,
            role: user.role,
            office_id: user.office_id
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || 'super_secret_jwt_key_absensi_2026', {
            expiresIn: '7d'
        });

        res.cookie('token', token, {
            httpOnly: false, // frontend can read if needed
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Don't send password or raw descriptor in main login response
        delete user.password;
        const hasFace = !!user.face_descriptor;
        delete user.face_descriptor;

        return res.json({
            success: true,
            message: 'Login berhasil.',
            token,
            user: {
                ...user,
                has_face: hasFace
            }
        });
    } catch (err) {
        console.error('Error login:', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.' });
    }
});

// Profile Saat Ini
router.get('/me', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.position, u.department, u.phone, u.avatar,
                    (u.face_descriptor IS NOT NULL) as has_face,
                    o.id as office_id, o.name as office_name, o.address as office_address,
                    o.latitude, o.longitude, o.radius, o.work_start, o.work_end, o.late_tolerance
             FROM users u
             LEFT JOIN offices o ON u.office_id = o.id
             WHERE u.id = ?`,
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
        }

        res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error('Error me:', err);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// Get Face Descriptor untuk pencocokan live
router.get('/face-descriptor', authenticate, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, face_descriptor FROM users WHERE id = ?',
            [req.user.id]
        );

        if (rows.length === 0 || !rows[0].face_descriptor) {
            return res.status(404).json({ success: false, message: 'Data biometrik wajah belum didaftarkan.' });
        }

        res.json({
            success: true,
            descriptor: JSON.parse(rows[0].face_descriptor)
        });
    } catch (err) {
        console.error('Error get descriptor:', err);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
});

// Daftarkan / Update Vektor Wajah
router.post('/register-face', authenticate, async (req, res) => {
    try {
        const { descriptor, photoBase64 } = req.body;

        if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
            return res.status(400).json({
                success: false,
                message: 'Format data vektor biometrik tidak valid. Wajib 128-dimensi array.'
            });
        }

        // Simpan foto wajah / avatar
        const avatarData = photoBase64 || null;
        const descriptorJson = JSON.stringify(descriptor);

        if (avatarData) {
            await db.query(
                'UPDATE users SET face_descriptor = ?, avatar = ? WHERE id = ?',
                [descriptorJson, avatarData, req.user.id]
            );
        } else {
            await db.query(
                'UPDATE users SET face_descriptor = ? WHERE id = ?',
                [descriptorJson, req.user.id]
            );
        }

        res.json({
            success: true,
            message: 'Data wajah biometrik berhasil disimpan!',
            avatar: avatarData
        });
    } catch (err) {
        console.error('Error register face:', err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan biometrik wajah.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logout berhasil.' });
});

module.exports = router;

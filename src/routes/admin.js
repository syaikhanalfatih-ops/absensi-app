const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

// Middleware: Semua rute admin wajib role 'admin'
router.use(authenticate, requireRole('admin'));

// Helper: Tanggal hari ini YYYY-MM-DD
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 1. Statistik Dashboard
router.get('/stats', async (req, res) => {
    try {
        const today = getTodayDateString();

        // Total Karyawan Aktif
        const [[{ total_employees }]] = await db.query(
            "SELECT COUNT(*) as total_employees FROM users WHERE role = 'employee' AND is_active = 1"
        );

        // Hadir Hari Ini
        const [[{ total_present }]] = await db.query(
            "SELECT COUNT(*) as total_present FROM attendances WHERE date = ? AND check_in_time IS NOT NULL",
            [today]
        );

        // Terlambat Hari Ini
        const [[{ total_late }]] = await db.query(
            "SELECT COUNT(*) as total_late FROM attendances WHERE date = ? AND status = 'late'",
            [today]
        );

        // Tepat Waktu
        const total_on_time = Math.max(0, total_present - total_late);

        // Belum Hadir
        const not_present = Math.max(0, total_employees - total_present);

        res.json({
            success: true,
            stats: {
                total_employees,
                total_present,
                total_on_time,
                total_late,
                not_present,
                date: today
            }
        });
    } catch (err) {
        console.error('Error admin stats:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil statistik.' });
    }
});

// 2. Daftar Log Absensi (Filter tanggal & user)
router.get('/attendances', async (req, res) => {
    try {
        const { date, start_date, end_date, user_id, status } = req.query;

        let query = `
            SELECT a.*, u.employee_id, u.name as user_name, u.position, u.department, u.avatar,
                   o.name as office_name
            FROM attendances a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN offices o ON a.office_id = o.id
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND a.date = ?';
            params.push(date);
        } else if (start_date && end_date) {
            query += ' AND a.date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        } else {
            // Default: hari ini
            query += ' AND a.date = ?';
            params.push(getTodayDateString());
        }

        if (user_id) {
            query += ' AND a.user_id = ?';
            params.push(user_id);
        }

        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }

        query += ' ORDER BY a.date DESC, a.check_in_time DESC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, count: rows.length, attendances: rows });
    } catch (err) {
        console.error('Error admin attendances:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data log absensi.' });
    }
});

// 3. Export Absensi ke CSV
router.get('/export', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const start = start_date || getTodayDateString();
        const end = end_date || getTodayDateString();

        const [rows] = await db.query(
            `SELECT a.date, u.employee_id, u.name, u.department, u.position,
                    a.check_in_time, a.check_in_distance, a.check_in_method,
                    a.check_out_time, a.status, o.name as office_name
             FROM attendances a
             JOIN users u ON a.user_id = u.id
             LEFT JOIN offices o ON a.office_id = o.id
             WHERE a.date BETWEEN ? AND ?
             ORDER BY a.date ASC, u.name ASC`,
            [start, end]
        );

        let csv = 'Tanggal,NIP/NIK,Nama Pegawai,Departemen,Jabatan,Jam Masuk,Jarak Masuk (m),Metode,Jam Pulang,Status,Kantor\r\n';

        rows.forEach(r => {
            csv += `"${r.date}","${r.employee_id}","${r.name}","${r.department || ''}","${r.position || ''}","${r.check_in_time || '-'}","${r.check_in_distance || 0}","${r.check_in_method || '-'}","${r.check_out_time || '-'}","${r.status}","${r.office_name || '-'}"\r\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="rekap_absensi_${start}_sd_${end}.csv"`);
        res.status(200).send(csv);
    } catch (err) {
        console.error('Error export csv:', err);
        res.status(500).json({ success: false, message: 'Gagal mengunduh laporan CSV.' });
    }
});

// 4. Kelola Karyawan: List
router.get('/employees', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.position, u.department, u.phone, u.avatar,
                    (u.face_descriptor IS NOT NULL) as has_face,
                    u.is_active, u.created_at,
                    o.id as office_id, o.name as office_name
             FROM users u
             LEFT JOIN offices o ON u.office_id = o.id
             ORDER BY u.role DESC, u.name ASC`
        );

        res.json({ success: true, employees: rows });
    } catch (err) {
        console.error('Error list employees:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data karyawan.' });
    }
});

// 5. Kelola Karyawan: Tambah
router.post('/employees', async (req, res) => {
    try {
        const { employee_id, name, email, password, role, position, department, phone, office_id } = req.body;

        if (!employee_id || !name || !email || !password) {
            return res.status(400).json({ success: false, message: 'NIP, nama, email, dan password wajib diisi.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `INSERT INTO users (employee_id, name, email, password, role, position, department, phone, office_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                employee_id,
                name,
                email,
                hashedPassword,
                role || 'employee',
                position || 'Staff',
                department || 'Umum',
                phone || null,
                office_id || 1
            ]
        );

        res.json({ success: true, message: 'Karyawan baru berhasil ditambahkan.', id: result.insertId });
    } catch (err) {
        console.error('Error add employee:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'NIP atau email sudah digunakan.' });
        }
        res.status(500).json({ success: false, message: 'Gagal menambahkan karyawan.' });
    }
});

// 6. Kelola Karyawan: Update
router.put('/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, name, email, password, role, position, department, phone, office_id, is_active } = req.body;

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                `UPDATE users 
                 SET employee_id = ?, name = ?, email = ?, password = ?, role = ?, 
                     position = ?, department = ?, phone = ?, office_id = ?, is_active = ?
                 WHERE id = ?`,
                [employee_id, name, email, hashedPassword, role, position, department, phone, office_id, is_active, id]
            );
        } else {
            await db.query(
                `UPDATE users 
                 SET employee_id = ?, name = ?, email = ?, role = ?, 
                     position = ?, department = ?, phone = ?, office_id = ?, is_active = ?
                 WHERE id = ?`,
                [employee_id, name, email, role, position, department, phone, office_id, is_active, id]
            );
        }

        res.json({ success: true, message: 'Data karyawan berhasil diperbarui.' });
    } catch (err) {
        console.error('Error update employee:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui karyawan.' });
    }
});

// 7. Kelola Karyawan: Reset Face Biometrik
router.post('/employees/:id/reset-face', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE users SET face_descriptor = NULL WHERE id = ?', [id]);
        res.json({ success: true, message: 'Data biometrik wajah karyawan berhasil di-reset.' });
    } catch (err) {
        console.error('Error reset face:', err);
        res.status(500).json({ success: false, message: 'Gagal me-reset wajah biometrik.' });
    }
});

// 8. Kelola Karyawan: Hapus
router.delete('/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun admin yang sedang login.' });
        }

        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'Karyawan berhasil dihapus.' });
    } catch (err) {
        console.error('Error delete employee:', err);
        res.status(500).json({ success: false, message: 'Gagal menghapus karyawan.' });
    }
});

module.exports = router;

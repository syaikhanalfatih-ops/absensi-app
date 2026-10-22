const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware standar
app.use(cors());
app.use(express.json({ limit: '15mb' })); // support foto base64 selfie
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/office', require('./src/routes/office'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/qr', require('./src/routes/qr'));
app.use('/api/admin', require('./src/routes/admin'));

// Fallback untuk route SPA / PWA
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.get('/register-face', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/register-face.html'));
});

// Catch-all fallback
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'Endpoint API tidak ditemukan.' });
    }
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Jalankan Server jika dipanggil langsung
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`===============================================`);
        console.log(`🚀 Server Absensi berjalan di http://localhost:${PORT}`);
        console.log(`📱 Mobile PWA Absensi: http://localhost:${PORT}`);
        console.log(`🖥️ Admin Dashboard   : http://localhost:${PORT}/admin`);
        console.log(`===============================================`);
    });
}

module.exports = app;

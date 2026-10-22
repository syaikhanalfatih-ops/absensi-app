const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.VERCEL
    ? path.join('/tmp', 'selfies')
    : path.join(__dirname, '../../uploads/selfies');

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (e) {
    // Abaikan jika filesystem read-only di serverless
}

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diperbolehkan!'));
        }
    }
});

/**
 * Simpan base64 string gambar ke file jpg (jika di local)
 * @param {string} base64Data 
 * @returns {string|null} Nama file yang tersimpan
 */
function saveBase64Image(base64Data) {
    if (!base64Data || !base64Data.startsWith('data:image')) {
        return null;
    }

    try {
        const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return null;
        }

        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const fileName = 'selfie-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.' + ext;
        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(filePath, buffer);
        return fileName;
    } catch (err) {
        // Pada Vercel, jangan simpan ke file disk
        return null;
    }
}

module.exports = { upload, saveBase64Image };

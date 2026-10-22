const mysql = require('mysql2/promise');
require('dotenv').config();

const isRemote = process.env.DB_HOST && !['localhost', '127.0.0.1'].includes(process.env.DB_HOST);
const useSsl = process.env.DB_SSL === 'true' || isRemote;

const poolConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'db_absensi',
    waitForConnections: true,
    connectionLimit: 5, // Serverless Vercel ramah connection limit
    queueLimit: 0,
    timezone: '+07:00'
};

if (useSsl) {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;

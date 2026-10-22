const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('🧪 Memulai Pengujian Otomatis Sistem Absensi...\n');

    try {
        // 1. Test Login Admin
        console.log('1. Menguji Login Admin...');
        const loginAdminRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@absensi.local', password: 'admin123' })
        });
        const adminData = await loginAdminRes.json();
        if (!adminData.success) throw new Error('Login admin gagal: ' + adminData.message);
        console.log('✅ Login Admin Berhasil! Token didapat.');
        const adminToken = adminData.token;

        // 2. Test Get Admin Stats
        console.log('\n2. Menguji Ambil Statistik Admin...');
        const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const statsData = await statsRes.json();
        if (!statsData.success) throw new Error('Gagal ambil stats: ' + statsData.message);
        console.log('✅ Statistik Dashboard:', statsData.stats);

        // 3. Test Dynamic QR Generation
        console.log('\n3. Menguji Pembuatan Dynamic QR Lobi...');
        const qrRes = await fetch(`${BASE_URL}/api/qr/dynamic?office_id=1`, {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const qrData = await qrRes.json();
        if (!qrData.success || !qrData.token) throw new Error('Gagal generate QR');
        console.log('✅ Dynamic QR berhasil dibuat! Token:', qrData.token.substring(0, 16) + '...');

        // 4. Test QR Validation
        console.log('\n4. Menguji Validasi Token QR...');
        const qrValRes = await fetch(`${BASE_URL}/api/qr/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + adminToken
            },
            body: JSON.stringify({ token: qrData.token, office_id: 1 })
        });
        const qrValData = await qrValRes.json();
        if (!qrValData.success) throw new Error('Gagal validasi QR: ' + qrValData.message);
        console.log('✅ Token QR valid!');

        // 5. Test Login Employee
        console.log('\n5. Menguji Login Pegawai (Budi)...');
        const loginEmpRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'budi@absensi.local', password: 'karyawan123' })
        });
        const empData = await loginEmpRes.json();
        if (!empData.success) throw new Error('Login karyawan gagal: ' + empData.message);
        console.log('✅ Login Pegawai Berhasil! Nama:', empData.user.name);
        const empToken = empData.token;

        // 6. Test Register Face Biometric Vector
        console.log('\n6. Menguji Pendaftaran Vektor Wajah Biometrik...');
        const dummyDescriptor = Array.from({ length: 128 }, () => Math.random() * 0.1);
        const faceRegRes = await fetch(`${BASE_URL}/api/auth/register-face`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + empToken
            },
            body: JSON.stringify({ descriptor: dummyDescriptor })
        });
        const faceRegData = await faceRegRes.json();
        if (!faceRegData.success) throw new Error('Gagal daftar biometrik: ' + faceRegData.message);
        console.log('✅ Vektor biometrik 128-dimensi berhasil disimpan!');

        // 7. Test Get Face Descriptor
        console.log('\n7. Menguji Ambil Vektor Biometrik Wajah...');
        const getDescRes = await fetch(`${BASE_URL}/api/auth/face-descriptor`, {
            headers: { 'Authorization': 'Bearer ' + empToken }
        });
        const getDescData = await getDescRes.json();
        if (!getDescData.success || getDescData.descriptor.length !== 128) throw new Error('Data descriptor tidak cocok');
        console.log('✅ Vektor biometrik berhasil diverifikasi dari DB.');

        // 8. Test Check-In Geofence Validation: Luar Radius
        console.log('\n8. Menguji Validasi Geofence (Luar Radius)...');
        const outRadiusRes = await fetch(`${BASE_URL}/api/attendance/check-in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + empToken
            },
            body: JSON.stringify({
                lat: -6.917464, // Bandung (jauh dari Jakarta)
                lng: 107.619122,
                method: 'gps'
            })
        });
        const outRadiusData = await outRadiusRes.json();
        if (outRadiusData.success) throw new Error('Seharusnya gagal di luar radius!');
        console.log('✅ Sistem sukses menolak absen di luar radius:', outRadiusData.message);

        // 9. Test Check-In: Di Dalam Radius Kantor
        console.log('\n9. Menguji Absen Masuk (Dalam Radius Kantor)...');
        const inRadiusRes = await fetch(`${BASE_URL}/api/attendance/check-in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + empToken
            },
            body: JSON.stringify({
                lat: -6.22558800, // Koordinat kantor pusat
                lng: 106.80859100,
                method: 'face'
            })
        });
        const inRadiusData = await inRadiusRes.json();
        if (!inRadiusData.success) throw new Error('Absen masuk gagal: ' + inRadiusData.message);
        console.log('✅ Absen Masuk Berhasil! Status:', inRadiusData.status, '| Jarak:', inRadiusData.distance, 'm');

        // 10. Test Check-In Duplikasi
        console.log('\n10. Menguji Pencegahan Absen Masuk Ganda...');
        const dupRes = await fetch(`${BASE_URL}/api/attendance/check-in`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + empToken
            },
            body: JSON.stringify({
                lat: -6.22558800,
                lng: 106.80859100,
                method: 'face'
            })
        });
        const dupData = await dupRes.json();
        if (dupData.success) throw new Error('Absen ganda tidak boleh berhasil!');
        console.log('✅ Sistem sukses mencegah absen ganda:', dupData.message);

        // 11. Test Check-Out: Absen Pulang
        console.log('\n11. Menguji Absen Pulang (Check-Out)...');
        const outRes = await fetch(`${BASE_URL}/api/attendance/check-out`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + empToken
            },
            body: JSON.stringify({
                lat: -6.22558800,
                lng: 106.80859100,
                method: 'face'
            })
        });
        const outData = await outRes.json();
        if (!outData.success) throw new Error('Absen pulang gagal: ' + outData.message);
        console.log('✅ Absen Pulang Berhasil!', outData.message);

        // 12. Test Admin Logs & Stats Update
        console.log('\n12. Menguji Pembaruan Log & Statistik di Panel Admin...');
        const newStatsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const newStatsData = await newStatsRes.json();
        console.log('✅ Statistik Terbaru Admin:', newStatsData.stats);

        const logsRes = await fetch(`${BASE_URL}/api/admin/attendances`, {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const logsData = await logsRes.json();
        console.log(`✅ Log Presensi Terdaftar: ${logsData.count} data.`);
        console.log('   Data Terakhir:', {
            nama: logsData.attendances[0].user_name,
            masuk: logsData.attendances[0].check_in_time,
            pulang: logsData.attendances[0].check_out_time,
            status: logsData.attendances[0].status,
            metode: logsData.attendances[0].check_in_method,
            jarak: logsData.attendances[0].check_in_distance + 'm'
        });

        console.log('\n🎉 SEMUA PENGUJIAN FITUR SELESAI & LULUS 100%!');

    } catch (err) {
        console.error('\n❌ PENGUJIAN GAGAL:', err.message);
        process.exit(1);
    }
}

runTests();

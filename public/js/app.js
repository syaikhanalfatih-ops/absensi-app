// Main Application Logic for Presensi Pintar Mobile
lucide.createIcons();

const token = localStorage.getItem('auth_token');
if (!token) {
    window.location.href = '/login';
}

let currentUser = null;
let currentOffice = null;
let userDescriptor = null;
let currentCoords = null;
let isMockGps = false;
let attendanceMode = 'check-in'; // 'check-in' or 'check-out'

// Live Clock
function updateClock() {
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const timeStr = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join(':');

    const clockElem = document.getElementById('liveClock');
    const dateElem = document.getElementById('currentDate');
    if (clockElem) clockElem.textContent = timeStr;
    if (dateElem) dateElem.textContent = dateStr;
}
setInterval(updateClock, 1000);
updateClock();

// Haversine Distance in JS
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// 1. Fetch User Profile & Status
async function loadUserData() {
    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!data.success) {
            localStorage.clear();
            window.location.href = '/login';
            return;
        }

        currentUser = data.user;
        currentOffice = {
            id: data.user.office_id,
            name: data.user.office_name,
            address: data.user.office_address,
            latitude: parseFloat(data.user.latitude),
            longitude: parseFloat(data.user.longitude),
            radius: data.user.radius,
            work_start: data.user.work_start,
            work_end: data.user.work_end,
            late_tolerance: data.user.late_tolerance
        };

        // Render Profile
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').textContent = `${currentUser.position} • ${currentUser.department}`;
        document.getElementById('officeName').innerHTML = `
            <i data-lucide="building" class="w-3.5 h-3.5"></i>
            <span>${currentOffice.name} (Radius: ${currentOffice.radius}m)</span>
        `;

        // Render Tab Profil
        document.getElementById('profileName').textContent = currentUser.name;
        document.getElementById('profileNip').textContent = 'NIP: ' + currentUser.employee_id;
        document.getElementById('profilePosition').textContent = currentUser.position;
        document.getElementById('profileDept').textContent = currentUser.department;
        document.getElementById('profileEmail').textContent = currentUser.email;
        document.getElementById('profileOffice').textContent = currentOffice.name;

        if (currentUser.avatar) {
            const avatarSrc = currentUser.avatar.startsWith('data:image') ? currentUser.avatar : `/uploads/selfies/${currentUser.avatar}`;
            const avatarHtml = `<img src="${avatarSrc}" class="w-full h-full object-cover">`;
            document.getElementById('userAvatarContainer').innerHTML = avatarHtml;
            document.getElementById('profileAvatarLarge').innerHTML = avatarHtml;
        }

        // Biometric Warning
        const warning = document.getElementById('faceWarningBanner');
        const faceStatus = document.getElementById('profileFaceStatus');
        if (!currentUser.has_face) {
            warning.classList.remove('hidden');
            faceStatus.className = 'font-medium text-amber-400 flex items-center gap-1';
            faceStatus.innerHTML = '<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> Belum Terdaftar';
        } else {
            warning.classList.add('hidden');
            faceStatus.className = 'font-medium text-emerald-400 flex items-center gap-1';
            faceStatus.innerHTML = '<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Terdaftar';
            loadUserDescriptor();
        }

        lucide.createIcons();
        initGeolocation();
        loadTodayStatus();
    } catch (err) {
        console.error('Error loadUserData:', err);
    }
}

// 2. Muat Vektor Biometrik Wajah Karyawan
async function loadUserDescriptor() {
    try {
        const res = await fetch('/api/auth/face-descriptor', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (data.success && data.descriptor) {
            userDescriptor = new Float32Array(data.descriptor);
        }
    } catch (e) {
        console.error('Error load descriptor:', e);
    }
}

// 3. Status Absensi Hari Ini
async function loadTodayStatus() {
    try {
        const res = await fetch('/api/attendance/today', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        const inTimeElem = document.getElementById('checkInTimeText');
        const inBadgeElem = document.getElementById('checkInStatusBadge');
        const outTimeElem = document.getElementById('checkOutTimeText');
        const outBadgeElem = document.getElementById('checkOutStatusBadge');
        const btnIn = document.getElementById('btnOpenCheckIn');
        const btnOut = document.getElementById('btnOpenCheckOut');

        if (data.has_checked_in) {
            inTimeElem.textContent = data.attendance.check_in_time.substring(0, 5) + ' WIB';
            const isLate = data.attendance.status === 'late';
            inBadgeElem.textContent = isLate ? 'Terlambat' : 'Tepat Waktu';
            inBadgeElem.className = isLate ? 'mt-1 text-[11px] font-medium text-amber-400' : 'mt-1 text-[11px] font-medium text-emerald-400';
            btnIn.disabled = true;
            btnIn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            inTimeElem.textContent = '--:--';
            inBadgeElem.textContent = 'Belum Absen';
            btnIn.disabled = false;
            btnIn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        if (data.has_checked_out) {
            outTimeElem.textContent = data.attendance.check_out_time.substring(0, 5) + ' WIB';
            outBadgeElem.textContent = 'Selesai';
            outBadgeElem.className = 'mt-1 text-[11px] font-medium text-blue-400';
            btnOut.disabled = true;
            btnOut.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            outTimeElem.textContent = '--:--';
            outBadgeElem.textContent = data.has_checked_in ? 'Belum Pulang' : 'Wajib Masuk Dulu';
            btnOut.disabled = !data.has_checked_in;
            if (!data.has_checked_in) btnOut.classList.add('opacity-50', 'cursor-not-allowed');
            else btnOut.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    } catch (err) {
        console.error('Error loadTodayStatus:', err);
    }
}

// 4. Inisialisasi Geolocation Real-Time
function initGeolocation() {
    if (!navigator.geolocation) {
        updateGpsStatus(null, 'Browser tidak mendukung GPS Geolocation.');
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            if (!isMockGps) {
                currentCoords = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude
                };
                evaluateDistance();
            }
        },
        (err) => {
            if (!isMockGps) {
                updateGpsStatus(null, 'Izin GPS ditolak atau GPS tidak aktif.');
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function evaluateDistance() {
    if (!currentCoords || !currentOffice) return;

    const dist = calculateDistance(
        currentCoords.latitude,
        currentCoords.longitude,
        currentOffice.latitude,
        currentOffice.longitude
    );

    const isInRadius = dist <= currentOffice.radius;
    updateGpsStatus(isInRadius, dist);
}

function updateGpsStatus(isInRadius, detail) {
    const dot = document.getElementById('gpsIndicatorDot');
    const statusText = document.getElementById('gpsStatusText');
    const distText = document.getElementById('gpsDistanceText');

    if (isInRadius === true) {
        dot.className = 'w-3.5 h-3.5 rounded-full bg-emerald-500 radar-pulse flex-shrink-0';
        statusText.textContent = 'Di Dalam Radius Kantor';
        statusText.className = 'font-semibold text-emerald-400';
        distText.textContent = `Jarak Anda: ${detail} meter (Batas: ${currentOffice.radius}m)`;
    } else if (isInRadius === false) {
        dot.className = 'w-3.5 h-3.5 rounded-full bg-rose-500 flex-shrink-0';
        statusText.textContent = 'Di Luar Radius Kantor';
        statusText.className = 'font-semibold text-rose-400';
        distText.textContent = `Jarak Anda: ${detail} meter (Batas: ${currentOffice.radius}m)`;
    } else {
        dot.className = 'w-3.5 h-3.5 rounded-full bg-yellow-400 animate-pulse flex-shrink-0';
        statusText.textContent = 'GPS Menunggu Izin';
        statusText.className = 'font-medium text-slate-300';
        distText.textContent = detail;
    }
}

// Fitur Simulasi GPS Kantor untuk Pengujian
document.getElementById('toggleMockGpsBtn').addEventListener('click', () => {
    if (!currentOffice) return;
    isMockGps = !isMockGps;
    const btn = document.getElementById('toggleMockGpsBtn');

    if (isMockGps) {
        currentCoords = {
            latitude: currentOffice.latitude + 0.00005, // ~5 meter dari kantor
            longitude: currentOffice.longitude + 0.00005
        };
        btn.textContent = '[Kembalikan GPS Asli]';
        btn.className = 'text-emerald-400 hover:underline font-semibold';
        evaluateDistance();
    } else {
        btn.textContent = '[Set ke Posisi Kantor]';
        btn.className = 'text-blue-400 hover:underline';
        initGeolocation();
    }
});

document.getElementById('refreshGpsBtn').addEventListener('click', () => {
    if (isMockGps) {
        evaluateDistance();
    } else {
        initGeolocation();
    }
});

// 5. MODAL FACE RECOGNITION ATTENDANCE
const faceModal = document.getElementById('faceModal');
const modalVideo = document.getElementById('modalVideo');
const modalOverlay = document.getElementById('modalOverlay');
const modalGuideOval = document.getElementById('modalGuideOval');
const faceMatchBadge = document.getElementById('faceMatchBadge');
const btnSubmitFace = document.getElementById('btnSubmitFaceAttendance');
const btnSubmitText = document.getElementById('btnSubmitFaceText');

let faceStream = null;
let faceInterval = null;
let isFaceMatched = false;
let capturedSnapshot = null;

async function openFaceModal(mode) {
    attendanceMode = mode;
    document.getElementById('faceModalTitle').textContent = mode === 'check-in' ? 'Absen Masuk (Wajah)' : 'Absen Pulang (Wajah)';
    faceModal.classList.remove('hidden');

    btnSubmitFace.disabled = true;
    btnSubmitText.textContent = 'Menunggu Verifikasi Wajah...';
    faceMatchBadge.textContent = 'Memuat kamera & model biometrik...';

    try {
        // Muat models jika belum
        const MODEL_URL = '/models';
        if (!faceapi.nets.ssdMobilenetv1.params) {
            await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
            await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
            await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        }

        faceStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });
        modalVideo.srcObject = faceStream;
        modalVideo.onloadedmetadata = () => {
            modalVideo.play();
            startFaceMatching();
        };
    } catch (err) {
        console.error('Camera open error:', err);
        faceMatchBadge.textContent = 'Gagal mengakses kamera.';
        modalGuideOval.classList.add('fail');
    }
}

function closeFaceModal() {
    if (faceStream) {
        faceStream.getTracks().forEach(t => t.stop());
    }
    clearInterval(faceInterval);
    faceModal.classList.add('hidden');
    modalGuideOval.className = 'face-scan-guide';
}

function startFaceMatching() {
    const displaySize = { width: modalVideo.videoWidth || 280, height: modalVideo.videoHeight || 373 };
    faceapi.matchDimensions(modalOverlay, displaySize);

    faceInterval = setInterval(async () => {
        if (modalVideo.paused || modalVideo.ended) return;

        const detection = await faceapi.detectSingleFace(modalVideo)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            modalGuideOval.classList.remove('fail');

            if (!userDescriptor) {
                // User belum daftarkan wajah
                faceMatchBadge.className = 'absolute bottom-3 left-3 right-3 py-1.5 px-3 bg-amber-900/90 backdrop-blur rounded-xl text-center text-xs text-amber-200';
                faceMatchBadge.textContent = 'Wajah terdeteksi (Belum ada template biometrik)';
                btnSubmitFace.disabled = false;
                btnSubmitText.textContent = 'Kirim Presensi (Selfie)';
                isFaceMatched = true;
                return;
            }

            // Hitung Euclidean Distance antara live wajah & stored descriptor
            const distance = faceapi.euclideanDistance(detection.descriptor, userDescriptor);
            const threshold = 0.55; // standar face-api
            const similarity = Math.max(0, Math.min(100, Math.round((1 - (distance / 0.8)) * 100)));

            if (distance <= threshold) {
                modalGuideOval.classList.add('success');
                faceMatchBadge.className = 'absolute bottom-3 left-3 right-3 py-1.5 px-3 bg-emerald-900/90 backdrop-blur rounded-xl text-center text-xs text-emerald-200 font-medium';
                faceMatchBadge.textContent = `Wajah Cocok: ${similarity}% (${currentUser.name})`;

                btnSubmitFace.disabled = false;
                btnSubmitText.textContent = `Konfirmasi ${attendanceMode === 'check-in' ? 'Absen Masuk' : 'Absen Pulang'}`;
                isFaceMatched = true;
            } else {
                modalGuideOval.classList.remove('success');
                faceMatchBadge.className = 'absolute bottom-3 left-3 right-3 py-1.5 px-3 bg-rose-900/90 backdrop-blur rounded-xl text-center text-xs text-rose-200';
                faceMatchBadge.textContent = `Wajah tidak sesuai (${similarity}%)`;
                btnSubmitFace.disabled = true;
                btnSubmitText.textContent = 'Wajah Tidak Cocok';
                isFaceMatched = false;
            }
        } else {
            modalGuideOval.classList.remove('success');
            faceMatchBadge.className = 'absolute bottom-3 left-3 right-3 py-1.5 px-3 bg-slate-900/80 backdrop-blur rounded-xl text-center text-xs text-slate-300';
            faceMatchBadge.textContent = 'Posisikan wajah di dalam lingkaran...';
            btnSubmitFace.disabled = true;
            btnSubmitText.textContent = 'Mencari Wajah...';
        }
    }, 400);
}

// Submit Face Attendance
btnSubmitFace.addEventListener('click', async () => {
    btnSubmitFace.disabled = true;
    btnSubmitText.textContent = 'Mengirim Presensi...';

    // Buat snapshot selfie
    const canvas = document.createElement('canvas');
    canvas.width = modalVideo.videoWidth || 480;
    canvas.height = modalVideo.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(modalVideo, 0, 0, canvas.width, canvas.height);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    await submitAttendance({
        method: 'face',
        photoBase64: photoBase64
    });

    closeFaceModal();
});

// 6. MODAL QR SCANNER
const qrModal = document.getElementById('qrModal');
let html5QrCode = null;

function openQrScanner(mode) {
    attendanceMode = mode;
    qrModal.classList.remove('hidden');
    document.getElementById('qrScanStatus').textContent = 'Mengaktifkan scanner kamera...';

    html5QrCode = new Html5Qrcode("qrReader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        onQrCodeSuccess,
        (errorMessage) => {}
    ).catch(err => {
        console.error('QR start error:', err);
        document.getElementById('qrScanStatus').textContent = 'Gagal mengakses kamera belakang.';
    });
}

function closeQrModal() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(e => {});
    }
    qrModal.classList.add('hidden');
}

async function onQrCodeSuccess(decodedText) {
    try {
        let token = decodedText;
        try {
            const parsed = JSON.parse(decodedText);
            if (parsed.token) token = parsed.token;
        } catch (e) {}

        document.getElementById('qrScanStatus').textContent = 'QR terdeteksi! Memverifikasi...';
        closeQrModal();

        await submitAttendance({
            method: 'qr',
            qr_token: token
        });
    } catch (e) {
        alert('Gagal memproses QR Code.');
    }
}

// 7. Core Function Submit Attendance
async function submitAttendance({ method, photoBase64, qr_token }) {
    if (!currentCoords) {
        alert('Koordinat GPS belum siap. Pastikan izin lokasi aktif atau klik [Set ke Posisi Kantor].');
        return;
    }

    const endpoint = attendanceMode === 'check-in' ? '/api/attendance/check-in' : '/api/attendance/check-out';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                lat: currentCoords.latitude,
                lng: currentCoords.longitude,
                method: method,
                photoBase64: photoBase64 || null,
                qr_token: qr_token || null
            })
        });

        const data = await res.json();

        if (!data.success) {
            alert('Gagal: ' + data.message);
            return;
        }

        alert('Berhasil! ' + data.message);
        loadTodayStatus();
        loadHistory();
    } catch (err) {
        console.error('Error submit attendance:', err);
        alert('Terjadi kesalahan saat mengirim presensi.');
    }
}

// Button Listeners
document.getElementById('btnOpenCheckIn').addEventListener('click', () => {
    openFaceModal('check-in');
});

document.getElementById('btnOpenCheckOut').addEventListener('click', () => {
    openFaceModal('check-out');
});

document.getElementById('btnOpenQrScanner').addEventListener('click', () => {
    openQrScanner('check-in');
});

// Logout Listener
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('Yakin ingin keluar?')) {
        await fetch('/api/auth/logout', { method: 'POST' });
        localStorage.clear();
        window.location.href = '/login';
    }
});

// 8. Navigation & Tab Switcher
function switchTab(tabId) {
    const tabs = ['presensi', 'riwayat', 'profil'];
    tabs.forEach(t => {
        const section = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        const nav = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
        if (t === tabId) {
            section.classList.remove('hidden');
            nav.classList.add('active', 'text-blue-500');
            nav.classList.remove('text-slate-400');
        } else {
            section.classList.add('hidden');
            nav.classList.remove('active', 'text-blue-500');
            nav.classList.add('text-slate-400');
        }
    });

    if (tabId === 'riwayat') {
        loadHistory();
    }
}

// 9. Load Riwayat Absensi
async function loadHistory() {
    const container = document.getElementById('historyListContainer');
    try {
        const res = await fetch('/api/attendance/history', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!data.success || data.history.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-xs text-slate-500">Belum ada riwayat absensi bulan ini.</div>';
            return;
        }

        let html = '';
        data.history.forEach(row => {
            const isLate = row.status === 'late';
            const statusClass = isLate ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            const statusLabel = isLate ? 'Terlambat' : 'Tepat Waktu';

            const photoSrc = row.check_in_photo 
                ? (row.check_in_photo.startsWith('data:image') ? row.check_in_photo : `/uploads/selfies/${row.check_in_photo}`)
                : null;

            const photoThumbnail = photoSrc 
                ? `<img src="${photoSrc}" class="w-10 h-10 rounded-xl object-cover border border-slate-700">`
                : `<div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500"><i data-lucide="camera" class="w-4 h-4"></i></div>`;

            html += `
                <div class="p-3 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-center justify-between text-xs">
                    <div class="flex items-center gap-3">
                        ${photoThumbnail}
                        <div>
                            <div class="font-semibold text-slate-200">${row.date}</div>
                            <div class="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>Masuk: ${row.check_in_time ? row.check_in_time.substring(0, 5) : '-'}</span>
                                <span>•</span>
                                <span>Pulang: ${row.check_out_time ? row.check_out_time.substring(0, 5) : '-'}</span>
                            </div>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-medium border ${statusClass}">
                        ${statusLabel}
                    </span>
                </div>
            `;
        });

        container.innerHTML = html;
        lucide.createIcons();
    } catch (err) {
        console.error('Error loadHistory:', err);
    }
}

// Inisialisasi awal saat load
window.addEventListener('DOMContentLoaded', () => {
    loadUserData();
});

-- Inisialisasi Database Absensi
CREATE DATABASE IF NOT EXISTS `db_absensi` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `db_absensi`;

-- 1. Tabel Kantor / Lokasi Geofence
CREATE TABLE IF NOT EXISTS `offices` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `address` TEXT NULL,
    `latitude` DECIMAL(10, 8) NOT NULL,
    `longitude` DECIMAL(11, 8) NOT NULL,
    `radius` INT NOT NULL DEFAULT 100, -- radius meter
    `work_start` TIME NOT NULL DEFAULT '08:00:00',
    `work_end` TIME NOT NULL DEFAULT '17:00:00',
    `late_tolerance` INT NOT NULL DEFAULT 15, -- menit toleransi terlambat
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tabel Users (Admin & Karyawan)
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `employee_id` VARCHAR(50) UNIQUE NOT NULL, -- NIP / NIK
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(100) UNIQUE NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
    `position` VARCHAR(100) DEFAULT 'Staff',
    `department` VARCHAR(100) DEFAULT 'Umum',
    `phone` VARCHAR(30) NULL,
    `office_id` INT NULL,
    `face_descriptor` LONGTEXT NULL, -- JSON Float32Array (128 descriptor embedding)
    `avatar` LONGTEXT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_users_office` FOREIGN KEY (`office_id`) REFERENCES `offices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabel Absensi (Presensi Harian)
CREATE TABLE IF NOT EXISTS `attendances` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `office_id` INT NULL,
    `date` DATE NOT NULL,
    
    -- Check In (Masuk)
    `check_in_time` TIME NULL,
    `check_in_lat` DECIMAL(10, 8) NULL,
    `check_in_lng` DECIMAL(11, 8) NULL,
    `check_in_distance` INT NULL, -- Jarak meter saat absen
    `check_in_photo` LONGTEXT NULL,
    `check_in_method` ENUM('face', 'qr', 'gps') DEFAULT 'gps',
    
    -- Check Out (Pulang)
    `check_out_time` TIME NULL,
    `check_out_lat` DECIMAL(10, 8) NULL,
    `check_out_lng` DECIMAL(11, 8) NULL,
    `check_out_distance` INT NULL,
    `check_out_photo` LONGTEXT NULL,
    `check_out_method` ENUM('face', 'qr', 'gps') NULL,
    
    -- Status & Catatan
    `status` ENUM('present', 'late', 'leave', 'absent') NOT NULL DEFAULT 'present',
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY `unique_user_date` (`user_id`, `date`),
    CONSTRAINT `fk_attendances_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_attendances_office` FOREIGN KEY (`office_id`) REFERENCES `offices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabel Dynamic QR Code (Lobby Kantor)
CREATE TABLE IF NOT EXISTS `dynamic_qrs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `office_id` INT NOT NULL,
    `token` VARCHAR(64) UNIQUE NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_dynamic_qrs_office` FOREIGN KEY (`office_id`) REFERENCES `offices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Data Awal
INSERT INTO `offices` (`id`, `name`, `address`, `latitude`, `longitude`, `radius`, `work_start`, `work_end`, `late_tolerance`)
VALUES (1, 'Kantor Pusat', 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan', -6.22558800, 106.80859100, 150, '08:00:00', '17:00:00', 15)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

INSERT INTO `users` (`id`, `employee_id`, `name`, `email`, `password`, `role`, `position`, `department`, `office_id`, `is_active`)
VALUES 
(1, 'ADM001', 'Administrator HRD', 'admin@absensi.local', '$2b$10$kCJV7BHLVXg0XD63JyC9C.6hZ2xXf67ZeLmoRGSR350OSk33QrZga', 'admin', 'HR Manager', 'Human Resource', 1, 1),
(2, 'EMP001', 'Budi Santoso', 'budi@absensi.local', '$2b$10$gMR2y4o.lD2PcM.fbfjs3.AB/frx/T/24mWLyJ3uM8ApmPcuu4c4e', 'employee', 'Software Engineer', 'IT & Development', 1, 1),
(3, 'EMP002', 'Siti Rahma', 'siti@absensi.local', '$2b$10$gMR2y4o.lD2PcM.fbfjs3.AB/frx/T/24mWLyJ3uM8ApmPcuu4c4e', 'employee', 'UI/UX Designer', 'Product Design', 1, 1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

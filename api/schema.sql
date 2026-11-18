-- ==========================================================================
-- MANAJEMEN UANG IHSAAN — SKEMA DATABASE MYSQL
-- Jalankan sekali lewat Laragon/phpMyAdmin atau:
--   mysql -u root < api/schema.sql
-- ==========================================================================

CREATE DATABASE IF NOT EXISTS `manajemen_uang_ihsaan`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `manajemen_uang_ihsaan`;

CREATE TABLE IF NOT EXISTS `settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `name` VARCHAR(24) NOT NULL DEFAULT 'Ihsaan',
  `pin` VARCHAR(6) NOT NULL DEFAULT '123456',
  `monthly_limit` BIGINT UNSIGNED NOT NULL DEFAULT 1500000,
  `weekly_limit` BIGINT UNSIGNED NOT NULL DEFAULT 350000,
  `theme` VARCHAR(10) NOT NULL DEFAULT 'system',
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` VARCHAR(100) NOT NULL,
  `type` ENUM('income', 'expense') NOT NULL,
  `amount` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `note` VARCHAR(160) NOT NULL,
  `tx_date` DATE NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tx_date` (`tx_date`),
  KEY `idx_tx_type` (`type`),
  KEY `idx_tx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `amount` BIGINT UNSIGNED NOT NULL,
  `cycle` ENUM('weekly', 'monthly') NOT NULL DEFAULT 'monthly',
  `due_date` DATE NOT NULL,
  `category` VARCHAR(40) NOT NULL DEFAULT 'langganan',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL,
  `last_paid_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sub_due` (`due_date`),
  KEY `idx_sub_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wishlist` (
  `id` VARCHAR(100) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `target` BIGINT UNSIGNED NOT NULL,
  `saved` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `deadline` DATE NULL,
  `note` VARCHAR(160) NOT NULL DEFAULT '',
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `completed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wish_completed` (`completed`),
  KEY `idx_wish_deadline` (`deadline`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `quick_adds` (
  `id` VARCHAR(100) NOT NULL,
  `label` VARCHAR(40) NOT NULL,
  `amount` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sync_meta` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `revision` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL,
  `client_id` VARCHAR(100) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `sync_meta` (`id`, `revision`, `updated_at`)
VALUES (1, 0, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE `id` = `id`;

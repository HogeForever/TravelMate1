-- =========================================================
-- TravelMate — База данных MySQL в OpenServer (gbook)
-- Хост: 127.0.1.31, База: gbook, Пользователь: root, Порт: 3306
-- =========================================================

CREATE DATABASE IF NOT EXISTS gbook
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE gbook;

-- 1. Пайдаланушылар / Пользователи (клиенты, агентства, админ)
CREATE TABLE IF NOT EXISTS users (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    name     VARCHAR(100) NOT NULL,
    email    VARCHAR(100) NOT NULL UNIQUE,
    phone    VARCHAR(30),
    password VARCHAR(255) NOT NULL,                 -- bcrypt шифрленген құпия сөз
    role     ENUM('client', 'agency', 'admin') NOT NULL DEFAULT 'client',
    status   ENUM('active', 'pending', 'blocked') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Турлар / Туры (агентство қосады, сипаттамасы мен қонақүй ерекшеліктері бар)
CREATE TABLE IF NOT EXISTS tours (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    agencyId    INT NOT NULL,
    title       VARCHAR(150) NOT NULL,
    country     VARCHAR(100) NOT NULL,
    days        INT NOT NULL,
    price       INT NOT NULL,
    stars       INT NOT NULL DEFAULT 5,
    meal        VARCHAR(100) DEFAULT 'Ultra All Inclusive',
    hotel       VARCHAR(150) DEFAULT '',
    image       VARCHAR(500),
    features    TEXT,                               -- JSON немесе ерекшеліктер тізімі
    includes    TEXT,                               -- JSON немесе тур құрамы
    description TEXT,
    FOREIGN KEY (agencyId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Брондаулар / Бронирования (клиент турды таңдағанда жасалады)
CREATE TABLE IF NOT EXISTS bookings (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    tourId    INT NOT NULL,
    clientId  INT NOT NULL,
    date      DATE NOT NULL,
    people    INT NOT NULL DEFAULT 1,
    comment   TEXT,
    status    ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tourId)   REFERENCES tours(id) ON DELETE CASCADE,
    FOREIGN KEY (clientId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Хабарламалар / Сообщения («Байланыс / Контакты» формасынан)
CREATE TABLE IF NOT EXISTS messages (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    email     VARCHAR(100) NOT NULL,
    text      TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

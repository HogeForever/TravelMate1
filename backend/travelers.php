<?php
// =========================================================
// travelers.php — хранение паспортных данных туристов в MySQL
// Клиент видит ТОЛЬКО свои сохранённые паспорта (по email/user_id).
// Админ и Турагентство видят паспортные данные всех клиентов.
// =========================================================
require_once 'config.php';

// Автоматическое создание таблицы travelers в БД gbook
mysqli_query($link, "CREATE TABLE IF NOT EXISTS travelers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL DEFAULT 0,
    user_email VARCHAR(190) NOT NULL DEFAULT '',
    user_name VARCHAR(190) NOT NULL DEFAULT '',
    full_name VARCHAR(190) NOT NULL,
    passport VARCHAR(64) NOT NULL,
    birth_date VARCHAR(32) DEFAULT '',
    phone VARCHAR(64) DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

// Добавляем начальные записи для демо-аккаунтов (строго изолированно по email)
$cntRes = mysqli_query($link, "SELECT COUNT(*) AS c FROM travelers");
$cntRow = $cntRes ? mysqli_fetch_assoc($cntRes) : ['c' => 0];
if ((int)$cntRow['c'] === 0) {
    mysqli_query($link, "INSERT INTO travelers (user_id, user_email, user_name, full_name, passport, birth_date, phone) VALUES
        (3, 'client@travelmate.kz', 'Айгерім (Клиент)', 'AIGERIM SERIKKYZY', 'N09482716', '1996-05-14', '+7 700 000 00 03'),
        (4, 'alibekzumadildin99@gmail.com', 'Alibek', 'ESKO BAHA', 'N0948456', '2006-08-31', '+7 700 000 00 03')");
}

$user = currentUser();

// ---------- СПИСОК ПАСПОРТНЫХ ДАННЫХ ----------
if ($action === 'list') {
    if (!$user) {
        send([]);
    }

    $role = $user['role'] ?? 'client';
    $email = mysqli_real_escape_string($link, strtolower(trim($user['email'] ?? '')));

    // Админ и Турагентство получают все паспортные профили всех клиентов
    if ($role === 'admin' || $role === 'agency') {
        $sql = "SELECT * FROM travelers ORDER BY id DESC";
    } else {
        // Обычный клиент получает ТОЛЬКО свои паспортные данные строго по своему email
        $sql = "SELECT * FROM travelers WHERE LOWER(user_email) = '$email' ORDER BY id DESC";
    }

    $res = mysqli_query($link, $sql);
    $list = [];
    if ($res) {
        while ($row = mysqli_fetch_assoc($res)) {
            $list[] = [
                'id'        => (int)$row['id'],
                'userId'    => (int)$row['user_id'],
                'userEmail' => $row['user_email'],
                'userName'  => $row['user_name'],
                'fullName'  => $row['full_name'],
                'passport'  => $row['passport'],
                'birthDate' => $row['birth_date'],
                'phone'     => $row['phone']
            ];
        }
    }
    send($list);
}

// ---------- ДОБАВЛЕНИЕ / ОБНОВЛЕНИЕ ПАСПОРТНЫХ ДАННЫХ ----------
if ($action === 'save') {
    if (!$user) {
        send(['ok' => false, 'error' => 'Необходима авторизация']);
    }

    $userId    = (int)$user['id'];
    $userEmail = mysqli_real_escape_string($link, strtolower(trim($user['email'] ?? '')));
    $userName  = mysqli_real_escape_string($link, trim($user['name'] ?? ''));
    $fullName  = mysqli_real_escape_string($link, strtoupper(trim($input['fullName'] ?? '')));
    $passport  = mysqli_real_escape_string($link, strtoupper(trim($input['passport'] ?? '')));
    $birthDate = mysqli_real_escape_string($link, trim($input['birthDate'] ?? ''));
    $phone     = mysqli_real_escape_string($link, trim($input['phone'] ?? ''));

    if ($fullName === '' || $passport === '') {
        send(['ok' => false, 'error' => 'Заполните ФИО и номер паспорта']);
    }

    // Проверяем, есть ли уже такой паспорт у этого аккаунта
    $chk = mysqli_query($link, "SELECT id FROM travelers WHERE LOWER(user_email) = '$userEmail' AND UPPER(passport) = '$passport' LIMIT 1");
    if ($chk && ($existing = mysqli_fetch_assoc($chk))) {
        $eid = (int)$existing['id'];
        mysqli_query($link, "UPDATE travelers SET full_name = '$fullName', birth_date = '$birthDate', phone = '$phone', user_name = '$userName' WHERE id = $eid");
        send(['ok' => true, 'id' => $eid]);
    }

    mysqli_query($link, "INSERT INTO travelers (user_id, user_email, user_name, full_name, passport, birth_date, phone)
        VALUES ($userId, '$userEmail', '$userName', '$fullName', '$passport', '$birthDate', '$phone')");
    send(['ok' => true, 'id' => (int)mysqli_insert_id($link)]);
}

// ---------- УДАЛЕНИЕ ПАСПОРТНЫХ ДАННЫХ ----------
if ($action === 'delete') {
    if (!$user) {
        send(['ok' => false, 'error' => 'Необходима авторизация']);
    }

    $id = (int)($input['id'] ?? 0);
    $role = $user['role'] ?? 'client';
    $email = mysqli_real_escape_string($link, strtolower(trim($user['email'] ?? '')));

    if ($role === 'admin' || $role === 'agency') {
        mysqli_query($link, "DELETE FROM travelers WHERE id = $id");
    } else {
        mysqli_query($link, "DELETE FROM travelers WHERE id = $id AND LOWER(user_email) = '$email'");
    }
    send(['ok' => true]);
}

send(['ok' => false, 'error' => 'Неизвестное действие']);

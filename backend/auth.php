<?php
// =========================================================
// auth.php — вход, регистрация, выход, проверка сессии (mysqli)
// =========================================================
require_once 'config.php';

// ---------- ВХОД (LOGIN) ----------
if ($action === 'login') {
    $email = mysqli_real_escape_string($link, trim($input['email'] ?? ''));
    $password = (string)($input['password'] ?? '');

    $sql = "SELECT * FROM users WHERE email = '$email' LIMIT 1";
    $result = mysqli_query($link, $sql);
    $user = $result ? mysqli_fetch_assoc($result) : null;

    if (!$user || !password_verify($password, $user['password'])) {
        send(['ok' => false, 'error' => 'login_error']);
    }
    if ($user['status'] === 'blocked') {
        send(['ok' => false, 'error' => 'blocked_error']);
    }

    $_SESSION['user_id'] = (int)$user['id'];
    unset($user['password']); // Безопасность: не отправляем пароль в браузер
    send(['ok' => true, 'user' => $user]);
}

// ---------- РЕГИСТРАЦИЯ (REGISTER) ----------
if ($action === 'register') {
    $name  = mysqli_real_escape_string($link, trim($input['name'] ?? ''));
    $email = mysqli_real_escape_string($link, trim($input['email'] ?? ''));
    $phone = mysqli_real_escape_string($link, trim($input['phone'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $role  = (($input['role'] ?? '') === 'agency') ? 'agency' : 'client';
    $status = ($role === 'agency') ? 'pending' : 'active';

    if (empty($name) || empty($email) || empty($password)) {
        send(['ok' => false, 'error' => 'Заполните все обязательные поля']);
    }

    // Проверяем, существует ли уже такой email
    $checkSql = "SELECT id FROM users WHERE email = '$email' LIMIT 1";
    $checkResult = mysqli_query($link, $checkSql);
    if ($checkResult && mysqli_num_rows($checkResult) > 0) {
        send(['ok' => false, 'error' => 'email_exists']);
    }

    $hash = mysqli_real_escape_string($link, password_hash($password, PASSWORD_DEFAULT));
    $insertSql = "INSERT INTO users (name, email, phone, password, role, status) 
                  VALUES ('$name', '$email', '$phone', '$hash', '$role', '$status')";

    if (!mysqli_query($link, $insertSql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    $newId = mysqli_insert_id($link);
    $_SESSION['user_id'] = $newId;
    send(['ok' => true, 'user' => currentUser()]);
}

// ---------- ВЫХОД (LOGOUT) ----------
if ($action === 'logout') {
    $_SESSION = [];
    if (session_id()) {
        session_destroy();
    }
    send(['ok' => true]);
}

// ---------- КТО СЕЙЧАС АВТОРИЗОВАН (ME) ----------
if ($action === 'me') {
    send(['user' => currentUser()]);
}

send(['ok' => false, 'error' => 'Неизвестное действие']);

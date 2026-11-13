<?php
// =========================================================
// users.php — управление пользователями платформы (только админ) (mysqli)
// =========================================================
require_once 'config.php';
requireRole(['admin']);

// ---------- СПИСОК ВСЕХ ПОЛЬЗОВАТЕЛЕЙ ----------
if ($action === 'list') {
    $sql = "SELECT id, name, email, phone, role, status FROM users ORDER BY id ASC";
    $result = mysqli_query($link, $sql);
    $list = [];
    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            $row['id'] = (int)$row['id'];
            $list[] = $row;
        }
    }
    send($list);
}

// ---------- ИЗМЕНЕНИЕ СТАТУСА (ACTIVE / PENDING / BLOCKED) ----------
if ($action === 'status') {
    $id = (int)($input['id'] ?? 0);
    $status = mysqli_real_escape_string($link, trim($input['status'] ?? ''));

    if (!in_array($status, ['active', 'pending', 'blocked'], true)) {
        send(['ok' => false, 'error' => 'Неверный статус']);
    }

    // Главного администратора заблокировать нельзя
    $sql = "UPDATE users SET status = '$status' WHERE id = $id AND role <> 'admin'";
    mysqli_query($link, $sql);
    send(['ok' => true]);
}

// ---------- УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ----------
if ($action === 'delete') {
    $id = (int)($input['id'] ?? 0);

    // Администратора удалить нельзя
    $sql = "DELETE FROM users WHERE id = $id AND role <> 'admin'";
    mysqli_query($link, $sql);
    send(['ok' => true]);
}

send(['ok' => false, 'error' => 'Неизвестное действие']);

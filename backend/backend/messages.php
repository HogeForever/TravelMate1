<?php
// =========================================================
// messages.php — сообщения из формы обратной связи «Контакты» (mysqli)
// =========================================================
require_once 'config.php';

// ---------- ОТПРАВИТЬ СООБЩЕНИЕ (ЛЮБОЙ ГОСТЬ) ----------
if ($action === 'add') {
    $name  = mysqli_real_escape_string($link, trim($input['name'] ?? ''));
    $email = mysqli_real_escape_string($link, trim($input['email'] ?? ''));
    $text  = mysqli_real_escape_string($link, trim($input['text'] ?? ''));

    if (empty($name) || empty($email) || empty($text)) {
        send(['ok' => false, 'error' => 'Заполните имя, email и текст сообщения']);
    }

    $sql = "INSERT INTO messages (name, email, text) VALUES ('$name', '$email', '$text')";
    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    send(['ok' => true]);
}

// ---------- СПИСОК ВСЕХ СООБЩЕНИЙ (ТОЛЬКО АДМИН) ----------
if ($action === 'list') {
    requireRole(['admin']);

    $sql = "SELECT id, name, email, text, createdAt FROM messages ORDER BY id DESC";
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

send(['ok' => false, 'error' => 'Неизвестное действие']);

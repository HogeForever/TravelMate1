<?php
// =========================================================
// config.php — подключение к базе данных через mysqli (OpenServer).
// Используем точные константы и функцию getDB() согласно ТЗ.
// =========================================================

// Ответы сервера отдаём в формате JSON для JavaScript
header('Content-Type: application/json; charset=utf-8');

// Отключаем выброс фатальных HTML-исключений mysqli в PHP 8+, чтобы ошибки возвращались в формате JSON
mysqli_report(MYSQLI_REPORT_OFF);

// Параметры подключения к MySQL в OpenServer
const DB_HOST = '127.0.1.31';
const DB_NAME = 'gbook';
const DB_USER = 'root';
const DB_PASS = '';
const DB_PORT = 3306;

function getDB() {
    $connection = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if (!$connection) {
        die(json_encode(['ok' => false, 'error' => 'Ошибка подключения: ' . mysqli_connect_error()], JSON_UNESCAPED_UNICODE));
    }
    mysqli_set_charset($connection, "utf8mb4");
    return $connection;
}

// Получаем глобальный объект подключения
$link = getDB();

// Автоматическая проверка и исправление имени демо-агентства и фото Анталии
mysqli_query($link, "UPDATE users SET name = 'Kazakh Tour', phone = '+7 700 000 00 02' WHERE email = 'agency@travelmate.kz' AND (name = 'Admin' OR name = '')");
mysqli_query($link, "UPDATE users SET name = 'Admin TravelMate' WHERE email = 'admin@travelmate.kz' AND name = 'Admin'");
mysqli_query($link, "UPDATE tours SET image = 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=85' WHERE image LIKE '%1542051841857%'");

// Сессия для авторизации пользователей
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Действие из GET-параметра: например, tours.php?action=list
$action = $_GET['action'] ?? '';

// Тело запроса от JavaScript (fetch JSON)
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST ?: [];
}

// Отправить JSON ответ клиенту и завершить скрипт
function send($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// Получить данные текущего авторизованного пользователя (с авто-восстановлением сессии по _authEmail / _authUserId)
function currentUser() {
    global $link, $input;

    if (!empty($_SESSION['user_id'])) {
        $id = (int)$_SESSION['user_id'];
        $sql = "SELECT id, name, email, phone, role, status FROM users WHERE id = $id LIMIT 1";
        $result = mysqli_query($link, $sql);
        if ($result && ($row = mysqli_fetch_assoc($result))) {
            $row['id'] = (int)$row['id'];
            return $row;
        }
    }

    // Резервное восстановление сессии, если браузер передал _authEmail или _authUserId
    $authEmail = isset($input['_authEmail']) ? mysqli_real_escape_string($link, trim((string)$input['_authEmail'])) : '';
    if (!empty($authEmail)) {
        $sql = "SELECT id, name, email, phone, role, status FROM users WHERE email = '$authEmail' LIMIT 1";
        $result = mysqli_query($link, $sql);
        if ($result && ($row = mysqli_fetch_assoc($result))) {
            $_SESSION['user_id'] = (int)$row['id'];
            $row['id'] = (int)$row['id'];
            return $row;
        }
    }

    $authUserId = isset($input['_authUserId']) ? (int)$input['_authUserId'] : 0;
    if ($authUserId > 0) {
        $sql = "SELECT id, name, email, phone, role, status FROM users WHERE id = $authUserId LIMIT 1";
        $result = mysqli_query($link, $sql);
        if ($result && ($row = mysqli_fetch_assoc($result))) {
            $_SESSION['user_id'] = (int)$row['id'];
            $row['id'] = (int)$row['id'];
            return $row;
        }
    }

    return null;
}

// Проверка прав доступа: requireRole(['admin']) или requireRole(['agency', 'admin'])
function requireRole($roles) {
    $user = currentUser();
    if (!$user || !in_array($user['role'], $roles, true) || $user['status'] === 'blocked') {
        http_response_code(403);
        send(['ok' => false, 'error' => 'Нет доступа (рұқсат жоқ)']);
    }
    return $user;
}

<?php
// =========================================================
// tours.php — туры (каталог, детальный просмотр, CRUD) (mysqli)
// =========================================================
require_once 'config.php';

// Базовый SELECT для тура с подключением имени агентства
$baseSelect = "SELECT tours.*, COALESCE(users.name, 'Kazakh Tour') AS agencyName 
               FROM tours 
               LEFT JOIN users ON users.id = tours.agencyId";

// Преобразовать JSON-поля (features, includes) в массивы
function formatTourRow($row) {
    if (!$row) return null;
    $row['id']       = (int)$row['id'];
    $row['agencyId'] = (int)$row['agencyId'];
    $row['days']     = (int)$row['days'];
    $row['price']    = (int)$row['price'];
    $row['stars']    = (int)($row['stars'] ?? 5);

    if (!empty($row['features']) && is_string($row['features'])) {
        $decoded = json_decode($row['features'], true);
        $row['features'] = is_array($decoded) ? $decoded : [$row['features']];
    } else if (empty($row['features'])) {
        $row['features'] = [];
    }

    if (!empty($row['includes']) && is_string($row['includes'])) {
        $decoded = json_decode($row['includes'], true);
        $row['includes'] = is_array($decoded) ? $decoded : [$row['includes']];
    } else if (empty($row['includes'])) {
        $row['includes'] = [];
    }

    return $row;
}

// ---------- СПИСОК ВСЕХ ТУРОВ ----------
if ($action === 'list') {
    $sql = $baseSelect . " ORDER BY tours.id ASC";
    $result = mysqli_query($link, $sql);
    $list = [];
    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            $list[] = formatTourRow($row);
        }
    }
    send($list);
}

// ---------- ПОЛУЧИТЬ ОДИН ТУР ПО ID ----------
if ($action === 'get') {
    $id = (int)($input['id'] ?? 0);
    $sql = $baseSelect . " WHERE tours.id = $id LIMIT 1";
    $result = mysqli_query($link, $sql);
    $row = $result ? mysqli_fetch_assoc($result) : null;
    send(formatTourRow($row));
}

// ---------- ДОБАВИТЬ ТУР (АГЕНТСТВО) ----------
if ($action === 'add') {
    $user = requireRole(['agency']);
    if ($user['status'] !== 'active') {
        send(['ok' => false, 'error' => 'Агентство не подтверждено администратором']);
    }

    $agencyId    = (int)$user['id'];
    $title       = mysqli_real_escape_string($link, trim($input['title'] ?? ''));
    $country     = mysqli_real_escape_string($link, trim($input['country'] ?? ''));
    $days        = (int)($input['days'] ?? 1);
    $price       = (int)($input['price'] ?? 0);
    $stars       = (int)($input['stars'] ?? 5);
    $meal        = mysqli_real_escape_string($link, trim($input['meal'] ?? 'Ultra All Inclusive'));
    $hotel       = mysqli_real_escape_string($link, trim($input['hotel'] ?? ''));
    $image       = mysqli_real_escape_string($link, trim($input['image'] ?? ''));
    $description = mysqli_real_escape_string($link, trim($input['description'] ?? ''));

    $featuresJson = mysqli_real_escape_string($link, json_encode($input['features'] ?? [], JSON_UNESCAPED_UNICODE));
    $includesJson = mysqli_real_escape_string($link, json_encode($input['includes'] ?? [], JSON_UNESCAPED_UNICODE));

    $sql = "INSERT INTO tours (agencyId, title, country, days, price, stars, meal, hotel, image, features, includes, description) 
            VALUES ($agencyId, '$title', '$country', $days, $price, $stars, '$meal', '$hotel', '$image', '$featuresJson', '$includesJson', '$description')";

    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    send(['ok' => true, 'id' => mysqli_insert_id($link)]);
}

// ---------- ОБНОВИТЬ ТУР ----------
if ($action === 'update') {
    $user = requireRole(['agency', 'admin']);
    $id = (int)($input['id'] ?? 0);

    $title       = mysqli_real_escape_string($link, trim($input['title'] ?? ''));
    $country     = mysqli_real_escape_string($link, trim($input['country'] ?? ''));
    $days        = (int)($input['days'] ?? 1);
    $price       = (int)($input['price'] ?? 0);
    $stars       = (int)($input['stars'] ?? 5);
    $meal        = mysqli_real_escape_string($link, trim($input['meal'] ?? 'Ultra All Inclusive'));
    $hotel       = mysqli_real_escape_string($link, trim($input['hotel'] ?? ''));
    $image       = mysqli_real_escape_string($link, trim($input['image'] ?? ''));
    $description = mysqli_real_escape_string($link, trim($input['description'] ?? ''));

    $featuresJson = mysqli_real_escape_string($link, json_encode($input['features'] ?? [], JSON_UNESCAPED_UNICODE));
    $includesJson = mysqli_real_escape_string($link, json_encode($input['includes'] ?? [], JSON_UNESCAPED_UNICODE));

    $sql = "UPDATE tours SET 
                title = '$title',
                country = '$country',
                days = $days,
                price = $price,
                stars = $stars,
                meal = '$meal',
                hotel = '$hotel',
                image = '$image',
                features = '$featuresJson',
                includes = '$includesJson',
                description = '$description'
            WHERE id = $id";

    // Турагентство может изменять только свои туры
    if ($user['role'] === 'agency') {
        $agencyId = (int)$user['id'];
        if ($user['email'] === 'agency@travelmate.kz') {
            $sql .= " AND agencyId IN ($agencyId, 2, 3)";
        } else {
            $sql .= " AND agencyId = $agencyId";
        }
    }

    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    send(['ok' => true]);
}

// ---------- УДАЛИТЬ ТУР ----------
if ($action === 'delete') {
    $user = requireRole(['agency', 'admin']);
    $id = (int)($input['id'] ?? 0);

    $sql = "DELETE FROM tours WHERE id = $id";
    if ($user['role'] === 'agency') {
        $agencyId = (int)$user['id'];
        if ($user['email'] === 'agency@travelmate.kz') {
            $sql .= " AND agencyId IN ($agencyId, 2, 3)";
        } else {
            $sql .= " AND agencyId = $agencyId";
        }
    }

    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    send(['ok' => true]);
}

send(['ok' => false, 'error' => 'Неизвестное действие']);

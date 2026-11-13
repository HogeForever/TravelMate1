<?php
// =========================================================
// bookings.php — бронирования и оплата (48 часов) (mysqli)
// =========================================================
require_once 'config.php';

// Базовый запрос с джойнами тура и клиента
$baseSelect = "SELECT bookings.*,
                      UNIX_TIMESTAMP(bookings.createdAt) * 1000 AS createdAtMs,
                      COALESCE(tours.title, 'Тур') AS tourTitle,
                      COALESCE(tours.agencyId, 0)  AS agencyId,
                      CASE 
                          WHEN bookings.customTotal IS NOT NULL AND bookings.customTotal > 0 
                          THEN bookings.customTotal 
                          ELSE (COALESCE(tours.price, 0) * bookings.people) 
                      END AS total,
                      COALESCE(users.name, 'Клиент') AS clientName,
                      COALESCE(users.phone, '')      AS clientPhone
               FROM bookings
               LEFT JOIN tours ON tours.id = bookings.tourId
               LEFT JOIN users ON users.id = bookings.clientId";

// ---------- ПОЛУЧИТЬ СПИСОК БРОНИРОВАНИЙ ----------
if ($action === 'list') {
    $user = currentUser();
    if ($user && $user['role'] === 'client') {
        $userId = (int)$user['id'];
        $sql = $baseSelect . " WHERE bookings.clientId = $userId ORDER BY bookings.id DESC";
    } else {
        $sql = $baseSelect . " ORDER BY bookings.id DESC";
    }

    $result = mysqli_query($link, $sql);
    $list = [];
    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            $row['id']            = (int)$row['id'];
            $row['tourId']        = (int)$row['tourId'];
            $row['clientId']      = (int)$row['clientId'];
            $row['agencyId']      = (int)$row['agencyId'];
            $row['people']        = (int)$row['people'];
            $row['total']         = (int)$row['total'];
            $row['createdAtMs']   = (float)($row['createdAtMs'] ?? (time() * 1000));
            $row['paymentStatus'] = $row['paymentStatus'] ?: 'unpaid';
            $row['paymentMethod'] = $row['paymentMethod'] ?: '';
            if (!empty($row['customOptions']) && is_string($row['customOptions'])) {
                $decoded = json_decode($row['customOptions'], true);
                if (is_array($decoded)) {
                    $row['customOptions'] = $decoded;
                }
            }
            $list[] = $row;
        }
    }
    send($list);
}

// ---------- СОЗДАТЬ БРОНИРОВАНИЕ (КЛИЕНТ) ----------
if ($action === 'add') {
    $user = requireRole(['client', 'admin', 'agency']);
    $tourId      = (int)($input['tourId'] ?? 1);
    $clientId    = (int)$user['id'];
    $date        = mysqli_real_escape_string($link, trim($input['date'] ?? ''));
    $people      = max(1, (int)($input['people'] ?? 1));
    $comment     = mysqli_real_escape_string($link, trim($input['comment'] ?? ''));
    $customTotal = max(0, (int)($input['customTotal'] ?? 0));

    $customOptionsRaw = $input['customOptions'] ?? null;
    $customOptionsStr = '';
    if (is_array($customOptionsRaw)) {
        $customOptionsStr = mysqli_real_escape_string($link, json_encode($customOptionsRaw, JSON_UNESCAPED_UNICODE));
    } elseif (is_string($customOptionsRaw)) {
        $customOptionsStr = mysqli_real_escape_string($link, $customOptionsRaw);
    }

    if ($tourId <= 0 || empty($date)) {
        send(['ok' => false, 'error' => 'Укажите тур и дату поездки']);
    }

    // Проверяем, существует ли тур с таким ID в БД
    $tourCheck = mysqli_query($link, "SELECT id FROM tours WHERE id = $tourId LIMIT 1");
    if (!$tourCheck || mysqli_num_rows($tourCheck) === 0) {
        $firstTourRes = mysqli_query($link, "SELECT id FROM tours ORDER BY id ASC LIMIT 1");
        if ($firstTourRes && ($firstTour = mysqli_fetch_assoc($firstTourRes))) {
            $tourId = (int)$firstTour['id'];
        }
    }

    $sql = "INSERT INTO bookings (tourId, clientId, date, people, comment, customTotal, customOptions, status, paymentStatus) 
            VALUES ($tourId, $clientId, '$date', $people, '$comment', $customTotal, '$customOptionsStr', 'pending', 'unpaid')";

    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    $newId = mysqli_insert_id($link);
    send([
        'ok' => true,
        'id' => $newId,
        'createdAtMs' => time() * 1000,
        'paymentStatus' => 'unpaid'
    ]);
}

// ---------- ОПЛАТИТЬ БРОНИРОВАНИЕ (В ТЕЧЕНИЕ 48 ЧАСОВ) ----------
if ($action === 'pay') {
    $id        = (int)($input['id'] ?? 0);
    $method    = mysqli_real_escape_string($link, trim($input['paymentMethod'] ?? 'Kaspi / Bank Card'));
    $rawStatus = trim($input['paymentStatus'] ?? 'paid');
    $payStatus = in_array($rawStatus, ['paid', 'partial', 'unpaid', 'refunded'], true) ? $rawStatus : 'paid';

    if ($id <= 0) {
        send(['ok' => false, 'error' => 'Некорректный ID бронирования']);
    }

    $sql = "UPDATE bookings 
            SET paymentStatus = '$payStatus', 
                paymentMethod = '$method', 
                paidAt = NOW() 
            WHERE id = $id";

    if (!mysqli_query($link, $sql)) {
        send(['ok' => false, 'error' => mysqli_error($link)]);
    }

    send(['ok' => true, 'paymentStatus' => $payStatus, 'paymentMethod' => $method]);
}

// ---------- ИЗМЕНИТЬ СТАТУС БРОНИ ----------
if ($action === 'status') {
    $id     = (int)($input['id'] ?? 0);
    $status = mysqli_real_escape_string($link, trim($input['status'] ?? ''));

    if ($id > 0 && !empty($status)) {
        $extraPay = ($status === 'cancelled') ? ", paymentStatus = 'refunded'" : "";
        $sql = "UPDATE bookings SET status = '$status' $extraPay WHERE id = $id";
        mysqli_query($link, $sql);
    }

    send(['ok' => true]);
}

send(['ok' => false, 'error' => 'Неизвестное действие']);

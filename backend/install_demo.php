<?php
// =========================================================
// install_demo.php — первичное наполнение базы gbook через mysqli
// Добавляет пользователей и туры с отелями, звёздами и преимуществами.
// =========================================================
require_once 'config.php';

// Проверяем структуру таблиц и создаём их, если они ещё не созданы
mysqli_query($link, "CREATE TABLE IF NOT EXISTS users (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    name     VARCHAR(100) NOT NULL,
    email    VARCHAR(100) NOT NULL UNIQUE,
    phone    VARCHAR(30),
    password VARCHAR(255) NOT NULL,
    role     ENUM('client', 'agency', 'admin') NOT NULL DEFAULT 'client',
    status   ENUM('active', 'pending', 'blocked') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

mysqli_query($link, "CREATE TABLE IF NOT EXISTS tours (
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
    features    TEXT,
    includes    TEXT,
    description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// На случай если таблица tours была создана в старой версии без колонок stars, meal, hotel, features, includes:
$colsRes = mysqli_query($link, "SHOW COLUMNS FROM tours");
$existingCols = [];
if ($colsRes) {
    while ($c = mysqli_fetch_assoc($colsRes)) {
        $existingCols[] = $c['Field'];
    }
}
if (!in_array('stars', $existingCols))    mysqli_query($link, "ALTER TABLE tours ADD COLUMN stars INT NOT NULL DEFAULT 5");
if (!in_array('meal', $existingCols))     mysqli_query($link, "ALTER TABLE tours ADD COLUMN meal VARCHAR(100) DEFAULT 'Ultra All Inclusive'");
if (!in_array('hotel', $existingCols))    mysqli_query($link, "ALTER TABLE tours ADD COLUMN hotel VARCHAR(150) DEFAULT ''");
if (!in_array('features', $existingCols)) mysqli_query($link, "ALTER TABLE tours ADD COLUMN features TEXT");
if (!in_array('includes', $existingCols)) mysqli_query($link, "ALTER TABLE tours ADD COLUMN includes TEXT");

mysqli_query($link, "CREATE TABLE IF NOT EXISTS bookings (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    tourId    INT NOT NULL,
    clientId  INT NOT NULL,
    date      DATE NOT NULL,
    people    INT NOT NULL DEFAULT 1,
    comment   TEXT,
    status    ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

mysqli_query($link, "CREATE TABLE IF NOT EXISTS messages (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    email     VARCHAR(100) NOT NULL,
    text      TEXT NOT NULL,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

// Проверяем, есть ли уже демо-туры
$checkTours = mysqli_query($link, "SELECT COUNT(*) as cnt FROM tours");
$rowTours = $checkTours ? mysqli_fetch_assoc($checkTours) : null;
$force = isset($_GET['force']);
if (!$force && $rowTours && (int)$rowTours['cnt'] > 0) {
    // Обновим старое фото Анталии в БД, если оно осталось
    mysqli_query($link, "UPDATE tours SET image = 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=85' WHERE image LIKE '%1542051841857%'");
    send([
        'ok' => true,
        'message' => 'В базе данных gbook уже есть записи (пайдаланушылар мен турлар бар). Демо-данные уже загружены!'
    ]);
}

$defaultPassword = password_hash('123456', PASSWORD_DEFAULT);

// 1. Создаем начальных пользователей
$users = [
    ['Admin TravelMate',  'admin@travelmate.kz',   '+7 700 000 00 01', $defaultPassword, 'admin',  'active'],
    ['Kazakh Tour',       'agency@travelmate.kz',  '+7 700 000 00 02', $defaultPassword, 'agency', 'active'],
    ['Айгерим Сериккызы', 'client@travelmate.kz',  '+7 700 000 00 03', $defaultPassword, 'client', 'active'],
    ['Silk Way Travel',   'silkway@travelmate.kz', '+7 700 000 00 04', $defaultPassword, 'agency', 'pending']
];

foreach ($users as $u) {
    $name  = mysqli_real_escape_string($link, $u[0]);
    $email = mysqli_real_escape_string($link, $u[1]);
    $phone = mysqli_real_escape_string($link, $u[2]);
    $pass  = mysqli_real_escape_string($link, $u[3]);
    $role  = mysqli_real_escape_string($link, $u[4]);
    $stat  = mysqli_real_escape_string($link, $u[5]);

    $sql = "INSERT IGNORE INTO users (name, email, phone, password, role, status) 
            VALUES ('$name', '$email', '$phone', '$pass', '$role', '$stat')";
    mysqli_query($link, $sql);
}

// Находим ID турагентства 'Kazakh Tour'
$res = mysqli_query($link, "SELECT id FROM users WHERE email = 'agency@travelmate.kz' LIMIT 1");
$agency = mysqli_fetch_assoc($res);
$agencyId = $agency ? (int)$agency['id'] : 1;

// 2. Список богатых туров с характеристиками и звездами
$tours = [
    [
        'title' => 'Анталия — Rixos Premium Belek',
        'country' => 'Түркия / Турция',
        'days' => 7,
        'price' => 350000,
        'stars' => 5,
        'meal' => 'Ultra All Inclusive',
        'hotel' => 'Rixos Premium Belek Luxury Resort',
        'image' => 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=85',
        'features' => [
            '🌊 1-ші жағалау сызығы (жеке құмды жағажай / 1-я береговая линия)',
            '🏊 4 бассейн (жылытылатын жабық бассейн және аквапарк)',
            '🍽️ 7 A la Carte мейрамхана және премиум швед үстелі',
            '💆 Luxury SPA & Сауна, түрік хамамы',
            '🎡 The Land of Legends саябағына тегін кіру және трансфер'
        ],
        'includes' => [
            '✈️ Алматы – Анталия – Алматы тікелей әуе рейсі',
            '🏨 5 жұлдызды отельде 7 күн / 6 түн тұру',
            '🚐 Жеке VIP трансфер (әуежай – отель – әуежай)',
            '🛡️ Толық медициналық сақтандыру',
            '👩‍💼 24/7 қазақша және орысша қолдау көрсететін жеке гид'
        ],
        'description' => 'Анталияның ең беделді Белек аймағындағы премиум демалыс. Мөлдір Жерорта теңізі, қарағайлы орман саясы, жоғары деңгейлі қызмет және отбасылық демалысқа арналған барлық жағдай жасалған.'
    ],
    [
        'title' => 'Дубай — Atlantis The Palm & Burj View',
        'country' => 'БАӘ / ОАЭ',
        'days' => 5,
        'price' => 420000,
        'stars' => 5,
        'meal' => 'Швед үстелі (Breakfast & Dinner)',
        'hotel' => 'Atlantis The Royal & Palm Resort',
        'image' => 'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80',
        'features' => [
            '🏰 Пальма аралындағы атақты отель панорамасы',
            '🌊 Aquaventure әлемдегі ең үлкен аквапаркіне шексіз кіру',
            '🐪 4x4 джиппен шөл сафариі және кешкі BBQ шоуы',
            '🏙️ Бурдж-Халифа 124-қабатына экскурсия билеті',
            '🛍️ Dubai Mall сауда орталығына тегін шаттл-бас'
        ],
        'includes' => [
            '✈️ Тікелей рейс: Алматы/Астана – Дубай – Алматы/Астана',
            '🏨 Премиум Deluxe нөмірінде 5 күн / 4 түн тұру',
            '🍳 Таңғы және кешкі ас (жартылай пансион)',
            '🚐 Барлық экскурсияларға трансфер',
            '📄 Электронды туристік виза рәсімдеу'
        ],
        'description' => 'Дубайдың футуристік сәулеті мен араб ертегісін бір уақытта сезініңіз. Бурдж-Халифа, заманауи жағажайлар, шексіз шопинг және шөл даланың сиқырлы сафариі.'
    ],
    [
        'title' => 'Романтичный Париж & Лувр',
        'country' => 'Франция',
        'days' => 6,
        'price' => 690000,
        'stars' => 4,
        'meal' => 'Француз таңғы асы (Continental Breakfast)',
        'hotel' => 'Le Grand Boulevard Boutique Hotel 4*',
        'image' => 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
        'features' => [
            '🗼 Эйфель мұнарасынан 15 минуттық жаяу қашықтық',
            '☕ Тәтті круассандары бар француздық дәстүрлі таңғы ас',
            '🚢 Сена өзенінде романтикалық панорамалық круиз',
            '🎨 Лувр және Монмартр өнер галереяларына кезексіз кіру'
        ],
        'includes' => [
            '✈️ Халықаралық ұшу билеттері',
            '🏨 Париж орталығындағы 4* бутик-отельде тұру',
            '🥐 Күнделікті балғын таңғы ас',
            '🗺️ Қазақ/орыс тіліндегі лицензияланған гидпен қала турлары'
        ],
        'description' => 'Махаббат қаласы Париждің тарихи көшелерімен серуендеп, Сена жағалауында кофе ішіп, әлемдік шедеврлерді көріңіз.'
    ],
    [
        'title' => 'Горы Алматы & Шарын каньоны',
        'country' => 'Қазақстан / Казахстан',
        'days' => 3,
        'price' => 85000,
        'stars' => 4,
        'meal' => 'Толық тамақтану (3 мезгіл)',
        'hotel' => 'Shymbulak Mountain Eco Resort 4*',
        'image' => 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80',
        'features' => [
            '🏔️ Таза тау ауасы және теңіз деңгейінен 2260м биіктік',
            '🚡 Медеу – Шымбұлақ аспалы жолының билеті',
            '🏜️ Шарын каньоны мен Көлсай көлдеріне күндізгі экспедиция'
        ],
        'includes' => [
            '🚐 Ыңғайлы Sprinter туристік автобусымен барлық жол',
            '🏡 Тау бөктеріндегі жайлы эко-коттеджде тұру',
            '🍲 Дәмді ұлттық және еуропалық 3 мезгіл тағам'
        ],
        'description' => 'Қазақстан табиғатының ғажайып жауһарлары. Медеу мұз айдыны, Шымбұлақ тау-шаңғы курорты, ертегідей Шарын каньоны.'
    ],
    [
        'title' => 'Экзотикалық Пхукет & Пхи-Пхи',
        'country' => 'Тайланд',
        'days' => 10,
        'price' => 480000,
        'stars' => 4,
        'meal' => 'Breakfast Buffet (Швед үстелі)',
        'hotel' => 'Phuket Graceland Resort & Spa 4* Deluxe',
        'image' => 'https://images.unsplash.com/photo-1589394815804-964ed0be2eb5?auto=format&fit=crop&w=800&q=80',
        'features' => [
            '🌴 Патонг жағажайына қарама-қарсы орналасу',
            '🛥️ Пхи-Пхи және Джеймс Бонд аралдарына жылдам қайықпен тур',
            '🤿 Түрлі-түсті балықтармен снорклинг жабдықтары'
        ],
        'includes' => [
            '✈️ Алматы – Пхукет – Алматы чартерлік тікелей рейс',
            '🏨 Тропикалық бағы бар 4* курортта 10 күн тұру',
            '🍍 Күнделікті таңғы швед үстелі'
        ],
        'description' => 'Андаман теңізінің жылы толқындары, экзотикалық табиғат, жарқын түнгі өмір және әлемге әйгілі тай қонақжайлылығы.'
    ],
    [
        'title' => 'Мальдивы — Sun Siyam Olhuveli',
        'country' => 'Мальдивы',
        'days' => 8,
        'price' => 950000,
        'stars' => 5,
        'meal' => 'Full Board Plus (Таңғы + Түскі + Кешкі ас)',
        'hotel' => 'Sun Siyam Olhuveli Premium Water Villa 5*',
        'image' => 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=800&q=80',
        'features' => [
            '🏡 Мұхит үстінде орналасқан жеке су вилласы (Water Villa)',
            '🚤 Мале халықаралық әуежайынан жылдам катермен трансфер',
            '🐬 Дельфиндер мекендейтін лагунада кешкі круиз'
        ],
        'includes' => [
            '✈️ Әуе билеттері (Алматы – Мале – Алматы)',
            '🏨 5* Су үстіндегі виллада 8 күн / 7 түн ұмытылмас демалыс',
            '🍹 3 мезгіл толық премиум тамақтану және сусындар'
        ],
        'description' => 'Үнді мұхитының ортасындағы нағыз жұмақ. Ақ ұнтақ құм, көгілдір мөлдір лагуна және мұхит үстіндегі вилла террасасы.'
    ]
];

foreach ($tours as $t) {
    $title       = mysqli_real_escape_string($link, $t['title']);
    $country     = mysqli_real_escape_string($link, $t['country']);
    $days        = (int)$t['days'];
    $price       = (int)$t['price'];
    $stars       = (int)$t['stars'];
    $meal        = mysqli_real_escape_string($link, $t['meal']);
    $hotel       = mysqli_real_escape_string($link, $t['hotel']);
    $image       = mysqli_real_escape_string($link, $t['image']);
    $description = mysqli_real_escape_string($link, $t['description']);

    $featuresJson = mysqli_real_escape_string($link, json_encode($t['features'], JSON_UNESCAPED_UNICODE));
    $includesJson = mysqli_real_escape_string($link, json_encode($t['includes'], JSON_UNESCAPED_UNICODE));

    $sql = "INSERT INTO tours (agencyId, title, country, days, price, stars, meal, hotel, image, features, includes, description) 
            VALUES ($agencyId, '$title', '$country', $days, $price, $stars, '$meal', '$hotel', '$image', '$featuresJson', '$includesJson', '$description')";
    mysqli_query($link, $sql);
}

// 3. Создаем тестовое бронирование
$clientIdRes = mysqli_query($link, "SELECT id FROM users WHERE email = 'client@travelmate.kz' LIMIT 1");
$clientRow = mysqli_fetch_assoc($clientIdRes);
$clientId = $clientRow ? (int)$clientRow['id'] : 3;

$tourIdRes = mysqli_query($link, "SELECT id FROM tours ORDER BY id ASC LIMIT 1");
$tourRow = mysqli_fetch_assoc($tourIdRes);
$tourId = $tourRow ? (int)$tourRow['id'] : 1;

$bookSql = "INSERT INTO bookings (tourId, clientId, date, people, comment, status) 
            VALUES ($tourId, $clientId, '2026-11-20', 2, 'Теңізге қарайтын бөлме қажет', 'pending')";
mysqli_query($link, $bookSql);

send([
    'ok' => true,
    'message' => 'Сәтті орнатылды! База gbook успешно заполнена начальными пользователями и турами.',
    'accounts' => [
        'Админ' => 'admin@travelmate.kz (пароль: 123456)',
        'Агентство' => 'agency@travelmate.kz (пароль: 123456)',
        'Клиент' => 'client@travelmate.kz (пароль: 123456)'
    ]
]);

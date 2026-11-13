# TravelMate — База данных MySQL в OpenServer (gbook)

Платформа **TravelMate** успешно подключена к базе данных **MySQL** через **OpenServer** с помощью функции `getDB()` и расширения `mysqli`.

---

## 1. Параметры подключения (`backend/config.php`)

Подключение к базе данных реализовано строго по вашему коду:

```php
const DB_HOST = '127.0.1.31';
const DB_NAME = 'gbook';
const DB_USER = 'root';
const DB_PASS = '';
const DB_PORT = 3306;

function getDB() {
    $connection = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if (!$connection) {
        die("Ошибка подключения: " . mysqli_connect_error());
    }
    mysqli_set_charset($connection, "utf8mb4");
    return $connection;
}

$link = getDB();
```

---

## 2. Структура таблиц в базе `gbook`

В базе данных `gbook` созданы следующие таблицы:

1. **`users`** — пользователи платформы:
   - `id`, `name`, `email`, `phone`, `password` (bcrypt хэш), `role` (`client`, `agency`, `admin`), `status` (`active`, `pending`, `blocked`).
2. **`tours`** — туры и отели:
   - `id`, `agencyId`, `title`, `country`, `days`, `price`, `stars`, `meal`, `hotel`, `image`, `features` (JSON), `includes` (JSON), `description`.
3. **`bookings`** — бронирования туров клиентами:
   - `id`, `tourId`, `clientId`, `date`, `people`, `comment`, `status` (`pending`, `accepted`, `rejected`, `cancelled`), `createdAt`.
4. **`messages`** — входящие сообщения из формы «Контакты»:
   - `id`, `name`, `email`, `text`, `createdAt`.
5. **`msgs`** — исходная таблица гостевой книги OpenServer (сохранена и не затронута).

---

## 3. Файлы бэкенда (`backend/`)

| Файл | Описание |
|---|---|
| `config.php` | Константы подключения, `getDB()`, сессии, проверка ролей `requireRole()`, функция ответа `send()` |
| `auth.php` | Авторизация (`login`), регистрация (`register`), выход (`logout`), текущий пользователь (`me`) |
| `tours.php` | Каталог (`list`), страница тура (`get`), добавление тура (`add`), изменение (`update`), удаление (`delete`) |
| `bookings.php` | Список броней с фильтрацией по роли (`list`), создание брони (`add`), изменение статуса (`status`) |
| `users.php` | Управление пользователями для админа: просмотр (`list`), смена статуса (`status`), удаление (`delete`) |
| `messages.php` | Сообщения: отправка (`add`), просмотр админом (`list`) |
| `install_demo.php` | Первичная инициализация базы и загрузка 6 премиум-туров и 4 тестовых аккаунтов |
| `database.sql` | SQL-дамп создания таблиц для импорта через phpMyAdmin |

---

## 4. Как запустить и открыть сайт

### Способ 1: Через OpenServer (MySQL режим)
В OpenServer проект уже привязан к домену `student`:
- Откройте браузер и перейдите по адресу:
  **http://student/Kusro/index.html**  
  или  
  **http://student/travelmate/index.html**

При открытии через веб-сервер сайт автоматически отправляет запросы к PHP-бэкенду и работает напрямую с базой MySQL `gbook`.

### Способ 2: Напрямую файлом (file:///)
Если дважды кликнуть на `index.html` на рабочем столе, `js/data.js` автоматически переключится на безопасный локальный режим (`localStorage`), чтобы страница не выдавала ошибок CORS.

---

## 5. Тестовые аккаунты для проверки

Все пароли: **`123456`**

- **Администратор платформы:** `admin@travelmate.kz` (пароль: `123456`)
  - Управляет пользователями, утверждает турагентства, видит статистику и все заявки.
- **Турагентство:** `agency@travelmate.kz` (пароль: `123456`)
  - Добавляет и редактирует свои туры, одобряет/отклоняет бронирования клиентов.
- **Клиент / Турист:** `client@travelmate.kz` (пароль: `123456`)
  - Просматривает туры, бронирует отели, отслеживает свои брони в личном кабинете.

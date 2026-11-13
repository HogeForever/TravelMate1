/* ==========================================================
   data-api.js — жұмыс деректерін MySQL дерекқорынан алу (PHP арқылы).
   Работа с данными через MySQL (OpenServer: 127.0.1.31, база: gbook).

   Бұл файлдағы барлық функциялар `app.js` үшін дайын:
   getCurrentUser(), loginUser(), registerUser(), logoutUser(),
   getTours(), getTourById(), addTour(), updateTour(), deleteTour(),
   getBookings(), addBooking(), setBookingStatus(),
   getUsers(), setUserStatus(), deleteUser(),
   getMessages(), addMessage().
   ========================================================== */

// PHP скрипттері орналасқан бума
const API_URL = 'backend/';

/**
 * Серверге (PHP) JSON сұраныс жіберу функциясы.
 * Универсальная функция запроса к PHP скриптам.
 * @param {string} file — мысалы: 'tours.php', 'auth.php'
 * @param {string} action — мысалы: 'list', 'get', 'login'
 * @param {object} body — жіберілетін мәліметтер (POST body)
 */
async function api(file, action, body) {
    try {
        const url = API_URL + file + (action ? '?action=' + encodeURIComponent(action) : '');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body || {})
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                return JSON.parse(errorText);
            } catch (e) {
                return { ok: false, error: 'HTTP_' + response.status, message: errorText };
            }
        }

        return await response.json();
    } catch (err) {
        console.error('API байланыс қатесі / Ошибка соединения с API (' + file + '):', err);
        return { ok: false, error: 'connection_error', message: err.message };
    }
}


/* ==========================================================
   1. Пайдаланушылар және Авторизация (Пользователи и сессия)
   ========================================================== */

// Ағымдағы кіріп тұрған пайдаланушыны білу
async function getCurrentUser() {
    try {
        const res = await api('auth.php', 'me');
        return (res && res.user) ? res.user : null;
    } catch (e) {
        return null;
    }
}

// Жүйеге кіру (email, құпия сөз)
async function loginUser(email, password) {
    return await api('auth.php', 'login', { email: email, password: password });
}

// Тіркелу (аты, email, телефон, құпия сөз, рөлі: client немесе agency)
async function registerUser(data) {
    return await api('auth.php', 'register', data);
}

// Жүйеден шығу (сессияны жою)
async function logoutUser() {
    return await api('auth.php', 'logout');
}

// Барлық пайдаланушылар тізімі (тек админ үшін)
async function getUsers() {
    const res = await api('users.php', 'list');
    return Array.isArray(res) ? res : [];
}

// Пайдаланушы мәртебесін өзгерту (active / pending / blocked)
async function setUserStatus(id, status) {
    return await api('users.php', 'status', { id: Number(id), status: status });
}

// Пайдаланушыны өшіру (тек админ)
async function deleteUser(id) {
    return await api('users.php', 'delete', { id: Number(id) });
}


/* ==========================================================
   2. Турлар (Туры и отели)
   ========================================================== */

// Барлық турлар тізімін алу
async function getTours() {
    const res = await api('tours.php', 'list');
    return Array.isArray(res) ? res : [];
}

// ID бойынша 1 тур туралы толық мәлімет алу
async function getTourById(id) {
    const res = await api('tours.php', 'get', { id: Number(id) });
    return (res && res.id) ? res : null;
}

// Жаңа тур қосу (тек турагенттік үшін)
async function addTour(tour) {
    return await api('tours.php', 'add', tour);
}

// Турды өзгерту / редакциялау
async function updateTour(id, data) {
    const payload = Object.assign({}, data, { id: Number(id) });
    return await api('tours.php', 'update', payload);
}

// Турды өшіру
async function deleteTour(id) {
    return await api('tours.php', 'delete', { id: Number(id) });
}


/* ==========================================================
   3. Брондаулар (Бронирования туров)
   ========================================================== */

// Брондаулар тізімі: клиент өзінікін, агенттік өз турына, админ бәрін көреді
async function getBookings() {
    const res = await api('bookings.php', 'list');
    return Array.isArray(res) ? res : [];
}

// Клиент турды брондаған кезде шақырылады
async function addBooking(booking) {
    return await api('bookings.php', 'add', booking);
}

// Бронның статусын өзгерту (accepted / rejected / cancelled)
async function setBookingStatus(id, status) {
    return await api('bookings.php', 'status', { id: Number(id), status: status });
}


/* ==========================================================
   4. Хабарламалар (Байланыс формасы / Контакты)
   ========================================================== */

// Хабарламалар тізімін алу (тек админ үшін)
async function getMessages() {
    const res = await api('messages.php', 'list');
    return Array.isArray(res) ? res : [];
}

// Жаңа хабарлама жіберу
async function addMessage(message) {
    return await api('messages.php', 'add', message);
}

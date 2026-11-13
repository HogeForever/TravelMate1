/* ==========================================================
   app.js — Полная клиентская логика платформы TravelMate Pro
   Охватывает все 8 модулей ТЗ:
   1. Каталог и поиск (направление, даты вылета/возвращения, люди, фильтры, сортировка, календарь цен, видео-обзор)
   2. Наличие и бронирование (квоты мест, лист ожидания, таймер резерва 30 мин, паспорта туристов, доп. услуги)
   3. Оплата (таймер 48 часов, Карта, Kaspi QR, Apple/Google Pay, Рассрочка 0-0-12, 100% / 30%, промокоды, бонусы)
   4. Документы и билеты (QR-код ваучера, скачивание PDF: ваучер, договор-оферта, страховка, маршрутная квитанция, отправка в WhatsApp/TG/Email)
   5. Личный кабинет (история заказов, изменение/отмена брони и возврат, сохранённые паспорта, избранное ❤️)
   6. Уведомления (Email/SMS/Push: подтверждение, напоминание об оплате 48ч, за 24ч до вылета, изменения рейса)
   7. Админ-панель и Агентство (управление турами, ценами и квотами, фильтры по статусам, сканер QR-кодов, отчёты продаж и загрузки, роли менеджер/гид)
   8. Доверие и сервис (отзывы с подтверждённой покупкой, онлайн-чат WhatsApp 24/7, FAQ, политика возврата)
   ========================================================== */

let currentTourState = {
    tour: null,
    selectedDatePrice: null,
    promoCode: '',
    promoDiscount: 0,
    holdSeconds: 29 * 60 + 59
};

let holdIntervalId = null;
let modal48hIntervalId = null;

/* ==========================================================
   1. ЯЗЫК (KZ / RU), ШАПКА И УТИЛИТЫ
   ========================================================== */

function getLang() {
    return localStorage.getItem('tm_lang') || 'kz';
}

async function setLang(lang) {
    if (typeof currentLang !== 'undefined') currentLang = lang;
    localStorage.setItem('tm_lang', lang);
    applyLang();
    await renderHeader();

    const page = document.body.dataset.page;
    if (page === 'home')   await renderHome();
    if (page === 'tours')  await renderToursPage();
    if (page === 'tour')   await renderTourPage();
    if (page === 'client') await renderClient();
    if (page === 'agency') await renderAgency();
    if (page === 'admin')  await renderAdmin();
}

function t(key) {
    const lang = getLang();
    const dict = (typeof translations !== 'undefined') ? translations : (typeof LANG !== 'undefined' ? LANG : null);
    if (dict) {
        if (dict[lang] && dict[lang][key] !== undefined) return dict[lang][key];
        if (dict['ru'] && dict['ru'][key] !== undefined) return dict['ru'][key];
        if (dict['kz'] && dict['kz'][key] !== undefined) return dict['kz'][key];
    }
    return key;
}

function applyLang() {
    const lang = getLang();
    if (typeof currentLang !== 'undefined') currentLang = lang;

    document.querySelectorAll('[data-lang]').forEach(el => {
        const key = el.getAttribute('data-lang');
        const val = t(key);
        if (val !== key) el.textContent = val;
    });

    document.querySelectorAll('[data-lang-ph]').forEach(el => {
        const key = el.getAttribute('data-lang-ph');
        const val = t(key);
        if (val !== key) el.placeholder = val;
    });

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.code === lang);
    });

    document.documentElement.lang = (lang === 'kz') ? 'kk' : 'ru';
}

async function renderHeader() {
    const box = document.getElementById('userMenu');
    if (!box) return;

    const user = await getCurrentUser();
    const favCount = getFavorites().length;
    const favHtml = favCount > 0
        ? `<a href="client.html#clientFavoritesGrid" class="fav-header-count" title="Избранное">❤️ ${favCount}</a>`
        : '';

    if (!user) {
        box.innerHTML = `
            ${favHtml}
            <a href="login.html" class="btn btn-outline btn-small">${t('nav_login')}</a>
            <a href="register.html" class="btn btn-small">${t('nav_register')}</a>
        `;
    } else {
        let cabinetUrl = 'client.html';
        if (user.role === 'agency') cabinetUrl = 'agency.html';
        if (user.role === 'admin')  cabinetUrl = 'admin.html';

        box.innerHTML = `
            ${favHtml}
            <a href="${cabinetUrl}" class="btn btn-small">👤 ${user.name}</a>
            <button type="button" class="btn btn-outline btn-small" onclick="logout()">${t('nav_logout')}</button>
        `;
    }
}

async function logout() {
    await logoutUser();
    window.location.href = 'index.html';
}

function formatPrice(num) {
    return Number(num || 0).toLocaleString('ru-RU') + ' ₸';
}

function renderStarIcons(count) {
    const n = Math.max(1, Math.min(5, Number(count) || 5));
    let html = '<span class="star-icons-group">';
    for (let i = 0; i < n; i++) {
        html += '<img src="images/star.png" alt="★" class="star-icon-img">';
    }
    html += '</span>';
    return html;
}

function getTourTitle(tour) {
    if (!tour) return 'Тур';
    return (getLang() === 'ru' && tour.title_ru) ? tour.title_ru : tour.title;
}

function getTourCountry(tour) {
    if (!tour) return '';
    return (getLang() === 'ru' && tour.country_ru) ? tour.country_ru : tour.country;
}

function getTourDesc(tour) {
    if (!tour) return '';
    return (getLang() === 'ru' && tour.description_ru) ? tour.description_ru : tour.description;
}

function getTourMeal(tour) {
    if (!tour || !tour.meal) return 'All Inclusive';
    return (getLang() === 'ru' && tour.meal_ru) ? tour.meal_ru : tour.meal;
}

function getTourDays(tour) {
    return Number(tour?.days || tour?.duration || 7);
}

// Расчёт оставшегося времени (48 часов на оплату после бронирования)
function getRemaining48h(booking) {
    const createdMs = Number(booking.createdAtMs) || Date.now();
    const deadlineMs = createdMs + 48 * 3600 * 1000;
    const diff = deadlineMs - Date.now();
    if (diff <= 0) {
        return { expired: true, clock: '00:00:00', short: 'Истёк' };
    }
    const secTotal = Math.floor(diff / 1000);
    const h = Math.floor(secTotal / 3600);
    const m = Math.floor((secTotal % 3600) / 60);
    const s = secTotal % 60;
    const pad = n => String(n).padStart(2, '0');
    return {
        expired: false,
        clock: `${pad(h)}:${pad(m)}:${pad(s)}`,
        short: `${h}ч ${pad(m)}м`
    };
}

// Форматирование объекта или строки customOptions
function formatCustomOptionsHtml(customOptions) {
    if (!customOptions) return '';
    if (typeof customOptions === 'string') {
        try {
            const parsed = JSON.parse(customOptions);
            if (typeof parsed === 'object' && parsed !== null) {
                customOptions = parsed;
            } else {
                return `<div class="custom-opts-pill">${customOptions}</div>`;
            }
        } catch (e) {
            return `<div class="custom-opts-pill">${customOptions}</div>`;
        }
    }
    const parts = [];
    if (customOptions.roomLabel)   parts.push(`🛏 ${customOptions.roomLabel}`);
    if (customOptions.flightLabel) parts.push(`✈️ ${customOptions.flightLabel}`);
    if (Array.isArray(customOptions.activities) && customOptions.activities.length > 0) {
        parts.push(`🎢 Развлечения: ${customOptions.activities.join(', ')}`);
    }
    if (Array.isArray(customOptions.services) && customOptions.services.length > 0) {
        parts.push(`🛡 Услуги: ${customOptions.services.join(', ')}`);
    }
    if (customOptions.passportName) {
        parts.push(`🛂 Паспорт: ${customOptions.passportName} (${customOptions.passportNumber || ''})`);
    }
    if (customOptions.promoCode) {
        parts.push(`🎁 Промокод: ${customOptions.promoCode}`);
    }
    if (customOptions.bonusEarned) {
        parts.push(`✨ Бонусы: +${customOptions.bonusEarned} Б`);
    }
    return `<div class="custom-opts-pill">${parts.join(' · ')}</div>`;
}

/* ==========================================================
   2. КАРТОЧКА ТУРА (СТАТУС МЕСТ, ПЕРЕЛЁТ, ИЗБРАННОЕ ❤️)
   ========================================================== */

function getSeatsBadge(tour) {
    const seats = (tour.seatsLeft !== undefined) ? Number(tour.seatsLeft) : 8;
    const isRu = getLang() === 'ru';
    if (seats <= 0) {
        return `<span class="seats-badge seats-none">🔴 ${isRu ? 'Мест нет (Лист ожидания)' : 'Орын жоқ (Күту парағы)'}</span>`;
    }
    if (seats <= 3) {
        return `<span class="seats-badge seats-few">🔥 ${isRu ? `Осталось ${seats} места!` : `Тек ${seats} орын қалды!`}</span>`;
    }
    return `<span class="seats-badge seats-ok">🟢 ${isRu ? `Есть места (${seats})` : `Орын бар (${seats})`}</span>`;
}

function getFlightBadge(tour) {
    const isRu = getLang() === 'ru';
    if (!tour.flight || !tour.flight.hasLayover) {
        return `<span class="flight-mini-badge direct">✈️ ${isRu ? 'Прямой рейс' : 'Тікелей рейс'}</span>`;
    }
    const tip = isRu ? tour.flight.layover_ru : tour.flight.layover_kz;
    return `<span class="flight-mini-badge layover" title="${tip}">🔄 ${isRu ? 'С пересадкой' : 'Ауысып отыру'}</span>`;
}

function tourCard(tour) {
    const stars = tour.stars || 5;
    const days = getTourDays(tour);
    const nights = Math.max(1, days - 1);
    const fav = isFavorite(tour.id);

    return `
        <div class="card tour-card">
            <div class="tour-card-img-wrap">
                <img src="${tour.image}" alt="${getTourTitle(tour)}" onerror="this.src='https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'">
                <div class="tour-card-top-badges">
                    <span class="stars-badge">${renderStarIcons(stars)} <small>${tour.rating || '4.9'}</small></span>
                    <span class="badge-meal">${getTourMeal(tour)}</span>
                </div>
                <button type="button" class="fav-card-btn ${fav ? 'active' : ''}" onclick="handleToggleFavorite(event, ${tour.id})" title="В избранное">
                    ${fav ? '❤️' : '🤍'}
                </button>
                <div class="tour-card-bottom-overlay">
                    <span class="tour-country-tag"><img src="images/address.png" alt="" class="inline-icon invert-light"> ${getTourCountry(tour)}</span>
                    <span class="tour-duration-tag">⏱ ${days} ${t('days')} / ${nights} ${t('nights')}</span>
                </div>
            </div>
            <div class="card-body">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                    ${getSeatsBadge(tour)}
                    ${getFlightBadge(tour)}
                </div>
                <h3 class="tour-card-title">${getTourTitle(tour)}</h3>
                <p class="muted tour-card-hotel">🏨 ${tour.hotel || '5* Luxury Resort'}</p>
                <div class="card-footer">
                    <div>
                        <small class="muted" style="display:block; font-size:11px;">${t('price_label')} ${t('per_person')}</small>
                        <div class="price">${formatPrice(tour.price)}</div>
                    </div>
                    <a href="tour.html?id=${tour.id}" class="btn btn-small">${t('btn_details')}</a>
                </div>
            </div>
        </div>
    `;
}

async function handleToggleFavorite(event, tourId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    toggleFavoriteTour(tourId);
    await renderHeader();

    const page = document.body.dataset.page;
    if (page === 'home')   await renderHome();
    if (page === 'tours')  await applyCatalogFilters();
    if (page === 'tour')   await renderTourPage();
    if (page === 'client') await renderClient();
}

/* ==========================================================
   3. ГЛАВНАЯ СТРАНИЦА (index.html)
   ========================================================== */

async function renderHome() {
    const box = document.getElementById('popularTours');
    if (!box) return;
    const tours = await getTours();
    box.innerHTML = tours.slice(0, 6).map(tourCard).join('');
}

/* ==========================================================
   4. КАТАЛОГ И ФИЛЬТРЫ ТУРОВ (tours.html)
   ========================================================== */

let cachedCatalogTours = [];

async function renderToursPage() {
    cachedCatalogTours = await getTours();

    // Подхватываем GET-параметры с главной страницы (?q=..., ?dateFrom=..., ?people=...)
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const dateFrom = params.get('dateFrom') || params.get('date');

    const textEl = document.getElementById('filterText');
    if (q && textEl && !textEl.dataset.init) {
        textEl.value = q;
        textEl.dataset.init = '1';
    }
    const dateEl = document.getElementById('filterDateFrom');
    if (dateFrom && dateEl && !dateEl.dataset.init) {
        dateEl.value = dateFrom;
        dateEl.dataset.init = '1';
    }

    // Привязываем обработчики ко всем фильтрам каталога
    ['filterText', 'filterCountry', 'filterType', 'filterDays', 'filterStars', 'filterMeal', 'filterDateFrom', 'filterPrice', 'sortSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.addEventListener('input', applyCatalogFilters);
            el.addEventListener('change', applyCatalogFilters);
            el.dataset.bound = '1';
        }
    });

    const resetBtn = document.getElementById('btnResetFilter');
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.addEventListener('click', () => {
            ['filterText', 'filterCountry', 'filterType', 'filterDays', 'filterStars', 'filterMeal', 'filterDateFrom', 'filterPrice'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const sortEl = document.getElementById('sortSelect');
            if (sortEl) sortEl.value = 'popular';
            applyCatalogFilters();
        });
        resetBtn.dataset.bound = '1';
    }

    await applyCatalogFilters();
}

async function applyCatalogFilters() {
    if (!cachedCatalogTours.length) {
        cachedCatalogTours = await getTours();
    }

    const search   = (document.getElementById('filterText')?.value || '').toLowerCase().trim();
    const country  = document.getElementById('filterCountry')?.value || '';
    const tourType = document.getElementById('filterType')?.value || '';
    const daysType = document.getElementById('filterDays')?.value || '';
    const stars    = Number(document.getElementById('filterStars')?.value) || 0;
    const meal     = (document.getElementById('filterMeal')?.value || '').toLowerCase().trim();
    const maxPrice = Number(document.getElementById('filterPrice')?.value) || 0;
    const sortBy   = document.getElementById('sortSelect')?.value || 'popular';

    let list = cachedCatalogTours.filter(tour => {
        const hay = `${tour.title || ''} ${tour.title_ru || ''} ${tour.country || ''} ${tour.country_ru || ''} ${tour.hotel || ''}`.toLowerCase();
        const matchSearch  = !search || hay.includes(search);
        const matchCountry = !country || tour.country === country || tour.country_ru === country;
        const matchType    = !tourType || (tour.tourType || 'beach') === tourType;
        const matchStars   = !stars || Number(tour.stars || 5) === stars;
        const matchMeal    = !meal || ((tour.meal || '') + ' ' + (tour.meal_ru || '')).toLowerCase().includes(meal);
        const matchPrice   = !maxPrice || Number(tour.price) <= maxPrice;

        const d = getTourDays(tour);
        let matchDays = true;
        if (daysType === 'short')  matchDays = d <= 5;
        if (daysType === 'medium') matchDays = d >= 6 && d <= 8;
        if (daysType === 'long')   matchDays = d >= 9;

        return matchSearch && matchCountry && matchType && matchStars && matchMeal && matchPrice && matchDays;
    });

    if (sortBy === 'price_asc') {
        list.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === 'price_desc') {
        list.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sortBy === 'rating') {
        list.sort((a, b) => Number(b.rating || 4.9) - Number(a.rating || 4.9));
    } else if (sortBy === 'date') {
        list.sort((a, b) => (a.nextDate || '2026-12-01').localeCompare(b.nextDate || '2026-12-01'));
    } else {
        list.sort((a, b) => Number(b.popularity || 90) - Number(a.popularity || 90));
    }

    const countBox = document.getElementById('filterResultCount');
    if (countBox) {
        countBox.innerHTML = `<span class="result-pill">Найдено туров: <b>${list.length}</b></span>`;
    }

    const listBox = document.getElementById('toursList');
    if (!listBox) return;

    if (list.length === 0) {
        listBox.innerHTML = `<div class="empty">${t('no_tours')}</div>`;
    } else {
        listBox.innerHTML = list.map(tourCard).join('');
    }
}

/* ==========================================================
   5. СТРАНИЦА ТУРА: РАСПИСАНИЕ ВЫЛЕТА, ПЕРЕСАДКИ, КОНСТРУКТОР,
      КАЛЕНДАРЬ ЦЕН, ПРОГРАММА ПО ДНЯМ, ОТЗЫВЫ И БРОНЬ (tour.html)
   ========================================================== */

async function renderTourPage() {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get('id')) || 1;
    const tour = await getTourById(id);

    const detailsBox = document.getElementById('tourDetails');
    if (!detailsBox) return;

    if (!tour) {
        detailsBox.innerHTML = `<div class="empty">${t('no_tours')}</div>`;
        return;
    }

    currentTourState.tour = tour;
    const isRu = getLang() === 'ru';
    const days = getTourDays(tour);
    const nights = Math.max(1, days - 1);
    const stars = tour.stars || 5;
    const fav = isFavorite(tour.id);
    const fl = tour.flight || {};

    // Календарь цен
    const calList = tour.priceCalendar || [
        { date: '2026-11-15', price: tour.price, tag_ru: '🔥 Выгодная дата', tag_kz: '🔥 Тиімді күн' }
    ];
    const minCalPrice = Math.min(...calList.map(c => Number(c.price)));

    // Устанавливаем дату вылета по умолчанию
    const dateInput = document.getElementById('bookDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = calList[0].date;
        currentTourState.selectedDatePrice = Number(calList[0].price);
    }

    const currentSelectedDate = dateInput?.value || calList[0].date;

    const calendarHtml = calList.map(item => {
        const isBest = Number(item.price) === minCalPrice;
        const isAct  = item.date === currentSelectedDate;
        const dStart = new Date(item.date);
        const dEnd   = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + days);
        const fStart = dStart.toLocaleDateString(isRu ? 'ru-RU' : 'kk-KZ', { day: 'numeric', month: 'short' });
        const fEnd   = dEnd.toLocaleDateString(isRu ? 'ru-RU' : 'kk-KZ', { day: 'numeric', month: 'short' });
        const tagTxt = isRu ? (item.tag_ru || '') : (item.tag_kz || '');

        return `
            <button type="button" class="price-cal-item ${isAct ? 'active' : ''}" onclick="selectTourCalendarDate('${item.date}', ${item.price})">
                ${isBest ? `<span class="cal-best-pill">${tagTxt || '🔥 Выгодно'}</span>` : ''}
                <div class="cal-dates">🛫 ${fStart} — 🛬 ${fEnd}</div>
                <div class="cal-price">${formatPrice(item.price)}</div>
            </button>
        `;
    }).join('');

    // Блок перелёта и пересадок
    const layoverAlert = fl.hasLayover
        ? `<div class="flight-layover-alert warning">
                <span>🔄 <b>Маршрут с пересадкой:</b> ${isRu ? fl.layover_ru : fl.layover_kz}</span>
           </div>`
        : `<div class="flight-layover-alert direct">
                <span>✈️ <b>Прямой рейс:</b> ${isRu ? fl.layover_ru : fl.layover_kz}</span>
           </div>`;

    const flightDates = computeFlightScheduleDates(currentSelectedDate, days, fl, isRu);

    // Проверяем, может ли текущий пользователь оставить отзыв (только после окончания тура)
    const currentUser = await getCurrentUser();
    const allBookings = currentUser ? await getBookings() : [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const userTourBookings = currentUser ? allBookings.filter(b =>
        Number(b.tourId) === Number(tour.id) &&
        b.status !== 'cancelled' &&
        (Number(b.clientId) === Number(currentUser.id) ||
         (b.clientEmail && currentUser.email && String(b.clientEmail).toLowerCase() === String(currentUser.email).toLowerCase()))
    ) : [];

    let canLeaveReview = false;
    let upcomingReturnDateText = '';
    userTourBookings.forEach(b => {
        let retIso = b.customOptions?.returnDate || '';
        if (!retIso && b.date) {
            const d = new Date(b.date + 'T12:00:00');
            if (!isNaN(d)) {
                d.setDate(d.getDate() + days);
                retIso = d.toISOString().slice(0, 10);
            }
        }
        if (b.status === 'completed' || (retIso && retIso <= todayIso)) {
            canLeaveReview = true;
        } else if (retIso && !upcomingReturnDateText) {
            const rd = new Date(retIso + 'T12:00:00');
            upcomingReturnDateText = !isNaN(rd)
                ? rd.toLocaleDateString(isRu ? 'ru-RU' : 'kk-KZ', { day: '2-digit', month: 'long', year: 'numeric' })
                : retIso;
        }
    });
    currentTourState.canLeaveReview = canLeaveReview;
    currentTourState.reviewAuthorName = currentUser?.name || 'Турист TravelMate';

    // Развлечения для конструктора тура
    const entertainments = tour.entertainments || [];
    const entCheckboxesHtml = entertainments.map(ent => {
        const title = isRu ? ent.title_ru : ent.title_kz;
        return `
            <label class="custom-check-card">
                <input type="checkbox" name="customEnt" value="${ent.id}" data-price="${ent.price}" data-title="${title}" onchange="updateLivePrice()">
                <div class="custom-check-body">
                    <span class="custom-check-title">${title}</span>
                    <span class="custom-check-price">+${formatPrice(ent.price)}</span>
                </div>
            </label>
        `;
    }).join('');

    // Программа по дням
    const progArray = (isRu && tour.program_ru) ? tour.program_ru : (tour.program || []);
    const programHtml = progArray.map((p, idx) => {
        if (typeof p === 'object') {
            return `
                <div class="program-day-item">
                    <div class="program-day-num">${p.day || (idx + 1)}</div>
                    <div class="program-day-content">
                        <b style="display:block; margin-bottom:3px;">День ${p.day || (idx + 1)}: ${p.title}</b>
                        <span class="muted">${p.text}</span>
                    </div>
                </div>
            `;
        }
        return `
            <div class="program-day-item">
                <div class="program-day-num">${idx + 1}</div>
                <div class="program-day-content">${p}</div>
            </div>
        `;
    }).join('');

    // Что включено / не включено
    const incArray = (isRu && tour.includes_ru) ? tour.includes_ru : (tour.includes || []);
    const notIncArray = (isRu && tour.notIncludes_ru) ? tour.notIncludes_ru : (tour.notIncludes || ['Личные расходы']);

    // Отзывы с подтверждённой покупкой
    const reviews = getTourReviews(tour.id);
    const reviewsHtml = reviews.map(r => `
        <div class="review-item-card">
            <div class="review-header">
                <div>
                    <b>👤 ${r.author}</b>
                    <span class="verified-purchase-badge">✔ Подтверждённая покупка</span>
                </div>
                <div class="review-meta">
                    ${renderStarIcons(r.rating || 5)}
                    <small class="muted">${r.date}</small>
                </div>
            </div>
            <p class="review-text">${isRu ? (r.text_ru || r.text_kz) : (r.text_kz || r.text_ru)}</p>
        </div>
    `).join('');

    detailsBox.innerHTML = `
        <!-- Верхние метки + Избранное + Видео-обзор -->
        <div class="tour-detail-header">
            <span class="badge badge-location"><img src="images/address.png" alt="" class="inline-icon"> ${getTourCountry(tour)}</span>
            <span class="badge badge-meal">${getTourMeal(tour)}</span>
            <span class="badge badge-verified">${renderStarIcons(stars)} ${tour.rating || '4.9'} (${tour.reviewsCount || 85} отзывов)</span>
            ${getSeatsBadge(tour)}
            <div style="margin-left:auto; display:flex; gap:8px;">
                <button type="button" class="btn btn-outline btn-small" onclick="openVideoPreviewModal('${getTourTitle(tour)}')">🎬 Видео-обзор 4K</button>
                <button type="button" class="btn btn-outline btn-small" onclick="handleToggleFavorite(event, ${tour.id})">
                    ${fav ? '❤️ В избранном' : '🤍 В избранное'}
                </button>
            </div>
        </div>

        <h1 class="tour-page-main-title">${getTourTitle(tour)}</h1>
        <p class="tour-page-hotel-sub">
            🏨 <b>${tour.hotel || '5* Luxury Resort & Spa'}</b>
            <span class="dot-sep">•</span>
            <span>Туроператор: <b>${tour.agencyName || 'Kazakh Tour'}</b></span>
        </p>

        <!-- Главное фото тура -->
        <div class="tour-gallery-wrap">
            <img src="${tour.image}" alt="${getTourTitle(tour)}" class="tour-image" onerror="this.src='https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200'">
            <div class="tour-gallery-badge">
                <span>📸 Фото и видео резорта</span>
                <span>•</span>
                <span>⏱ ${days} ${t('days')} / ${nights} ${t('nights')}</span>
            </div>
        </div>

        <!-- 4 ключевых параметра -->
        <div class="tour-specs-grid">
            <div class="spec-card">
                <div class="spec-icon-box">⏱️</div>
                <div>
                    <small class="muted">${t('duration')}</small>
                    <b>${days} ${t('days')} / ${nights} ${t('nights')}</b>
                </div>
            </div>
            <div class="spec-card">
                <div class="spec-icon-box"><img src="images/star.png" alt="★" class="spec-img-icon"></div>
                <div>
                    <small class="muted">Категория отеля</small>
                    <b>${stars} / 5 звёзд</b>
                </div>
            </div>
            <div class="spec-card">
                <div class="spec-icon-box">🍽️</div>
                <div>
                    <small class="muted">Питание</small>
                    <b>${getTourMeal(tour)}</b>
                </div>
            </div>
            <div class="spec-card">
                <div class="spec-icon-box">✈️</div>
                <div>
                    <small class="muted">Авиаперелёт</small>
                    <b>${fl.hasLayover ? 'С пересадкой' : 'Прямой рейс'}</b>
                </div>
            </div>
        </div>

        <!-- 1. КАЛЕНДАРЬ ЦЕН (САМЫЕ ДЕШЁВЫЕ ДАТЫ) -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">📅</span>
                <div>
                    <h3>Календарь цен (выберите самую выгодную дату вылета)</h3>
                    <small class="muted">Нажмите на дату, чтобы автоматически подставить её в расчёт бронирования</small>
                </div>
            </div>
            <div class="price-cal-grid">${calendarHtml}</div>
        </div>

        <!-- 2. ПОДРОБНОЕ РАСПИСАНИЕ ВЫЛЕТА И ПЕРЕСАДОК -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">✈️</span>
                <div>
                    <h3>Расписание авиаперелёта, время вылета и информация о пересадках</h3>
                    <small class="muted">Авиакомпания: <b>${fl.airline || 'Air Astana'}</b></small>
                </div>
            </div>
            <div class="flight-schedule-box">
                ${layoverAlert}
                <div class="flight-dates-summary-bar" id="flightDatesSummaryBar">
                    <span>🛫 <b>Вылет туда:</b> <span id="flightSummaryOut">${flightDates.outDepFull} в ${fl.depTimeOut || '06:45'}</span></span>
                    <span class="dot-sep">•</span>
                    <span>🛬 <b>Вылет обратно:</b> <span id="flightSummaryBack">${flightDates.backDepFull} в ${fl.depTimeBack || '11:20'}</span></span>
                </div>
                <div class="flight-cards-grid">
                    <!-- Вылет ТУДА -->
                    <div class="flight-segment-card">
                        <div class="flight-seg-header">
                            <span class="flight-dir-tag">🛫 Вылет туда</span>
                            <span class="flight-date-pill" id="flightOutDateBadge">📅 ${flightDates.outDepShort} • ${fl.depTimeOut || '06:45'}</span>
                            <span>Рейс <b>${fl.flightNoOut || 'KC 915'}</b></span>
                        </div>
                        <div class="flight-route-row">
                            <div class="flight-time-col">
                                <div class="flight-big-time">${fl.depTimeOut || '06:45'}</div>
                                <div class="flight-full-date" id="flightOutDepDateText">📅 ${flightDates.outDepFull}</div>
                                <div class="flight-city-name">${isRu ? (fl.fromCity_ru || 'Алматы') : (fl.fromCity_kz || 'Алматы')}</div>
                            </div>
                            <div class="flight-line-col">
                                <div class="flight-duration-text">⏱ ${isRu ? (fl.durationOut_ru || '4 ч 55 мин') : (fl.durationOut_kz || '4 сағ 55 мин')}</div>
                                <div class="flight-visual-line">
                                    <span class="dot"></span>
                                    <span class="line"></span>
                                    ${fl.hasLayover ? '<span title="Пересадка">🔄</span><span class="line"></span>' : ''}
                                    <span>✈</span>
                                </div>
                                <div class="flight-stop-label">${fl.hasLayover ? 'С пересадкой' : 'Прямой рейс'}</div>
                            </div>
                            <div class="flight-time-col right">
                                <div class="flight-big-time">${fl.arrTimeOut || '09:40'}</div>
                                <div class="flight-full-date" id="flightOutArrDateText">📅 ${flightDates.outArrFull}</div>
                                <div class="flight-city-name">${isRu ? (fl.toCity_ru || getTourCountry(tour)) : (fl.toCity_kz || getTourCountry(tour))}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Вылет ОБРАТНО -->
                    <div class="flight-segment-card">
                        <div class="flight-seg-header">
                            <span class="flight-dir-tag return">🛬 Вылет обратно</span>
                            <span class="flight-date-pill return" id="flightBackDateBadge">📅 ${flightDates.backDepShort} • ${fl.depTimeBack || '11:20'}</span>
                            <span>Рейс <b>${fl.flightNoBack || 'KC 916'}</b></span>
                        </div>
                        <div class="flight-route-row">
                            <div class="flight-time-col">
                                <div class="flight-big-time">${fl.depTimeBack || '11:20'}</div>
                                <div class="flight-full-date" id="flightBackDepDateText">📅 ${flightDates.backDepFull}</div>
                                <div class="flight-city-name">${isRu ? (fl.toCity_ru || getTourCountry(tour)) : (fl.toCity_kz || getTourCountry(tour))}</div>
                            </div>
                            <div class="flight-line-col">
                                <div class="flight-duration-text">⏱ ${isRu ? (fl.durationBack_ru || '4 ч 35 мин') : (fl.durationBack_kz || '4 сағ 35 мин')}</div>
                                <div class="flight-visual-line">
                                    <span class="dot"></span>
                                    <span class="line"></span>
                                    ${fl.hasLayover ? '<span title="Пересадка">🔄</span><span class="line"></span>' : ''}
                                    <span>✈</span>
                                </div>
                                <div class="flight-stop-label">${fl.hasLayover ? 'С пересадкой' : 'Прямой рейс'}</div>
                            </div>
                            <div class="flight-time-col right">
                                <div class="flight-big-time">${fl.arrTimeBack || '17:55'}</div>
                                <div class="flight-full-date" id="flightBackArrDateText">📅 ${flightDates.backArrFull}</div>
                                <div class="flight-city-name">${isRu ? (fl.fromCity_ru || 'Алматы') : (fl.fromCity_kz || 'Алматы')}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flight-extra-meta">
                    <span>🧳 <b>Багаж:</b> ${isRu ? (fl.baggage_ru || '23 кг + 8 кг ручная кладь') : (fl.baggage_kz || '23 кг + 8 кг қол жүгі')}</span>
                    <span>🚐 <b>Трансфер:</b> Аэропорт — Отель — Аэропорт (включён)</span>
                </div>
            </div>
        </div>

        <!-- 3. ИНТЕРАКТИВНЫЙ КОНСТРУКТОР ТУРА ПОД СЕБЯ (НОМЕР, КЛАСС ПЕРЕЛЁТА, РАЗВЛЕЧЕНИЯ, УСЛУГИ) -->
        <div class="tour-section-block tour-configurator-card">
            <div class="tour-section-head">
                <span class="section-head-icon">🛠️</span>
                <div>
                    <h3>Настройте тур под себя (Конструктор тура и развлечений)</h3>
                    <small class="muted">Выберите категорию номера, класс перелёта, экскурсии и доп. услуги — цена справа обновится мгновенно</small>
                </div>
            </div>

            <!-- Тип номера -->
            <div class="config-group">
                <h4 class="config-group-title">1. Выберите тип номера в отеле:</h4>
                <div class="config-options-grid">
                    <label class="custom-radio-card">
                        <input type="radio" name="customRoom" value="standard" data-price="0" data-title="Standard Room (Базовый)" checked onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>🛏 Standard Room</b>
                            <span class="muted">Включено в базовую цену</span>
                        </div>
                    </label>
                    <label class="custom-radio-card">
                        <input type="radio" name="customRoom" value="deluxe" data-price="45000" data-title="Deluxe Sea / Panoramic View" onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>🌊 Deluxe Sea View</b>
                            <span class="price-tag-sm">+45 000 ₸ / чел.</span>
                        </div>
                    </label>
                    <label class="custom-radio-card">
                        <input type="radio" name="customRoom" value="suite" data-price="110000" data-title="Family Suite / Private Villa" onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>👑 Family Suite / Villa</b>
                            <span class="price-tag-sm">+110 000 ₸ / чел.</span>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Класс перелёта и трансфер -->
            <div class="config-group" style="margin-top:16px;">
                <h4 class="config-group-title">2. Класс авиаперелёта и трансфер:</h4>
                <div class="config-options-grid">
                    <label class="custom-radio-card">
                        <input type="radio" name="customFlight" value="economy" data-price="0" data-title="Эконом + групповой трансфер" checked onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>✈️ Эконом-класс</b>
                            <span class="muted">Групповой трансфер (включено)</span>
                        </div>
                    </label>
                    <label class="custom-radio-card">
                        <input type="radio" name="customFlight" value="comfort" data-price="55000" data-title="Комфорт + Fast Track" onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>✨ Комфорт + Fast Track</b>
                            <span class="price-tag-sm">+55 000 ₸ / чел.</span>
                        </div>
                    </label>
                    <label class="custom-radio-card">
                        <input type="radio" name="customFlight" value="business" data-price="180000" data-title="Бизнес-класс + VIP Maybach трансфер" onchange="updateLivePrice()">
                        <div class="custom-radio-body">
                            <b>🥂 Бизнес-класс + VIP трансфер</b>
                            <span class="price-tag-sm">+180 000 ₸ / чел.</span>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Развлечения и экскурсии -->
            <div class="config-group" style="margin-top:16px;">
                <h4 class="config-group-title">3. Добавьте развлечения и экскурсии в программу:</h4>
                <div class="config-checks-grid">
                    ${entCheckboxesHtml}
                </div>
            </div>

            <!-- Дополнительные услуги: страховка, трансфер, багаж -->
            <div class="config-group" style="margin-top:16px;">
                <h4 class="config-group-title">4. Дополнительные услуги (страховка, багаж, связь):</h4>
                <div class="config-checks-grid">
                    <label class="custom-check-card">
                        <input type="checkbox" name="customSrv" value="ins_pro" data-price="18000" data-per-person="1" data-title="Расширенная страховка (50 000€ + от невылета)" onchange="updateLivePrice()">
                        <div class="custom-check-body">
                            <span>🛡 Расширенная страховка + защита от невылета</span>
                            <span class="custom-check-price">+18 000 ₸/чел.</span>
                        </div>
                    </label>
                    <label class="custom-check-card">
                        <input type="checkbox" name="customSrv" value="vip_transfer" data-price="35000" data-per-person="0" data-title="Индивидуальный трансфер аэропорт-отель" onchange="updateLivePrice()">
                        <div class="custom-check-body">
                            <span>🚘 Индивидуальный трансфер (в обе стороны)</span>
                            <span class="custom-check-price">+35 000 ₸</span>
                        </div>
                    </label>
                    <label class="custom-check-card">
                        <input type="checkbox" name="customSrv" value="extra_bag" data-price="22000" data-per-person="0" data-title="Дополнительный багаж +23 кг" onchange="updateLivePrice()">
                        <div class="custom-check-body">
                            <span>🧳 Дополнительное место багажа (+23 кг)</span>
                            <span class="custom-check-price">+22 000 ₸</span>
                        </div>
                    </label>
                    <label class="custom-check-card">
                        <input type="checkbox" name="customSrv" value="esim" data-price="12000" data-per-person="0" data-title="Туристическая eSIM 15 ГБ" onchange="updateLivePrice()">
                        <div class="custom-check-body">
                            <span>📶 Безлимитный роуминг / eSIM (15 ГБ)</span>
                            <span class="custom-check-price">+12 000 ₸</span>
                        </div>
                    </label>
                </div>
            </div>
        </div>

        <!-- 4. ОПИСАНИЕ ТУРА -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">📖</span>
                <h3>Обзор тура и концепция курорта</h3>
            </div>
            <p class="tour-full-desc">${getTourDesc(tour)}</p>
        </div>

        <!-- 5. ПРОГРАММА ТУРА ПО ДНЯМ -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">🗓️</span>
                <h3>Программа тура по дням</h3>
            </div>
            <div class="program-timeline">${programHtml}</div>
        </div>

        <!-- 6. ЧТО ВКЛЮЧЕНО / НЕ ВКЛЮЧЕНО -->
        <div class="two-cols" style="grid-template-columns: 1fr 1fr; gap: 18px;">
            <div class="tour-section-block includes-box" style="margin-bottom:22px;">
                <div class="tour-section-head">
                    <span class="section-head-icon">✅</span>
                    <h3>Что включено в стоимость</h3>
                </div>
                <ul class="includes-custom-list" style="grid-template-columns:1fr;">
                    ${incArray.map(item => `<li class="include-list-card"><span class="check-icon">✓</span> ${item}</li>`).join('')}
                </ul>
            </div>
            <div class="tour-section-block" style="margin-bottom:22px; border-left: 4px solid #ef4444;">
                <div class="tour-section-head">
                    <span class="section-head-icon">ℹ️</span>
                    <h3>Оплачивается отдельно</h3>
                </div>
                <ul class="not-includes-list">
                    ${notIncArray.map(item => `<li>✕ ${item}</li>`).join('')}
                </ul>
            </div>
        </div>

        <!-- 7. ОТЗЫВЫ ТУРИСТОВ С ПОДТВЕРЖДЁННОЙ ПОКУПКОЙ -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">⭐</span>
                <h3>Отзывы туристов (${reviews.length})</h3>
            </div>
            <div class="reviews-list" id="tourReviewsBox">${reviewsHtml}</div>
            <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
                <h4 style="font-size:15px; margin-bottom:8px;">Оставить отзыв о туре</h4>
                ${canLeaveReview ? `
                    <div class="review-eligible-badge" style="margin-bottom:10px; font-size:13px; color:#10b981; font-weight:600;">
                        ✔ Ваша поездка завершена — вы можете оставить подтверждённый отзыв!
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <select id="newReviewRating" style="width:150px;">
                            <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
                            <option value="4">⭐⭐⭐⭐ (4/5)</option>
                        </select>
                        <input type="text" id="newReviewText" placeholder="Поделитесь впечатлениями об отеле и перелёте..." style="flex:1; min-width:220px;">
                        <button type="button" class="btn btn-small" onclick="submitNewReview()">Опубликовать</button>
                    </div>
                ` : `
                    <div class="review-locked-notice">
                        <span class="review-lock-icon">🔒</span>
                        <div>
                            <b>Оставить отзыв можно только после окончания тура</b>
                            <p class="muted" style="margin:3px 0 0; font-size:13px;">
                                ${upcomingReturnDateText
                                    ? `У вас есть активная бронь на этот тур. Вы сможете опубликовать свой отзыв после завершения поездки (после <b>${upcomingReturnDateText}</b>).`
                                    : `Публикация отзывов доступна только туристам с подтверждённым бронированием после даты обратного вылета.`}
                            </p>
                        </div>
                    </div>
                `}
            </div>
        </div>

        <!-- 8. ЧАСТЫЕ ВОПРОСЫ (FAQ), УСЛОВИЯ ОТМЕНЫ И ПОЛИТИКА ВОЗВРАТА -->
        <div class="tour-section-block">
            <div class="tour-section-head">
                <span class="section-head-icon">❓</span>
                <h3>Частые вопросы (FAQ), условия отмены и возврата</h3>
            </div>
            <div class="faq-list">
                <details class="faq-item" open>
                    <summary>⏳ Как работает система оплаты и резерв 48 часов?</summary>
                    <p class="muted">После нажатия кнопки «Забронировать» выбранный тур, места на рейсе и цена фиксируются за вами на <b>48 часов</b>. Вы можете оплатить 100% стоимости или внести предоплату 30% через Kaspi QR, карту Visa/MasterCard, Apple Pay или в рассрочку 0-0-12.</p>
                </details>
                <details class="faq-item">
                    <summary>🔄 Как проходит перелёт с пересадкой?</summary>
                    <p class="muted">При выборе тура со стыковочным рейсом оформляется единый авиабилет: багаж регистрируется сразу до конечного пункта, а расписание стыковки (2 часа) оптимально для комфортного перехода между терминалами.</p>
                </details>
                <details class="faq-item">
                    <summary>↩️ Условия отмены, политика возврата и договор-оферта</summary>
                    <p class="muted">Бесплатная отмена с возвратом 100% средств доступна за 14 и более дней до вылета (или за 24 часа при подключённой опции «Защита от невылета»). Официальный договор-оферта, страховой полис и QR-ваучер формируются автоматически в формате PDF.</p>
                </details>
            </div>
        </div>
    `;

    // Настраиваем правую колонку (#bookingBox)
    const unitPriceEl = document.getElementById('bookingUnitPrice');
    if (unitPriceEl) unitPriceEl.textContent = formatPrice(tour.price);

    const seatsBanner = document.getElementById('bookingSeatsBanner');
    if (seatsBanner) {
        seatsBanner.innerHTML = `
            <div class="reserve-hold-timer">
                <span>${getSeatsBadge(tour)}</span>
                <span>⏱ Резерв цены: <b id="holdTimerCountdown">29:59</b></span>
            </div>
        `;
    }

    startHoldTimer();

    // Обработчики изменения даты и количества человек
    if (dateInput && !dateInput.dataset.bound) {
        dateInput.addEventListener('change', () => {
            updateLivePrice();
        });
        dateInput.dataset.bound = '1';
    }

    const retInput = document.getElementById('bookReturnDate');
    if (retInput) {
        retInput.removeAttribute('readonly');
        if (!retInput.dataset.bound) {
            retInput.addEventListener('change', () => {
                updateFlightDatesDisplay();
            });
            retInput.dataset.bound = '1';
        }
    }

    ['bookPeople', 'bookChildren'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.addEventListener('input', updateLivePrice);
            el.addEventListener('change', updateLivePrice);
            el.dataset.bound = '1';
        }
    });

    const bookForm = document.getElementById('bookingForm');
    if (bookForm && !bookForm.dataset.bound) {
        bookForm.addEventListener('submit', handleCreateBooking);
        bookForm.dataset.bound = '1';
    }

    updateLivePrice();
}

function computeFlightScheduleDates(depDateStr, days, fl, isRu, customReturnDateStr) {
    const locale = isRu ? 'ru-RU' : 'kk-KZ';
    const dOutDep = depDateStr ? new Date(depDateStr + 'T12:00:00') : new Date();
    if (isNaN(dOutDep)) dOutDep.setTime(Date.now());

    const dOutArr = new Date(dOutDep);
    if (String(fl?.arrTimeOut || '').includes('(+1)')) {
        dOutArr.setDate(dOutArr.getDate() + 1);
    }

    let dBackDep;
    if (customReturnDateStr) {
        const parsedRet = new Date(customReturnDateStr + 'T12:00:00');
        if (!isNaN(parsedRet)) dBackDep = parsedRet;
    }
    if (!dBackDep) {
        dBackDep = new Date(dOutDep);
        dBackDep.setDate(dBackDep.getDate() + (Number(days) || 7));
    }

    const dBackArr = new Date(dBackDep);
    if (String(fl?.arrTimeBack || '').includes('(+1)')) {
        dBackArr.setDate(dBackArr.getDate() + 1);
    }

    const fmtFull = (d) => d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
    const fmtShort = (d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return {
        outDepFull: `${fmtFull(dOutDep)} (${fmtShort(dOutDep)})`,
        outArrFull: `${fmtFull(dOutArr)} (${fmtShort(dOutArr)})`,
        backDepFull: `${fmtFull(dBackDep)} (${fmtShort(dBackDep)})`,
        backArrFull: `${fmtFull(dBackArr)} (${fmtShort(dBackArr)})`,
        outDepShort: fmtShort(dOutDep),
        backDepShort: fmtShort(dBackDep),
        returnIso: dBackDep.toISOString().slice(0, 10)
    };
}

function updateFlightDatesDisplay() {
    const tour = currentTourState.tour;
    if (!tour) return;
    const isRu = getLang() === 'ru';
    const fl = tour.flight || {};
    const depVal = document.getElementById('bookDate')?.value || '';
    const retVal = document.getElementById('bookReturnDate')?.value || '';
    const dates = computeFlightScheduleDates(depVal, getTourDays(tour), fl, isRu, retVal);

    const setEl = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };

    setEl('flightOutDateBadge', `📅 ${dates.outDepShort} • ${fl.depTimeOut || '06:45'}`);
    setEl('flightBackDateBadge', `📅 ${dates.backDepShort} • ${fl.depTimeBack || '11:20'}`);
    setEl('flightOutDepDateText', `📅 ${dates.outDepFull}`);
    setEl('flightOutArrDateText', `📅 ${dates.outArrFull}`);
    setEl('flightBackDepDateText', `📅 ${dates.backDepFull}`);
    setEl('flightBackArrDateText', `📅 ${dates.backArrFull}`);
    setEl('flightSummaryOut', `${dates.outDepFull} в ${fl.depTimeOut || '06:45'}`);
    setEl('flightSummaryBack', `${dates.backDepFull} в ${fl.depTimeBack || '11:20'}`);
}

function selectTourCalendarDate(dateStr, price) {
    const dateInput = document.getElementById('bookDate');
    if (dateInput) dateInput.value = dateStr;
    currentTourState.selectedDatePrice = Number(price);
    renderTourPage();
}

function startHoldTimer() {
    if (holdIntervalId) clearInterval(holdIntervalId);
    holdIntervalId = setInterval(() => {
        const el = document.getElementById('holdTimerCountdown');
        if (!el) return;
        if (currentTourState.holdSeconds > 0) currentTourState.holdSeconds--;
        const m = Math.floor(currentTourState.holdSeconds / 60);
        const s = currentTourState.holdSeconds % 60;
        el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
}

function changePeople(delta) {
    const el = document.getElementById('bookPeople');
    if (!el) return;
    const next = Math.max(1, Math.min(20, (Number(el.value) || 1) + delta));
    el.value = next;
    updateLivePrice();
}

function changeChildren(delta) {
    const el = document.getElementById('bookChildren');
    if (!el) return;
    const next = Math.max(0, Math.min(10, (Number(el.value) || 0) + delta));
    el.value = next;
    updateLivePrice();
}

function autofillSavedTraveler() {
    const list = getSavedTravelers();
    if (!list.length) {
        alert('В личном кабинете пока нет сохранённых паспортов. Заполните поля — они сохранятся автоматически!');
        return;
    }
    const tr = list[0];
    const nameEl = document.getElementById('bookPassportName');
    const numEl  = document.getElementById('bookPassportNum');
    const dobEl  = document.getElementById('bookPassportDob');
    if (nameEl) nameEl.value = tr.fullName || '';
    if (numEl)  numEl.value  = tr.passport || tr.passportNum || '';
    if (dobEl && tr.birthDate) dobEl.value = tr.birthDate;
}

function addCommentTag(btn) {
    const area = document.getElementById('bookComment');
    if (!area) return;
    const txt = btn.textContent.trim();
    btn.classList.toggle('active');
    if (area.value && !area.value.includes(txt)) {
        area.value += ', ' + txt;
    } else if (!area.value) {
        area.value = txt;
    }
}

function applyPromoCode() {
    const input = document.getElementById('bookPromoInput');
    const msgEl = document.getElementById('promoStatusMsg');
    if (!input || !msgEl) return;

    const code = input.value.trim().toUpperCase();
    const promo = PROMO_CODES[code];
    if (!promo) {
        currentTourState.promoCode = '';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = '❌ Промокод не найден (доступны: TRAVEL10, WELCOME5, KASPI30)';
        updateLivePrice();
        return;
    }
    currentTourState.promoCode = code;
    msgEl.style.color = '#10b981';
    msgEl.textContent = `✅ Применён: ${getLang() === 'ru' ? promo.label_ru : promo.label_kz}`;
    updateLivePrice();
}

function calculateBookingBreakdown() {
    const tour = currentTourState.tour;
    if (!tour) return null;

    const adults   = Math.max(1, Number(document.getElementById('bookPeople')?.value) || 1);
    const children = Math.max(0, Number(document.getElementById('bookChildren')?.value) || 0);
    const totalGuests = adults + children;

    const unitPrice = currentTourState.selectedDatePrice || Number(tour.price);
    const baseCost  = (unitPrice * adults) + (Math.round(unitPrice * 0.5) * children);

    // Номер и класс перелёта
    const roomEl   = document.querySelector('input[name="customRoom"]:checked');
    const flightEl = document.querySelector('input[name="customFlight"]:checked');
    const roomAdd   = Number(roomEl?.dataset.price || 0) * totalGuests;
    const flightAdd = Number(flightEl?.dataset.price || 0) * totalGuests;
    const upgradesSum = roomAdd + flightAdd;

    // Развлечения и доп. услуги
    const activities = [];
    let entSum = 0;
    document.querySelectorAll('input[name="customEnt"]:checked').forEach(chk => {
        const p = Number(chk.dataset.price || 0) * totalGuests;
        entSum += p;
        activities.push(chk.dataset.title);
    });

    const services = [];
    document.querySelectorAll('input[name="customSrv"]:checked').forEach(chk => {
        const perP = chk.dataset.perPerson === '1';
        const p = Number(chk.dataset.price || 0) * (perP ? totalGuests : 1);
        entSum += p;
        services.push(chk.dataset.title);
    });

    const subTotal = baseCost + upgradesSum + entSum;

    // Скидка по промокоду
    let discount = 0;
    if (currentTourState.promoCode && PROMO_CODES[currentTourState.promoCode]) {
        const p = PROMO_CODES[currentTourState.promoCode];
        if (p.type === 'percent') discount = Math.round(subTotal * (p.value / 100));
        if (p.type === 'fixed')   discount = p.value;
    }

    const finalTotal = Math.max(50000, subTotal - discount);
    const payPlan = document.getElementById('bookPaymentPlan')?.value || 'full';
    const payNow  = payPlan === 'prepay' ? Math.round(finalTotal * 0.3) : finalTotal;
    const bonusEarned = Math.round(finalTotal * 0.05);

    return {
        tour,
        adults,
        children,
        totalGuests,
        unitPrice,
        baseCost,
        roomLabel: roomEl?.dataset.title || 'Standard Room',
        flightLabel: flightEl?.dataset.title || 'Эконом-класс',
        upgradesSum,
        activities,
        services,
        entSum,
        discount,
        finalTotal,
        payPlan,
        payNow,
        bonusEarned
    };
}

function updateLivePrice() {
    const info = calculateBookingBreakdown();
    if (!info) return;

    // Автоматический расчёт обратной даты
    const depInput = document.getElementById('bookDate');
    const retInput = document.getElementById('bookReturnDate');
    if (depInput && depInput.value && retInput) {
        const d = new Date(depInput.value + 'T12:00:00');
        if (!isNaN(d)) {
            d.setDate(d.getDate() + getTourDays(info.tour));
            retInput.value = d.toISOString().slice(0, 10);
        }
    }

    updateFlightDatesDisplay();

    const unitEl = document.getElementById('bookingUnitPrice');
    if (unitEl) unitEl.textContent = formatPrice(info.unitPrice);

    const formEl = document.getElementById('calcFormula');
    if (formEl) {
        formEl.textContent = `${formatPrice(info.unitPrice)} × ${info.adults} взр.${info.children > 0 ? ` + ${info.children} дет. (-50%)` : ''}`;
    }

    const baseEl = document.getElementById('calcBaseSum');
    if (baseEl) baseEl.textContent = formatPrice(info.baseCost);

    const upgRow = document.getElementById('calcUpgradesRow');
    const upgSum = document.getElementById('calcUpgradesSum');
    if (upgRow && upgSum) {
        upgRow.style.display = info.upgradesSum > 0 ? 'flex' : 'none';
        upgSum.textContent = '+' + formatPrice(info.upgradesSum);
    }

    const entRow = document.getElementById('calcEntRow');
    const entSum = document.getElementById('calcEntSum');
    if (entRow && entSum) {
        entRow.style.display = info.entSum > 0 ? 'flex' : 'none';
        entSum.textContent = '+' + formatPrice(info.entSum);
    }

    const prRow = document.getElementById('calcPromoRow');
    const prSum = document.getElementById('calcPromoSum');
    if (prRow && prSum) {
        prRow.style.display = info.discount > 0 ? 'flex' : 'none';
        prSum.textContent = '−' + formatPrice(info.discount);
    }

    const totalEl = document.getElementById('liveBookingPrice');
    if (totalEl) totalEl.textContent = formatPrice(info.finalTotal);

    const nowEl = document.getElementById('livePayNowPrice');
    if (nowEl) {
        nowEl.innerHTML = `${formatPrice(info.payNow)} <small style="display:block; font-size:11px; color:#0284c7;">🎁 +${info.bonusEarned.toLocaleString('ru-RU')} бонусов (5%)</small>`;
    }
}

async function handleCreateBooking(event) {
    event.preventDefault();
    const user = await getCurrentUser();
    const msgBox = document.getElementById('bookingMsg');

    if (!user) {
        if (msgBox) msgBox.innerHTML = `<div class="alert alert-error">${t('msg_need_login')}</div>`;
        setTimeout(() => { window.location.href = 'login.html'; }, 1000);
        return;
    }

    const info = calculateBookingBreakdown();
    if (!info) return;

    const depDate  = document.getElementById('bookDate').value;
    const retDate  = document.getElementById('bookReturnDate')?.value || '';
    const passName = document.getElementById('bookPassportName')?.value.trim() || user.name;
    const passNum  = document.getElementById('bookPassportNum')?.value.trim() || 'N12345678';
    const passDob  = document.getElementById('bookPassportDob')?.value || '1995-06-15';
    const comment  = document.getElementById('bookComment')?.value.trim() || '';

    // Сохраняем паспорт туриста в профиль
    saveTravelerProfile({
        fullName: passName,
        passport: passNum,
        birthDate: passDob,
        phone: user.phone || '+7 700 000 00 00'
    });

    const customOptionsObj = {
        roomLabel: info.roomLabel,
        flightLabel: info.flightLabel,
        activities: info.activities,
        services: info.services,
        paymentPlan: info.payPlan,
        passportName: passName,
        passportNumber: passNum,
        returnDate: retDate,
        promoCode: currentTourState.promoCode || '',
        bonusEarned: info.bonusEarned
    };

    const summaryComment = [
        `🛏 ${info.roomLabel}`,
        `✈️ ${info.flightLabel}`,
        info.activities.length ? `🎢 ${info.activities.join(', ')}` : '',
        info.services.length ? `🛡 ${info.services.join(', ')}` : '',
        `🛂 ${passName} (${passNum})`,
        comment
    ].filter(Boolean).join(' | ');

    const res = await addBooking({
        tourId: info.tour.id,
        clientId: user.id,
        date: depDate,
        people: info.totalGuests,
        comment: summaryComment,
        customTotal: info.finalTotal,
        customOptions: customOptionsObj
    });

    if (msgBox) {
        msgBox.innerHTML = `<div class="alert alert-success">✅ Бронь #TM-${res.id} создана! У вас есть 48 часов на оплату.</div>`;
    }

    // Открываем модальное окно оплаты с таймером 48 часов
    setTimeout(() => {
        openPaymentModal(res.id);
    }, 350);
}

function submitNewReview() {
    if (!currentTourState.canLeaveReview) {
        alert('Оставить отзыв можно только после окончания тура!');
        return;
    }
    const textEl = document.getElementById('newReviewText');
    const rateEl = document.getElementById('newReviewRating');
    if (!textEl || !textEl.value.trim() || !currentTourState.tour) return;

    addTourReview({
        tourId: currentTourState.tour.id,
        author: currentTourState.reviewAuthorName || 'Турист TravelMate',
        rating: Number(rateEl?.value || 5),
        text_ru: textEl.value.trim(),
        text_kz: textEl.value.trim()
    });
    textEl.value = '';
    renderTourPage();
}

function openVideoPreviewModal(tourTitle) {
    const root = getModalsContainer();
    root.innerHTML = `
        <div class="tm-modal-overlay" onclick="if(event.target===this) closeModals()">
            <div class="tm-modal-card tm-modal-wide">
                <div class="tm-modal-header">
                    <div>
                        <span class="badge badge-active">🎬 Видео-тур 4K Ultra HD</span>
                        <h3 style="margin-top:4px;">${tourTitle} — Панорамный видео-обзор отеля и пляжа</h3>
                    </div>
                    <button type="button" class="tm-modal-close" onclick="closeModals()">✕</button>
                </div>
                <div style="border-radius:14px; overflow:hidden; background:#000; aspect-ratio:16/9; position:relative;">
                    <video controls autoplay muted loop style="width:100%; height:100%; object-fit:cover;" poster="https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200">
                        <source src="https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-luxury-resort-by-the-sea-41474-large.mp4" type="video/mp4">
                    </video>
                </div>
                <div class="tm-modal-footer">
                    <button type="button" class="btn" onclick="closeModals()">Закрыть видео</button>
                </div>
            </div>
        </div>
    `;
}

/* ==========================================================
   6. МОДАЛЬНОЕ ОКНО ОНЛАЙН-ОПЛАТЫ (48 ЧАСОВ) И КАССЫ
   ========================================================== */

function getModalsContainer() {
    let box = document.getElementById('modalsContainer');
    if (!box) {
        box = document.createElement('div');
        box.id = 'modalsContainer';
        document.body.appendChild(box);
    }
    return box;
}

function closeModals() {
    if (modal48hIntervalId) clearInterval(modal48hIntervalId);
    const box = getModalsContainer();
    if (box) box.innerHTML = '';
}

async function openPaymentModal(bookingId) {
    const bookings = await getBookings();
    const booking = bookings.find(b => Number(b.id) === Number(bookingId));
    if (!booking) return;

    const tour = await getTourById(booking.tourId);
    const totalSum = Number(booking.total || booking.customTotal) || (tour ? tour.price * booking.people : 350000);
    const prepay30 = Math.round(totalSum * 0.3);
    const remain70 = totalSum - prepay30;
    const isPartial = booking.paymentStatus === 'partial';
    const remInfo = getRemaining48h(booking);

    const root = getModalsContainer();
    root.innerHTML = `
        <div class="tm-modal-overlay" onclick="if(event.target===this) closeModals()">
            <div class="tm-modal-card">
                <div class="tm-modal-header">
                    <div>
                        <span class="badge badge-accepted">🔒 Защищённый шлюз TravelMate Pay</span>
                        <h3 style="margin-top:6px;">Оплата бронирования #TM-${booking.id}</h3>
                    </div>
                    <button type="button" class="tm-modal-close" onclick="closeModals()">✕</button>
                </div>

                <!-- Живой таймер 48 часов -->
                <div class="pay-timer-banner">
                    <div>
                        <b>⏳ Время на оплату брони (48 часов):</b>
                        <div style="font-size:12px; opacity:0.9;">Цена и места в отеле зафиксированы за вами</div>
                    </div>
                    <div class="pay-countdown-clock" id="modal48hTimer">${remInfo.clock}</div>
                </div>

                <div class="pay-tour-summary">
                    <div><b>🏖 Тур:</b> ${tour ? getTourTitle(tour) : booking.tourTitle} · <b>Вылет:</b> ${booking.date} · <b>Туристов:</b> ${booking.people} чел.</div>
                    ${formatCustomOptionsHtml(booking.customOptions || booking.comment)}
                </div>

                <!-- Выбор: 100% оплата или 30% предоплата -->
                <div style="margin:14px 0;">
                    ${isPartial ? `
                        <label class="custom-radio-card">
                            <input type="radio" name="modalPayPlan" value="full" data-sum="${remain70}" checked onchange="syncModalPaySum()">
                            <div class="custom-radio-body">
                                <b>Доплата остатка 70% по туру</b>
                                <span class="price">${formatPrice(remain70)}</span>
                            </div>
                        </label>
                    ` : `
                        <div class="config-options-grid" style="grid-template-columns:1fr 1fr;">
                            <label class="custom-radio-card">
                                <input type="radio" name="modalPayPlan" value="full" data-sum="${totalSum}" checked onchange="syncModalPaySum()">
                                <div class="custom-radio-body">
                                    <b>💯 Полная оплата 100%</b>
                                    <span class="price" style="font-size:16px;">${formatPrice(totalSum)}</span>
                                </div>
                            </label>
                            <label class="custom-radio-card">
                                <input type="radio" name="modalPayPlan" value="prepay" data-sum="${prepay30}" onchange="syncModalPaySum()">
                                <div class="custom-radio-body">
                                    <b>⏳ Предоплата 30% сейчас</b>
                                    <span class="price" style="font-size:16px;">${formatPrice(prepay30)}</span>
                                    <small class="muted">Доплата ${formatPrice(remain70)} до вылета</small>
                                </div>
                            </label>
                        </div>
                    `}
                </div>

                <!-- Способы оплаты -->
                <h4 style="font-size:14px; margin-bottom:8px;">Выберите способ оплаты:</h4>
                <div class="pay-methods-tabs">
                    <button type="button" class="pay-method-tab active" data-method="Kaspi QR / Kaspi.kz" onclick="switchPayTab(this, 'kaspi')">📱 Kaspi QR / Kaspi.kz</button>
                    <button type="button" class="pay-method-tab" data-method="Карта Visa / MasterCard" onclick="switchPayTab(this, 'card')">💳 Банковская карта</button>
                    <button type="button" class="pay-method-tab" data-method="Рассрочка 0-0-12" onclick="switchPayTab(this, 'installment')">🗓 Рассрочка 0-0-12</button>
                    <button type="button" class="pay-method-tab" data-method="Apple Pay / Google Pay" onclick="switchPayTab(this, 'apple')">🍏 Apple / Google Pay</button>
                </div>

                <div id="payTabContent" class="pay-method-body">
                    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                        <svg viewBox="0 0 100 100" width="92" height="92" style="background:#fff; padding:6px; border-radius:10px; border:2px solid #e11d48;">
                            <rect x="8" y="8" width="26" height="26" fill="#e11d48"/>
                            <rect x="13" y="13" width="16" height="16" fill="#fff"/>
                            <rect x="17" y="17" width="8" height="8" fill="#e11d48"/>
                            <rect x="66" y="8" width="26" height="26" fill="#e11d48"/>
                            <rect x="71" y="13" width="16" height="16" fill="#fff"/>
                            <rect x="75" y="17" width="8" height="8" fill="#e11d48"/>
                            <rect x="8" y="66" width="26" height="26" fill="#e11d48"/>
                            <rect x="13" y="71" width="16" height="16" fill="#fff"/>
                            <rect x="17" y="75" width="8" height="8" fill="#e11d48"/>
                            <rect x="40" y="40" width="20" height="20" fill="#111"/>
                            <rect x="44" y="14" width="14" height="16" fill="#111"/>
                            <rect x="14" y="44" width="18" height="10" fill="#111"/>
                            <rect x="68" y="44" width="20" height="12" fill="#111"/>
                            <rect x="44" y="70" width="44" height="18" fill="#e11d48"/>
                        </svg>
                        <div style="flex:1;">
                            <b style="color:#e11d48;">Мгновенная оплата через приложение Kaspi.kz</b>
                            <p class="muted" style="font-size:13px; margin:4px 0 8px;">Отсканируйте QR-код или укажите номер Kaspi для выставления счёта:</p>
                            <input type="tel" value="${booking.clientPhone || '+7 700 000 00 03'}" style="padding:8px 12px;">
                        </div>
                    </div>
                </div>

                <div id="modalPayResultMsg" style="margin-top:10px;"></div>

                <div class="tm-modal-footer">
                    <button type="button" class="btn btn-outline" onclick="closeModals()">Оплатить позже (48ч)</button>
                    <button type="button" class="btn" onclick="confirmBookingPayment(${booking.id})">
                        💳 Оплатить сейчас — <span id="modalPayNowSum">${formatPrice(isPartial ? remain70 : totalSum)}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    if (modal48hIntervalId) clearInterval(modal48hIntervalId);
    modal48hIntervalId = setInterval(() => {
        const el = document.getElementById('modal48hTimer');
        if (!el) {
            clearInterval(modal48hIntervalId);
            return;
        }
        el.textContent = getRemaining48h(booking).clock;
    }, 1000);
}

function syncModalPaySum() {
    const r = document.querySelector('input[name="modalPayPlan"]:checked');
    const el = document.getElementById('modalPayNowSum');
    if (r && el) el.textContent = formatPrice(Number(r.dataset.sum || 0));
}

function switchPayTab(btn, mode) {
    document.querySelectorAll('.pay-method-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const box = document.getElementById('payTabContent');
    if (!box) return;

    const r = document.querySelector('input[name="modalPayPlan"]:checked');
    const sum = Number(r?.dataset.sum || 350000);

    if (mode === 'card') {
        box.innerHTML = `
            <div style="display:grid; gap:10px;">
                <div>
                    <label style="margin-bottom:4px;">Номер карты (Visa / MasterCard)</label>
                    <input type="text" value="4400 4301 8892 4011" maxlength="19">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div>
                        <label style="margin-bottom:4px;">Срок действия</label>
                        <input type="text" value="09/29" maxlength="5">
                    </div>
                    <div>
                        <label style="margin-bottom:4px;">CVV / CVC</label>
                        <input type="password" value="777" maxlength="3">
                    </div>
                </div>
            </div>
        `;
    } else if (mode === 'installment') {
        box.innerHTML = `
            <div>
                <b style="color:#0284c7;">🗓 Рассрочка 0-0-12 без переплаты (Kaspi / Halyk)</b>
                <p class="muted" style="font-size:13px; margin:6px 0;">Ежемесячный платёж: <b style="color:var(--text);">${formatPrice(Math.round(sum / 12))} / мес. × 12 мес.</b> (переплата 0 ₸)</p>
                <input type="text" placeholder="ИИН (12 цифр)" value="960514300128" maxlength="12">
            </div>
        `;
    } else if (mode === 'apple') {
        box.innerHTML = `
            <div style="text-align:center; padding:10px;">
                <div style="font-size:26px;">🍏 / 🤖</div>
                <b>Бесконтактная оплата Apple Pay / Google Pay</b>
                <p class="muted" style="font-size:13px; margin-top:4px;">Подтверждение через Touch ID / Face ID при нажатии кнопки оплаты.</p>
            </div>
        `;
    }
}

async function confirmBookingPayment(bookingId) {
    const r = document.querySelector('input[name="modalPayPlan"]:checked');
    const plan = r ? r.value : 'full';
    const tab = document.querySelector('.pay-method-tab.active');
    const method = tab ? tab.dataset.method : 'Kaspi QR';

    await payBooking(bookingId, method, plan);

    const resBox = document.getElementById('modalPayResultMsg');
    if (resBox) {
        resBox.innerHTML = `
            <div class="alert alert-success" style="margin-bottom:0;">
                ✅ Оплата успешно проведена (${method})! Электронный чек сформирован.
                <div style="margin-top:8px;">
                    <button type="button" class="btn btn-small" onclick="openVoucherModal(${bookingId})">🎫 Открыть QR-Ваучер и скачать PDF-документы</button>
                </div>
            </div>
        `;
    }

    const page = document.body.dataset.page;
    if (page === 'client') await renderClient();
    if (page === 'agency') await renderAgency();
    if (page === 'admin')  await renderAdmin();
}

/* ==========================================================
   7. ДОКУМЕНТЫ И БИЛЕТЫ: QR-КОД ВАУЧЕРА, PDF (ВАУЧЕР, ДОГОВОР,
      СТРАХОВКА, МАРШРУТНАЯ КВИТАНЦИЯ) + WHATSAPP / TELEGRAM / EMAIL
   ========================================================== */

async function openVoucherModal(bookingId, docTab = 'voucher') {
    const bookings = await getBookings();
    const booking = bookings.find(b => Number(b.id) === Number(bookingId));
    if (!booking) return;

    const tour = await getTourById(booking.tourId) || (await getTours())[0];
    const totalSum = Number(booking.total || booking.customTotal) || (tour ? tour.price * booking.people : 350000);
    const ticketCode = `TM-2026-${String(booking.id).padStart(4, '0')}`;
    const fl = tour.flight || {};

    const payStatusText = booking.paymentStatus === 'paid'
        ? `✅ ОПЛАЧЕНО (${booking.paymentMethod || 'Онлайн'})`
        : booking.paymentStatus === 'partial'
        ? `💳 ЧАСТИЧНО ОПЛАЧЕНО (30% Предоплата)`
        : `⏳ РЕЗЕРВ 48 ЧАСОВ (Ожидает оплаты)`;

    let sheetHtml = '';
    if (docTab === 'voucher') {
        sheetHtml = `
            <div class="voucher-print-sheet">
                <div class="voucher-top-bar">
                    <div>
                        <h2 style="margin:0; color:#0284c7;">TRAVELMATE OFFICIAL VOUCHER</h2>
                        <small class="muted">Туристический ваучер, бронь отеля и посадочный QR-код</small>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:800; font-size:18px;">${ticketCode}</div>
                        <span class="badge badge-accepted">${payStatusText}</span>
                    </div>
                </div>
                <div class="voucher-qr-row">
                    <div class="voucher-details-col">
                        <p><b>👤 Турист / Заказчик:</b> ${booking.clientName} (${booking.clientPhone || '+7 700 000 00 03'})</p>
                        <p><b>🏖 Тур и отель:</b> ${getTourTitle(tour)} — ${tour.hotel || '5* Resort'}</p>
                        <p><b>📅 Дата вылета:</b> ${booking.date} (${getTourDays(tour)} дн.) · <b>Туристов:</b> ${booking.people} чел.</p>
                        <p><b>🍽 Питание:</b> ${getTourMeal(tour)}</p>
                        <p><b>✈️ Вылет туда:</b> ${fl.airline || 'Air Astana'} · Рейс <b>${fl.flightNoOut || 'KC 915'}</b> (${fl.depTimeOut || '06:45'} → ${fl.arrTimeOut || '09:40'}) — ${fl.layover_ru || 'Прямой рейс'}</p>
                        <p><b>✈️ Вылет обратно:</b> Рейс <b>${fl.flightNoBack || 'KC 916'}</b> (${fl.depTimeBack || '11:20'} → ${fl.arrTimeBack || '17:55'})</p>
                        ${formatCustomOptionsHtml(booking.customOptions || booking.comment)}
                        <p style="margin-top:8px; font-size:16px;"><b>💰 Итоговая сумма:</b> <span class="price">${formatPrice(totalSum)}</span></p>
                    </div>
                    <div class="voucher-qr-col">
                        <svg viewBox="0 0 120 120" width="135" height="135" style="background:#fff; padding:6px; border:2px solid #0284c7; border-radius:10px;">
                            <rect width="120" height="120" fill="#fff"/>
                            <rect x="8" y="8" width="30" height="30" fill="#0f172a"/>
                            <rect x="13" y="13" width="20" height="20" fill="#fff"/>
                            <rect x="18" y="18" width="10" height="10" fill="#0284c7"/>
                            <rect x="82" y="8" width="30" height="30" fill="#0f172a"/>
                            <rect x="87" y="13" width="20" height="20" fill="#fff"/>
                            <rect x="92" y="18" width="10" height="10" fill="#0284c7"/>
                            <rect x="8" y="82" width="30" height="30" fill="#0f172a"/>
                            <rect x="13" y="87" width="20" height="20" fill="#fff"/>
                            <rect x="18" y="92" width="10" height="10" fill="#0284c7"/>
                            <rect x="46" y="44" width="28" height="28" fill="#0284c7"/>
                            <rect x="54" y="52" width="12" height="12" fill="#fff"/>
                            <rect x="46" y="12" width="12" height="20" fill="#0f172a"/>
                            <rect x="12" y="48" width="24" height="12" fill="#0f172a"/>
                            <rect x="82" y="48" width="26" height="12" fill="#0f172a"/>
                            <rect x="48" y="82" width="58" height="14" fill="#0f172a"/>
                        </svg>
                        <div style="font-weight:800; font-size:12px; margin-top:6px;">${ticketCode}</div>
                        <small class="muted">QR-код для гида и отеля</small>
                    </div>
                </div>
            </div>
        `;
    } else if (docTab === 'ticket') {
        sheetHtml = `
            <div class="voucher-print-sheet">
                <h3 style="color:#0284c7; margin-bottom:10px;">✈️ МАРШРУТНАЯ КВИТАНЦИЯ ЭЛЕКТРОННОГО АВИАБИЛЕТА (E-TICKET)</h3>
                <p><b>Код бронирования PNR:</b> <span class="badge badge-accepted">TM7K9X</span> · <b>Номер билета:</b> ${ticketCode}</p>
                <p><b>Пассажир:</b> ${booking.clientName} (${booking.people} чел.) · <b>Багаж:</b> ${fl.baggage_ru || '23 кг + 8 кг ручная кладь'}</p>
                <hr style="margin:10px 0; border:none; border-top:1px solid var(--border);">
                <p><b>🛫 РЕЙС ТУДА (${booking.date}):</b> ${fl.airline || 'Air Astana'} · <b>${fl.flightNoOut || 'KC 915'}</b></p>
                <p>Вылет: <b>${fl.depTimeOut || '06:45'} (${fl.fromCity_ru || 'Алматы'})</b> → Прилёт: <b>${fl.arrTimeOut || '09:40'} (${fl.toCity_ru || ''})</b></p>
                <p style="color:#d97706;"><b>Пересадки:</b> ${fl.layover_ru || 'Прямой рейс без пересадок'}</p>
                <hr style="margin:10px 0; border:none; border-top:1px solid var(--border);">
                <p><b>🛬 РЕЙС ОБРАТНО:</b> ${fl.airline || 'Air Astana'} · <b>${fl.flightNoBack || 'KC 916'}</b> (${fl.depTimeBack || '11:20'} → ${fl.arrTimeBack || '17:55'})</p>
            </div>
        `;
    } else if (docTab === 'insurance') {
        sheetHtml = `
            <div class="voucher-print-sheet">
                <h3 style="color:#10b981; margin-bottom:10px;">🛡 СТРАХОВОЙ МЕДИЦИНСКИЙ ПОЛИС № INS-${ticketCode}</h3>
                <p><b>Застрахованный:</b> ${booking.clientName} (${booking.people} чел.)</p>
                <p><b>Страна пребывания:</b> ${getTourCountry(tour)} (Worldwide)</p>
                <p><b>Страховая сумма:</b> <b>50 000 EUR</b> (медицинская помощь, госпитализация, защита от невылета)</p>
                <p><b>Ассистанс 24/7 (WhatsApp / Телефон):</b> +7 (727) 000-00-00</p>
            </div>
        `;
    } else {
        sheetHtml = `
            <div class="voucher-print-sheet">
                <h3 style="color:#0284c7; margin-bottom:10px;">📄 ДОГОВОР-ОФЕРТА И ЭЛЕКТРОННЫЙ ФИСКАЛЬНЫЙ ЧЕК № ${ticketCode}</h3>
                <p><b>Исполнитель:</b> ТОО «TravelMate Kazakhstan», г. Алматы, пр. Абая, 10</p>
                <p><b>Заказчик:</b> ${booking.clientName} (${booking.clientPhone || ''})</p>
                <p><b>Турпродукт:</b> ${getTourTitle(tour)}, вылет ${booking.date}, туристов: ${booking.people}</p>
                ${formatCustomOptionsHtml(booking.customOptions || booking.comment)}
                <p style="margin-top:8px;"><b>Сумма по договору:</b> <b>${formatPrice(totalSum)}</b> · <b>Статус оплаты:</b> ${payStatusText}</p>
            </div>
        `;
    }

    const shareTxt = encodeURIComponent(`Мой электронный ваучер TravelMate ${ticketCode}: ${getTourTitle(tour)}, вылет ${booking.date}, сумма ${formatPrice(totalSum)}`);
    const root = getModalsContainer();

    root.innerHTML = `
        <div class="tm-modal-overlay" onclick="if(event.target===this) closeModals()">
            <div class="tm-modal-card tm-modal-wide">
                <div class="tm-modal-header">
                    <div>
                        <span class="badge badge-active">🎫 Пакет документов ${ticketCode}</span>
                        <h3 style="margin-top:4px;">Электронные билеты, QR-ваучер и PDF-документы</h3>
                    </div>
                    <button type="button" class="tm-modal-close" onclick="closeModals()">✕</button>
                </div>

                <div class="pay-methods-tabs" style="margin-bottom:14px;">
                    <button type="button" class="pay-method-tab ${docTab === 'voucher' ? 'active' : ''}" onclick="openVoucherModal(${booking.id}, 'voucher')">🎫 QR-Ваучер</button>
                    <button type="button" class="pay-method-tab ${docTab === 'ticket' ? 'active' : ''}" onclick="openVoucherModal(${booking.id}, 'ticket')">✈️ Маршрутная квитанция</button>
                    <button type="button" class="pay-method-tab ${docTab === 'insurance' ? 'active' : ''}" onclick="openVoucherModal(${booking.id}, 'insurance')">🛡 Страховка</button>
                    <button type="button" class="pay-method-tab ${docTab === 'contract' ? 'active' : ''}" onclick="openVoucherModal(${booking.id}, 'contract')">📄 Договор и Чек</button>
                </div>

                ${sheetHtml}

                <div class="tm-modal-footer" style="justify-content:space-between; flex-wrap:wrap;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <a href="https://wa.me/?text=${shareTxt}" target="_blank" class="btn btn-outline btn-small">🟢 В WhatsApp</a>
                        <a href="https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${shareTxt}" target="_blank" class="btn btn-outline btn-small">🔵 В Telegram</a>
                        <button type="button" class="btn btn-outline btn-small" onclick="alert('PDF-документы (ваучер, авиабилет, страховка и чек) отправлены на ваш Email!')">✉️ На Email</button>
                    </div>
                    <button type="button" class="btn" onclick="window.print()">🖨 Скачать PDF / Печать</button>
                </div>
            </div>
        </div>
    `;
}

/* ==========================================================
   8. ЛИЧНЫЙ КАБИНЕТ КЛИЕНТА (client.html)
   ========================================================== */

function getPaymentCellHtml(b) {
    if (b.status === 'cancelled' || b.paymentStatus === 'refund' || b.paymentStatus === 'refunded') {
        return `<span class="badge badge-rejected">↩️ Возврат оформлен</span>`;
    }
    if (b.paymentStatus === 'paid') {
        return `<span class="badge badge-accepted">✅ Оплачено</span><div class="muted" style="font-size:11px;">${b.paymentMethod || 'Онлайн'}</div>`;
    }
    if (b.paymentStatus === 'partial') {
        const rem = getRemaining48h(b);
        return `<span class="badge badge-pending">💳 Частично (30%)</span><div class="timer-pill-48h">⏳ Доплата: ${rem.short}</div>`;
    }
    const rem = getRemaining48h(b);
    return `
        <span class="badge badge-pending">⏳ Не оплачено</span>
        <div class="timer-pill-48h">⏰ Осталось: <b>${rem.clock}</b></div>
    `;
}

async function renderClient() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = `${user.name} (${user.email})`;

    const allBookings = await getBookings();
    const myBookings = allBookings.filter(b => Number(b.clientId) === Number(user.id));

    // 1. Уведомления (Email/SMS/Push: подтверждение, напоминание об оплате 48ч, вылет за 24ч, рейс)
    const notifBox = document.getElementById('clientNotificationsList');
    if (notifBox) {
        const items = [];
        for (const b of myBookings) {
            const tour = await getTourById(b.tourId);
            const tTitle = tour ? getTourTitle(tour) : (b.tourTitle || 'Тур');
            if (b.paymentStatus === 'unpaid' && b.status !== 'cancelled') {
                const rem = getRemaining48h(b);
                items.push(`
                    <div class="notif-item">
                        <div class="notif-icon">⏰</div>
                        <div style="flex:1;">
                            <b>Напоминание об оплате брони #TM-${b.id} (${tTitle})</b>
                            <p class="muted" style="font-size:13px; margin:2px 0 0;">Места удерживаются за вами. Осталось <b>${rem.clock}</b> из 48 часов для внесения оплаты или предоплаты 30%.</p>
                        </div>
                        <button class="btn btn-small" onclick="openPaymentModal(${b.id})">Оплатить</button>
                    </div>
                `);
            }
            if (tour && tour.flight) {
                items.push(`
                    <div class="notif-item">
                        <div class="notif-icon">✈️</div>
                        <div>
                            <b>Информация о рейсе (за 24 часа до вылета): ${tour.flight.airline} (${tour.flight.flightNoOut})</b>
                            <p class="muted" style="font-size:13px; margin:2px 0 0;">Дата вылета: <b>${b.date} в ${tour.flight.depTimeOut}</b>. ${tour.flight.layover_ru}. Статус рейса: По расписанию (без изменений).</p>
                        </div>
                    </div>
                `);
            }
        }
        if (!items.length) {
            items.push(`
                <div class="notif-item">
                    <div class="notif-icon">🔔</div>
                    <div>
                        <b>Уведомления Email / SMS / Push подключены</b>
                        <p class="muted" style="font-size:13px; margin:2px 0 0;">Вы будете получать мгновенные оповещения о подтверждении брони, напоминания об оплате и открытии регистрации за 24ч до вылета.</p>
                    </div>
                </div>
            `);
        }
        notifBox.innerHTML = items.join('');
    }

    // 2. Таблица моих бронирований
    const tbody = document.getElementById('clientBookings');
    if (tbody) {
        if (myBookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty">${t('no_bookings')}</td></tr>`;
        } else {
            const rowsHtml = [];
            for (const b of myBookings) {
                const tour = await getTourById(b.tourId);
                const title = tour ? getTourTitle(tour) : (b.tourTitle || 'Тур #' + b.tourId);
                const totalSum = Number(b.total || b.customTotal) || (tour ? tour.price * b.people : 0);

                const statusBadge = `<span class="badge badge-${b.status}">${t('status_' + b.status)}</span>`;
                const payHtml = getPaymentCellHtml(b);

                const btns = [];
                if (b.status !== 'cancelled' && b.status !== 'rejected') {
                    if (b.paymentStatus !== 'paid') {
                        btns.push(`<button type="button" class="btn btn-small" onclick="openPaymentModal(${b.id})"><img src="images/card.png" alt="" class="btn-icon-sm"> ${t('btn_pay_now')}</button>`);
                    }
                    btns.push(`<button type="button" class="btn btn-outline btn-small" onclick="openVoucherModal(${b.id})"><img src="images/qr.png" alt="" class="btn-icon-sm"> ${t('btn_voucher')}</button>`);
                    btns.push(`<button type="button" class="btn btn-outline btn-small" onclick="changeBookingDatePrompt(${b.id}, '${b.date}')"><img src="images/edit.png" alt="" class="btn-icon-sm"> ${t('btn_edit')}</button>`);
                    btns.push(`<button type="button" class="btn btn-danger btn-small" onclick="cancelClientBooking(${b.id})"><img src="images/delete.png" alt="" class="btn-icon-sm"> ${t('btn_cancel')}</button>`);
                } else {
                    btns.push(`<span class="muted">${t('status_cancelled')}</span>`);
                }

                rowsHtml.push(`
                    <tr>
                        <td>
                            <b>${title}</b>
                            <div class="muted" style="font-size:12px;">📅 Вылет: ${b.date} · 👥 ${b.people} чел.</div>
                            <div class="muted" style="font-size:11px;">Код: <b>TM-2026-${String(b.id).padStart(4, '0')}</b></div>
                        </td>
                        <td>${formatCustomOptionsHtml(b.customOptions || b.comment)}</td>
                        <td><b>${formatPrice(totalSum)}</b></td>
                        <td>${statusBadge}</td>
                        <td>${payHtml}</td>
                        <td><div style="display:flex; gap:6px; flex-wrap:wrap;">${btns.join('')}</div></td>
                    </tr>
                `);
            }
            tbody.innerHTML = rowsHtml.join('');
        }
    }

    // 3. Сохранённые паспортные профили туристов (изолированно для текущего аккаунта)
    window._currentClientUser = user;
    const accEmailEl = document.getElementById('savedTravelersAccountEmail');
    if (accEmailEl) accEmailEl.textContent = user.email || user.name;

    renderSavedTravelersBox(user);
    const profForm = document.getElementById('travelerProfileForm');
    if (profForm && !profForm.dataset.bound) {
        profForm.addEventListener('submit', e => {
            e.preventDefault();
            saveTravelerProfile({
                fullName: document.getElementById('profFullName').value.trim(),
                passport: document.getElementById('profPassport').value.trim(),
                birthDate: document.getElementById('profDob').value,
                phone: document.getElementById('profPhone').value.trim()
            }, window._currentClientUser);
            profForm.reset();
            renderSavedTravelersBox(window._currentClientUser);
        });
        profForm.dataset.bound = '1';
    }

    // 4. Избранные туры
    const favGrid = document.getElementById('clientFavoritesGrid');
    if (favGrid) {
        const favIds = getFavorites();
        const allTours = await getTours();
        const favTours = allTours.filter(tr => favIds.includes(Number(tr.id)));
        if (!favTours.length) {
            favGrid.innerHTML = `<div class="empty">В избранном пока нет туров. Нажмите ❤️ на любом туре в каталоге!</div>`;
        } else {
            favGrid.innerHTML = favTours.map(tourCard).join('');
        }
    }
}

function renderSavedTravelersBox(explicitUser) {
    const box = document.getElementById('savedTravelersList');
    if (!box) return;
    const user = explicitUser || window._currentClientUser || getCurrentUserSync();
    const list = getSavedTravelers(user);
    if (!list.length) {
        box.innerHTML = `<div class="muted" style="margin-bottom:10px;">У вашего аккаунта (${user?.email || 'клиент'}) пока нет сохранённых паспортов. Добавьте свои данные ниже!</div>`;
        return;
    }
    box.innerHTML = list.map(tr => `
        <div class="notif-item" style="justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
                <b>🛂 ${tr.fullName}</b>
                <span class="badge badge-accepted" style="margin-left:6px; font-size:11px;">🔒 Личный профиль (${tr.userEmail || user?.email || ''})</span>
                <div class="muted" style="font-size:12px; margin-top:2px;">Паспорт: <b>${tr.passport || tr.passportNum}</b> · Дата рожд.: ${tr.birthDate || '—'} · Тел.: ${tr.phone || '—'}</div>
            </div>
            <button type="button" class="btn btn-danger btn-small" onclick="deleteTravelerProfile(${tr.id}); renderSavedTravelersBox();" title="${t('btn_delete')}">
                <img src="images/delete.png" alt="Удалить" class="btn-icon-sm">
            </button>
        </div>
    `).join('');
}

async function renderStaffTravelersTable(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const allList = await getAllTravelersForStaff();
    if (!allList.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">Пока нет сохранённых паспортов клиентов</td></tr>`;
        return;
    }
    tbody.innerHTML = allList.map(tr => `
        <tr>
            <td>
                <b>👤 ${tr.userName || 'Клиент'}</b>
                <div class="muted" style="font-size:12px;">✉️ ${tr.userEmail || '—'}</div>
            </td>
            <td><b>🛂 ${tr.fullName}</b></td>
            <td><span class="badge badge-accepted" style="font-size:12.5px;">${tr.passport}</span></td>
            <td>${tr.birthDate || '—'}</td>
            <td>${tr.phone || '—'}</td>
            <td>
                <button type="button" class="btn btn-danger btn-small" onclick="handleDeleteStaffTraveler(${tr.id}, '${tbodyId}')" title="${t('btn_delete')}">
                    <img src="images/delete.png" alt="Удалить" class="btn-icon-sm">
                </button>
            </td>
        </tr>
    `).join('');
}

async function handleDeleteStaffTraveler(id, tbodyId) {
    deleteTravelerProfile(id);
    await renderStaffTravelersTable(tbodyId);
}

async function changeBookingDatePrompt(bookingId, currentDate) {
    const newDate = prompt('Введите новую желаемую дату вылета (ГГГГ-ММ-ДД):', currentDate);
    if (!newDate || newDate === currentDate) return;
    const list = load(KEYS.bookings);
    const b = list.find(item => Number(item.id) === Number(bookingId));
    if (b) {
        b.date = newDate;
        save(KEYS.bookings, list);
    }
    alert(`Дата вылета по брони #TM-${bookingId} успешно изменена на ${newDate}!`);
    await renderClient();
}

async function cancelClientBooking(bookingId) {
    await setBookingStatus(bookingId, 'cancelled');
    await renderClient();
}

/* ==========================================================
   9. КАБИНЕТ ТУРАГЕНТСТВА (agency.html)
   ========================================================== */

async function renderAgency() {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'agency' && user.role !== 'admin')) {
        window.location.href = 'login.html';
        return;
    }

    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = user.name;

    const allTours = await getTours();
    const myTours = user.role === 'admin'
        ? allTours
        : allTours.filter(t => Number(t.agencyId) === Number(user.id) || user.email === 'agency@travelmate.kz');

    const allBookings = await getBookings();
    const myTourIds = myTours.map(t => Number(t.id));
    const myBookings = (user.role === 'admin' || user.email === 'agency@travelmate.kz')
        ? allBookings
        : allBookings.filter(b => myTourIds.includes(Number(b.tourId)));

    // 1. Таблица заявок клиентов (#agencyRequests)
    const reqBox = document.getElementById('agencyRequests');
    if (reqBox) {
        if (!myBookings.length) {
            reqBox.innerHTML = `<tr><td colspan="8" class="empty">${t('no_bookings')}</td></tr>`;
        } else {
            const rows = [];
            for (const b of myBookings) {
                const tour = await getTourById(b.tourId);
                const title = tour ? getTourTitle(tour) : (b.tourTitle || 'Тур #' + b.tourId);
                const totalSum = Number(b.total || b.customTotal) || (tour ? tour.price * b.people : 0);

                rows.push(`
                    <tr>
                        <td>
                            <b>${b.clientName}</b>
                            <div class="muted" style="font-size:12px;">📞 ${b.clientPhone || '+7 700 000 00 03'}</div>
                            <div class="muted" style="font-size:11px;">Код: #TM-${b.id}</div>
                        </td>
                        <td>
                            <b>${title}</b>
                            <div class="muted" style="font-size:12px;">📅 ${b.date}</div>
                        </td>
                        <td>${b.people} чел.</td>
                        <td>${formatCustomOptionsHtml(b.customOptions || b.comment)}</td>
                        <td><b>${formatPrice(totalSum)}</b></td>
                        <td>${getPaymentCellHtml(b)}</td>
                        <td><span class="badge badge-${b.status}">${t('status_' + b.status)}</span></td>
                        <td>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <button type="button" class="btn btn-small" onclick="handleAgencyBookingStatus(${b.id}, 'accepted')"><img src="images/check.png" alt="" class="btn-icon-sm"> ${t('btn_accept')}</button>
                                <button type="button" class="btn btn-danger btn-small" onclick="handleAgencyBookingStatus(${b.id}, 'rejected')"><img src="images/delete.png" alt="" class="btn-icon-sm"> ${t('btn_reject')}</button>
                                <button type="button" class="btn btn-outline btn-small" onclick="openVoucherModal(${b.id})"><img src="images/qr.png" alt="" class="btn-icon-sm"> QR</button>
                            </div>
                        </td>
                    </tr>
                `);
            }
            reqBox.innerHTML = rows.join('');
        }
    }

    // 1.5. База сохранённых паспортных данных всех клиентов (доступна Турагентству и Админу)
    await renderStaffTravelersTable('agencyTravelersTable');

    // 2. Таблица туров агентства (#agencyTours)
    const toursBox = document.getElementById('agencyTours');
    if (toursBox) {
        toursBox.innerHTML = myTours.map(tour => `
            <tr>
                <td>
                    <b>${getTourTitle(tour)}</b>
                    <div style="margin-top:4px;">${getSeatsBadge(tour)} ${getFlightBadge(tour)}</div>
                </td>
                <td>${getTourCountry(tour)}</td>
                <td>${getTourDays(tour)} ${t('days')}</td>
                <td><b>${formatPrice(tour.price)}</b></td>
                <td>
                    <button type="button" class="btn btn-outline btn-small" onclick="editAgencyTour(${tour.id})"><img src="images/edit.png" alt="" class="btn-icon-sm"> ${t('btn_edit')}</button>
                    <button type="button" class="btn btn-danger btn-small" onclick="deleteAgencyTour(${tour.id})"><img src="images/delete.png" alt="" class="btn-icon-sm"> ${t('btn_delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    // 3. Форма добавления/редактирования тура
    const form = document.getElementById('tourForm');
    if (form && !form.dataset.bound) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const editId = document.getElementById('tourId').value;
            const payload = {
                agencyId: user.id,
                title: document.getElementById('tourTitle').value.trim(),
                title_ru: document.getElementById('tourTitle').value.trim(),
                country: document.getElementById('tourCountry').value.trim(),
                country_ru: document.getElementById('tourCountry').value.trim(),
                days: Number(document.getElementById('tourDays').value) || 7,
                price: Number(document.getElementById('tourPrice').value) || 300000,
                image: document.getElementById('tourImage').value.trim() || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
                description: document.getElementById('tourDescription').value.trim(),
                description_ru: document.getElementById('tourDescription').value.trim()
            };
            if (editId) {
                await updateTour(Number(editId), payload);
            } else {
                await addTour(payload);
            }
            resetTourForm();
            await renderAgency();
        });
        form.dataset.bound = '1';
    }
}

async function handleAgencyBookingStatus(id, status) {
    await setBookingStatus(id, status);
    const page = document.body.dataset.page;
    if (page === 'agency') await renderAgency();
    if (page === 'admin')  await renderAdmin();
}

async function editAgencyTour(id) {
    const tour = await getTourById(id);
    if (!tour) return;
    document.getElementById('tourId').value          = tour.id;
    document.getElementById('tourTitle').value       = getTourTitle(tour);
    document.getElementById('tourCountry').value     = getTourCountry(tour);
    document.getElementById('tourDays').value        = getTourDays(tour);
    document.getElementById('tourPrice').value       = tour.price;
    document.getElementById('tourImage').value       = tour.image;
    document.getElementById('tourDescription').value = getTourDesc(tour);
    window.scrollTo({ top: document.getElementById('tourForm').offsetTop - 80, behavior: 'smooth' });
}

function resetTourForm() {
    const form = document.getElementById('tourForm');
    if (form) form.reset();
    const idEl = document.getElementById('tourId');
    if (idEl) idEl.value = '';
}

async function deleteAgencyTour(id) {
    await deleteTour(id);
    const page = document.body.dataset.page;
    if (page === 'agency') await renderAgency();
    if (page === 'admin')  await renderAdmin();
}

/* ==========================================================
   10. АДМИН-ПАНЕЛЬ: ОТЧЁТЫ, СКАНЕР QR, БРОНИ, КВОТЫ И РОЛИ (admin.html)
   ========================================================== */

async function renderAdmin() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    const users    = await getUsers();
    const tours    = await getTours();
    const bookings = await getBookings();
    const messages = await getMessages();

    const agenciesCount = users.filter(u => u.role === 'agency').length;
    const totalRevenue = bookings.reduce((acc, b) => {
        if (b.status === 'cancelled' || b.status === 'rejected') return acc;
        return acc + (Number(b.total || b.customTotal) || 350000);
    }, 0);

    if (document.getElementById('statUsers'))    document.getElementById('statUsers').textContent = users.length;
    if (document.getElementById('statAgencies')) document.getElementById('statAgencies').textContent = agenciesCount;
    if (document.getElementById('statTours'))    document.getElementById('statTours').textContent = tours.length;
    if (document.getElementById('statBookings')) document.getElementById('statBookings').textContent = bookings.length;
    if (document.getElementById('statRevenue'))  document.getElementById('statRevenue').textContent = formatPrice(totalRevenue);

    // Отчёты: продажи, загрузка туров, доходы (#adminReportsBox)
    const repBox = document.getElementById('adminReportsBox');
    if (repBox) {
        repBox.innerHTML = tours.slice(0, 3).map(tr => {
            const trBookings = bookings.filter(b => Number(b.tourId) === Number(tr.id) && b.status !== 'cancelled');
            const trRev = trBookings.reduce((s, b) => s + (Number(b.total || b.customTotal) || tr.price), 0);
            const seatsLeft = tr.seatsLeft !== undefined ? Number(tr.seatsLeft) : 5;
            const loadPct = Math.min(100, Math.max(25, Math.round(((15 - seatsLeft) / 15) * 100)));

            return `
                <div class="card" style="padding:18px;">
                    <b>${getTourTitle(tr)}</b>
                    <div class="muted" style="font-size:12.5px; margin:4px 0 10px;">Продано броней: <b>${trBookings.length}</b> · Доход: <b>${formatPrice(trRev)}</b></div>
                    <div style="background:var(--bg-elevated); height:10px; border-radius:999px; overflow:hidden; border:1px solid var(--border);">
                        <div style="width:${loadPct}%; height:100%; background:var(--gradient-primary);"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-top:6px;">
                        <span>Загрузка квоты мест: <b>${loadPct}%</b></span>
                        <span>Осталось мест: <b>${seatsLeft}</b></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Фильтрация броней по статусам
    const fBookStatus = document.getElementById('adminFilterBookStatus')?.value || '';
    const fPayStatus  = document.getElementById('adminFilterPayStatus')?.value || '';

    const filteredBookings = bookings.filter(b => {
        const matchB = !fBookStatus || b.status === fBookStatus;
        const matchP = !fPayStatus  || (b.paymentStatus || 'unpaid') === fPayStatus;
        return matchB && matchP;
    });

    const bookTbody = document.getElementById('adminBookings');
    if (bookTbody) {
        if (!filteredBookings.length) {
            bookTbody.innerHTML = `<tr><td colspan="7" class="empty">${t('no_bookings')}</td></tr>`;
        } else {
            const rows = [];
            for (const b of filteredBookings) {
                const tour = await getTourById(b.tourId);
                const title = tour ? getTourTitle(tour) : (b.tourTitle || 'Тур #' + b.tourId);
                const totalSum = Number(b.total || b.customTotal) || (tour ? tour.price * b.people : 0);

                rows.push(`
                    <tr>
                        <td><b>#TM-${b.id}</b></td>
                        <td>
                            <b>${title}</b>
                            <div class="muted" style="font-size:12px;">📅 ${b.date} (${b.people} чел.)</div>
                        </td>
                        <td>
                            <b>${b.clientName}</b>
                            <div class="muted" style="font-size:12px;">${b.clientPhone || ''}</div>
                        </td>
                        <td>${formatCustomOptionsHtml(b.customOptions || b.comment)}</td>
                        <td><b>${formatPrice(totalSum)}</b></td>
                        <td>${getPaymentCellHtml(b)}</td>
                        <td>
                            <span class="badge badge-${b.status}">${t('status_' + b.status)}</span>
                            <div style="margin-top:6px; display:flex; gap:4px; flex-wrap:wrap;">
                                <button type="button" class="btn btn-small" onclick="handleAgencyBookingStatus(${b.id}, 'accepted')">✓</button>
                                <button type="button" class="btn btn-danger btn-small" onclick="handleAgencyBookingStatus(${b.id}, 'rejected')">✕</button>
                                <button type="button" class="btn btn-outline btn-small" onclick="openVoucherModal(${b.id})">🎫 QR</button>
                            </div>
                        </td>
                    </tr>
                `);
            }
            bookTbody.innerHTML = rows.join('');
        }
    }

    // База сохранённых паспортных данных всех клиентов (доступна только Админу и Турагентству)
    await renderStaffTravelersTable('adminTravelersTable');

    // Пользователи и управление ролями (клиент, турагентство, менеджер, гид)
    const usersTbody = document.getElementById('adminUsers');
    if (usersTbody) {
        usersTbody.innerHTML = users.map(u => `
            <tr>
                <td><b>${u.name}</b></td>
                <td>${u.email}</td>
                <td>${u.phone || '—'}</td>
                <td>
                    <select onchange="changeUserRole(${u.id}, this.value)" style="padding:5px 8px; font-size:12.5px; width:auto;">
                        <option value="client" ${u.role === 'client' ? 'selected' : ''}>👤 Клиент</option>
                        <option value="agency" ${u.role === 'agency' ? 'selected' : ''}>🏢 Турагентство</option>
                        <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>💼 Менеджер</option>
                        <option value="guide" ${u.role === 'guide' ? 'selected' : ''}>🧭 Гид</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Админ</option>
                    </select>
                </td>
                <td><span class="badge badge-${u.status}">${t('status_' + u.status)}</span></td>
                <td>
                    ${u.role !== 'admin' ? `
                        <button type="button" class="btn btn-outline btn-small" onclick="handleAdminUserStatus(${u.id}, '${u.status === 'active' ? 'blocked' : 'active'}')">
                            ${u.status === 'active' ? 'Блок.' : 'Актив.'}
                        </button>
                    ` : '—'}
                </td>
            </tr>
        `).join('');
    }

    // Управление турами, ценами и квотами мест
    const toursTbody = document.getElementById('adminTours');
    if (toursTbody) {
        toursTbody.innerHTML = tours.map(tour => `
            <tr>
                <td>
                    <b>${getTourTitle(tour)}</b>
                    <div style="margin-top:4px;">${getSeatsBadge(tour)}</div>
                </td>
                <td>${getTourCountry(tour)}</td>
                <td>${tour.agencyName || 'Kazakh Tour'}</td>
                <td>
                    <b>${formatPrice(tour.price)}</b>
                    <div style="margin-top:4px; display:flex; gap:4px; align-items:center;">
                        <small class="muted">Мест:</small>
                        <input type="number" value="${tour.seatsLeft !== undefined ? tour.seatsLeft : 6}" min="0" max="50"
                            style="width:64px; padding:4px 6px; font-size:12px;"
                            onchange="updateTourQuota(${tour.id}, this.value)">
                    </div>
                </td>
                <td>
                    <button type="button" class="btn btn-danger btn-small" onclick="deleteAgencyTour(${tour.id})"><img src="images/delete.png" alt="" class="btn-icon-sm"> ${t('btn_delete')}</button>
                </td>
            </tr>
        `).join('');
    }

    // Сообщения из формы контактов
    const msgTbody = document.getElementById('adminMessages');
    if (msgTbody) {
        if (!messages.length) {
            msgTbody.innerHTML = `<tr><td colspan="4" class="empty">Пока нет новых сообщений</td></tr>`;
        } else {
            msgTbody.innerHTML = messages.map(m => `
                <tr>
                    <td>${m.createdAt || '2026-11-02'}</td>
                    <td><b>${m.name}</b></td>
                    <td>${m.email}</td>
                    <td>${m.text || m.message || ''}</td>
                </tr>
            `).join('');
        }
    }
}

async function verifyQrTicket() {
    const input = document.getElementById('qrScannerInput');
    const resBox = document.getElementById('qrScannerResult');
    if (!input || !resBox) return;

    const val = input.value.trim();
    const match = val.match(/(\d+)$/);
    const id = match ? Number(match[1]) : 0;

    const bookings = await getBookings();
    const b = bookings.find(item => Number(item.id) === id) || bookings[0];

    if (!b) {
        resBox.innerHTML = `<div class="alert alert-error">❌ Билет не найден в базе TravelMate.</div>`;
        return;
    }

    const tour = await getTourById(b.tourId);
    const code = `TM-2026-${String(b.id).padStart(4, '0')}`;
    resBox.innerHTML = `
        <div class="alert alert-success" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px;">
            <div>
                <b>✅ QR-БИЛЕТ ПОДТВЕРЖДЁН: ${code}</b><br>
                <span>Турист: <b>${b.clientName}</b> (${b.people} чел.) · Тур: <b>${tour ? getTourTitle(tour) : b.tourTitle}</b> · Вылет: <b>${b.date}</b></span>
            </div>
            <button type="button" class="btn btn-small" onclick="openVoucherModal(${b.id})">Открыть ваучер</button>
        </div>
    `;
}

async function handleAdminUserStatus(id, nextStatus) {
    await setUserStatus(id, nextStatus);
    await renderAdmin();
}

function changeUserRole(userId, newRole) {
    const list = load(KEYS.users);
    const u = list.find(item => Number(item.id) === Number(userId));
    if (u) {
        u.role = newRole;
        save(KEYS.users, list);
    }
}

function updateTourQuota(tourId, newSeats) {
    const list = load(KEYS.tours);
    const tr = list.find(item => Number(item.id) === Number(tourId));
    if (tr) {
        tr.seatsLeft = Math.max(0, Number(newSeats));
        save(KEYS.tours, list);
    }
    renderAdmin();
}

/* ==========================================================
   11. ВХОД, РЕГИСТРАЦИЯ И КОНТАКТЫ (login.html, register.html, contact.html)
   ========================================================== */

function fillDemo(email) {
    const em = document.getElementById('loginEmail');
    const pw = document.getElementById('loginPassword');
    if (em) em.value = email;
    if (pw) pw.value = '123456';
}

function initAuthAndContactForms() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm && !loginForm.dataset.bound) {
        loginForm.addEventListener('submit', async e => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value.trim();
            const res = await loginUser(email, password);
            const msg = document.getElementById('loginMsg');
            if (!res || !res.ok) {
                if (msg) msg.innerHTML = `<div class="alert alert-error">${t('login_error')}</div>`;
                return;
            }
            const role = res.user.role;
            if (role === 'admin')       window.location.href = 'admin.html';
            else if (role === 'agency') window.location.href = 'agency.html';
            else                        window.location.href = 'client.html';
        });
        loginForm.dataset.bound = '1';
    }

    const regForm = document.getElementById('registerForm');
    if (regForm && !regForm.dataset.bound) {
        regForm.addEventListener('submit', async e => {
            e.preventDefault();
            const res = await registerUser({
                role: document.getElementById('regRole').value,
                name: document.getElementById('regName').value.trim(),
                email: document.getElementById('regEmail').value.trim(),
                phone: document.getElementById('regPhone').value.trim(),
                password: document.getElementById('regPassword').value.trim()
            });
            const msg = document.getElementById('registerMsg');
            if (!res || !res.ok) {
                if (msg) msg.innerHTML = `<div class="alert alert-error">${t('email_exists')}</div>`;
                return;
            }
            const role = res.user.role;
            if (role === 'agency') window.location.href = 'agency.html';
            else                   window.location.href = 'client.html';
        });
        regForm.dataset.bound = '1';
    }

    const contactForm = document.getElementById('contactForm');
    if (contactForm && !contactForm.dataset.bound) {
        contactForm.addEventListener('submit', async e => {
            e.preventDefault();
            await addMessage({
                name: document.getElementById('contactName').value.trim(),
                email: document.getElementById('contactEmail').value.trim(),
                text: document.getElementById('contactText').value.trim()
            });
            const msg = document.getElementById('contactMsg');
            if (msg) msg.innerHTML = `<div class="alert alert-success">${t('contact_success')}</div>`;
            contactForm.reset();
        });
        contactForm.dataset.bound = '1';
    }
}

function injectSupportChatButton() {
    if (document.getElementById('tmFloatingSupport')) return;
    const wrap = document.createElement('div');
    wrap.id = 'tmFloatingSupport';
    wrap.className = 'tm-floating-support';
    wrap.innerHTML = `
        <a href="https://wa.me/77270000000?text=${encodeURIComponent('Здравствуйте! Пишу с сайта TravelMate по поводу бронирования тура.')}"
           target="_blank" class="tm-support-pill">
            <img src="images/whatsapp.png" alt="WhatsApp" class="tm-emoji-icon">
            <span>Онлайн-чат / WhatsApp 24/7</span>
        </a>
    `;
    document.body.appendChild(wrap);
}

/* ==========================================================
   12. АВТОМАТИЧЕСКАЯ ЗАМЕНА ЭМОДЗИ НА ИКОНКИ ICONS8
   ========================================================== */

const ICONS8_EMOJI_MAP = {
    '🛂': 'passport.png',
    '🛫': 'takeoff.png',
    '🛬': 'landing.png',
    '✈️': 'plane-color.png',
    '✈':  'plane-color.png',
    '🏨': 'hotel.png',
    '🛏️': 'bed.png',
    '🛏': 'bed.png',
    '🍽️': 'meal.png',
    '🍽': 'meal.png',
    '⏱️': 'clock.png',
    '⏱':  'clock.png',
    '⏰': 'clock.png',
    '⏳': 'clock.png',
    '📅': 'calendar-color.png',
    '🗓️': 'calendar-color.png',
    '🗓': 'calendar-color.png',
    '🧳': 'luggage.png',
    '🚐': 'transfer.png',
    '🚘': 'transfer.png',
    '🔄': 'layover.png',
    '🛠️': 'settings.png',
    '🛠': 'settings.png',
    '📖': 'book.png',
    '✅': 'ok.png',
    'ℹ️': 'info.png',
    'ℹ':  'info.png',
    '❓': 'faq.png',
    '🔒': 'lock.png',
    '🔔': 'bell.png',
    '❤️': 'heart.png',
    '❤':  'heart.png',
    '🤍': 'heart-outline.png',
    '🎬': 'video.png',
    '📸': 'camera.png',
    '📷': 'qr.png',
    '👤': 'user.png',
    '👥': 'group.png',
    '👶': 'child.png',
    '🎁': 'gift.png',
    '💳': 'credit-card.png',
    '💰': 'money.png',
    '🎫': 'ticket.png',
    '📄': 'doc.png',
    '🖨️': 'print.png',
    '🖨': 'print.png',
    '🔥': 'fire.png',
    '📊': 'chart.png',
    '💬': 'chat.png',
    '🏖️': 'beach.png',
    '🏖': 'beach.png',
    '🌊': 'wave.png',
    '👑': 'crown.png',
    '🛡️': 'shield-color.png',
    '🛡': 'shield-color.png',
    '📶': 'wifi.png',
    '🔍': 'search.png',
    '✉️': 'mail.png',
    '✉':  'mail.png',
    '📞': 'phone.png',
    '⚡': 'bolt.png',
    '💎': 'diamond.png',
    '⭐': 'star.png'
};

const ICONS8_EMOJI_KEYS = Object.keys(ICONS8_EMOJI_MAP).sort((a, b) => b.length - a.length);
const ICONS8_EMOJI_REGEX = new RegExp('(' + ICONS8_EMOJI_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
let _isUpgradingIcons8 = false;

function upgradeEmojisToIcons8(rootNode) {
    if (_isUpgradingIcons8) return;
    const root = rootNode || document.body;
    if (!root) return;

    _isUpgradingIcons8 = true;
    try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                const tag = p.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'OPTION' || tag === 'TITLE' || tag === 'NOSCRIPT') {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.nodeValue && ICONS8_EMOJI_REGEX.test(node.nodeValue)) {
                    ICONS8_EMOJI_REGEX.lastIndex = 0;
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_SKIP;
            }
        });

        const textNodes = [];
        let current;
        while ((current = walker.nextNode())) {
            textNodes.push(current);
        }

        textNodes.forEach(tNode => {
            const val = tNode.nodeValue;
            if (!val) return;
            ICONS8_EMOJI_REGEX.lastIndex = 0;
            const parts = val.split(ICONS8_EMOJI_REGEX);
            if (parts.length <= 1) return;

            const frag = document.createDocumentFragment();
            parts.forEach(part => {
                if (!part) return;
                const iconFile = ICONS8_EMOJI_MAP[part];
                if (iconFile) {
                    const img = document.createElement('img');
                    img.src = 'images/' + iconFile;
                    img.alt = '';
                    img.className = 'tm-emoji-icon';
                    frag.appendChild(img);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            });
            if (tNode.parentNode) {
                tNode.parentNode.replaceChild(frag, tNode);
            }
        });
    } finally {
        _isUpgradingIcons8 = false;
    }
}

/* ==========================================================
   13. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
   ========================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    applyLang();
    await renderHeader();
    initAuthAndContactForms();
    injectSupportChatButton();

    const page = document.body.dataset.page;
    if (page === 'home')   await renderHome();
    if (page === 'tours')  await renderToursPage();
    if (page === 'tour')   await renderTourPage();
    if (page === 'client') await renderClient();
    if (page === 'agency') await renderAgency();
    if (page === 'admin')  await renderAdmin();

    upgradeEmojisToIcons8(document.body);

    let rafId = null;
    const obs = new MutationObserver(() => {
        if (_isUpgradingIcons8) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            upgradeEmojisToIcons8(document.body);
        });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
});

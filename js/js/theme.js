/* ==========================================================
   theme.js — светлая / тёмная тема
   Подключается в <head>, чтобы тема включалась сразу,
   без «мигания» белым цветом.
   ========================================================== */

// Если раньше пользователь выбрал тёмную тему — включаем её
if (localStorage.getItem('tm_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

// Вызывается кнопкой 🌓 в шапке
function toggleTheme() {
    // toggle добавляет класс, если его нет, и убирает, если есть
    const isDark = document.documentElement.classList.toggle('dark');

    // запоминаем выбор
    if (isDark) {
        localStorage.setItem('tm_theme', 'dark');
    } else {
        localStorage.setItem('tm_theme', 'light');
    }
}

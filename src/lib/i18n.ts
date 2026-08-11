/**
 * Два языка: русский и узбекский. Ключ — короткое имя строки,
 * значение — пара переводов. Так видно оба варианта рядом и не бывает
 * ситуации, когда строку перевели в одном месте и забыли в другом.
 */
export const LANGS = ["ru", "uz"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = "lid_lang";
export const DEFAULT_LANG: Lang = "ru";

export const LANG_LABEL: Record<Lang, string> = { ru: "Русский", uz: "O'zbekcha" };
export const LANG_SHORT: Record<Lang, string> = { ru: "РУ", uz: "UZ" };

type Entry = { ru: string; uz: string };

export const DICT = {
  // ------------------------------------------------------------- разделы
  "nav.mine": { ru: "Моё", uz: "Meniki" },
  "nav.myResults": { ru: "Мои результаты", uz: "Natijalarim" },
  "nav.dashboards": { ru: "Дашборды", uz: "Boshqaruv paneli" },
  "nav.overview": { ru: "Обзор", uz: "Umumiy" },
  "nav.admin": { ru: "Администратор", uz: "Administrator" },
  "nav.callcenter": { ru: "Call-центр", uz: "Call markaz" },
  "nav.finance": { ru: "Финансы", uz: "Moliya" },
  "nav.clients": { ru: "Клиенты", uz: "Mijozlar" },
  "nav.leads": { ru: "Лиды", uz: "Lidlar" },
  "nav.visits": { ru: "Визиты", uz: "Tashriflar" },
  "nav.students": { ru: "Ученики", uz: "O'quvchilar" },
  "nav.groups": { ru: "Группы", uz: "Guruhlar" },
  "nav.attendance": { ru: "Посещаемость", uz: "Davomat" },
  "nav.money": { ru: "Деньги", uz: "Pul" },
  "nav.payments": { ru: "Платежи", uz: "To'lovlar" },
  "nav.expenses": { ru: "Расходы", uz: "Xarajatlar" },
  "nav.debtors": { ru: "Должники", uz: "Qarzdorlar" },
  "nav.manage": { ru: "Управление", uz: "Boshqaruv" },
  "nav.staff": { ru: "Сотрудники", uz: "Xodimlar" },
  "nav.audit": { ru: "История изменений", uz: "O'zgarishlar tarixi" },

  // --------------------------------------------------------------- шапка
  "header.demo": { ru: "Демо-данные", uz: "Namuna ma'lumotlar" },
  "header.refresh": { ru: "Обновить", uz: "Yangilash" },
  "header.refreshing": { ru: "Обновляю…", uz: "Yangilanmoqda…" },
  "header.checkIn": { ru: "Пришёл", uz: "Keldim" },
  "header.checkOut": { ru: "Ушёл", uz: "Ketdim" },
  "header.logout": { ru: "Выйти", uz: "Chiqish" },
  "header.themeLight": { ru: "Светлая тема", uz: "Yorug' mavzu" },
  "header.themeDark": { ru: "Тёмная тема", uz: "Tungi mavzu" },
  "header.language": { ru: "Язык", uz: "Til" },

  // ---------------------------------------------------------------- вход
  "auth.signIn": { ru: "Войти", uz: "Kirish" },
  "auth.signingIn": { ru: "Вход…", uz: "Kirilmoqda…" },
  "auth.login": { ru: "Логин", uz: "Login" },
  "auth.password": { ru: "Пароль", uz: "Parol" },
  "auth.passwordAgain": { ru: "Пароль ещё раз", uz: "Parolni takrorlang" },
  "auth.subtitle": { ru: "управление учебным центром", uz: "o'quv markazini boshqarish" },
  "auth.firstTime": { ru: "Первый раз здесь?", uz: "Birinchi marta kirdingizmi?" },
  "auth.firstTimeHint": {
    ru: "Найдите себя по имени и создайте вход — увидите свои результаты",
    uz: "Ismingizni toping va kirish yarating — natijalaringizni ko'rasiz",
  },
  "auth.register": { ru: "Зарегистрироваться", uz: "Ro'yxatdan o'tish" },
  "auth.registering": { ru: "Создаём…", uz: "Yaratilmoqda…" },
  "auth.registerTitle": { ru: "Регистрация сотрудника", uz: "Xodim ro'yxatdan o'tishi" },
  "auth.registerHint": {
    ru: "Найдите себя в списке и придумайте логин с паролем — после этого увидите свои результаты",
    uz: "Ro'yxatdan o'zingizni toping, login va parol o'ylab toping — so'ng natijalaringizni ko'rasiz",
  },
  "auth.yourName": { ru: "Ваше имя", uz: "Ismingiz" },
  "auth.namePlaceholder": { ru: "Начните печатать фамилию", uz: "Familiyangizni yozing" },
  "auth.pickLogin": { ru: "Придумайте логин", uz: "Login o'ylab toping" },
  "auth.found": { ru: "Нашли вас в системе", uz: "Sizni tizimdan topdik" },
  "auth.notFound": {
    ru: "Не нашли такого сотрудника — проверьте написание или обратитесь к администратору",
    uz: "Bunday xodim topilmadi — imloni tekshiring yoki administratorga murojaat qiling",
  },
  "auth.already": { ru: "Уже зарегистрировались?", uz: "Allaqachon ro'yxatdan o'tganmisiz?" },
  "auth.minChars": { ru: "минимум 6 символов", uz: "kamida 6 ta belgi" },

  // ------------------------------------------------------------ показатели
  "m.activeStudents": { ru: "Активные ученики", uz: "Faol o'quvchilar" },
  "m.groups": { ru: "групп", uz: "guruh" },
  "m.revenueMonth": { ru: "Приход за месяц", uz: "Oylik tushum" },
  "m.revenueToday": { ru: "Приход сегодня", uz: "Bugungi tushum" },
  "m.profit": { ru: "Чистая прибыль", uz: "Sof foyda" },
  "m.margin": { ru: "маржа", uz: "marja" },
  "m.debtors": { ru: "Должники", uz: "Qarzdorlar" },
  "m.debtorsAmount": { ru: "на сумму", uz: "jami" },
  "m.newStudents": { ru: "Новые ученики за месяц", uz: "Oylik yangi o'quvchilar" },
  "m.conversion": { ru: "Конверсия лид → ученик", uz: "Lid → o'quvchi konversiyasi" },
  "m.frozen": { ru: "Заморожены", uz: "Muzlatilganlar" },
  "m.left": { ru: "Ушли за месяц", uz: "Oyda ketganlar" },
  "m.callsToday": { ru: "Звонки сегодня", uz: "Bugungi qo'ng'iroqlar" },
  "m.callsTotal": { ru: "всего", uz: "jami" },
  "m.leadsToday": { ru: "Лиды за день", uz: "Kunlik lid soni" },
  "m.qualified": { ru: "Качественные лиды", uz: "Sifatli lid soni" },
  "m.visitsOffice": { ru: "Визиты в офис", uz: "Tashriflar soni" },
  "m.phoneLessons": { ru: "Уроки по телефону", uz: "Kunlik call dars" },
  "m.newClientsToday": { ru: "Новые клиенты сегодня", uz: "Bugun kelgan yangi mijozlar" },
  "m.paymentsToday": { ru: "Оплаты за сегодня", uz: "Bugungi to'lovlar" },
  "m.visitsToday": { ru: "Визиты сегодня", uz: "Bugungi tashriflar" },
  "m.retention": { ru: "Удержание новых учеников", uz: "Yangi o'quvchilarni ushlab qolish" },
  "m.lesson1": { ru: "1-й урок — пришли все", uz: "1-dars — hammasi keldi" },
  "m.lesson2": { ru: "2-й урок", uz: "2-dars" },
  "m.lesson3": { ru: "3-й урок", uz: "3-dars" },
  "m.cashToday": { ru: "Касса сегодня", uz: "Bugungi kassa" },
  "m.byCourse": { ru: "Ученики по направлениям", uz: "Yo'nalishlar bo'yicha o'quvchilar" },
  "m.groupsFill": { ru: "Заполненность групп", uz: "Guruhlar to'ldirilishi" },
  "m.expensesByCategory": { ru: "Расходы по статьям", uz: "Xarajat turlari" },
  "m.operators": { ru: "Операторы", uz: "Operatorlar" },
  "m.myPlace": { ru: "Место сегодня", uz: "Bugungi o'rin" },
  "m.outOf": { ru: "из", uz: "dan" },
  "m.talkTime": { ru: "В разговоре", uz: "Suhbatda" },

  // ---------------------------------------------------------------- общее
  "c.today": { ru: "сегодня", uz: "bugun" },
  "c.month": { ru: "за месяц", uz: "oyda" },
  "c.all": { ru: "Всего", uz: "Jami" },
  "c.search": { ru: "Поиск…", uz: "Qidiruv…" },
  "c.nothingFound": { ru: "Ничего не найдено", uz: "Hech narsa topilmadi" },
  "c.back": { ru: "Назад", uz: "Orqaga" },
  "c.forward": { ru: "Вперёд", uz: "Oldinga" },
  "c.of": { ru: "из", uz: "dan" },
  "c.student": { ru: "Ученик", uz: "O'quvchi" },
  "c.group": { ru: "Группа", uz: "Guruh" },
  "c.status": { ru: "Статус", uz: "Holat" },
  "c.date": { ru: "Дата", uz: "Sana" },
  "c.amount": { ru: "Сумма", uz: "Summa" },
  "c.debt": { ru: "Долг", uz: "Qarz" },
  "c.overdue": { ru: "Просрочка", uz: "Kechikish" },
  "c.source": { ru: "Источник", uz: "Manba" },
  "c.operator": { ru: "Оператор", uz: "Operator" },
  "c.teacher": { ru: "Преподаватель", uz: "O'qituvchi" },
  "c.method": { ru: "Способ", uz: "Usul" },
  "c.author": { ru: "Автор", uz: "Muallif" },
  "c.created": { ru: "Создан", uz: "Yaratilgan" },
  "c.started": { ru: "Начал", uz: "Boshlagan" },
  "c.balance": { ru: "Баланс", uz: "Balans" },
  "c.calls": { ru: "Звонки", uz: "Qo'ng'iroqlar" },
  "c.leads": { ru: "Лиды", uz: "Lidlar" },
  "c.visits": { ru: "Визиты", uz: "Tashriflar" },
  "c.came": { ru: "Пришёл", uz: "Keldi" },
  "c.yes": { ru: "да", uz: "ha" },
  "c.no": { ru: "нет", uz: "yo'q" },
  "c.result": { ru: "Результат", uz: "Natija" },
  "c.sale": { ru: "продажа", uz: "sotuv" },
  "c.free": { ru: "Свободно", uz: "Bo'sh" },
  "c.seats": { ru: "мест", uz: "joy" },
  "c.who": { ru: "Кто", uz: "Kim" },
  "c.when": { ru: "Когда", uz: "Qachon" },
  "c.role": { ru: "Роль", uz: "Rol" },
  "c.access": { ru: "Доступ", uz: "Kirish" },
  "c.active": { ru: "активен", uz: "faol" },
  "c.disabled": { ru: "отключён", uz: "o'chirilgan" },
} as const satisfies Record<string, Entry>;

export type Key = keyof typeof DICT;

/** Переводчик: `const t = translator(lang); t("nav.leads")` */
export function translator(lang: Lang) {
  return (key: Key) => DICT[key][lang];
}

/**
 * Demo / mock data for in-memory store and onboarding.
 * Generates sample tasks, lists, tags, flows, personas for first-run experience.
 * Supports locale-aware generation (EN / RU).
 */
import { ulid } from '../ulid.js';
import { localIsoDate } from './date.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let nextId = 100;
export const uid = () => String(nextId++);

function rel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localIsoDate(d);
}

// ─── Locale data ─────────────────────────────────────────────────────────────

const DATA = {
  en: {
    lists: ['Work', 'Personal', 'Health', 'Learning', 'Finance', 'Side Project', 'Home'],
    tags: ['meeting', 'code', 'design', 'call', 'email', 'urgent', 'review',
           'planning', 'research', 'fitness', 'reading', 'budget', 'travel', 'home', 'bug'],
    flows: ['ProductLaunch', 'WeeklyWellness', 'HomeRenovation'],
    personas: ['Alice', 'Bob', 'Charlie', 'Diana'],
  },
  ru: {
    lists: ['Работа', 'Личное', 'Здоровье', 'Обучение', 'Финансы', 'Пет-проект', 'Дом'],
    tags: ['встреча', 'код', 'дизайн', 'звонок', 'email', 'срочно', 'ревью',
           'планирование', 'исследование', 'фитнес', 'чтение', 'бюджет', 'путешествие', 'дом', 'баг'],
    flows: ['ЗапускПродукта', 'ЗОЖнеделя', 'РемонтДома'],
    personas: ['Алиса', 'Борис', 'Вадим', 'Диана'],
  },
};

// ─── Mock Data (for in-memory store) ─────────────────────────────────────────

export const MOCK_LISTS    = DATA.en.lists;
export const MOCK_TAGS     = DATA.en.tags.slice(0, 7);
export const MOCK_FLOWS    = DATA.en.flows;
export const MOCK_PERSONAS = DATA.en.personas.slice(0, 3);

export const INITIAL_TASKS = buildDemoTasks('en').tasks.slice(0, 10);

// ─── Demo data generator ────────────────────────────────────────────────────

export function buildDemoTasks(locale: string = 'en') {
  const isRu = locale === 'ru';
  const L = isRu ? DATA.ru : DATA.en;

  const now = () => new Date().toISOString();
  const _idMap: Record<number, string> = {};
  const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rndChar = () => ENC[(Math.random() * 32) | 0];
  const id = (n: number) => { if (!_idMap[n]) { let s = ''; for (let i = 0; i < 26; i++) s += rndChar(); _idMap[n] = s; } return _idMap[n]; };

  const t = (n: number, title: string, list: string, status: string, priority: number, due: string | null, opts: any = {}) => ({
    id: id(n), title, list, status, priority, due,
    dateStart: null, estimate: null, recurrence: null,
    flowId: null, dependsOn: null, tags: [], personas: [],
    url: null, postponed: 0, subtasks: [], notes: [], rtmSeriesId: null,
    createdAt: now(),
    completedAt: status === 'done' ? (due ? `${due}T12:00:00.000Z` : now()) : null,
    ...opts,
  });

  const tasks = isRu ? [
    // ── Работа ─────────────────────────────────────────────────────────────
    t(1,  'Подготовить презентацию дорожной карты Q2',  'Работа', 'active', 1, rel(3),  { estimate: '3 часа',    tags: ['встреча','планирование'], personas: ['Алиса'],          flowId: 'ЗапускПродукта', dateStart: rel(0), notes: [{ id: ulid(), content: 'Включить: рост пользователей, тренды выручки, цели Q3, техническая дорожная карта', createdAt: now() }] }),
    t(2,  'Исправить критический баг авторизации',      'Работа', 'active', 1, rel(1),  { estimate: '2 часа',    tags: ['код','баг','срочно'],     personas: ['Борис'],          flowId: 'ЗапускПродукта', postponed: 1, url: 'https://github.com/example/issues/42' }),
    t(3,  'Ревью кода PR #128',                         'Работа', 'inbox',  2, rel(2),  { estimate: '1 час',     tags: ['код','ревью'],            personas: ['Вадим'],          flowId: 'ЗапускПродукта', dependsOn: [id(2)], url: 'https://github.com/example/pulls/128' }),
    t(4,  'Еженедельный стендап команды',                'Работа', 'active', 3, rel(1),  { estimate: '30 мин',    tags: ['встреча'],                personas: ['Алиса','Борис','Вадим'], recurrence: 'weekly' }),
    t(5,  'Написать документацию API',                   'Работа', 'active', 2, rel(5),  { estimate: '4 часа',    tags: ['код','планирование'],     notes: [{ id: ulid(), content: 'Auth, Users, Tasks, Reports, Webhooks', createdAt: now() }], url: 'https://swagger.io/docs/specification/' }),
    t(6,  'Спроектировать онбординг нового пользователя','Работа', 'inbox',  2, rel(7),  { estimate: '5 часов',   tags: ['дизайн','планирование'],  personas: ['Диана'],          flowId: 'ЗапускПродукта', dateStart: rel(2) }),
    t(7,  'Ревью производительности 1-на-1',             'Работа', 'active', 1, rel(4),  { estimate: '1 час',     tags: ['встреча'],                personas: ['Алиса'] }),
    t(8,  'Обновить зависимости проекта',                'Работа', 'done',   3, rel(-3), { estimate: '1 час',     tags: ['код'] }),
    t(9,  'Настроить мониторинг ошибок',                 'Работа', 'active', 2, rel(6),  { estimate: '2 часа',    tags: ['код'],                    personas: ['Борис'],          flowId: 'ЗапускПродукта', dependsOn: [id(3)], url: 'https://sentry.io', dateStart: rel(1) }),
    t(10, 'Провести 5 пользовательских интервью',        'Работа', 'inbox',  2, rel(10), { estimate: '5 часов',   tags: ['исследование','встреча'], personas: ['Диана'],          flowId: 'ЗапускПродукта', dependsOn: [id(6)], dateStart: rel(3), notes: [{ id: ulid(), content: 'В1: Опишите типичный день\nВ2: Главные проблемы?\nВ3: Как решаете сейчас?', createdAt: now() }] }),

    // ── Личное ──────────────────────────────────────────────────────────────
    t(11, 'Спланировать летний отпуск',                  'Личное', 'inbox',  3, rel(30), { estimate: '2 часа',  tags: ['путешествие','планирование'], url: 'https://google.com/flights' }),
    t(12, 'Записаться к стоматологу',                    'Личное', 'inbox',  2, rel(2),  {                      tags: ['звонок'],                    postponed: 3 }),
    t(13, 'Продукты на неделю',                          'Личное', 'active', 3, rel(1),  { estimate: '1 час',   tags: ['дом'],                       recurrence: 'weekly' }),
    t(14, 'Позвонить родителям',                         'Личное', 'active', 2, rel(3),  { estimate: '30 мин',  tags: ['звонок'],                    recurrence: 'weekly', postponed: 1 }),
    t(15, 'Починить кран в ванной',                      'Дом',    'inbox',  2, rel(5),  {                      tags: ['дом'],                       flowId: 'РемонтДома', url: 'https://youtube.com/results?search_query=починить+кран' }),
    t(16, 'Навести порядок в домашнем офисе',            'Дом',    'inbox',  4, null,    { estimate: '3 часа',  tags: ['дом'],                       postponed: 2 }),
    t(17, 'Продлить автостраховку',                      'Личное', 'inbox',  1, rel(14), {                      tags: ['email','бюджет'] }),

    // ── Здоровье ────────────────────────────────────────────────────────────
    t(18, 'Утренняя пробежка',                           'Здоровье', 'active', 3, rel(1),  { estimate: '45 мин',  tags: ['фитнес'],  flowId: 'ЗОЖнеделя', recurrence: 'daily' }),
    t(19, 'Еженедельная йога',                           'Здоровье', 'active', 3, rel(3),  { estimate: '1 час',   tags: ['фитнес'],  flowId: 'ЗОЖнеделя', recurrence: 'weekly', url: 'https://yoga-studio.example.com' }),
    t(20, 'Заготовка еды на неделю',                     'Здоровье', 'active', 3, rel(2),  { estimate: '2 часа',  tags: ['фитнес'],  flowId: 'ЗОЖнеделя', recurrence: 'weekly', notes: [{ id: ulid(), content: 'Пн: курица с рисом\nВт: паста\nСр: салат\nЧт: стир-фрай\nПт: остатки', createdAt: now() }] }),
    t(21, 'Принять витамины',                            'Здоровье', 'active', 4, rel(1),  {                      tags: ['фитнес'],  flowId: 'ЗОЖнеделя', recurrence: 'daily' }),
    t(22, 'Ежемесячный осмотр у врача',                  'Здоровье', 'inbox',  2, rel(21), { estimate: '2 часа',  tags: ['фитнес'],  recurrence: 'monthly', postponed: 1 }),
    t(23, 'Силовая тренировка 30 минут',                 'Здоровье', 'active', 2, rel(1),  { estimate: '30 мин',  tags: ['фитнес'],  flowId: 'ЗОЖнеделя', recurrence: 'daily', url: 'https://fitness-app.example.com/workout' }),

    // ── Обучение ────────────────────────────────────────────────────────────
    t(24, 'Прочитать главу 5 «Чистого кода»',            'Обучение', 'active', 3, rel(3),  { estimate: '1 час',      tags: ['чтение','код'] }),
    t(25, 'Пройти туториал по Rust (ownership)',          'Обучение', 'inbox',  3, rel(7),  { estimate: '2 часа',     tags: ['код','чтение'],    url: 'https://doc.rust-lang.org/book/ch04.html' }),
    t(26, 'Посмотреть доклад по system design',           'Обучение', 'inbox',  4, null,    { estimate: '1.5 часа',   tags: ['исследование'],    url: 'https://youtube.com/watch?v=system-design' }),
    t(27, 'Практика SQL: оконные функции',                'Обучение', 'inbox',  3, rel(10), { estimate: '1.5 часа',   tags: ['код'],             url: 'https://sqlzoo.net/wiki/Window_functions' }),
    t(28, 'Написать статью: оптимизация React',           'Обучение', 'active', 2, rel(12), { estimate: '3 часа',     tags: ['код','планирование'], dateStart: rel(5), notes: [{ id: ulid(), content: '1. useMemo и useCallback\n2. Code splitting\n3. Виртуальные списки\n4. Оптимизация картинок\n5. Анализ бандла', createdAt: now() }] }),
    t(29, 'Ежемесячная ретроспектива обучения',           'Обучение', 'inbox',  3, rel(25), { estimate: '1 час',      tags: ['планирование','исследование'], recurrence: 'monthly' }),

    // ── Финансы ──────────────────────────────────────────────────────────────
    t(30, 'Проверить месячный бюджет',                    'Финансы', 'active', 2, rel(7),  { estimate: '1 час',   tags: ['бюджет'],             recurrence: 'monthly' }),
    t(31, 'Подать квартальную декларацию',                 'Финансы', 'inbox',  1, rel(21), { estimate: '3 часа',  tags: ['срочно','бюджет'],    dateStart: rel(14), notes: [{ id: ulid(), content: '☐ Справки 2-НДФЛ\n☐ Декларация за прошлый год\n☐ Выписка по ипотеке\n☐ Чеки на благотворительность\n☐ Медицинские расходы', createdAt: now() }] }),
    t(32, 'Перезаключить договор на интернет',            'Финансы', 'inbox',  3, rel(5),  {                      tags: ['звонок','бюджет'],    postponed: 2 }),
    t(33, 'Ежемесячный перевод на накопления',            'Финансы', 'active', 2, rel(7),  {                      tags: ['бюджет'],             recurrence: 'monthly' }),
    t(34, 'Проверить инвестиционный портфель',             'Финансы', 'inbox',  3, rel(14), { estimate: '1 час',   tags: ['бюджет','исследование'], url: 'https://finance.yahoo.com/portfolio' }),

    // ── Пет-проект ──────────────────────────────────────────────────────────
    t(35, 'Настроить CI/CD pipeline',                     'Пет-проект', 'active', 2, rel(4),  { estimate: '3 часа',  tags: ['код'],              personas: ['Борис'],   flowId: 'ЗапускПродукта', url: 'https://github.com/features/actions' }),
    t(36, 'Написать тесты для модуля авторизации',        'Пет-проект', 'inbox',  2, rel(6),  { estimate: '2 часа',  tags: ['код','ревью'],                             flowId: 'ЗапускПродукта', dependsOn: [id(35)] }),
    t(37, 'Сверстать лендинг',                            'Пет-проект', 'active', 2, rel(8),  { estimate: '5 часов', tags: ['дизайн'],           personas: ['Диана'],   flowId: 'ЗапускПродукта' }),
    t(38, 'Подключить аналитику',                         'Пет-проект', 'inbox',  3, rel(9),  { estimate: '2 часа',  tags: ['код'],                                     flowId: 'ЗапускПродукта', dependsOn: [id(35)], dateStart: rel(5), url: 'https://analytics.google.com' }),
    t(39, 'Публичный бета-запуск',                        'Пет-проект', 'inbox',  1, rel(21), {                      tags: ['планирование','срочно'], personas: ['Алиса','Борис'], flowId: 'ЗапускПродукта', dependsOn: [id(36)], dateStart: rel(15) }),

    // ── Ремонт дома (flow) ──────────────────────────────────────────────────
    t(40, 'Получить 3 сметы на ремонт ванной',            'Дом', 'inbox',  2, rel(7),  {                      tags: ['дом','исследование'], personas: ['Вадим'],  flowId: 'РемонтДома' }),
    t(41, 'Выбрать плитку и сантехнику',                  'Дом', 'inbox',  2, rel(14), { estimate: '3 часа',  tags: ['дизайн','дом'],                            flowId: 'РемонтДома', dependsOn: [id(40)], dateStart: rel(7), url: 'https://houzz.com' }),
    t(42, 'Подписать договор с подрядчиком',              'Дом', 'inbox',  1, rel(21), {                      tags: ['дом'],               personas: ['Вадим'],  flowId: 'РемонтДома', dependsOn: [id(41)], dateStart: rel(14) }),
    t(43, 'Контроль сроков ремонта',                      'Дом', 'inbox',  2, rel(45), {                      tags: ['планирование','дом'],                      flowId: 'РемонтДома', dependsOn: [id(42)], dateStart: rel(30) }),
    t(44, 'Финальная приёмка и подпись акта',              'Дом', 'inbox',  2, rel(60), { estimate: '1 час',   tags: ['дом'],               personas: ['Вадим'],  flowId: 'РемонтДома', dependsOn: [id(43)], dateStart: rel(58) }),

    // ── Завершённые ─────────────────────────────────────────────────────────
    t(45, 'Настроить новый рабочий ноутбук',              'Работа', 'done',      3, rel(-7),  { estimate: '4 часа',  tags: ['код'] }),
    t(46, 'Забронировать билеты на конференцию',          'Личное', 'done',      2, rel(-14), {                      tags: ['путешествие','email'], url: 'https://flights.google.com' }),
    t(47, 'Подготовить проектное предложение',            'Работа', 'done',      1, rel(-5),  { estimate: '2 часа',  tags: ['планирование'], personas: ['Алиса'] }),
    t(48, 'Прочитать годовой отчёт за Q4',                'Финансы', 'done',     3, rel(-10), { estimate: '1 час',   tags: ['чтение','бюджет'] }),

    // ── Отменённые ──────────────────────────────────────────────────────────
    t(49, 'Миграция монолита на микросервисы',            'Работа', 'cancelled', 2, rel(-30), { estimate: '40 часов', tags: ['код','планирование'], personas: ['Борис','Вадим'], notes: [{ id: ulid(), content: 'Слишком большой объём для текущей команды. Вернёмся в Q4.', createdAt: now() }] }),
    t(50, 'Запустить серию подкастов',                    'Личное', 'cancelled', 4, null,     {                       tags: ['планирование'], postponed: 5 }),
  ] : [
    // ── Work ────────────────────────────────────────────────────────────────
    t(1,  'Prepare Q2 roadmap presentation',    'Work', 'active',    1, rel(3),  { estimate: '3 hours',   tags: ['meeting','planning'],   personas: ['Alice'],           flowId: 'ProductLaunch', dateStart: rel(0), notes: [{ id: ulid(), content: 'Include: user growth, revenue trends, Q3 goals, technical roadmap, hiring plan', createdAt: now() }] }),
    t(2,  'Fix critical login bug',             'Work', 'active',    1, rel(1),  { estimate: '2 hours',   tags: ['code','bug','urgent'],   personas: ['Bob'],             flowId: 'ProductLaunch', postponed: 1,      url: 'https://github.com/example/issues/42' }),
    t(3,  'Code review for PR #128',            'Work', 'inbox',     2, rel(2),  { estimate: '1 hour',    tags: ['code','review'],         personas: ['Charlie'],         flowId: 'ProductLaunch', dependsOn: [id(2)],  url: 'https://github.com/example/pulls/128' }),
    t(4,  'Weekly team standup',                'Work', 'active',    3, rel(1),  { estimate: '30 min',    tags: ['meeting'],               personas: ['Alice','Bob','Charlie'], recurrence: 'weekly' }),
    t(5,  'Write API documentation',            'Work', 'active',    2, rel(5),  { estimate: '4 hours',   tags: ['code','planning'],                                      notes: [{ id: ulid(), content: 'Auth, Users, Tasks, Reports, Webhooks', createdAt: now() }], url: 'https://swagger.io/docs/specification/' }),
    t(6,  'Design new user onboarding flow',    'Work', 'inbox',     2, rel(7),  { estimate: '5 hours',   tags: ['design','planning'],     personas: ['Diana'],           flowId: 'ProductLaunch', dateStart: rel(2) }),
    t(7,  'Performance review 1-on-1',          'Work', 'active',    1, rel(4),  { estimate: '1 hour',    tags: ['meeting'],               personas: ['Alice'] }),
    t(8,  'Update project dependencies',        'Work', 'done',      3, rel(-3), { estimate: '1 hour',    tags: ['code'] }),
    t(9,  'Set up error monitoring',            'Work', 'active',    2, rel(6),  { estimate: '2 hours',   tags: ['code'],                  personas: ['Bob'],             flowId: 'ProductLaunch', dependsOn: [id(3)],  url: 'https://sentry.io', dateStart: rel(1) }),
    t(10, 'Conduct 5 user research interviews', 'Work', 'inbox',     2, rel(10), { estimate: '5 hours',   tags: ['research','meeting'],    personas: ['Diana'],           flowId: 'ProductLaunch', dependsOn: [id(6)], dateStart: rel(3), notes: [{ id: ulid(), content: 'Q1: Walk me through your typical day\nQ2: What are the biggest pain points?\nQ3: How do you currently solve this?', createdAt: now() }] }),

    // ── Personal ────────────────────────────────────────────────────────────
    t(11, 'Plan summer vacation',               'Personal', 'inbox',  3, rel(30), { estimate: '2 hours', tags: ['travel','planning'],                                    url: 'https://google.com/flights' }),
    t(12, 'Call dentist for appointment',       'Personal', 'inbox',  2, rel(2),  {                      tags: ['call'],                                                  postponed: 3 }),
    t(13, 'Grocery shopping',                   'Personal', 'active', 3, rel(1),  { estimate: '1 hour',  tags: ['home'],                                                  recurrence: 'weekly' }),
    t(14, 'Call parents',                       'Personal', 'active', 2, rel(3),  { estimate: '30 min',  tags: ['call'],                                                  recurrence: 'weekly', postponed: 1 }),
    t(15, 'Fix leaky bathroom faucet',          'Home',     'inbox',  2, rel(5),  {                      tags: ['home'],                  flowId: 'HomeRenovation',        url: 'https://youtube.com/results?search_query=fix+leaky+faucet' }),
    t(16, 'Organize home office',               'Home',     'inbox',  4, null,    { estimate: '3 hours', tags: ['home'],                                                  postponed: 2 }),
    t(17, 'Renew car insurance',                'Personal', 'inbox',  1, rel(14), {                      tags: ['email','budget'] }),

    // ── Health & Fitness ─────────────────────────────────────────────────────
    t(18, 'Morning run',                        'Health',   'active', 3, rel(1),  { estimate: '45 min',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily' }),
    t(19, 'Weekly yoga class',                  'Health',   'active', 3, rel(3),  { estimate: '1 hour',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'weekly', url: 'https://yoga-studio.example.com' }),
    t(20, 'Meal prep for the week',             'Health',   'active', 3, rel(2),  { estimate: '2 hours', tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'weekly', notes: [{ id: ulid(), content: 'Mon: chicken & rice\nTue: pasta primavera\nWed: salad bowl\nThu: stir fry\nFri: leftovers', createdAt: now() }] }),
    t(21, 'Take daily vitamins',                'Health',   'active', 4, rel(1),  {                      tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily' }),
    t(22, 'Monthly health checkup',             'Health',   'inbox',  2, rel(21), { estimate: '2 hours', tags: ['fitness'],                                               recurrence: 'monthly', postponed: 1 }),
    t(23, '30-minute strength workout',         'Health',   'active', 2, rel(1),  { estimate: '30 min',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily',  url: 'https://fitness-app.example.com/workout' }),

    // ── Learning ─────────────────────────────────────────────────────────────
    t(24, "Read 'Clean Code' chapter 5",        'Learning', 'active', 3, rel(3),  { estimate: '1 hour',   tags: ['reading','code'] }),
    t(25, 'Complete Rust ownership tutorial',   'Learning', 'inbox',  3, rel(7),  { estimate: '2 hours',  tags: ['code','reading'],                                       url: 'https://doc.rust-lang.org/book/ch04.html' }),
    t(26, 'Watch system design talk',           'Learning', 'inbox',  4, null,    { estimate: '1.5 hours',tags: ['research'],                                              url: 'https://youtube.com/watch?v=system-design' }),
    t(27, 'Practice SQL window functions',      'Learning', 'inbox',  3, rel(10), { estimate: '1.5 hours',tags: ['code'],                                                  url: 'https://sqlzoo.net/wiki/Window_functions' }),
    t(28, 'Write blog post: React perf tips',   'Learning', 'active', 2, rel(12), { estimate: '3 hours',  tags: ['code','planning'],      dateStart: rel(5),               notes: [{ id: ulid(), content: '1. useMemo and useCallback\n2. Code splitting\n3. Virtual lists\n4. Image optimization\n5. Bundle analysis', createdAt: now() }] }),
    t(29, 'Monthly learning retrospective',     'Learning', 'inbox',  3, rel(25), { estimate: '1 hour',   tags: ['planning','research'],  recurrence: 'monthly' }),

    // ── Finance ───────────────────────────────────────────────────────────────
    t(30, 'Review monthly budget',              'Finance',  'active', 2, rel(7),  { estimate: '1 hour',   tags: ['budget'],               recurrence: 'monthly' }),
    t(31, 'File quarterly taxes',               'Finance',  'inbox',  1, rel(21), { estimate: '3 hours',  tags: ['urgent','budget'],      dateStart: rel(14),              notes: [{ id: ulid(), content: '☐ W-2 / 1099 forms\n☐ Last year\'s return\n☐ Mortgage interest statement\n☐ Charitable donation receipts\n☐ Medical expense records', createdAt: now() }] }),
    t(32, 'Negotiate cable/internet bill',      'Finance',  'inbox',  3, rel(5),  {                       tags: ['call','budget'],         postponed: 2 }),
    t(33, 'Monthly transfer to savings',        'Finance',  'active', 2, rel(7),  {                       tags: ['budget'],               recurrence: 'monthly' }),
    t(34, 'Review investment portfolio',        'Finance',  'inbox',  3, rel(14), { estimate: '1 hour',   tags: ['budget','research'],    url: 'https://finance.yahoo.com/portfolio' }),

    // ── Side Project ──────────────────────────────────────────────────────────
    t(35, 'Set up CI/CD pipeline',              'Side Project', 'active', 2, rel(4),  { estimate: '3 hours', tags: ['code'],            personas: ['Bob'],    flowId: 'ProductLaunch', url: 'https://github.com/features/actions' }),
    t(36, 'Write unit tests for auth module',   'Side Project', 'inbox',  2, rel(6),  { estimate: '2 hours', tags: ['code','review'],                         flowId: 'ProductLaunch', dependsOn: [id(35)] }),
    t(37, 'Design landing page',                'Side Project', 'active', 2, rel(8),  { estimate: '5 hours', tags: ['design'],          personas: ['Diana'],  flowId: 'ProductLaunch' }),
    t(38, 'Integrate analytics',                'Side Project', 'inbox',  3, rel(9),  { estimate: '2 hours', tags: ['code'],                                  flowId: 'ProductLaunch', dependsOn: [id(35)], dateStart: rel(5), url: 'https://analytics.google.com' }),
    t(39, 'Public beta launch',                 'Side Project', 'inbox',  1, rel(21), {                      tags: ['planning','urgent'], personas: ['Alice','Bob'], flowId: 'ProductLaunch', dependsOn: [id(36)], dateStart: rel(15) }),

    // ── Home Renovation (flow) ────────────────────────────────────────────────
    t(40, 'Get 3 quotes for bathroom reno',     'Home', 'inbox',  2, rel(7),  {                      tags: ['home','research'],   personas: ['Charlie'],   flowId: 'HomeRenovation' }),
    t(41, 'Choose tiles and fixtures',          'Home', 'inbox',  2, rel(14), { estimate: '3 hours', tags: ['design','home'],                              flowId: 'HomeRenovation', dependsOn: [id(40)], dateStart: rel(7),  url: 'https://houzz.com' }),
    t(42, 'Sign contract with contractor',      'Home', 'inbox',  1, rel(21), {                      tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: [id(41)], dateStart: rel(14) }),
    t(43, 'Manage renovation timeline',         'Home', 'inbox',  2, rel(45), {                      tags: ['planning','home'],                            flowId: 'HomeRenovation', dependsOn: [id(42)], dateStart: rel(30) }),
    t(44, 'Final walkthrough and sign-off',     'Home', 'inbox',  2, rel(60), { estimate: '1 hour',  tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: [id(43)], dateStart: rel(58) }),

    // ── Done ─────────────────────────────────────────────────────────────────
    t(45, 'Set up new development laptop',      'Work',     'done',      3, rel(-7),  { estimate: '4 hours', tags: ['code'] }),
    t(46, 'Book flight for conference',         'Personal', 'done',      2, rel(-14), {                      tags: ['travel','email'],                               url: 'https://flights.google.com' }),
    t(47, 'Create project proposal document',   'Work',     'done',      1, rel(-5),  { estimate: '2 hours', tags: ['planning'],      personas: ['Alice'] }),
    t(48, 'Read Q4 annual report',              'Finance',  'done',      3, rel(-10), { estimate: '1 hour',  tags: ['reading','budget'] }),

    // ── Cancelled ─────────────────────────────────────────────────────────────
    t(49, 'Migrate monolith to microservices',  'Work',     'cancelled', 2, rel(-30), { estimate: '40 hours', tags: ['code','planning'], personas: ['Bob','Charlie'], notes: [{ id: ulid(), content: 'Scope too large for current team. Will revisit in Q4 with dedicated resources.', createdAt: now() }] }),
    t(50, 'Launch podcast series',              'Personal', 'cancelled', 4, null,     {                       tags: ['planning'],         postponed: 5 }),
  ];

  return { tasks, lists: L.lists, tags: L.tags, flows: L.flows, personas: L.personas };
}

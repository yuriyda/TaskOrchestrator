/**
 * Demo / mock data for in-memory store and onboarding.
 * Generates sample tasks, lists, tags, flows, personas for first-run experience.
 */
import { ulid } from '../ulid.js';

// ─── Mock Data (English) ──────────────────────────────────────────────────────

export const MOCK_LISTS    = ["Home", "Work", "Studies", "Shopping", "Health"];
export const MOCK_TAGS     = ["shopping", "urgent", "meeting", "code", "call", "reading", "sport"];
export const MOCK_FLOWS    = ["ShoppingTrip", "ProductRelease", "MorningRoutine"];
export const MOCK_PERSONAS = ["Alice", "Bob", "Charlie"];

let nextId = 100;
export const uid = () => String(nextId++);

export const INITIAL_TASKS = [
  { id: "1",  title: "Buy milk",               list: "Shopping", tags: ["shopping"],          personas: [],          priority: 2, due: "2026-03-23", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: "3",  subtasks: [], status: "active", createdAt: "2026-03-20T10:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "2",  title: "Call the doctor",         list: "Health",   tags: ["call", "urgent"],   personas: ["Alice"],   priority: 1, due: "2026-03-22", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-21T08:00:00Z", url: null, dateStart: null, estimate: "30 min", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "3",  title: "Check shopping list",     list: "Shopping", tags: ["shopping"],          personas: [],          priority: 3, due: "2026-03-23", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-19T14:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "4",  title: "Write weekly report",     list: "Work",     tags: ["code"],              personas: ["Bob"],     priority: 2, due: "2026-03-24", recurrence: "weekly",flowId: "ProductRelease", dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-18T09:00:00Z", url: "https://docs.example.com/report", dateStart: null, estimate: "2 hours", postponed: 1, notes: [{ id: "n1", title: "Template", content: "Use the Q1 template from shared drive", createdAt: "2026-03-18T09:30:00Z" }], rtmSeriesId: null },
  { id: "5",  title: "Morning workout",         list: "Health",   tags: ["sport"],             personas: [],          priority: 3, due: null,         recurrence: "daily", flowId: "MorningRoutine", dependsOn: null, subtasks: [], status: "active", createdAt: "2026-03-20T06:00:00Z", url: null, dateStart: null, estimate: "45 min", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "6",  title: "Read a book chapter",     list: "Studies",  tags: ["reading"],           personas: [],          priority: 4, due: "2026-03-25", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-21T20:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "7",  title: "Prepare presentation",    list: "Work",     tags: ["meeting"],           personas: ["Alice","Bob"], priority: 1, due: "2026-03-23", recurrence: null, flowId: "ProductRelease", dependsOn: "4",  subtasks: [], status: "active", createdAt: "2026-03-17T11:00:00Z", url: null, dateStart: "2026-03-22", estimate: "3 hours", postponed: 0, notes: [], rtmSeriesId: null },
  { id: "8",  title: "Clean windows",           list: "Home",     tags: [],                    personas: [],          priority: 4, due: "2026-03-28", recurrence: null,    flowId: null,             dependsOn: null, subtasks: [], status: "inbox",  createdAt: "2026-03-22T10:00:00Z", url: null, dateStart: null, estimate: null, postponed: 2, notes: [], rtmSeriesId: null },
  { id: "9",  title: "Do code review",          list: "Work",     tags: ["code"],              personas: ["Charlie"], priority: 2, due: "2026-03-22", recurrence: null,    flowId: "ProductRelease", dependsOn: "7",  subtasks: [], status: "inbox",  createdAt: "2026-03-21T15:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
  { id: "10", title: "Buy vitamins",            list: "Shopping", tags: ["shopping","urgent"], personas: [],          priority: 2, due: "2026-03-22", recurrence: null,    flowId: "ShoppingTrip",   dependsOn: "1",  subtasks: [], status: "active", createdAt: "2026-03-21T12:00:00Z", url: null, dateStart: null, estimate: null, postponed: 0, notes: [], rtmSeriesId: null },
];

// ─── Demo data generator ──────────────────────────────────────────────────────

export function buildDemoTasks() {
  const rel = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const now = () => new Date().toISOString();
  // Generate unique IDs for demo tasks; memoized so dependsOn references work
  const _idMap = {};
  const ENC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const rndChar = () => ENC[(Math.random() * 32) | 0];
  const id = (n) => { if (!_idMap[n]) { let s = ''; for (let i = 0; i < 26; i++) s += rndChar(); _idMap[n] = s; } return _idMap[n]; };

  const lists    = ['Work', 'Personal', 'Health', 'Learning', 'Finance', 'Side Project', 'Home'];
  const tags     = ['meeting', 'code', 'design', 'call', 'email', 'urgent', 'review',
                    'planning', 'research', 'fitness', 'reading', 'budget', 'travel', 'home', 'bug'];
  const flows    = ['ProductLaunch', 'WeeklyWellness', 'HomeRenovation'];
  const personas = ['Alice', 'Bob', 'Charlie', 'Diana'];

  const t = (n, title, list, status, priority, due, opts = {}) => ({
    id: id(n), title, list, status, priority, due,
    dateStart: null, estimate: null, recurrence: null,
    flowId: null, dependsOn: null, tags: [], personas: [],
    url: null, postponed: 0, subtasks: [], notes: [], rtmSeriesId: null,
    createdAt: now(),
    completedAt: status === 'done' ? (due ? `${due}T12:00:00.000Z` : now()) : null,
    ...opts,
  });

  const tasks = [
    // ── Work ────────────────────────────────────────────────────────────────
    t(1,  'Prepare Q2 roadmap presentation',    'Work', 'active',    1, rel(3),  { estimate: '3 hours',   tags: ['meeting','planning'],   personas: ['Alice'],           flowId: 'ProductLaunch', dateStart: rel(0), rtmSeriesId: id(1), notes: [{ id: ulid(), title: 'Key slides', content: 'Include: user growth, revenue trends, Q3 goals, technical roadmap, hiring plan', createdAt: now() }] }),
    t(2,  'Fix critical login bug',             'Work', 'active',    1, rel(1),  { estimate: '2 hours',   tags: ['code','bug','urgent'],   personas: ['Bob'],             flowId: 'ProductLaunch', postponed: 1,      url: 'https://github.com/example/issues/42' }),
    t(3,  'Code review for PR #128',            'Work', 'inbox',     2, rel(2),  { estimate: '1 hour',    tags: ['code','review'],         personas: ['Charlie'],         flowId: 'ProductLaunch', dependsOn: id(2),  url: 'https://github.com/example/pulls/128' }),
    t(4,  'Weekly team standup',                'Work', 'active',    3, rel(1),  { estimate: '30 min',    tags: ['meeting'],               personas: ['Alice','Bob','Charlie'], recurrence: 'weekly' }),
    t(5,  'Write API documentation',            'Work', 'active',    2, rel(5),  { estimate: '4 hours',   tags: ['code','planning'],                                      rtmSeriesId: id(5), notes: [{ id: ulid(), title: 'Endpoints to document', content: 'Auth, Users, Tasks, Reports, Webhooks', createdAt: now() }], url: 'https://swagger.io/docs/specification/' }),
    t(6,  'Design new user onboarding flow',    'Work', 'inbox',     2, rel(7),  { estimate: '5 hours',   tags: ['design','planning'],     personas: ['Diana'],           flowId: 'ProductLaunch', dateStart: rel(2) }),
    t(7,  'Performance review 1-on-1',          'Work', 'active',    1, rel(4),  { estimate: '1 hour',    tags: ['meeting'],               personas: ['Alice'] }),
    t(8,  'Update project dependencies',        'Work', 'done',      3, rel(-3), { estimate: '1 hour',    tags: ['code'] }),
    t(9,  'Set up error monitoring',            'Work', 'active',    2, rel(6),  { estimate: '2 hours',   tags: ['code'],                  personas: ['Bob'],             flowId: 'ProductLaunch', dependsOn: id(3),  url: 'https://sentry.io', dateStart: rel(1) }),
    t(10, 'Conduct 5 user research interviews', 'Work', 'inbox',     2, rel(10), { estimate: '5 hours',   tags: ['research','meeting'],    personas: ['Diana'],           flowId: 'ProductLaunch', dependsOn: id(6), dateStart: rel(3), rtmSeriesId: id(10), notes: [{ id: ulid(), title: 'Interview script', content: 'Q1: Walk me through your typical day\nQ2: What are the biggest pain points?\nQ3: How do you currently solve this?', createdAt: now() }] }),

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
    t(20, 'Meal prep for the week',             'Health',   'active', 3, rel(2),  { estimate: '2 hours', tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'weekly', rtmSeriesId: id(20), notes: [{ id: ulid(), title: 'This week menu', content: 'Mon: chicken & rice\nTue: pasta primavera\nWed: salad bowl\nThu: stir fry\nFri: leftovers', createdAt: now() }] }),
    t(21, 'Take daily vitamins',                'Health',   'active', 4, rel(1),  {                      tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily' }),
    t(22, 'Monthly health checkup',             'Health',   'inbox',  2, rel(21), { estimate: '2 hours', tags: ['fitness'],                                               recurrence: 'monthly', postponed: 1 }),
    t(23, '30-minute strength workout',         'Health',   'active', 2, rel(1),  { estimate: '30 min',  tags: ['fitness'],               flowId: 'WeeklyWellness',        recurrence: 'daily',  url: 'https://fitness-app.example.com/workout' }),

    // ── Learning ─────────────────────────────────────────────────────────────
    t(24, "Read 'Clean Code' chapter 5",        'Learning', 'active', 3, rel(3),  { estimate: '1 hour',   tags: ['reading','code'] }),
    t(25, 'Complete Rust ownership tutorial',   'Learning', 'inbox',  3, rel(7),  { estimate: '2 hours',  tags: ['code','reading'],                                       url: 'https://doc.rust-lang.org/book/ch04.html' }),
    t(26, 'Watch system design talk',           'Learning', 'inbox',  4, null,    { estimate: '1.5 hours',tags: ['research'],                                              url: 'https://youtube.com/watch?v=system-design' }),
    t(27, 'Practice SQL window functions',      'Learning', 'inbox',  3, rel(10), { estimate: '1.5 hours',tags: ['code'],                                                  url: 'https://sqlzoo.net/wiki/Window_functions' }),
    t(28, 'Write blog post: React perf tips',   'Learning', 'active', 2, rel(12), { estimate: '3 hours',  tags: ['code','planning'],      dateStart: rel(5),               rtmSeriesId: id(28), notes: [{ id: ulid(), title: 'Outline', content: '1. useMemo and useCallback\n2. Code splitting\n3. Virtual lists\n4. Image optimization\n5. Bundle analysis', createdAt: now() }] }),
    t(29, 'Monthly learning retrospective',     'Learning', 'inbox',  3, rel(25), { estimate: '1 hour',   tags: ['planning','research'],  recurrence: 'monthly' }),

    // ── Finance ───────────────────────────────────────────────────────────────
    t(30, 'Review monthly budget',              'Finance',  'active', 2, rel(7),  { estimate: '1 hour',   tags: ['budget'],               recurrence: 'monthly' }),
    t(31, 'File quarterly taxes',               'Finance',  'inbox',  1, rel(21), { estimate: '3 hours',  tags: ['urgent','budget'],      dateStart: rel(14),              rtmSeriesId: id(31), notes: [{ id: ulid(), title: 'Documents checklist', content: '☐ W-2 / 1099 forms\n☐ Last year\'s return\n☐ Mortgage interest statement\n☐ Charitable donation receipts\n☐ Medical expense records', createdAt: now() }] }),
    t(32, 'Negotiate cable/internet bill',      'Finance',  'inbox',  3, rel(5),  {                       tags: ['call','budget'],         postponed: 2 }),
    t(33, 'Monthly transfer to savings',        'Finance',  'active', 2, rel(7),  {                       tags: ['budget'],               recurrence: 'monthly' }),
    t(34, 'Review investment portfolio',        'Finance',  'inbox',  3, rel(14), { estimate: '1 hour',   tags: ['budget','research'],    url: 'https://finance.yahoo.com/portfolio' }),

    // ── Side Project ──────────────────────────────────────────────────────────
    t(35, 'Set up CI/CD pipeline',              'Side Project', 'active', 2, rel(4),  { estimate: '3 hours', tags: ['code'],            personas: ['Bob'],    flowId: 'ProductLaunch', url: 'https://github.com/features/actions' }),
    t(36, 'Write unit tests for auth module',   'Side Project', 'inbox',  2, rel(6),  { estimate: '2 hours', tags: ['code','review'],                         flowId: 'ProductLaunch', dependsOn: id(35) }),
    t(37, 'Design landing page',                'Side Project', 'active', 2, rel(8),  { estimate: '5 hours', tags: ['design'],          personas: ['Diana'],  flowId: 'ProductLaunch' }),
    t(38, 'Integrate analytics',                'Side Project', 'inbox',  3, rel(9),  { estimate: '2 hours', tags: ['code'],                                  flowId: 'ProductLaunch', dependsOn: id(35), dateStart: rel(5), url: 'https://analytics.google.com' }),
    t(39, 'Public beta launch',                 'Side Project', 'inbox',  1, rel(21), {                      tags: ['planning','urgent'], personas: ['Alice','Bob'], flowId: 'ProductLaunch', dependsOn: id(36), dateStart: rel(15) }),

    // ── Home Renovation (flow) ────────────────────────────────────────────────
    t(40, 'Get 3 quotes for bathroom reno',     'Home', 'inbox',  2, rel(7),  {                      tags: ['home','research'],   personas: ['Charlie'],   flowId: 'HomeRenovation' }),
    t(41, 'Choose tiles and fixtures',          'Home', 'inbox',  2, rel(14), { estimate: '3 hours', tags: ['design','home'],                              flowId: 'HomeRenovation', dependsOn: id(40), dateStart: rel(7),  url: 'https://houzz.com' }),
    t(42, 'Sign contract with contractor',      'Home', 'inbox',  1, rel(21), {                      tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: id(41), dateStart: rel(14) }),
    t(43, 'Manage renovation timeline',         'Home', 'inbox',  2, rel(45), {                      tags: ['planning','home'],                            flowId: 'HomeRenovation', dependsOn: id(42), dateStart: rel(30) }),
    t(44, 'Final walkthrough and sign-off',     'Home', 'inbox',  2, rel(60), { estimate: '1 hour',  tags: ['home'],             personas: ['Charlie'],   flowId: 'HomeRenovation', dependsOn: id(43), dateStart: rel(58) }),

    // ── Done ─────────────────────────────────────────────────────────────────
    t(45, 'Set up new development laptop',      'Work',     'done',      3, rel(-7),  { estimate: '4 hours', tags: ['code'] }),
    t(46, 'Book flight for conference',         'Personal', 'done',      2, rel(-14), {                      tags: ['travel','email'],                               url: 'https://flights.google.com' }),
    t(47, 'Create project proposal document',   'Work',     'done',      1, rel(-5),  { estimate: '2 hours', tags: ['planning'],      personas: ['Alice'] }),
    t(48, 'Read Q4 annual report',              'Finance',  'done',      3, rel(-10), { estimate: '1 hour',  tags: ['reading','budget'] }),

    // ── Cancelled ─────────────────────────────────────────────────────────────
    t(49, 'Migrate monolith to microservices',  'Work',     'cancelled', 2, rel(-30), { estimate: '40 hours', tags: ['code','planning'], personas: ['Bob','Charlie'], rtmSeriesId: id(49), notes: [{ id: ulid(), title: 'Cancellation reason', content: 'Scope too large for current team. Will revisit in Q4 with dedicated resources.', createdAt: now() }] }),
    t(50, 'Launch podcast series',              'Personal', 'cancelled', 4, null,     {                       tags: ['planning'],         postponed: 5 }),
  ];

  return { tasks, lists, tags, flows, personas };
}

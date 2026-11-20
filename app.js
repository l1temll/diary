// ============================================================================
// 1. КОНФИГУРАЦИЯ FIREBASE (НЕБЛОКИРУЮЩАЯ ФОНОВАЯ ЗАГРУЗКА)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDwVDsV2-mbp0mHxZhyTCIP3-ym9UAjrWc",
  authDomain: "my-student-diary.firebaseapp.com",
  projectId: "my-student-diary",
  storageBucket: "my-student-diary.firebasestorage.app",
  messagingSenderId: "801393969196",
  appId: "1:801393969196:web:66bb0b1411f55249756989",
  measurementId: "G-B0BZEGM91N"
};

const isFirebaseConfigured =
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.includes("ВСТАВЬТЕ") &&
  !firebaseConfig.projectId.includes("ВАШ_ПРОЕКТ");

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

// Ссылки на методы Firebase (подгружаются асинхронно после отрисовки UI)
let signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut;
let collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch;

async function initFirebaseInBackground() {
  if (!isFirebaseConfigured) return;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js")
    ]);

    signInWithPopup = authMod.signInWithPopup;
    signInWithRedirect = authMod.signInWithRedirect;
    getRedirectResult = authMod.getRedirectResult;
    onAuthStateChanged = authMod.onAuthStateChanged;
    signOut = authMod.signOut;

    collection = fsMod.collection;
    doc = fsMod.doc;
    setDoc = fsMod.setDoc;
    updateDoc = fsMod.updateDoc;
    deleteDoc = fsMod.deleteDoc;
    onSnapshot = fsMod.onSnapshot;
    writeBatch = fsMod.writeBatch;

    app = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    googleProvider = new authMod.GoogleAuthProvider();
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({
        tabManager: fsMod.persistentMultipleTabManager()
      })
    });

    initFirebaseAuth();
  } catch (err) {
    console.warn("Firebase background init warning:", err);
  }
}

// ============================================================================
// 2. ЗВОНКИ И ВСТРОЕННАЯ БАЗА РАСПИСАНИЯ (ВСЕ 275 ПАР 1 СЕМЕСТРА)
// ============================================================================
const BELL_SCHEDULE = {
  "1": { start: "08:00", end: "09:30" },
  "2": { start: "09:40", end: "11:10" },
  "3": { start: "11:20", end: "12:50" },
  "4": { start: "13:20", end: "14:50" },
  "5": { start: "15:00", end: "16:30" },
  "6": { start: "16:40", end: "18:10" },
  "7": { start: "18:20", end: "19:50" }
};

// Константы обеденного перерыва (12:50 - 13:20)
const LUNCH_START_SEC = (12 * 60 + 50) * 60;
const LUNCH_END_SEC = (13 * 60 + 20) * 60;

const CLASS_TEMPLATES = [
  [2, "09:40", "11:10", "Элективные курсы по физической культуре и спорту", "Практика", "Зал №2", "доц. Ловыгина О.Н."],
  [4, "13:20", "14:50", "Математический анализ", "Лекция", "Б-403", "Чернышова А.В."],
  [5, "15:00", "16:30", "Алгебра и геометрия", "Практика", "Б-403", "доц. Чернышова А.В."],
  [3, "11:20", "12:50", "Информатика", "Лабораторная", "Б-304", "ст.пр. Рабушко А.Г."],
  [4, "13:20", "14:50", "Основы программирования", "Практика", "Б-403", "ст.пр. Адаменко Ю.В."],
  [1, "08:00", "09:30", "Информатика", "Лекция", "Б-403", "доц. Волк В.К."],
  [2, "09:40", "11:10", "История России", "Практика", "Б-406", "доц. Коновалов С.С."],
  [3, "11:20", "12:50", "История России", "Лекция", "Б-403", "доц. Коновалов С.С."],
  [4, "13:20", "14:50", "Физика", "Практика", "Б-344", "доц. Левченко Е.Ю."],
  [1, "08:00", "09:30", "Основы программирования", "Лабораторная", "Б-307", "ст.пр. Адаменко Ю.В."],
  [2, "09:40", "11:10", "Иностранный язык, английский", "Практика", "Б-201", "доц. Савельева М.В."],
  [3, "11:20", "12:50", "Введение в профессиональную деятельность", "Лекция", "Б-248", "ст.пр. Адаменко Ю.В."],
  [5, "15:00", "16:30", "Русский язык делового общения", "Лекция (Дистант)", "дистант", "доц. Шушарина И.А."],
  [6, "16:40", "18:10", "Основы программирования", "Лекция (Дистант)", "дистант", "ст.пр. Адаменко Ю.В."],
  [3, "11:20", "12:50", "Математический анализ", "Лекция", "Б-403", "Чернышова А.В."],
  [4, "13:20", "14:50", "Алгебра и геометрия", "Лекция", "Б-403", "Чернышова А.В."],
  [1, "08:00", "09:30", "Физика", "Лекция", "Б-403", "доц. Левченко Е.Ю."],
  [3, "11:20", "12:50", "Введение в профессиональную деятельность", "Практика", "Б-248", "ст.пр. Адаменко Ю.В."],
  [5, "15:00", "16:30", "Русский язык делового общения", "Практика (Дистант)", "дистант", "доц. Шушарина И.А."],
  [5, "15:00", "16:30", "Основы российской государственности", "Лекция", "Б-403", "доц. Меньщикова Л.В."],
  [6, "16:40", "18:10", "Основы российской государственности", "Лекция", "Б-403", "доц. Меньщикова Л.В."],
  [5, "15:00", "16:30", "Основы российской государственности", "Практика", "Б-403", "доц. Меньщикова Л.В."],
  [6, "16:40", "18:10", "Основы российской государственности", "Практика", "Б-403", "доц. Богданова Е.П."],
  [1, "08:00", "09:30", "Основы российской государственности", "Практика", "Б-403", "доц. Богданова Е.П."],
  [2, "09:40", "11:10", "Основы российской государственности", "Практика", "Б-403", "доц. Богданова Е.П."],
  [5, "15:00", "16:30", "Основы российской государственности", "Лекция", "Б-403", "доц. Царев Р.Ю."],
  [6, "16:40", "18:10", "Основы российской государственности", "Лекция", "Б-403", "доц. Царев Р.Ю."],
  [5, "15:00", "16:30", "Основы российской государственности", "Практика", "Б-403", "доц. Царев Р.Ю."],
  [6, "16:40", "18:10", "Основы российской государственности", "Практика", "Б-403", "доц. Царев Р.Ю."],
  [1, "08:00", "09:30", "Основы российской государственности", "Практика", "Б-403", "доц. Царев Р.Ю."],
  [2, "09:40", "11:10", "Основы российской государственности", "Практика", "Б-403", "доц. Царев Р.Ю."],
  [5, "15:00", "16:30", "Основы российской государственности", "Лекция", "Б-403", "доц. Прокопьева М.Ю."],
  [6, "16:40", "18:10", "Основы российской государственности", "Лекция", "Б-403", "доц. Прокопьева М.Ю."],
  [5, "15:00", "16:30", "Основы российской государственности", "Практика", "Б-403", "доц. Прокопьева М.Ю."],
  [6, "16:40", "18:10", "Основы российской государственности", "Практика", "Б-403", "доц. Прокопьева М.Ю."],
  [1, "08:00", "09:30", "Основы российской государственности", "Практика", "Б-403", "доц. Прокопьева М.Ю."],
  [2, "09:40", "11:10", "Основы российской государственности", "Практика", "Б-403", "доц. Прокопьева М.Ю."],
  [5, "15:00", "16:30", "Основы российской государственности", "Лекция", "Б-403", "доц. Жайкбаев Ж.С."],
  [6, "16:40", "18:10", "Основы российской государственности", "Лекция", "Б-403", "доц. Жайкбаев Ж.С."],
  [5, "15:00", "16:30", "Основы российской государственности", "Практика", "Б-403", "доц. Жайкбаев Ж.С."],
  [6, "16:40", "18:10", "Основы российской государственности", "Практика", "Б-403", "доц. Жайкбаев Ж.С."],
  [1, "08:00", "09:30", "Основы российской государственности", "Практика", "Б-403", "доц. Жайкбаев Ж.С."],
  [2, "09:40", "11:10", "Основы российской государственности", "Практика", "Б-403", "доц. Жайкбаев Ж.С."],
  [5, "15:00", "16:30", "Основы российской государственности", "Лекция", "Б-403", "проф. Орлов С.Н."],
  [6, "16:40", "18:10", "Основы российской государственности", "Лекция", "Б-403", "проф. Орлов С.Н."],
  [5, "15:00", "16:30", "Основы российской государственности", "Практика", "Б-403", "проф. Орлов С.Н."],
  [6, "16:40", "18:10", "Основы российской государственности", "Практика", "Б-403", "проф. Орлов С.Н."],
  [4, "13:20", "14:50", "Физика", "Лабораторная", "Б-341", "ст.пр. Никифорова Л.Н."],
  [1, "08:00", "09:30", "Основы российской государственности", "Практика", "Б-403", "проф. Орлов С.Н."],
  [2, "09:40", "11:10", "Основы российской государственности", "Практика", "Б-403", "проф. Орлов С.Н."],
  [2, "09:40", "11:10", "Алгебра и геометрия", "Практика", "Б-403", "доц. Чернышова А.В."]
];

const SEMESTER_DATE_MAP = {
  "2026-09-01": [0, 1, 2], "2026-09-02": [3, 4], "2026-09-03": [5, 6, 7, 8], "2026-09-04": [9, 10, 11], "2026-09-05": [12, 13],
  "2026-09-07": [14, 15], "2026-09-08": [0, 1, 2], "2026-09-09": [3, 4], "2026-09-10": [16, 6, 7], "2026-09-11": [9, 10, 17], "2026-09-12": [18, 13],
  "2026-09-14": [14, 15], "2026-09-15": [0, 1, 2], "2026-09-16": [3, 4], "2026-09-17": [5, 6, 7, 8], "2026-09-18": [9, 10], "2026-09-19": [12, 13],
  "2026-09-21": [14, 15], "2026-09-22": [0, 1, 2], "2026-09-23": [3, 4], "2026-09-24": [16, 6, 7], "2026-09-25": [9, 10, 17], "2026-09-26": [18, 13],
  "2026-09-28": [14, 15], "2026-09-29": [0, 1, 2], "2026-09-30": [3, 4], "2026-10-01": [5, 6, 7, 8], "2026-10-02": [9, 10], "2026-10-03": [12, 13],
  "2026-10-05": [14, 15, 19, 20], "2026-10-06": [0, 1, 2], "2026-10-07": [3, 4, 21, 22], "2026-10-08": [16, 6, 7], "2026-10-09": [9, 10, 17], "2026-10-10": [23, 24, 18, 13],
  "2026-10-12": [14, 15, 25, 26], "2026-10-13": [0, 1, 2], "2026-10-14": [3, 4, 27, 28], "2026-10-15": [5, 6, 7, 8], "2026-10-16": [9, 10], "2026-10-17": [29, 30, 12, 13],
  "2026-10-19": [14, 15, 31, 32], "2026-10-20": [0, 1, 2], "2026-10-21": [3, 4, 33, 34], "2026-10-22": [16, 6, 7], "2026-10-23": [9, 10, 17], "2026-10-24": [35, 36, 13],
  "2026-10-26": [14, 15, 37, 38], "2026-10-27": [0, 1, 2], "2026-10-28": [3, 4, 39, 40], "2026-10-29": [5, 6, 7], "2026-10-30": [9, 10], "2026-10-31": [41, 42, 12, 13],
  "2026-11-02": [14, 15, 43, 44], "2026-11-03": [0, 1, 45, 46], "2026-11-04": [3, 4], "2026-11-05": [16, 6, 7, 47], "2026-11-06": [9, 10, 17], "2026-11-07": [48, 49, 13],
  "2026-11-09": [14, 15], "2026-11-10": [0, 1, 2], "2026-11-11": [3, 4], "2026-11-12": [5, 6, 7], "2026-11-13": [9, 10], "2026-11-14": [50, 12, 13],
  "2026-11-16": [14, 15], "2026-11-17": [0, 1, 2], "2026-11-18": [3, 4], "2026-11-19": [16, 6, 7, 47], "2026-11-20": [9, 10, 17], "2026-11-21": [13],
  "2026-11-23": [14, 15], "2026-11-24": [0, 1, 2], "2026-11-25": [3, 4], "2026-11-26": [5, 6, 7], "2026-11-27": [9, 10], "2026-11-28": [12, 13],
  "2026-11-30": [14, 15], "2026-12-01": [0, 1, 2], "2026-12-02": [3, 4], "2026-12-03": [16, 6, 7, 47], "2026-12-04": [9, 10, 17], "2026-12-05": [13],
  "2026-12-07": [14, 15], "2026-12-08": [0, 1, 2], "2026-12-09": [3, 4], "2026-12-10": [5, 7], "2026-12-11": [9, 10], "2026-12-12": [12, 13],
  "2026-12-14": [14, 15], "2026-12-15": [0, 1, 2], "2026-12-16": [3, 4], "2026-12-17": [16, 7, 47], "2026-12-18": [9, 10, 17], "2026-12-19": [13],
  "2026-12-21": [14, 15], "2026-12-22": [0, 1, 2], "2026-12-23": [3, 4], "2026-12-24": [5, 7], "2026-12-25": [9, 10], "2026-12-26": [12, 13]
};

function buildDefaultSchedule() {
  const list = [];
  let counter = 1;
  for (const [dateStr, templateIds] of Object.entries(SEMESTER_DATE_MAP)) {
    for (const tplIndex of templateIds) {
      const [number, startTime, endTime, subject, type, room, teacher] = CLASS_TEMPLATES[tplIndex];
      list.push({
        id: `sem1_${dateStr}_${counter++}`,
        date: dateStr,
        number,
        startTime,
        endTime,
        subject,
        topic: "",
        type,
        room,
        teacher
      });
    }
  }
  return list;
}

const SEMESTER_START_MONDAY = "2026-08-31";

// ============================================================================
// 2.5. ФИЗИЧЕСКИЙ ДВИЖОК ПРУЖИН И ЖЕСТОВ (TELEGRAM iOS / WWDC 2018)
// ============================================================================
const SPRING_SHEET = { stiffness: 380, damping: 38, mass: 1 };   // Без отскока (damping ratio ≈ 0.98)
const SPRING_SNAPPY = { stiffness: 540, damping: 34, mass: 1 };  // Упругий отклик с лёгким отскоком (ratio ≈ 0.73)
const SPRING_PAGE = { stiffness: 420, damping: 41, mass: 1 };    // Перелистывание дней и вкладок (ratio ≈ 1.0)

const SWIPE_CONFIG = {
  DECELERATION_RATE: 0.998,      // Коэффициент инерции iOS UIScrollView
  RUBBER_CONSTANT: 0.55,         // Коэффициент натяжения Apple
  DAY_COMMIT_RATIO: 0.36,        // Доля ширины экрана для переключения дня
  DAY_VELOCITY_THRESHOLD: 420,   // Порог скорости пальца (px/s) для смены дня
  SHEET_DISMISS_RATIO: 0.38,     // Доля высоты шторки для закрытия
  SHEET_VELOCITY_THRESHOLD: 520, // Порог скорости пальца (px/s) для смахивания шторки
  EDGE_TAB_ZONE_PX: 28           // Зона у края экрана для свайпа вкладок поверх расписания
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function isReducedMotion() {
  return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

// Формула Apple rubber-band: (1 - 1 / ((x * 0.55 / d) + 1)) * d
function rubberBand(offset, dimension, constant = SWIPE_CONFIG.RUBBER_CONSTANT) {
  if (dimension <= 0 || offset === 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const abs = Math.abs(offset);
  return sign * (1 - 1 / ((abs * constant) / dimension + 1)) * dimension;
}

// Проекция конечной точки по скорости (WWDC 2018 Designing Fluid Interfaces)
function projectPosition(position, velocity, rate = SWIPE_CONFIG.DECELERATION_RATE) {
  return position + (velocity / 1000) * (rate / (1 - rate));
}

// Кольцевой трекер скорости пальца за последние 90 мс (возвращает px/sec)
function createVelocityTracker() {
  const pts = [];
  return {
    add(x, y, t = performance.now()) {
      pts.push({ x, y, t });
      const cutoff = t - 105;
      while (pts.length > 2 && pts[0].t < cutoff) pts.shift();
    },
    getVelocity(now = performance.now()) {
      const cutoff = now - 95;
      while (pts.length > 1 && pts[0].t < cutoff) pts.shift();
      if (pts.length < 2) return { vx: 0, vy: 0 };
      const first = pts[0];
      const last = pts[pts.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt <= 0.003) return { vx: 0, vy: 0 };
      return {
        vx: (last.x - first.x) / dt,
        vy: (last.y - first.y) / dt
      };
    },
    reset() {
      pts.length = 0;
    }
  };
}

// Решатель физической пружины с фиксированным подшагом 8 мс
function spring(from, to, options = {}, onUpdate, onDone) {
  const stiffness = options.stiffness ?? SPRING_SHEET.stiffness;
  const damping = options.damping ?? SPRING_SHEET.damping;
  const mass = options.mass ?? SPRING_SHEET.mass;
  const precision = options.precision ?? 1.2;

  let pos = from;
  let vel = options.velocity ?? 0;
  let rafId = 0;
  let stopped = false;

  if (isReducedMotion() || (Math.abs(to - from) < precision && Math.abs(vel) < precision)) {
    if (onUpdate) onUpdate(to, 0);
    if (onDone) onDone();
    return {
      stop() {},
      getCurrent: () => ({ pos: to, vel: 0 })
    };
  }

  let lastTime = performance.now();

  const finishNow = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(settleTimer);
    if (rafId) cancelAnimationFrame(rafId);
    pos = to;
    vel = 0;
    if (onUpdate) onUpdate(to, 0);
    if (onDone) onDone();
  };

  let settleTimer = setTimeout(finishNow, options.maxDurationMs ?? 1400);

  const tick = (now) => {
    if (stopped) return;
    let rem = Math.min((now - lastTime) / 1000, 0.064);
    lastTime = now;

    while (rem > 0) {
      const step = Math.min(rem, 0.008);
      const fSpring = -stiffness * (pos - to);
      const fDamper = -damping * vel;
      const acc = (fSpring + fDamper) / mass;
      vel += acc * step;
      pos += vel * step;
      rem -= step;
    }

    if (Math.abs(to - pos) <= precision && Math.abs(vel) <= precision * 14) {
      stopped = true;
      clearTimeout(settleTimer);
      pos = to;
      vel = 0;
      if (onUpdate) onUpdate(to, 0);
      if (onDone) onDone();
      return;
    }

    if (onUpdate) onUpdate(pos, vel);
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      clearTimeout(settleTimer);
      if (rafId) cancelAnimationFrame(rafId);
    },
    getCurrent() {
      return { pos, vel };
    }
  };
}

// Менеджер прерываемых анимаций по ключу/элементу (сохраняет скорость при перехвате)
const activeSpringsMap = new Map();

function animateTrackedSpring(key, from, to, config = {}, onUpdate, onDone) {
  const existing = activeSpringsMap.get(key);
  let startPos = from;
  let startVel = config.velocity ?? 0;

  if (existing) {
    const cur = existing.getCurrent();
    if (startPos === null || startPos === undefined) startPos = cur.pos;
    if (config.velocity === undefined) startVel = cur.vel;
    existing.stop();
    activeSpringsMap.delete(key);
  } else if (startPos === null || startPos === undefined) {
    startPos = 0;
  }

  let ctrl = null;
  ctrl = spring(
    startPos,
    to,
    { ...config, velocity: startVel },
    onUpdate,
    () => {
      if (activeSpringsMap.get(key) === ctrl) {
        activeSpringsMap.delete(key);
      }
      if (onDone) onDone();
    }
  );

  activeSpringsMap.set(key, ctrl);
  return ctrl;
}

function stopTrackedSpring(key) {
  const existing = activeSpringsMap.get(key);
  if (existing) {
    const cur = existing.getCurrent();
    existing.stop();
    activeSpringsMap.delete(key);
    return cur;
  }
  return null;
}

const sheetRuntimeState = new Map();

// ============================================================================
// 3. ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
const state = {
  user: null,
  isBootstrapped: false,
  animateNextCascade: true,
  colorMode: localStorage.getItem("diary_color_mode_v7") || "dark",
  accent: localStorage.getItem("diary_accent_v1") || "purple",
  theme: localStorage.getItem("diary_theme_v7") || "minimal",
  bgMode: localStorage.getItem("diary_bg_mode_v7") || "abstract",
  customBgDataUrl: localStorage.getItem("diary_custom_bg_img_v6") || "",
  customBgDim: Number(localStorage.getItem("diary_custom_bg_dim_v7") ?? 25),
  navStyle: localStorage.getItem("diary_nav_style_v5") || "floating",
  rimStyle: localStorage.getItem("diary_rim_style_v5") || "normal",

  activeTab: "schedule",
  weekGridMode: false,
  weekLayout: localStorage.getItem("diary_week_layout_v1") || "list", // "list" | "cards" | "table"
  selectedDate: getTodayISO(),
  daySlideDir: 0,
  addScope: "date",
  taskFilter: "active",
  noteFilter: "all",
  noteSearchQuery: "",
  taskTargetMode: "current",
  noteTargetMode: "none",
  contextClassItem: null,
  showEvents: localStorage.getItem("diary_show_events_v4") !== "false",

  schedule: [],
  events: [],
  tasks: [],
  notes: [],
  hiddenRules: [],

  noteModalPinned: false,
  draftTaskPhotos: [],
  draftNotePhotos: [],

  notifSettings: JSON.parse(
    localStorage.getItem("diary_notif_settings_v4") ||
      '{"classes":true,"tasks":true,"notes":true}'
  ),
  firedNotifications: JSON.parse(localStorage.getItem("diary_fired_notifs_v4") || "{}"),

  pendingDeleteItem: null,
  unsubscribers: [],
  noteDebounceTimers: {}
};

// ============================================================================
// 4. УТИЛИТЫ ДАТЫ, ВРЕМЕНИ И СЕКУНДНЫХ ТАЙМЕРОВ
// ============================================================================
function formatDateISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateISO(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

function getTodayISO() {
  return formatDateISO(new Date());
}

function getInitialStudyDate() {
  return formatDateISO(new Date());
}

function getMondayOfDate(dateStr) {
  const d = parseDateISO(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getStudyWeekNumber(dateStr) {
  const monday = getMondayOfDate(dateStr);
  const startMonday = parseDateISO(SEMESTER_START_MONDAY);
  const diffDays = Math.round((monday - startMonday) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

function timeToMinutes(tStr) {
  if (!tStr) return 0;
  const [h, m] = String(tStr).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function addDaysISO(dateStr, days) {
  const d = parseDateISO(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

let dayGhostLayer = null;

function ensureDaySwipeViewport() {
  let viewport = document.getElementById("day-swipe-viewport");
  let track = document.getElementById("day-swipe-track");
  if (viewport && track) return { viewport, track };

  const dayView = document.getElementById("day-schedule-view");
  const liveWidget = document.getElementById("live-now-widget");
  const evWrap = document.getElementById("events-section-wrapper");
  const schedList = document.getElementById("schedule-list");
  if (!dayView || !evWrap || !schedList) return { viewport: null, track: null };

  viewport = document.createElement("div");
  viewport.id = "day-swipe-viewport";
  viewport.className = "relative overflow-hidden";

  track = document.createElement("div");
  track.id = "day-swipe-track";
  track.className = "space-y-4";

  const anchor = liveWidget || evWrap;
  dayView.insertBefore(viewport, anchor);
  if (liveWidget) track.appendChild(liveWidget);
  track.appendChild(evWrap);
  track.appendChild(schedList);
  viewport.appendChild(track);

  return { viewport, track };
}

function cleanupDayGhostLayer() {
  if (dayGhostLayer) {
    dayGhostLayer.remove();
    dayGhostLayer = null;
  }
}

function forceFinishDaySwipe() {
  stopTrackedSpring("day-swipe-track");
  const { viewport, track } = ensureDaySwipeViewport();
  if (track) {
    track.style.transform = "";
    track.style.willChange = "";
  }
  cleanupDayGhostLayer();
  if (viewport) {
    viewport.style.minHeight = "";
    viewport.querySelectorAll(":scope > div:not(#day-swipe-track)").forEach((el) => el.remove());
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") forceFinishDaySwipe();
  });
  window.addEventListener("pageshow", () => forceFinishDaySwipe());
}

// Двухпанельное переключение дня (старый и новый день на экране одновременно)
function selectDateWithSlide(newDateISO, options = {}) {
  if (!newDateISO || newDateISO === state.selectedDate) {
    forceFinishDaySwipe();
    return;
  }

  const { viewport, track } = ensureDaySwipeViewport();
  if (!viewport || !track || state.weekGridMode || isReducedMotion()) {
    forceFinishDaySwipe();
    state.selectedDate = newDateISO;
    renderScheduleSection();
    return;
  }

  stopTrackedSpring("day-swipe-track");

  const dir = newDateISO > state.selectedDate ? 1 : -1;
  const width = viewport.clientWidth || window.innerWidth || 375;
  const oldHeight = track.offsetHeight || 0;

  if (!options.existingGhost) {
    cleanupDayGhostLayer();
    viewport.querySelectorAll(":scope > div:not(#day-swipe-track)").forEach((el) => el.remove());
    dayGhostLayer = track.cloneNode(true);
    dayGhostLayer.removeAttribute("id");
    dayGhostLayer.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    dayGhostLayer.style.position = "absolute";
    dayGhostLayer.style.top = "0";
    dayGhostLayer.style.left = "0";
    dayGhostLayer.style.width = "100%";
    dayGhostLayer.style.pointerEvents = "none";
    viewport.appendChild(dayGhostLayer);
  } else {
    if (dayGhostLayer && dayGhostLayer !== options.existingGhost) {
      dayGhostLayer.remove();
    }
    dayGhostLayer = options.existingGhost;
  }

  const startOffset =
    options.startOffsetPx !== undefined ? options.startOffsetPx : dir * width;
  const initialVelocity = options.velocity ?? 0;

  state.selectedDate = newDateISO;
  state.animateNextCascade = false;
  renderScheduleSection();

  const newHeight = track.offsetHeight || 0;
  if (oldHeight > newHeight) {
    viewport.style.minHeight = `${oldHeight}px`;
  }

  track.style.willChange = "transform";
  if (dayGhostLayer) dayGhostLayer.style.willChange = "transform, opacity";

  track.style.transform = `translate3d(${startOffset}px, 0, 0)`;
  if (dayGhostLayer) {
    dayGhostLayer.style.transform = `translate3d(${startOffset - dir * width}px, 0, 0)`;
  }

  animateTrackedSpring(
    "day-swipe-track",
    startOffset,
    0,
    { ...SPRING_PAGE, velocity: initialVelocity },
    (pos) => {
      track.style.transform = `translate3d(${pos}px, 0, 0)`;
      if (dayGhostLayer) {
        dayGhostLayer.style.transform = `translate3d(${pos - dir * width}px, 0, 0)`;
        const progress = Math.min(1, Math.max(0, 1 - Math.abs(pos) / width));
        dayGhostLayer.style.opacity = String(Math.max(0, 1 - progress * 0.85));
      }
    },
    () => {
      track.style.transform = "";
      track.style.willChange = "";
      viewport.style.minHeight = "";
      cleanupDayGhostLayer();
      viewport.querySelectorAll(":scope > div:not(#day-swipe-track)").forEach((el) => el.remove());
    }
  );
}

function formatShortDate(dateStr) {
  if (!dateStr) return "—";
  const d = parseDateISO(String(dateStr).slice(0, 10));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatCompactNumericDate(dateStr) {
  if (!dateStr) return "—";
  const d = parseDateISO(String(dateStr).slice(0, 10));
  if (isNaN(d)) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatDurationWithSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  if (h > 0) {
    return `${h}ч ${String(m).padStart(2, "0")}м ${s}с`;
  }
  return `${m}м ${s}с`;
}

function formatRemainingMinutes(totalSeconds) {
  const mins = Math.max(1, Math.ceil(totalSeconds / 60));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
  }
  return `${mins} мин`;
}

function findNextClassDateForSubject(subjectName, afterDateStr) {
  const cleanSubj = String(subjectName || "").trim().toLowerCase();
  if (!cleanSubj) return addDaysISO(afterDateStr, 7);
  const candidates = getVisibleSchedule()
    .filter((s) => s.date > afterDateStr && String(s.subject).trim().toLowerCase() === cleanSubj)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (candidates.length > 0) return candidates[0].date;
  return addDaysISO(afterDateStr, 7);
}

function isMonoMode() {
  return state.colorMode === "mono-dark" || state.colorMode === "mono-light";
}

function isLightMode() {
  return state.colorMode === "light" || state.colorMode === "mono-light";
}

// ============================================================================
// 5. ФИЛЬТРАЦИЯ СКРЫТЫХ ПАР
// ============================================================================
function isClassHidden(item) {
  if (!item) return false;
  const itemWeek = getStudyWeekNumber(item.date);
  for (const rule of state.hiddenRules) {
    if (rule.mode === "forever") {
      if (rule.subject === item.subject) return true;
    } else if (rule.mode === "week") {
      if (rule.weekNum === itemWeek && rule.subject === item.subject && Number(rule.number) === Number(item.number)) {
        return true;
      }
    }
  }
  return false;
}

function getVisibleSchedule() {
  return state.schedule.filter((item) => !item.isEvent && !isClassHidden(item));
}

// ============================================================================
// 6. СТАРТ ПРИЛОЖЕНИЯ
// ============================================================================
function bootstrapApp() {
  loadLocalDataOrSeed();
  syncStateFromStorage();
  state.isBootstrapped = true;
  renderAll();
  updateLiveWidget();
  setInterval(updateLiveWidget, 1000);

  initNetworkListeners();
  initUIListeners();
  initNotificationUI();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => {
          reg.update().catch(() => {});
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (hadController && !sessionStorage.getItem("diary_sw_reloaded_once")) {
              sessionStorage.setItem("diary_sw_reloaded_once", "1");
              location.reload();
            }
          });
        })
        .catch(() => {});
    });
  }

  setTimeout(() => {
    initFirebaseInBackground();
  }, 50);

  setInterval(checkScheduledNotifications, 25000);
  setTimeout(checkScheduledNotifications, 3000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}

function syncStateFromStorage() {
  state.colorMode = localStorage.getItem("diary_color_mode_v7") || "dark";
  state.accent = localStorage.getItem("diary_accent_v1") || "purple";
  state.theme = localStorage.getItem("diary_theme_v7") || "minimal";
  state.bgMode = localStorage.getItem("diary_bg_mode_v7") || "abstract";
  state.customBgDataUrl = localStorage.getItem("diary_custom_bg_img_v6") || "";
  state.customBgDim = Number(localStorage.getItem("diary_custom_bg_dim_v7") ?? 25);
  state.navStyle = localStorage.getItem("diary_nav_style_v5") || "floating";
  state.rimStyle = localStorage.getItem("diary_rim_style_v5") || "normal";

  const slider = document.getElementById("bg-dim-slider");
  const label = document.getElementById("bg-dim-value");
  if (slider) slider.value = String(state.customBgDim);
  if (label) label.textContent = `${state.customBgDim}%`;
}

window.addEventListener("diary-appearance-changed", () => {
  syncStateFromStorage();
  if (state.isBootstrapped) {
    renderScheduleSection();
    updateLiveWidget();
    refreshIcons();
  }
});

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function initNetworkListeners() {
  const updateUI = () => {
    const dot = document.getElementById("network-dot");
    const text = document.getElementById("network-text");
    if (!dot || !text) return;
    if (navigator.onLine) {
      dot.className = "w-2.5 h-2.5 rounded-full bg-ios-green shrink-0";
      text.textContent = "Онлайн · Облако готово";
    } else {
      dot.className = "w-2.5 h-2.5 rounded-full bg-ios-orange animate-pulse shrink-0";
      text.textContent = "Оффлайн · Автономный режим";
    }
  };
  window.addEventListener("online", updateUI);
  window.addEventListener("offline", updateUI);
  updateUI();
}

function setSyncIndicator(active) {
  const el = document.getElementById("sync-indicator");
  const readyEl = document.getElementById("sync-ready-label");
  if (el) el.classList.toggle("hidden", !active);
  if (readyEl) readyEl.classList.toggle("hidden", active);
}

// ============================================================================
// 7. ХРАНИЛИЩЕ: LOCALSTORAGE + FIREBASE FIRESTORE
// ============================================================================
function loadLocalDataOrSeed() {
  let rawSched = [];
  try {
    const savedSched = localStorage.getItem("diary_schedule_v2");
    if (savedSched) {
      const parsed = JSON.parse(savedSched);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawSched = parsed;
      }
    }
  } catch {}

  if (rawSched.length === 0) {
    rawSched = buildDefaultSchedule();
  }

  const legacyEvents = rawSched.filter((x) => x && x.isEvent);
  state.schedule = rawSched.filter((x) => x && !x.isEvent);

  let savedEvents = [];
  try {
    savedEvents = JSON.parse(localStorage.getItem("diary_events_v4") || "[]");
  } catch {}

  const eventMap = new Map();
  [...legacyEvents, ...savedEvents].forEach((ev) => {
    if (!ev || !ev.id) return;
    eventMap.set(ev.id, {
      id: ev.id,
      title: ev.title || ev.subject || "Мероприятие",
      date: ev.date,
      startTime: ev.startTime || "",
      endTime: ev.endTime || "",
      location: ev.location || ev.room || ""
    });
  });
  state.events = [...eventMap.values()];

  try {
    state.tasks = JSON.parse(localStorage.getItem("diary_tasks_v2") || "[]");
  } catch {
    state.tasks = [];
  }
  try {
    state.notes = JSON.parse(localStorage.getItem("diary_notes_v2") || "[]");
  } catch {
    state.notes = [];
  }
  try {
    state.hiddenRules = JSON.parse(localStorage.getItem("diary_hidden_rules_v3") || "[]");
  } catch {
    state.hiddenRules = [];
  }

  saveLocalData();
}

function saveLocalData() {
  localStorage.setItem("diary_schedule_v2", JSON.stringify(state.schedule));
  localStorage.setItem("diary_events_v4", JSON.stringify(state.events));
  localStorage.setItem("diary_tasks_v2", JSON.stringify(state.tasks));
  localStorage.setItem("diary_notes_v2", JSON.stringify(state.notes));
  localStorage.setItem("diary_hidden_rules_v3", JSON.stringify(state.hiddenRules));
}

function initFirebaseAuth() {
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, (user) => {
    state.user = user;
    state.unsubscribers.forEach((u) => u());
    state.unsubscribers = [];
    const btnLogin = document.getElementById("btn-login");
    const userProfile = document.getElementById("user-profile");
    const userAvatar = document.getElementById("user-avatar");

    if (user) {
      btnLogin?.classList.add("hidden");
      userProfile?.classList.remove("hidden");
      userProfile?.classList.add("flex");
      if (userAvatar) userAvatar.src = user.photoURL || "";
      subscribeFirestore(user.uid);
    } else {
      btnLogin?.classList.remove("hidden");
      userProfile?.classList.add("hidden");
      userProfile?.classList.remove("flex");
      loadLocalDataOrSeed();
      renderAll();
      updateLiveWidget();
    }
  });
}

function subscribeFirestore(uid) {
  setSyncIndicator(true);
  const schedRef = collection(db, "users", uid, "schedule");
  const unsubSched = onSnapshot(schedRef, async (snap) => {
    if (snap.empty && !localStorage.getItem(`seeded_${uid}`)) {
      localStorage.setItem(`seeded_${uid}`, "1");
      await uploadBatchScheduleToCloud(buildDefaultSchedule());
      return;
    }
    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nonEvents = allDocs.filter((d) => !d.isEvent);
    if (nonEvents.length > 0) {
      state.schedule = nonEvents;
      saveLocalData();
    }
    renderScheduleSection();
    updateSubjectsDatalist();
    updateLiveWidget();
    setSyncIndicator(false);
  });

  const eventsRef = collection(db, "users", uid, "events");
  const unsubEvents = onSnapshot(eventsRef, (snap) => {
    state.events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderScheduleSection();
  });

  const tasksRef = collection(db, "users", uid, "tasks");
  const unsubTasks = onSnapshot(tasksRef, (snap) => {
    state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderTasks();
    renderScheduleSection();
  });

  const notesRef = collection(db, "users", uid, "notes");
  const unsubNotes = onSnapshot(notesRef, (snap) => {
    state.notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderNotes();
    renderScheduleSection();
  });

  const hiddenRef = collection(db, "users", uid, "hiddenRules");
  const unsubHidden = onSnapshot(hiddenRef, (snap) => {
    state.hiddenRules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderScheduleSection();
    updateLiveWidget();
  });

  state.unsubscribers.push(unsubSched, unsubEvents, unsubTasks, unsubNotes, unsubHidden);
}

async function uploadBatchScheduleToCloud(items) {
  if (!state.user || !db) return;
  setSyncIndicator(true);
  const chunks = [];
  for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, "users", state.user.uid, "schedule", item.id), item);
    }
    await batch.commit();
  }
  setSyncIndicator(false);
}

async function saveScheduleItems(itemsToSave) {
  if (state.user && db) {
    await uploadBatchScheduleToCloud(itemsToSave);
  } else {
    for (const newItem of itemsToSave) {
      const idx = state.schedule.findIndex((s) => s.id === newItem.id);
      if (idx >= 0) state.schedule[idx] = newItem;
      else state.schedule.push(newItem);
    }
    saveLocalData();
    renderScheduleSection();
    updateSubjectsDatalist();
    updateLiveWidget();
  }
}

async function removeScheduleItemsByIds(ids) {
  const idSet = new Set(ids);
  if (state.user && db) {
    setSyncIndicator(true);
    const batch = writeBatch(db);
    for (const id of idSet) batch.delete(doc(db, "users", state.user.uid, "schedule", id));
    await batch.commit();
    setSyncIndicator(false);
  } else {
    state.schedule = state.schedule.filter((item) => !idSet.has(item.id));
    saveLocalData();
    renderScheduleSection();
    updateSubjectsDatalist();
    updateLiveWidget();
  }
}

async function saveEventItems(eventsToSave) {
  if (state.user && db) {
    const batch = writeBatch(db);
    for (const ev of eventsToSave) {
      batch.set(doc(db, "users", state.user.uid, "events", ev.id), ev);
    }
    await batch.commit();
  } else {
    for (const ev of eventsToSave) {
      const idx = state.events.findIndex((x) => x.id === ev.id);
      if (idx >= 0) state.events[idx] = ev;
      else state.events.push(ev);
    }
    saveLocalData();
    renderScheduleSection();
  }
}

async function deleteEventById(eventId) {
  if (state.user && db) {
    await deleteDoc(doc(db, "users", state.user.uid, "events", eventId));
  } else {
    state.events = state.events.filter((ev) => ev.id !== eventId);
    saveLocalData();
    renderScheduleSection();
  }
}

async function saveHiddenRule(rule) {
  if (state.user && db) {
    await setDoc(doc(db, "users", state.user.uid, "hiddenRules", rule.id), rule);
  } else {
    state.hiddenRules.push(rule);
    saveLocalData();
    renderScheduleSection();
    updateLiveWidget();
  }
}

async function removeHiddenRule(ruleId) {
  if (state.user && db) {
    await deleteDoc(doc(db, "users", state.user.uid, "hiddenRules", ruleId));
  } else {
    state.hiddenRules = state.hiddenRules.filter((r) => r.id !== ruleId);
    saveLocalData();
    renderScheduleSection();
    updateLiveWidget();
  }
}

async function saveTaskItem(task) {
  if (state.user && db) {
    await setDoc(doc(db, "users", state.user.uid, "tasks", task.id), task);
  } else {
    const idx = state.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) state.tasks[idx] = task;
    else state.tasks.push(task);
    saveLocalData();
    renderTasks();
    renderScheduleSection();
  }
}

async function saveNoteItem(note) {
  if (state.user && db) {
    await setDoc(doc(db, "users", state.user.uid, "notes", note.id), note);
  } else {
    const idx = state.notes.findIndex((n) => n.id === note.id);
    if (idx >= 0) state.notes[idx] = note;
    else state.notes.unshift(note);
    saveLocalData();
    renderNotes();
    renderScheduleSection();
  }
}

// ============================================================================
// 8. СЖАТИЕ ФОТОГРАФИЙ И ОБОЕВ ЧЕРЕЗ HTML5 CANVAS
// ============================================================================
function compressImageFile(file, maxWidth = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// 9. СИСТЕМА УВЕДОМЛЕНИЙ
// ============================================================================
function initNotificationUI() {
  const cToggle = document.getElementById("notif-toggle-classes");
  const tToggle = document.getElementById("notif-toggle-tasks");
  const nToggle = document.getElementById("notif-toggle-notes");

  if (cToggle) cToggle.checked = Boolean(state.notifSettings.classes);
  if (tToggle) tToggle.checked = Boolean(state.notifSettings.tasks);
  if (nToggle) nToggle.checked = Boolean(state.notifSettings.notes);

  updateNotifPermissionStatusUI();
}

function updateNotifPermissionStatusUI() {
  const statusEl = document.getElementById("notif-permission-status");
  const badgeDot = document.getElementById("badge-notif-active");
  const anyEnabled = state.notifSettings.classes || state.notifSettings.tasks || state.notifSettings.notes;

  if (!("Notification" in window)) {
    if (statusEl) statusEl.textContent = "Встроены внутриэкранные уведомления";
    if (badgeDot) badgeDot.classList.toggle("hidden", !anyEnabled);
    return;
  }

  if (Notification.permission === "granted") {
    if (statusEl) statusEl.textContent = "Разрешено • Уведомления активны";
    if (badgeDot) badgeDot.classList.toggle("hidden", !anyEnabled);
  } else if (Notification.permission === "denied") {
    if (statusEl) statusEl.textContent = "Заблокировано в браузере (работают баннеры)";
    if (badgeDot) badgeDot.classList.add("hidden");
  } else {
    if (statusEl) statusEl.textContent = "Нажмите «Включить» для пушей";
    if (badgeDot) badgeDot.classList.toggle("hidden", !anyEnabled);
  }
}

function showInAppToast(title, body) {
  let container = document.getElementById("ios-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "ios-toast-container";
    container.className = "fixed top-4 inset-x-4 z-[100] max-w-md mx-auto space-y-2 pointer-events-none";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "ios-tabbar-shell rounded-2xl p-3.5 shadow-2xl pointer-events-auto flex items-start gap-3 transition-all";
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full ios-accent-btn flex items-center justify-center shrink-0">
      <i data-lucide="bell" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-[13px] font-semibold text-primary-adaptive">${escapeHtml(title)}</p>
      <p class="text-[12px] text-secondary-adaptive mt-0.5 break-words">${escapeHtml(body)}</p>
    </div>
  `;
  container.appendChild(toast);
  refreshIcons();
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate3d(0, -10px, 0)";
    setTimeout(() => toast.remove(), 260);
  }, 4500);
}

async function sendAppNotification(title, body, uniqueKey) {
  if (uniqueKey && state.firedNotifications[uniqueKey]) return;
  if (uniqueKey) {
    state.firedNotifications[uniqueKey] = Date.now();
    localStorage.setItem("diary_fired_notifs_v4", JSON.stringify(state.firedNotifications));
  }

  showInAppToast(title, body);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body, tag: uniqueKey || String(Date.now()) });
      } else {
        new Notification(title, { body });
      }
    } catch {}
  }
}

function checkScheduledNotifications() {
  const now = new Date();
  const todayISO = formatDateISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (state.notifSettings.classes) {
    const todayClasses = getVisibleSchedule().filter((s) => s.date === todayISO);
    for (const cls of todayClasses) {
      const startMin = timeToMinutes(cls.startTime);
      const diff = startMin - nowMin;
      if (diff <= 10 && diff >= 9) {
        sendAppNotification(
          `Через 10 мин: ${cls.subject}`,
          `${cls.number} пара (${cls.startTime}) · Каб. ${cls.room}`,
          `cls_10m_${cls.id}_${todayISO}`
        );
      } else if (diff === 0) {
        sendAppNotification(
          `Началась пара: ${cls.subject}`,
          `Кабинет: ${cls.room} · ${cls.type}`,
          `cls_start_${cls.id}_${todayISO}`
        );
      }
    }
  }

  if (state.notifSettings.tasks) {
    const tomorrowISO = addDaysISO(todayISO, 1);
    const urgentTasks = state.tasks.filter(
      (t) => !t.completed && (t.deadline === todayISO || t.deadline === tomorrowISO)
    );
    if (urgentTasks.length > 0 && now.getHours() >= 9 && now.getHours() <= 21) {
      for (const task of urgentTasks) {
        const whenText = task.deadline === todayISO ? "Дедлайн СЕГОДНЯ" : "Дедлайн завтра";
        sendAppNotification(
          `${whenText}: ${task.subject}`,
          task.text,
          `task_due_${task.id}_${todayISO}`
        );
      }
    }
  }

  if (state.notifSettings.notes) {
    const nowTs = now.getTime();
    for (const note of state.notes) {
      if (!note.notifyEnabled || !note.notifyTime) continue;
      const targetTs = new Date(note.notifyTime).getTime();
      if (!isNaN(targetTs) && nowTs >= targetTs && nowTs - targetTs < 15 * 60 * 1000) {
        sendAppNotification(
          `Напоминание: ${note.title || note.subject || "Заметка"}`,
          note.content || "",
          `note_notif_${note.id}_${note.notifyTime}`
        );
      }
    }
  }
}

// ============================================================================
// 10. УМНЫЙ LIVE-БЛОК ТЕКУЩЕЙ / СЛЕДУЮЩЕЙ ПАРЫ (ПО РЕФЕРЕНСУ iOS)
// ============================================================================
function updateLiveWidget() {
  const now = new Date();
  const todayISO = formatDateISO(now);
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const visible = getVisibleSchedule();
  const todayClasses = visible
    .filter((s) => s.date === todayISO)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  let currentClass = null;
  let nextClassToday = null;
  let prevClassToday = null;

  for (const item of todayClasses) {
    const startSec = timeToMinutes(item.startTime) * 60;
    const endSec = timeToMinutes(item.endTime) * 60;
    if (nowSec >= startSec && nowSec < endSec) {
      currentClass = item;
    } else if (nowSec < startSec && !nextClassToday) {
      nextClassToday = item;
    } else if (nowSec >= endSec) {
      prevClassToday = item;
    }
  }

  let nextClassAny = nextClassToday;
  if (!nextClassAny) {
    const upcoming = visible
      .filter((s) => s.date > todayISO)
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (upcoming.length > 0) nextClassAny = upcoming[0];
  }

  const curDot = document.getElementById("live-current-dot");
  const curLabel = document.getElementById("live-current-label");
  const curTitle = document.getElementById("live-current-title");
  const curTimer = document.getElementById("live-current-timer");
  const curMeta = document.getElementById("live-current-meta");
  const curProgWrap = document.getElementById("live-current-progress-wrap");
  const curProg = document.getElementById("live-current-progress");

  if (!curTitle) return;

  const getRestTextUntilNext = () => {
    if (nextClassToday) {
      const remToNext = timeToMinutes(nextClassToday.startTime) * 60 - nowSec;
      return `Отдыхайте еще ${formatDurationWithSeconds(remToNext)}`;
    }
    return "Сегодня пар больше нет";
  };

  if (currentClass) {
    // 1. ИДЕТ ПАРА ПРЯМО СЕЙЧАС
    const startSec = timeToMinutes(currentClass.startTime) * 60;
    const endSec = timeToMinutes(currentClass.endTime) * 60;
    const remSec = Math.max(0, endSec - nowSec);
    const pct = Math.min(100, Math.max(0, Math.round(((nowSec - startSec) / (endSec - startSec)) * 100)));

    if (curDot) curDot.className = "live-pulse-dot shrink-0";
    if (curLabel) curLabel.textContent = `Сейчас · ${currentClass.startTime}–${currentClass.endTime}`;
    curTitle.textContent = currentClass.subject;
    curTimer.textContent = formatRemainingMinutes(remSec);
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(currentClass.room)}${currentClass.teacher ? ` · ${escapeHtml(currentClass.teacher)}` : ""}</span><span class="font-medium text-secondary-adaptive shrink-0">${escapeHtml(currentClass.type)}</span>`;
    curProgWrap?.classList.remove("hidden");
    if (curProg) curProg.style.width = `${pct}%`;
  } else if (nowSec >= LUNCH_START_SEC && nowSec < LUNCH_END_SEC) {
    // 2. ОБЕДЕННЫЙ ПЕРЕРЫВ (12:50 - 13:20)
    const remLunchSec = LUNCH_END_SEC - nowSec;
    const lunchPct = Math.min(100, Math.max(0, Math.round(((nowSec - LUNCH_START_SEC) / (LUNCH_END_SEC - LUNCH_START_SEC)) * 100)));

    if (curDot) curDot.className = "w-2 h-2 rounded-full bg-ios-green shrink-0";
    if (curLabel) curLabel.textContent = "Обед · 12:50–13:20";
    curTitle.textContent = "Обеденный перерыв";
    curTimer.textContent = formatDurationWithSeconds(remLunchSec);
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(getRestTextUntilNext())}</span><span class="shrink-0">до 13:20</span>`;
    curProgWrap?.classList.remove("hidden");
    if (curProg) curProg.style.width = `${lunchPct}%`;
  } else if (prevClassToday && nextClassToday) {
    // 3. ОКНО ИЛИ ПЕРЕМЕНА МЕЖДУ ПАРАМИ
    const prevEndSec = timeToMinutes(prevClassToday.endTime) * 60;
    const nextStartSec = timeToMinutes(nextClassToday.startTime) * 60;
    const totalGapMin = Math.round((nextStartSec - prevEndSec) / 60);
    const remGapSec = nextStartSec - nowSec;
    const isWindow = totalGapMin > 20;

    if (curDot) curDot.className = "w-2 h-2 rounded-full bg-ios-accent shrink-0";
    if (curLabel) curLabel.textContent = isWindow ? "Окно в расписании" : "Перемена";
    curTitle.textContent = isWindow ? "Сейчас окно" : "Перемена между парами";
    curTimer.textContent = formatDurationWithSeconds(remGapSec);
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(getRestTextUntilNext())}</span><span class="shrink-0">${escapeHtml(prevClassToday.endTime)}–${escapeHtml(nextClassToday.startTime)}</span>`;
    curProgWrap?.classList.add("hidden");
  } else {
    // 4. ПАРЫ ЕЩЕ НЕ НАЧАЛИСЬ ИЛИ УЖЕ ЗАКОНЧИЛИСЬ
    if (curDot) curDot.className = "w-2 h-2 rounded-full bg-ios-gray/50 shrink-0";
    if (curLabel) curLabel.textContent = "Текущий статус";
    curTitle.textContent = "Сейчас нет пары";

    if (nextClassToday) {
      const remToStart = timeToMinutes(nextClassToday.startTime) * 60 - nowSec;
      curTimer.textContent = `в ${nextClassToday.startTime}`;
      curMeta.innerHTML = `<span class="truncate">Отдыхайте еще ${escapeHtml(formatDurationWithSeconds(remToStart))}</span><span class="shrink-0">${escapeHtml(nextClassToday.subject)}</span>`;
    } else {
      curTimer.textContent = "Свободно";
      curMeta.innerHTML = `<span class="truncate">Отдыхайте · Пары на сегодня закончились</span><span></span>`;
    }
    curProgWrap?.classList.add("hidden");
  }

  // Блок: СЛЕДУЮЩАЯ ПАРА
  const nextTitle = document.getElementById("live-next-title");
  const nextTimer = document.getElementById("live-next-timer");
  const nextRoom = document.getElementById("live-next-room");
  const nextRange = document.getElementById("live-next-time-range");

  if (nextClassAny && nextTitle && nextTimer && nextRoom && nextRange) {
    nextTitle.textContent = nextClassAny.subject;
    nextRoom.textContent = `${nextClassAny.room} · ${nextClassAny.type}`;
    nextRange.textContent = `${nextClassAny.startTime}–${nextClassAny.endTime}`;

    if (nextClassAny.date === todayISO) {
      const startSec = timeToMinutes(nextClassAny.startTime) * 60;
      const diffSec = Math.max(0, startSec - nowSec);
      nextTimer.textContent = `Через ${formatDurationWithSeconds(diffSec)}`;
    } else {
      const dLabel = parseDateISO(nextClassAny.date).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
      nextTimer.textContent = dLabel;
    }
  } else if (nextTitle) {
    nextTitle.textContent = "Нет запланированных пар";
    if (nextRoom) nextRoom.textContent = "—";
    if (nextRange) nextRange.textContent = "";
    if (nextTimer) nextTimer.textContent = "—";
  }

  updateWeekGridNowLine();
}

// ============================================================================
// 11. ОБЗОР РАСПИСАНИЯ НА ВСЮ НЕДЕЛЮ (СПИСОК / СЕТКА / ТАБЛИЦА)
// ============================================================================
function toggleWeekGridView(forceState) {
  state.weekGridMode = typeof forceState === "boolean" ? forceState : !state.weekGridMode;
  document.body.classList.toggle("week-grid-open", state.weekGridMode && state.weekLayout === "table");

  const gridView = document.getElementById("week-grid-view");
  const dayView = document.getElementById("day-schedule-view");
  const daySel = document.getElementById("day-selector");
  const btnText = document.getElementById("week-grid-toggle-text");
  const btnToggle = document.getElementById("btn-week-grid-toggle");

  if (gridView && dayView) {
    gridView.classList.toggle("hidden", !state.weekGridMode);
    dayView.classList.toggle("hidden", state.weekGridMode);
  }
  if (daySel) {
    daySel.classList.toggle("hidden", state.weekGridMode);
  }
  if (btnText) {
    btnText.textContent = state.weekGridMode ? "День" : "Неделя";
  }
  if (btnToggle) {
    btnToggle.classList.toggle("ios-accent-soft-btn", state.weekGridMode);
  }

  if (state.weekGridMode) {
    renderWeekGridTable();
  }
  refreshIcons();
}

function renderWeekGridTable() {
  const wrapper = document.getElementById("week-grid-table-wrapper");
  if (!wrapper) return;

  document.body.classList.toggle("week-grid-open", state.weekGridMode && state.weekLayout === "table");

  document.querySelectorAll(".week-layout-btn").forEach((btn) => {
    const active = btn.dataset.weekLayout === state.weekLayout;
    btn.className = `week-layout-btn ios-press py-1.5 rounded-[11px] text-[12px] font-semibold transition-all ${
      active ? "ios-seg-active" : "text-secondary-adaptive"
    }`;
  });

  const todayISO = getTodayISO();
  const monday = getMondayOfDate(state.selectedDate);
  const visibleSchedule = getVisibleSchedule();

  const sundayDate = new Date(monday);
  sundayDate.setDate(monday.getDate() + 6);
  const sundayISO = formatDateISO(sundayDate);
  const hasSundayItems =
    visibleSchedule.some((s) => s.date === sundayISO) ||
    (state.showEvents && state.events.some((e) => e.date === sundayISO));

  const daysCount = hasSundayItems ? 7 : 6;
  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const dayFullNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
  const weekDates = [];

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push({
      dateObj: d,
      iso: formatDateISO(d),
      dayName: dayLabels[i],
      dayFull: dayFullNames[i],
      dayNum: d.getDate(),
      shortLabel: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    });
  }

  // ВАРИАНТ 1: МИНИМАЛИСТИЧНЫЙ СПИСОК ВСЕЙ НЕДЕЛИ С РАЗДЕЛИТЕЛЯМИ
  if (state.weekLayout === "list") {
    let listHtml = `<div class="space-y-4">`;

    for (const wd of weekDates) {
      const isToday = wd.iso === todayISO;
      const dayClasses = visibleSchedule
        .filter((s) => s.date === wd.iso)
        .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const dayEvents = state.showEvents ? state.events.filter((e) => e.date === wd.iso) : [];

      listHtml += `
        <div data-grid-pick-date="${wd.iso}" class="space-y-1.5 cursor-pointer">
          <div class="flex items-center justify-between pb-1 border-b ios-divider">
            <div class="flex items-center gap-2">
              <span class="text-[14px] font-bold ${isToday ? "text-ios-accent" : "text-primary-adaptive"}">${escapeHtml(wd.dayFull)}</span>
              <span class="text-[13px] text-tertiary-adaptive">${escapeHtml(wd.shortLabel)}</span>
            </div>
            <span class="text-[12px] text-tertiary-adaptive">${dayClasses.length > 0 ? `${dayClasses.length} пар(ы)` : "Выходной"}</span>
          </div>

          ${
            dayEvents.length > 0
              ? `<div class="divide-y ios-divider">
                  ${dayEvents
                    .map(
                      (ev) => `
                    <div class="py-2 flex items-center justify-between gap-2 text-[13px]">
                      <span class="font-medium text-ios-accent truncate">✦ ${escapeHtml(ev.title)}</span>
                      <span class="text-[12px] text-secondary-adaptive shrink-0">${escapeHtml(ev.startTime || "Весь день")}</span>
                    </div>`
                    )
                    .join("")}
                </div>`
              : ""
          }

          ${
            dayClasses.length > 0
              ? `<div class="divide-y ios-divider">
                  ${dayClasses
                    .map((cls) => {
                      const hasHw = state.tasks.some(
                        (t) =>
                          !t.completed &&
                          t.deadline === wd.iso &&
                          String(t.subject).trim().toLowerCase() === String(cls.subject).trim().toLowerCase()
                      );
                      return `
                      <div class="py-2.5 flex items-center justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="text-[14px] font-semibold text-primary-adaptive truncate">${escapeHtml(cls.subject)}</div>
                          <div class="text-[12px] text-secondary-adaptive truncate mt-0.5">
                            ${escapeHtml(cls.room)} · ${escapeHtml(cls.type)}${hasHw ? ` · <span class="text-ios-accent font-semibold">ДЗ</span>` : ""}
                          </div>
                        </div>
                        <div class="text-right shrink-0 tabular-nums">
                          <div class="text-[13px] font-medium text-primary-adaptive">${escapeHtml(cls.startTime)}–${escapeHtml(cls.endTime)}</div>
                          <div class="text-[11px] text-tertiary-adaptive">${escapeHtml(cls.number)} пара</div>
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
                </div>`
              : `<p class="py-2 text-[13px] text-tertiary-adaptive">Пар нет</p>`
          }
        </div>
      `;
    }

    listHtml += `</div>`;
    wrapper.innerHTML = listHtml;
    return;
  }

  // ВАРИАНТ 2: КОМПАКТНАЯ СЕТКА ДНЕЙ (2 КОЛОНКИ)
  if (state.weekLayout === "cards") {
    let cardsHtml = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">`;

    for (const wd of weekDates) {
      const isToday = wd.iso === todayISO;
      const dayClasses = visibleSchedule
        .filter((s) => s.date === wd.iso)
        .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

      cardsHtml += `
        <div data-grid-pick-date="${wd.iso}" class="ios-surface rounded-2xl p-3 flex flex-col justify-between cursor-pointer ios-press min-w-0">
          <div>
            <div class="flex items-center justify-between gap-1 pb-2 mb-2 border-b ios-divider">
              <span class="text-[13px] font-bold ${isToday ? "text-ios-accent" : "text-primary-adaptive"}">${wd.dayName}, ${wd.dayNum}</span>
              <span class="text-[11px] text-tertiary-adaptive">${dayClasses.length > 0 ? `${dayClasses.length} п.` : "Вых."}</span>
            </div>

            ${
              dayClasses.length > 0
                ? `<div class="divide-y ios-divider">
                    ${dayClasses
                      .map(
                        (cls) => `
                        <div class="py-1.5 space-y-0.5">
                          <div class="flex items-center justify-between gap-1 text-[10px] text-secondary-adaptive tabular-nums">
                            <span>${escapeHtml(cls.startTime)}</span>
                            <span class="font-medium text-primary-adaptive">${escapeHtml(cls.room)}</span>
                          </div>
                          <div class="text-[12px] font-semibold text-primary-adaptive leading-snug line-clamp-2 break-words">${escapeHtml(cls.subject)}</div>
                        </div>`
                      )
                      .join("")}
                  </div>`
                : `<div class="py-4 text-center text-[12px] text-tertiary-adaptive">Пар нет</div>`
            }
          </div>
        </div>
      `;
    }

    cardsHtml += `</div>`;
    wrapper.innerHTML = cardsHtml;
    return;
  }

  // ВАРИАНТ 3: ТАБЛИЦА КАЛЕНДАРЯ
  const hasSeventhSlot = visibleSchedule.some(
    (s) => weekDates.some((wd) => wd.iso === s.date) && Number(s.number) === 7
  );

  const slots = [
    { type: "class", number: 1, label: "1 пара", time: "08:00–09:30", startMin: 480, endMin: 570 },
    { type: "class", number: 2, label: "2 пара", time: "09:40–11:10", startMin: 580, endMin: 670 },
    { type: "class", number: 3, label: "3 пара", time: "11:20–12:50", startMin: 680, endMin: 770 },
    { type: "lunch", label: "Обед", time: "12:50–13:20", startMin: 770, endMin: 800 },
    { type: "class", number: 4, label: "4 пара", time: "13:20–14:50", startMin: 800, endMin: 890 },
    { type: "class", number: 5, label: "5 пара", time: "15:00–16:30", startMin: 900, endMin: 990 },
    { type: "class", number: 6, label: "6 пара", time: "16:40–18:10", startMin: 1000, endMin: 1090 }
  ];
  if (hasSeventhSlot) {
    slots.push({ type: "class", number: 7, label: "7 пара", time: "18:20–19:50", startMin: 1100, endMin: 1190 });
  }

  let html = `<div class="gcal-grid-table ${daysCount === 7 ? "cols-7" : ""} rounded-2xl overflow-hidden">`;

  html += `<div class="gcal-cell p-2 flex items-center justify-center text-[10px] font-semibold text-tertiary-adaptive">Пара</div>`;
  for (const wd of weekDates) {
    const isToday = wd.iso === todayISO;
    const isSelected = wd.iso === state.selectedDate;
    html += `
      <div data-grid-pick-date="${wd.iso}" class="gcal-cell py-2 px-2 text-center cursor-pointer hover:bg-white/[0.03] transition-colors">
        <div class="text-[10px] font-semibold uppercase ${isToday ? "text-ios-accent" : "text-secondary-adaptive"}">${wd.dayName}</div>
        <div class="mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full text-[13px] font-bold ${
          isToday
            ? "ios-accent-btn"
            : isSelected
            ? "ios-surface text-primary-adaptive"
            : "text-primary-adaptive"
        }">${wd.dayNum}</div>
      </div>
    `;
  }

  for (const slot of slots) {
    if (slot.type === "lunch") {
      html += `
        <div class="gcal-cell px-1.5 py-1.5 flex flex-col items-center justify-center text-center">
          <span class="text-[10px] font-semibold text-ios-green">Обед</span>
          <span class="text-[9px] text-tertiary-adaptive">12:50</span>
        </div>
      `;
      for (const wd of weekDates) {
        html += `
          <div class="gcal-cell px-2 py-1.5 flex items-center justify-center" data-grid-slot-cell="${wd.iso}:${slot.startMin}:${slot.endMin}">
            <span class="text-[10px] text-tertiary-adaptive">12:50–13:20</span>
          </div>
        `;
      }
      continue;
    }

    html += `
      <div class="gcal-cell p-1.5 flex flex-col items-center justify-center text-center">
        <span class="text-[11px] font-bold text-primary-adaptive">${slot.number}</span>
        <span class="text-[9px] text-tertiary-adaptive leading-tight mt-0.5">${slot.time.replace("–", "<br/>")}</span>
      </div>
    `;

    for (const wd of weekDates) {
      const cellClasses = visibleSchedule.filter(
        (s) => s.date === wd.iso && Number(s.number) === slot.number
      );

      html += `
        <div class="gcal-cell p-1.5 min-h-[72px] space-y-1" data-grid-slot-cell="${wd.iso}:${slot.startMin}:${slot.endMin}">
          ${cellClasses
            .map(
              (cls) => `
            <div data-grid-open-class="${cls.id}" data-grid-pick-date="${wd.iso}" class="gcal-event-card">
              <div class="font-semibold truncate">${escapeHtml(cls.subject)}</div>
              <div class="opacity-75 truncate text-[10px] mt-0.5">${escapeHtml(cls.room)} · ${escapeHtml(cls.type)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    }
  }

  html += `</div>`;
  wrapper.innerHTML = html;
  updateWeekGridNowLine();
}

function updateWeekGridNowLine() {
  if (!state.weekGridMode) return;
  document.querySelectorAll(".gcal-now-line").forEach((el) => el.remove());

  const now = new Date();
  const todayISO = formatDateISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const cells = document.querySelectorAll(`[data-grid-slot-cell^="${todayISO}:"]`);
  cells.forEach((cell) => {
    const [, startStr, endStr] = cell.dataset.gridSlotCell.split(":");
    const startMin = Number(startStr);
    const endMin = Number(endStr);
    if (nowMin >= startMin && nowMin <= endMin) {
      const pct = Math.min(100, Math.max(0, ((nowMin - startMin) / (endMin - startMin)) * 100));
      const line = document.createElement("div");
      line.className = "gcal-now-line";
      line.style.top = `${pct}%`;
      line.innerHTML = `<span class="gcal-now-dot"></span>`;
      cell.appendChild(line);
    }
  });
}

// ============================================================================
// 12. РЕНДЕРИНГ РАСПИСАНИЯ (МИНИМАЛИСТИЧНЫЙ ТАЙМЛАЙН iOS БЕЗ ПЛИТОК)
// ============================================================================
function triggerCascadeOnce(containerEl) {
  if (!containerEl || isReducedMotion()) return;
  containerEl.classList.remove("play-cascade");
  void containerEl.offsetWidth;
  containerEl.classList.add("play-cascade");
  setTimeout(() => containerEl.classList.remove("play-cascade"), 420);
}

function renderAll() {
  state.animateNextCascade = true;
  renderScheduleSection();
  renderTasks();
  renderNotes();
  updateSubjectsDatalist();
  state.animateNextCascade = false;
}

function renderScheduleSection() {
  const todayISO = getTodayISO();
  const monday = getMondayOfDate(state.selectedDate);
  const weekNum = getStudyWeekNumber(state.selectedDate);
  const currentActualWeekNum = getStudyWeekNumber(todayISO);
  const isCurrentStudyWeek = weekNum === currentActualWeekNum;

  const isOdd = Math.abs(weekNum) % 2 === 1;
  const parityText = isOdd ? "Числитель" : "Знаменатель";
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmtShort = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  const weekCurrentBadge = document.getElementById("week-current-badge");
  const weekTitle = document.getElementById("week-title");
  const weekSubtitle = document.getElementById("week-subtitle");
  const datePicker = document.getElementById("date-jump-picker");
  const btnToday = document.getElementById("btn-today");

  if (weekTitle) {
    weekTitle.textContent = weekNum >= 1 && weekNum <= 24 ? `Учебная неделя №${weekNum}` : `Календарная неделя`;
  }
  weekCurrentBadge?.classList.toggle("hidden", !isCurrentStudyWeek);
  if (weekSubtitle) weekSubtitle.textContent = `${parityText} · ${fmtShort(monday)} – ${fmtShort(sunday)}`;
  if (datePicker) datePicker.value = state.selectedDate;
  if (btnToday) btnToday.classList.toggle("hidden", state.selectedDate === todayISO);

  // Синхронизируем тумблер событий в настройках
  const eventsSwitch = document.getElementById("toggle-events-switch");
  if (eventsSwitch) eventsSwitch.checked = Boolean(state.showEvents);

  const hiddenCount = state.hiddenRules.length;
  const badgeHidden = document.getElementById("badge-hidden-count");
  const bannerHidden = document.getElementById("hidden-classes-banner");
  const inlineHiddenCount = document.getElementById("inline-hidden-count");
  if (badgeHidden) {
    badgeHidden.textContent = hiddenCount;
    badgeHidden.classList.toggle("hidden", hiddenCount === 0);
  }
  if (bannerHidden && inlineHiddenCount) {
    inlineHiddenCount.textContent = hiddenCount;
    bannerHidden.classList.toggle("hidden", hiddenCount === 0);
  }

  if (state.weekGridMode) {
    renderWeekGridTable();
  }

  // 7-дневная полоса недели (чистая, без рамок и коробок, по референсу image_6964ef.jpg)
  const visibleSchedule = getVisibleSchedule();
  const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const daySelector = document.getElementById("day-selector");
  const buttonsHtml = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = formatDateISO(d);
    const isSelected = iso === state.selectedDate;
    const isToday = iso === todayISO;
    const countForDay = visibleSchedule.filter((s) => s.date === iso).length;
    const hasEventForDay = state.showEvents && state.events.some((ev) => ev.date === iso);

    let pillClass = "bg-transparent text-secondary-adaptive hover:bg-white/[0.04]";
    if (isSelected) {
      pillClass = "ios-accent-btn font-bold";
    } else if (isToday) {
      pillClass = "bg-transparent text-ios-accent font-bold";
    }

    const dotColor = isSelected ? "bg-current opacity-85" : isToday ? "bg-ios-accent" : "bg-white/30";

    buttonsHtml.push(`
      <button type="button" data-select-date="${iso}" class="ios-press relative flex flex-col items-center py-2.5 rounded-2xl transition-colors min-w-0 ${pillClass}">
        <span class="text-[11px] font-medium ${isSelected ? "opacity-90" : "opacity-75"}">${dayNames[i]}</span>
        <span class="text-[16px] font-semibold mt-1 tabular-nums">${d.getDate()}</span>
        <div class="flex gap-1 mt-1.5 h-1.5 items-center">
          ${countForDay > 0 ? `<span class="w-1 h-1 rounded-full ${dotColor}"></span>` : ""}
          ${hasEventForDay ? `<span class="w-1 h-1 rounded-full ${isSelected ? "bg-current" : "bg-ios-accent"}"></span>` : ""}
        </div>
      </button>
    `);
  }
  if (daySelector) daySelector.innerHTML = buttonsHtml.join("");

  // Рендеринг блока Мероприятий (чистые строки с тонкими разделителями)
  const eventsWrapper = document.getElementById("events-section-wrapper");
  const eventsListEl = document.getElementById("events-list");
  const eventsCountEl = document.getElementById("events-day-count");
  const dayEvents = state.events
    .filter((ev) => ev.date === state.selectedDate)
    .sort((a, b) => timeToMinutes(a.startTime || "00:00") - timeToMinutes(b.startTime || "00:00"));

  if (eventsWrapper && eventsListEl) {
    if (state.showEvents && dayEvents.length > 0) {
      eventsWrapper.classList.remove("hidden");
      if (eventsCountEl) eventsCountEl.textContent = dayEvents.length;
      eventsListEl.innerHTML = dayEvents
        .map((ev) => {
          const timeLabel =
            ev.startTime && ev.endTime
              ? `${escapeHtml(ev.startTime)}–${escapeHtml(ev.endTime)}`
              : ev.startTime
              ? `в ${escapeHtml(ev.startTime)}`
              : ev.endTime
              ? `до ${escapeHtml(ev.endTime)}`
              : "Весь день";

          return `
        <div data-open-event-details="${ev.id}" class="py-3 flex items-center justify-between gap-3 cursor-pointer active:opacity-70 transition-opacity">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <span class="w-2 h-2 rounded-full bg-ios-accent shrink-0"></span>
            <div class="min-w-0 flex-1">
              <h4 class="text-[15px] font-semibold text-primary-adaptive truncate">${escapeHtml(ev.title)}</h4>
              ${
                ev.location
                  ? `<p class="text-[12px] text-secondary-adaptive truncate mt-0.5">${escapeHtml(ev.location)}</p>`
                  : ""
              }
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[13px] font-medium text-ios-accent tabular-nums">${timeLabel}</span>
            <i data-lucide="chevron-right" class="w-4 h-4 text-tertiary-adaptive"></i>
          </div>
        </div>
      `;
        })
        .join("");
    } else {
      eventsWrapper.classList.add("hidden");
      eventsListEl.innerHTML = "";
    }
  }

  // Рендеринг учебных пар выбранного дня (чистый таймлайн iOS по референсу image_6964ef.jpg)
  const listEl = document.getElementById("schedule-list");
  if (!listEl) return;

  const dayClasses = visibleSchedule
    .filter((item) => item.date === state.selectedDate)
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  if (dayClasses.length === 0) {
    const readableDate = parseDateISO(state.selectedDate).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    listEl.innerHTML = `
      <div class="py-12 text-center space-y-2">
        <div class="w-11 h-11 rounded-full ios-surface text-ios-accent flex items-center justify-center mx-auto mb-3">
          <i data-lucide="sparkles" class="w-5 h-5"></i>
        </div>
        <p class="font-semibold text-[16px] text-primary-adaptive capitalize">${escapeHtml(readableDate)}</p>
        <p class="text-[13px] text-secondary-adaptive max-w-[260px] mx-auto">Свободный день — пар по расписанию нет</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  listEl.innerHTML = dayClasses
    .map((item) => {
      const isLiveNow =
        item.date === todayISO &&
        nowMinutes >= timeToMinutes(item.startTime) &&
        nowMinutes < timeToMinutes(item.endTime);

      const isPassed =
        item.date < todayISO ||
        (item.date === todayISO && nowMinutes >= timeToMinutes(item.endTime));

      const subjectTasks = state.tasks.filter(
        (t) =>
          String(t.subject).trim().toLowerCase() === String(item.subject).trim().toLowerCase() &&
          (t.deadline === item.date || (!t.completed && t.deadline >= item.date))
      );

      const classNotes = state.notes.filter(
        (n) =>
          n.subject &&
          String(n.subject).trim().toLowerCase() === String(item.subject).trim().toLowerCase() &&
          (!n.date || n.date === item.date)
      );

      const rowStateClass = isLiveNow ? "is-live" : isPassed ? "is-passed" : "";

      // Компактные метаданные под названием предмета (аудитория · тип · индикаторы ДЗ/заметок/темы)
      const metaParts = [escapeHtml(item.room), escapeHtml(item.type)];
      if (item.topic) metaParts.push(`Тема: ${escapeHtml(item.topic)}`);
      if (classNotes.length > 0) metaParts.push(`Заметки (${classNotes.length})`);

      return `
      <div class="timeline-row ${rowStateClass} group" data-open-class-details="${item.id}">
        <!-- Вертикальная линия таймлайна с точкой -->
        <div class="timeline-rail-col">
          <span class="timeline-dot"></span>
          <span class="timeline-rail-line"></span>
        </div>

        <!-- Основная информация о паре (без коробки!) -->
        <div class="flex-1 min-w-0 space-y-1.5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="timeline-title text-[16px] font-semibold leading-snug text-primary-adaptive break-words">
                ${escapeHtml(item.subject)}
              </h3>
              <p class="text-[13px] text-secondary-adaptive truncate mt-0.5">
                ${metaParts.join(" · ")}
              </p>
            </div>

            <div class="text-right shrink-0 tabular-nums">
              <div class="text-[13px] font-medium ${isLiveNow ? "text-ios-accent font-semibold" : "text-secondary-adaptive"}">
                ${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}
              </div>
              <div class="text-[11px] text-tertiary-adaptive mt-0.5">${escapeHtml(item.number)} пара</div>
            </div>
          </div>

          ${
            subjectTasks.length > 0
              ? `<div class="pt-1 space-y-1.5" onclick="event.stopPropagation()">
                  ${subjectTasks
                    .map(
                      (t) => `
                    <div class="flex items-center gap-2.5 text-[13px]">
                      <button type="button" data-toggle-task="${t.id}" class="ios-press w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                        t.completed
                          ? "ios-accent-btn border-transparent"
                          : "border-ios-accent/70 hover:border-ios-accent"
                      }">
                        ${t.completed ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ""}
                      </button>
                      <span data-edit-task="${t.id}" class="truncate cursor-pointer ${
                        t.completed ? "line-through text-tertiary-adaptive" : "text-primary-adaptive/90"
                      }">${escapeHtml(t.text)}</span>
                    </div>`
                    )
                    .join("")}
                </div>`
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");

  if (state.animateNextCascade) {
    triggerCascadeOnce(listEl);
  }
  refreshIcons();
}

function renderPhotosRow(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return "";
  return `
    <div class="flex gap-2 overflow-x-auto no-scrollbar pt-1.5">
      ${photos
        .map(
          (src) => `
        <img src="${src}" data-view-photo="${src}" alt="Вложение" class="w-16 h-16 rounded-xl object-cover border ios-divider cursor-pointer shrink-0 hover:opacity-90" />
      `
        )
        .join("")}
    </div>
  `;
}

// ============================================================================
// 13. РЕНДЕРИНГ ТРЕКЕРА ДЗ (ГРУППИРОВКА ПО ДАТАМ БЕЗ ПЛИТОК, ПО РЕФЕРЕНСУ)
// ============================================================================
function formatTaskGroupHeader(dateStr, todayISO, tomorrowISO) {
  if (dateStr < todayISO) return "Просрочено";
  if (dateStr === todayISO) return "Сегодня";
  if (dateStr === tomorrowISO) return "Завтра";
  const d = parseDateISO(dateStr);
  if (isNaN(d)) return dateStr;
  const raw = d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function renderTasks() {
  const container = document.getElementById("tasks-list");
  if (!container) return;

  // 1. First: записываем старые координаты строк для FLIP-анимации
  const prevRects = new Map();
  if (!isReducedMotion() && state.activeTab === "tasks") {
    container.querySelectorAll("[data-task-card-id]").forEach((el) => {
      prevRects.set(el.dataset.taskCardId, el.getBoundingClientRect());
    });
  }

  const todayISO = getTodayISO();
  const tomorrowISO = addDaysISO(todayISO, 1);
  const currentWeekNum = getStudyWeekNumber(state.selectedDate);

  const activeTasks = state.tasks.filter((t) => !t.completed);
  const completedTasks = state.tasks.filter((t) => t.completed);
  const weekTasks = state.tasks.filter(
    (t) => !t.completed && getStudyWeekNumber(String(t.deadline).slice(0, 10)) === currentWeekNum
  );

  const countActiveEl = document.getElementById("count-active-tasks");
  const countWeekEl = document.getElementById("count-week-tasks");
  const countCompEl = document.getElementById("count-completed-tasks");
  if (countActiveEl) countActiveEl.textContent = activeTasks.length;
  if (countWeekEl) countWeekEl.textContent = weekTasks.length;
  if (countCompEl) countCompEl.textContent = completedTasks.length;

  const badge = document.getElementById("nav-badge-tasks");
  if (badge) {
    badge.textContent = activeTasks.length;
    badge.classList.toggle("hidden", activeTasks.length === 0);
  }

  let list = [...activeTasks];
  if (state.taskFilter === "this-week") list = [...weekTasks];
  else if (state.taskFilter === "completed") list = [...completedTasks];

  list.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center space-y-1.5">
        <p class="font-semibold text-[16px] text-primary-adaptive">Заданий в этой категории нет</p>
        <p class="text-[13px] text-secondary-adaptive">Нажмите «+» сверху или откройте нужную пару в расписании</p>
      </div>`;
    return;
  }

  // Группируем задачи по дате дедлайна (как на референсе image_6964ee.jpg)
  const groups = new Map();
  for (const task of list) {
    const dKey = String(task.deadline || todayISO).slice(0, 10);
    if (!groups.has(dKey)) groups.set(dKey, []);
    groups.get(dKey).push(task);
  }

  let html = "";
  for (const [dKey, groupTasks] of groups.entries()) {
    const groupTitle = formatTaskGroupHeader(dKey, todayISO, tomorrowISO);
    const isOverdueGroup = state.taskFilter !== "completed" && dKey < todayISO;

    html += `
      <div class="space-y-1">
        <h3 class="text-[13px] font-semibold tracking-tight pb-1 ${
          isOverdueGroup ? "text-ios-red" : "text-primary-adaptive"
        }">${escapeHtml(groupTitle)}</h3>

        <div class="divide-y ios-divider">
          ${groupTasks
            .map((task) => {
              const deadlineDate = String(task.deadline).slice(0, 10);
              const overdue = !task.completed && deadlineDate < todayISO;
              const isTodayDue = !task.completed && deadlineDate === todayISO;
              const isTomorrowDue = !task.completed && deadlineDate === tomorrowISO;
              const rightLabel = isTodayDue
                ? "Сегодня"
                : isTomorrowDue
                ? "Завтра"
                : formatCompactNumericDate(deadlineDate);

              const hasPhotos = Array.isArray(task.photos) && task.photos.length > 0;

              return `
              <div data-task-card-id="${task.id}" class="py-3 flex items-start gap-3.5">
                <button type="button" data-toggle-task="${task.id}" class="ios-press mt-0.5 w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
                  task.completed
                    ? "ios-accent-btn border-transparent"
                    : "border-white/30 hover:border-ios-accent"
                }">
                  ${task.completed ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ""}
                </button>

                <div data-edit-task="${task.id}" class="flex-1 min-w-0 cursor-pointer">
                  <div class="flex items-start justify-between gap-2.5">
                    <p class="text-[15px] font-medium leading-snug whitespace-pre-wrap break-words ${
                      task.completed ? "line-through text-tertiary-adaptive" : "text-primary-adaptive"
                    }">${escapeHtml(task.text)}</p>

                    <span class="text-[12px] font-medium shrink-0 tabular-nums mt-0.5 ${
                      overdue
                        ? "text-ios-red"
                        : isTodayDue
                        ? "text-ios-accent"
                        : "text-secondary-adaptive"
                    }">${escapeHtml(rightLabel)}</span>
                  </div>

                  <div class="flex items-center gap-2 mt-1 text-[12px] text-secondary-adaptive">
                    <span class="truncate">${escapeHtml(task.subject)}</span>
                    ${
                      hasPhotos
                        ? `<span class="inline-flex items-center gap-1 text-ios-accent shrink-0">· <i data-lucide="image" class="w-3 h-3"></i> ${task.photos.length}</span>`
                        : ""
                    }
                  </div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // 2. Last + Invert + Play: FLIP-сдвиг строк пружиной
  if (prevRects.size > 0 && !isReducedMotion() && state.activeTab === "tasks") {
    container.querySelectorAll("[data-task-card-id]").forEach((el) => {
      const id = el.dataset.taskCardId;
      const oldRect = prevRects.get(id);
      const newRect = el.getBoundingClientRect();
      if (oldRect) {
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dy) > 1) {
          el.style.willChange = "transform";
          animateTrackedSpring(
            `flip_task_${id}`,
            dy,
            0,
            SPRING_SHEET,
            (val) => {
              el.style.transform = `translate3d(0, ${val}px, 0)`;
            },
            () => {
              el.style.transform = "";
              el.style.willChange = "";
            }
          );
        }
      }
    });
  } else if (state.animateNextCascade) {
    triggerCascadeOnce(container);
  }

  refreshIcons();
}

// ============================================================================
// 14. РЕНДЕРИНГ ЗАМЕТОК (APPLE NOTES LIST + ПОИСК, ПО РЕФЕРЕНСУ)
// ============================================================================
function renderNotes() {
  const container = document.getElementById("notes-list");
  if (!container) return;

  let list = [...state.notes];

  if (state.noteFilter === "class") {
    list = list.filter((n) => Boolean(n.subject));
  } else if (state.noteFilter === "general") {
    list = list.filter((n) => !n.subject);
  }

  const q = state.noteSearchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (n) =>
        String(n.title || "").toLowerCase().includes(q) ||
        String(n.content || "").toLowerCase().includes(q) ||
        String(n.subject || "").toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center space-y-1.5">
        <p class="font-semibold text-[16px] text-primary-adaptive">${q ? "Ничего не найдено" : "Заметок пока нет"}</p>
        <p class="text-[13px] text-secondary-adaptive">${q ? "Попробуйте изменить поисковый запрос" : "Нажмите «+» сверху, чтобы создать заметку"}</p>
      </div>`;
    return;
  }

  container.innerHTML = list
    .map((note) => {
      const subParts = [];
      subParts.push(note.subject ? escapeHtml(note.subject) : "Личное");
      if (note.date) subParts.push(escapeHtml(formatCompactNumericDate(note.date)));
      if (Array.isArray(note.photos) && note.photos.length > 0) {
        subParts.push(`Фото (${note.photos.length})`);
      }

      return `
      <div data-edit-note="${note.id}" class="py-3.5 flex items-center justify-between gap-3 cursor-pointer active:opacity-70 transition-opacity">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            ${note.pinned ? `<i data-lucide="pin" class="w-3.5 h-3.5 text-ios-accent shrink-0"></i>` : ""}
            <h3 class="text-[15px] font-semibold text-primary-adaptive truncate">
              ${escapeHtml(note.title || "Без названия")}
            </h3>
          </div>
          <p class="text-[13px] text-secondary-adaptive truncate mt-0.5">
            ${escapeHtml(note.content || "Нет дополнительного текста")}
          </p>
          <div class="flex items-center gap-2 mt-1 text-[12px] text-tertiary-adaptive">
            <span>${subParts.join(" · ")}</span>
            ${
              note.notifyEnabled && note.notifyTime
                ? `<span class="text-ios-accent inline-flex items-center gap-1"><i data-lucide="bell" class="w-3 h-3"></i>${escapeHtml(
                    new Date(note.notifyTime).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  )}</span>`
                : ""
            }
          </div>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-tertiary-adaptive shrink-0"></i>
      </div>
    `;
    })
    .join("");

  if (state.animateNextCascade) {
    triggerCascadeOnce(container);
  }
  refreshIcons();
}

// ============================================================================
// 15. СКРЫТЫЕ ПАРЫ И DATALIST
// ============================================================================
function renderHiddenClassesModal() {
  const container = document.getElementById("hidden-classes-list");
  if (!container) return;
  if (state.hiddenRules.length === 0) {
    container.innerHTML = `<div class="py-8 text-center text-[13px] text-secondary-adaptive">Скрытых пар сейчас нет. Все дисциплины отображаются в расписании.</div>`;
    return;
  }

  container.innerHTML = state.hiddenRules
    .map(
      (rule) => `
    <div class="py-3.5 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <span class="text-[11px] font-semibold ${rule.mode === "forever" ? "text-ios-red" : "text-ios-accent"}">
          ${rule.mode === "forever" ? "Скрыто насовсем" : `Только на неделе №${rule.weekNum}`}
        </span>
        <p class="text-[15px] font-medium text-primary-adaptive truncate mt-0.5">${escapeHtml(rule.subject)}</p>
      </div>
      <button type="button" data-restore-hidden="${rule.id}" class="ios-press px-3.5 py-1.5 rounded-full ios-accent-soft-btn text-[12px] font-semibold shrink-0">
        Вернуть
      </button>
    </div>
  `
    )
    .join("");
}

function updateSubjectsDatalist() {
  const dl = document.getElementById("subjects-datalist");
  if (!dl) return;
  const subjects = [...new Set(state.schedule.filter((s) => !s.isEvent).map((s) => s.subject))];
  dl.innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("");
}

function applyTaskTargetMode(mode) {
  state.taskTargetMode = mode;
  document.querySelectorAll(".task-target-btn").forEach((btn) => {
    const active = btn.dataset.taskTarget === mode;
    btn.className = `task-target-btn ios-press py-2 rounded-[11px] text-[12px] font-semibold transition-all ${
      active ? "ios-seg-active" : "text-secondary-adaptive"
    }`;
  });

  const subj = document.getElementById("task-subject")?.value.trim() || "";
  const baseDate = state.contextClassItem?.date || state.selectedDate;
  const dateInput = document.getElementById("task-deadline");
  const hint = document.getElementById("task-target-hint");
  if (!dateInput || !hint) return;

  if (mode === "current") {
    dateInput.value = baseDate;
    hint.textContent = `Запишется на текущую пару (${formatShortDate(baseDate)})`;
  } else if (mode === "next") {
    const nextDate = findNextClassDateForSubject(subj, baseDate);
    dateInput.value = nextDate;
    hint.textContent = `Следующая пара: ${formatShortDate(nextDate)}`;
  } else {
    hint.textContent = `Выберите дату дедлайна ниже`;
    dateInput.focus();
  }
}

function applyNoteTargetMode(mode) {
  state.noteTargetMode = mode;
  document.querySelectorAll(".note-target-btn").forEach((btn) => {
    const active = btn.dataset.noteTarget === mode;
    btn.className = `note-target-btn ios-press py-1.5 rounded-[11px] text-[11px] font-semibold transition-all ${
      active ? "ios-seg-active" : "text-secondary-adaptive"
    }`;
  });

  const subj = document.getElementById("note-subject")?.value.trim() || "";
  const baseDate = state.contextClassItem?.date || state.selectedDate;
  const dateInput = document.getElementById("note-date");
  const hint = document.getElementById("note-target-hint");
  if (!dateInput || !hint) return;

  if (mode === "none") {
    dateInput.value = "";
    hint.textContent = "Без привязки к конкретной дате";
  } else if (mode === "current") {
    dateInput.value = baseDate;
    hint.textContent = `К текущей паре (${formatShortDate(baseDate)})`;
  } else if (mode === "next") {
    const nextDate = findNextClassDateForSubject(subj, baseDate);
    dateInput.value = nextDate;
    hint.textContent = `К следующей паре (${formatShortDate(nextDate)})`;
  } else {
    if (!dateInput.value) dateInput.value = baseDate;
    hint.textContent = "Выберите дату ниже";
  }
}

function renderDraftPhotos(containerId, photosArray, type) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (photosArray.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = photosArray
    .map(
      (src, idx) => `
    <div class="relative shrink-0">
      <img src="${src}" data-view-photo="${src}" class="w-16 h-16 rounded-xl object-cover border ios-divider cursor-pointer" />
      <button type="button" data-remove-draft-photo="${type}:${idx}" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ios-red text-white text-[10px] font-bold flex items-center justify-center shadow">✕</button>
    </div>
  `
    )
    .join("");
}

function setScopeMode(scope) {
  state.addScope = scope;
  document.querySelectorAll(".scope-btn").forEach((btn) => {
    const active = btn.dataset.scope === scope;
    btn.className = `scope-btn ios-press py-1.5 rounded-[11px] text-[11px] font-semibold transition-all ${
      active ? "ios-seg-active" : "text-secondary-adaptive"
    }`;
  });
  document.getElementById("scope-box-date")?.classList.toggle("hidden", scope !== "date");
  document.getElementById("scope-box-week")?.classList.toggle("hidden", scope !== "week" && scope !== "next-week");
  document.getElementById("scope-box-semester")?.classList.toggle("hidden", scope !== "semester");
}

function syncNoteModalPinUI() {
  const pinBtn = document.getElementById("note-modal-pin-btn");
  if (!pinBtn) return;
  pinBtn.classList.toggle("ios-accent-soft-btn", state.noteModalPinned);
  pinBtn.classList.toggle("text-secondary-adaptive", !state.noteModalPinned);
}

// ============================================================================
// 16. ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================
function initUIListeners() {
  initPhotoViewerGestures();

  // Обзор всей недели
  document.getElementById("btn-week-grid-toggle")?.addEventListener("click", () => {
    if (state.activeTab !== "schedule") {
      switchTabWithSpring("schedule");
    }
    toggleWeekGridView();
  });
  document.getElementById("btn-close-week-grid")?.addEventListener("click", () => {
    toggleWeekGridView(false);
  });

  document.querySelectorAll(".week-layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.weekLayout = btn.dataset.weekLayout || "list";
      localStorage.setItem("diary_week_layout_v1", state.weekLayout);
      renderWeekGridTable();
    });
  });

  // Загрузка своего фона из галереи
  document.getElementById("custom-bg-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBg = await compressImageFile(file, 1400, 0.78);
      localStorage.setItem("diary_custom_bg_img_v6", compressedBg);
      localStorage.setItem("diary_bg_mode_v7", "custom");
      if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
      showInAppToast("Фон обновлен", "Ваш фон из галереи установлен.");
    } catch {
      alert("Не удалось загрузить изображение фона");
    }
    e.target.value = "";
  });

  document.getElementById("btn-clear-custom-bg")?.addEventListener("click", () => {
    localStorage.removeItem("diary_custom_bg_img_v6");
    localStorage.setItem("diary_bg_mode_v7", "abstract");
    if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
  });

  document.getElementById("bg-dim-slider")?.addEventListener("input", (e) => {
    const val = Math.min(85, Math.max(0, Number(e.target.value) || 0));
    localStorage.setItem("diary_custom_bg_dim_v7", String(val));
    const label = document.getElementById("bg-dim-value");
    if (label) label.textContent = `${val}%`;
    if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
  });

  // Разрешение уведомлений и тумблеры
  document.getElementById("btn-request-notif-permission")?.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showInAppToast("Уведомления активны", "В вашем браузере включены внутриэкранные уведомления.");
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifPermissionStatusUI();
    if (perm === "granted") {
      sendAppNotification("Уведомления включены", "Мы напомним о парах, дедлайнах ДЗ и заметках.");
    }
  });

  const saveNotifToggles = () => {
    state.notifSettings = {
      classes: Boolean(document.getElementById("notif-toggle-classes")?.checked),
      tasks: Boolean(document.getElementById("notif-toggle-tasks")?.checked),
      notes: Boolean(document.getElementById("notif-toggle-notes")?.checked)
    };
    localStorage.setItem("diary_notif_settings_v4", JSON.stringify(state.notifSettings));
    updateNotifPermissionStatusUI();
  };
  document.getElementById("notif-toggle-classes")?.addEventListener("change", saveNotifToggles);
  document.getElementById("notif-toggle-tasks")?.addEventListener("change", saveNotifToggles);
  document.getElementById("notif-toggle-notes")?.addEventListener("change", saveNotifToggles);

  document.getElementById("btn-test-notification")?.addEventListener("click", () => {
    sendAppNotification("Тестовое уведомление", "Уведомления работают отлично!");
  });
  document.getElementById("btn-test-notification-alt")?.addEventListener("click", () => {
    sendAppNotification("Тестовое уведомление", "Уведомления работают отлично!");
  });

  // Тумблер показа мероприятий в настройках
  document.getElementById("toggle-events-switch")?.addEventListener("change", (e) => {
    state.showEvents = Boolean(e.target.checked);
    localStorage.setItem("diary_show_events_v4", String(state.showEvents));
    renderScheduleSection();
  });
  document.getElementById("btn-hide-events-inline")?.addEventListener("click", () => {
    state.showEvents = false;
    localStorage.setItem("diary_show_events_v4", "false");
    renderScheduleSection();
  });

  // Навигация по неделям и дням с плавным перелистыванием
  document.getElementById("btn-prev-week")?.addEventListener("click", () => {
    selectDateWithSlide(addDaysISO(state.selectedDate, -7));
  });
  document.getElementById("btn-next-week")?.addEventListener("click", () => {
    selectDateWithSlide(addDaysISO(state.selectedDate, 7));
  });
  document.getElementById("btn-today")?.addEventListener("click", () => {
    selectDateWithSlide(getInitialStudyDate());
  });
  document.getElementById("btn-date-picker-trigger")?.addEventListener("click", () => {
    const picker = document.getElementById("date-jump-picker");
    if (picker && typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
      } catch {}
    }
  });
  document.getElementById("date-jump-picker")?.addEventListener("change", (e) => {
    if (e.target.value) {
      selectDateWithSlide(e.target.value);
    }
  });
  document.getElementById("day-selector")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-select-date]");
    if (btn) {
      selectDateWithSlide(btn.dataset.selectDate);
    }
  });

  // Переключение дней недели на ПК стрелками клавиатуры
  document.addEventListener("keydown", (e) => {
    if (state.activeTab !== "schedule") return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const anyModalOpen = document.querySelector('div[id^="modal-"].fixed:not(.hidden)');
    if (anyModalOpen) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      selectDateWithSlide(addDaysISO(state.selectedDate, e.shiftKey ? -7 : -1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      selectDateWithSlide(addDaysISO(state.selectedDate, e.shiftKey ? 7 : 1));
    }
  });

  // Двухпанельный интерактивный свайп дней и вкладок + физика кнопок и шторок
  ensureDaySwipeViewport();
  initInteractiveDayAndTabSwipes();
  initPressAndIslandPhysics();
  initBottomSheetsPhysics();

  // Добавление мероприятия
  document.getElementById("btn-add-event")?.addEventListener("click", () => {
    document.getElementById("form-event")?.reset();
    const editId = document.getElementById("event-edit-id");
    const title = document.getElementById("modal-event-title");
    const df = document.getElementById("event-date-from");
    const dt = document.getElementById("event-date-to");
    const st = document.getElementById("event-start");
    const et = document.getElementById("event-end");
    if (editId) editId.value = "";
    if (title) title.textContent = "Новое событие";
    if (df) df.value = state.selectedDate;
    if (dt) dt.value = "";
    if (st) st.value = "";
    if (et) et.value = "";
    openModal("modal-event");
  });

  document.getElementById("form-event")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("event-edit-id")?.value || "";
    const title = document.getElementById("event-title")?.value.trim() || "Мероприятие";
    const fromStr = document.getElementById("event-date-from")?.value || state.selectedDate;
    const rawToStr = document.getElementById("event-date-to")?.value || "";
    const toStr = rawToStr && rawToStr >= fromStr ? rawToStr : fromStr;
    const startTime = document.getElementById("event-start")?.value || "";
    const endTime = document.getElementById("event-end")?.value || "";
    const location = document.getElementById("event-location")?.value.trim() || "";

    if (editId) {
      await saveEventItems([{ id: editId, title, date: fromStr, startTime, endTime, location }]);
      state.selectedDate = fromStr;
      renderScheduleSection();
      closeModal("modal-event");
      return;
    }

    const startD = parseDateISO(fromStr);
    const endD = parseDateISO(toStr);
    const items = [];
    let idx = 0;

    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const iso = formatDateISO(d);
      items.push({
        id: `event_${iso}_${Date.now()}_${idx++}`,
        title,
        date: iso,
        startTime,
        endTime,
        location
      });
    }

    if (items.length > 0) {
      state.showEvents = true;
      localStorage.setItem("diary_show_events_v4", "true");
      await saveEventItems(items);
      state.selectedDate = items[0].date;
      renderScheduleSection();
    }
    closeModal("modal-event");
  });

  // Поиск по заметкам
  document.getElementById("notes-search-input")?.addEventListener("input", (e) => {
    state.noteSearchQuery = e.target.value || "";
    renderNotes();
  });

  // Закрепление заметки в модальном окне
  document.getElementById("note-modal-pin-btn")?.addEventListener("click", () => {
    state.noteModalPinned = !state.noteModalPinned;
    syncNoteModalPinUI();
  });

  // Показ/скрытие поля времени уведомления в модалке заметки
  document.getElementById("note-notify-enabled")?.addEventListener("change", (e) => {
    document.getElementById("note-notify-time-wrap")?.classList.toggle("hidden", !e.target.checked);
  });

  document.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => setScopeMode(btn.dataset.scope));
  });
  document.getElementById("sched-number")?.addEventListener("change", (e) => {
    const bell = BELL_SCHEDULE[e.target.value];
    if (bell) {
      const s = document.getElementById("sched-start");
      const end = document.getElementById("sched-end");
      if (s) s.value = bell.start;
      if (end) end.value = bell.end;
    }
  });

  // Универсальная кнопка "+" в верхней шапке
  document.getElementById("btn-header-add")?.addEventListener("click", () => {
    if (state.activeTab === "schedule") {
      document.getElementById("form-schedule")?.reset();
      const editId = document.getElementById("sched-edit-id");
      const title = document.getElementById("modal-schedule-title");
      const wrap = document.getElementById("scope-selector-wrapper");
      const sDate = document.getElementById("sched-date");
      const semDay = document.getElementById("sched-sem-day");
      if (editId) editId.value = "";
      if (title) title.textContent = "Новая пара";
      wrap?.classList.remove("hidden");
      if (sDate) sDate.value = state.selectedDate;
      const rawDay = parseDateISO(state.selectedDate).getDay();
      if (semDay) semDay.value = String(rawDay);
      const cbVal = rawDay === 0 ? 7 : rawDay;
      document.querySelectorAll(".week-day-cb").forEach((cb) => {
        cb.checked = Number(cb.value) === cbVal;
      });
      setScopeMode("date");
      openModal("modal-schedule");
    } else if (state.activeTab === "tasks") {
      openTaskModalFor(null);
    } else {
      openNoteModalFor(null);
    }
  });

  document.getElementById("btn-new-task-top")?.addEventListener("click", () => openTaskModalFor(null));
  document.getElementById("btn-new-note-top")?.addEventListener("click", () => openNoteModalFor(null));

  // Скрытые пары
  const openHiddenModal = () => {
    closeModal("modal-tools");
    renderHiddenClassesModal();
    openModal("modal-hidden-classes");
  };
  document.getElementById("btn-hidden-classes")?.addEventListener("click", openHiddenModal);
  document.getElementById("btn-open-hidden-inline")?.addEventListener("click", openHiddenModal);

  document.getElementById("btn-restore-all-hidden")?.addEventListener("click", async () => {
    const ids = state.hiddenRules.map((r) => r.id);
    for (const id of ids) await removeHiddenRule(id);
    renderHiddenClassesModal();
    closeModal("modal-hidden-classes");
  });

  document.getElementById("btn-hide-this-week")?.addEventListener("click", async () => {
    const item = state.pendingDeleteItem;
    if (!item) return;
    const weekNum = getStudyWeekNumber(item.date);
    await saveHiddenRule({
      id: `hide_week_${weekNum}_${item.subject}_${item.number}`,
      mode: "week",
      weekNum,
      subject: item.subject,
      number: item.number
    });
    closeModal("modal-delete-schedule");
  });

  document.getElementById("btn-hide-forever")?.addEventListener("click", async () => {
    const item = state.pendingDeleteItem;
    if (!item) return;
    await saveHiddenRule({
      id: `hide_forever_${item.subject}`,
      mode: "forever",
      subject: item.subject,
      number: item.number
    });
    closeModal("modal-delete-schedule");
  });

  document.getElementById("btn-del-single")?.addEventListener("click", async () => {
    if (!state.pendingDeleteItem) return;
    await removeScheduleItemsByIds([state.pendingDeleteItem.id]);
    closeModal("modal-delete-schedule");
  });

  document.querySelectorAll(".task-target-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyTaskTargetMode(btn.dataset.taskTarget));
  });
  document.getElementById("task-subject")?.addEventListener("change", () => {
    if (state.taskTargetMode === "next") applyTaskTargetMode("next");
  });

  document.querySelectorAll(".note-target-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyNoteTargetMode(btn.dataset.noteTarget));
  });
  document.getElementById("note-subject")?.addEventListener("change", () => {
    if (state.noteTargetMode === "next") applyNoteTargetMode("next");
  });

  document.getElementById("task-photo-input")?.addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      const dataUrl = await compressImageFile(f);
      state.draftTaskPhotos.push(dataUrl);
    }
    renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
    e.target.value = "";
  });

  document.getElementById("note-photo-input")?.addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      const dataUrl = await compressImageFile(f);
      state.draftNotePhotos.push(dataUrl);
    }
    renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
    e.target.value = "";
  });

  document.getElementById("form-schedule")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("sched-edit-id")?.value || "";
    const number = Number(document.getElementById("sched-number")?.value || 1);
    const startTime = document.getElementById("sched-start")?.value || "08:00";
    const endTime = document.getElementById("sched-end")?.value || "09:30";
    const subject = document.getElementById("sched-subject")?.value.trim() || "Предмет";
    const topic = document.getElementById("sched-topic")?.value.trim() || "";
    const type = document.getElementById("sched-type")?.value || "Лекция";
    const room = document.getElementById("sched-room")?.value.trim() || "Ауд.";
    const teacher = document.getElementById("sched-teacher")?.value.trim() || "";
    const targetDates = [];

    if (editId) {
      const singleDate = document.getElementById("sched-date")?.value || state.selectedDate;
      await saveScheduleItems([{ id: editId, date: singleDate, number, startTime, endTime, subject, topic, type, room, teacher }]);
      closeModal("modal-schedule");
      return;
    }

    if (state.addScope === "date") {
      targetDates.push(document.getElementById("sched-date")?.value || state.selectedDate);
    } else if (state.addScope === "week" || state.addScope === "next-week") {
      const baseMonday = getMondayOfDate(state.selectedDate);
      if (state.addScope === "next-week") baseMonday.setDate(baseMonday.getDate() + 7);
      const checkedDays = [...document.querySelectorAll(".week-day-cb:checked")].map((cb) => Number(cb.value));
      for (const dayIdx of checkedDays) {
        const d = new Date(baseMonday);
        d.setDate(baseMonday.getDate() + (dayIdx - 1));
        targetDates.push(formatDateISO(d));
      }
    } else if (state.addScope === "semester") {
      const targetDow = Number(document.getElementById("sched-sem-day")?.value ?? 1);
      const parity = document.getElementById("sched-sem-parity")?.value || "all";
      const fromDate = parseDateISO(document.getElementById("sched-sem-from")?.value || "2026-09-01");
      const toDate = parseDateISO(document.getElementById("sched-sem-to")?.value || "2026-12-26");
      for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== targetDow) continue;
        const iso = formatDateISO(d);
        const wNum = getStudyWeekNumber(iso);
        const isOdd = Math.abs(wNum) % 2 === 1;
        if (parity === "odd" && !isOdd) continue;
        if (parity === "even" && isOdd) continue;
        targetDates.push(iso);
      }
    }

    const itemsToCreate = targetDates.map((dateStr, i) => ({
      id: `custom_${dateStr}_${Date.now()}_${i}`,
      date: dateStr,
      number,
      startTime,
      endTime,
      subject,
      topic,
      type,
      room,
      teacher
    }));

    if (itemsToCreate.length > 0) {
      await saveScheduleItems(itemsToCreate);
      state.selectedDate = itemsToCreate[0].date;
      renderScheduleSection();
    }
    closeModal("modal-schedule");
  });

  document.getElementById("form-task")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("task-edit-id")?.value || "";
    const taskObj = {
      id: editId || `task_${Date.now()}`,
      subject: document.getElementById("task-subject")?.value.trim() || "Предмет",
      text: document.getElementById("task-text")?.value.trim() || "",
      deadline: document.getElementById("task-deadline")?.value || state.selectedDate,
      completed: Boolean(document.getElementById("task-completed")?.checked),
      photos: [...state.draftTaskPhotos]
    };
    await saveTaskItem(taskObj);
    closeModal("modal-task");
  });

  // Удаление ДЗ из модального окна редактирования
  document.getElementById("btn-delete-task-from-modal")?.addEventListener("click", async () => {
    const id = document.getElementById("task-edit-id")?.value;
    if (!id) return;
    closeModal("modal-task");
    if (state.user && db) await deleteDoc(doc(db, "users", state.user.uid, "tasks", id));
    else {
      state.tasks = state.tasks.filter((t) => t.id !== id);
      saveLocalData();
      renderTasks();
      renderScheduleSection();
    }
  });

  document.getElementById("form-note")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("note-edit-id")?.value || "";
    const title = document.getElementById("note-title")?.value.trim() || "";
    const subject = document.getElementById("note-subject")?.value.trim() || "";
    const noteObj = {
      id: editId || `note_${Date.now()}`,
      title: title || (subject ? `Заметка: ${subject}` : "Без названия"),
      content: document.getElementById("note-content")?.value.trim() || "",
      subject,
      date: document.getElementById("note-date")?.value || "",
      pinned: Boolean(state.noteModalPinned),
      photos: [...state.draftNotePhotos],
      notifyEnabled: Boolean(document.getElementById("note-notify-enabled")?.checked),
      notifyTime: document.getElementById("note-notify-time")?.value || ""
    };
    await saveNoteItem(noteObj);
    closeModal("modal-note");
  });

  // Удаление заметки из модального окна редактирования
  document.getElementById("btn-delete-note-from-modal")?.addEventListener("click", async () => {
    const id = document.getElementById("note-edit-id")?.value;
    if (!id) return;
    closeModal("modal-note");
    if (state.user && db) await deleteDoc(doc(db, "users", state.user.uid, "notes", id));
    else {
      state.notes = state.notes.filter((n) => n.id !== id);
      saveLocalData();
      renderNotes();
      renderScheduleSection();
    }
  });

  document.getElementById("google-keep-import-input")?.addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    for (const file of files) {
      const raw = await file.text();
      let title = file.name.replace(/\.(json|txt|html)$/i, "");
      let content = raw;
      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(raw);
          title = parsed.title || title;
          content = parsed.textContent || parsed.content || raw;
        } catch {}
      }
      await saveNoteItem({
        id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: title || "Импортированная заметка",
        subject: "",
        date: "",
        content,
        pinned: false,
        photos: [],
        notifyEnabled: false,
        notifyTime: ""
      });
    }
    e.target.value = "";
  });

  document.getElementById("btn-tools")?.addEventListener("click", () => {
    openModal("modal-tools");
  });

  document.getElementById("btn-restore-default")?.addEventListener("click", async () => {
    const def = buildDefaultSchedule();
    state.schedule = def;
    state.hiddenRules = [];
    saveLocalData();
    if (state.user && db) await uploadBatchScheduleToCloud(def);
    renderScheduleSection();
    updateSubjectsDatalist();
    updateLiveWidget();
    closeModal("modal-tools");
    showInAppToast("Расписание восстановлено", "Все 275 пар семестра успешно загружены.");
  });

  document.getElementById("ics-file-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseICSFile(text);
    if (imported.length > 0) await saveScheduleItems(imported);
    closeModal("modal-tools");
  });

  document.getElementById("btn-login")?.addEventListener("click", async () => {
    if (!isFirebaseConfigured || !auth) {
      alert("Для входа через Google укажите ваш firebaseConfig в начале файла app.js");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      await signInWithRedirect(auth, googleProvider);
    }
  });
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (auth) signOut(auth);
  });

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTabWithSpring(btn.dataset.tab);
    });
  });

  document.querySelectorAll(".task-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.status;
      document.querySelectorAll(".task-filter-tab").forEach((b) => {
        const active = b.dataset.status === state.taskFilter;
        b.className = `task-filter-tab ios-press py-2 rounded-[11px] text-[13px] font-semibold transition-all ${
          active ? "ios-seg-active" : "text-secondary-adaptive"
        }`;
      });
      renderTasks();
    });
  });

  document.querySelectorAll(".note-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.noteFilter = btn.dataset.noteFilter;
      document.querySelectorAll(".note-filter-tab").forEach((b) => {
        const active = b.dataset.noteFilter === state.noteFilter;
        b.className = `note-filter-tab ios-press py-1.5 rounded-[11px] text-[13px] font-semibold transition-all ${
          active ? "ios-seg-active" : "text-secondary-adaptive"
        }`;
      });
      renderNotes();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  document.addEventListener("click", async (e) => {
    // Открытие подробного окна МЕРОПРИЯТИЯ
    const openEvDetails = e.target.closest("[data-open-event-details]");
    if (openEvDetails) {
      openEventDetailsModal(openEvDetails.dataset.openEventDetails);
      return;
    }

    // Открытие подробного окна ПАРЫ
    const openClsDetails = e.target.closest("[data-open-class-details]");
    if (openClsDetails) {
      openClassDetailsModal(openClsDetails.dataset.openClassDetails);
      return;
    }

    // Клик по карточке пары в сетке недели -> открыть подробности пары
    const gridOpenClass = e.target.closest("[data-grid-open-class]");
    if (gridOpenClass) {
      openClassDetailsModal(gridOpenClass.dataset.gridOpenClass);
      return;
    }

    // Клик по дню в сетке на всю неделю -> переход к этому дню
    const gridPick = e.target.closest("[data-grid-pick-date]");
    if (gridPick) {
      state.selectedDate = gridPick.dataset.gridPickDate;
      toggleWeekGridView(false);
      renderScheduleSection();
      return;
    }

    const photoEl = e.target.closest("[data-view-photo]");
    if (photoEl) {
      const img = document.getElementById("photo-viewer-img");
      if (img) img.src = photoEl.dataset.viewPhoto;
      resetPhotoViewerZoom();
      openModal("modal-photo-viewer");
      refreshIcons();
      return;
    }

    const rmPhotoBtn = e.target.closest("[data-remove-draft-photo]");
    if (rmPhotoBtn) {
      const [type, idxStr] = rmPhotoBtn.dataset.removeDraftPhoto.split(":");
      const idx = Number(idxStr);
      if (type === "task") {
        state.draftTaskPhotos.splice(idx, 1);
        renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
      } else {
        state.draftNotePhotos.splice(idx, 1);
        renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
      }
      return;
    }

    const delEventBtn = e.target.closest("[data-delete-event]");
    if (delEventBtn) {
      closeModal("modal-item-details");
      await deleteEventById(delEventBtn.dataset.deleteEvent);
      return;
    }

    const editEventBtn = e.target.closest("[data-edit-event]");
    if (editEventBtn) {
      closeModal("modal-item-details");
      const ev = state.events.find((x) => x.id === editEventBtn.dataset.editEvent);
      if (!ev) return;
      document.getElementById("event-edit-id").value = ev.id;
      document.getElementById("modal-event-title").textContent = "Изменить событие";
      document.getElementById("event-title").value = ev.title;
      document.getElementById("event-date-from").value = ev.date;
      document.getElementById("event-date-to").value = "";
      document.getElementById("event-start").value = ev.startTime;
      document.getElementById("event-end").value = ev.endTime;
      document.getElementById("event-location").value = ev.location || "";
      openModal("modal-event");
      return;
    }

    const quickTopicBtn = e.target.closest("[data-quick-topic]");
    if (quickTopicBtn) {
      const item = state.schedule.find((s) => s.id === quickTopicBtn.dataset.quickTopic);
      if (!item) return;
      const newTopic = prompt(`Введите тему пары (${item.subject}):`, item.topic || "");
      if (newTopic !== null) {
        item.topic = newTopic.trim();
        await saveScheduleItems([item]);
        if (!document.getElementById("modal-item-details")?.classList.contains("hidden")) {
          openClassDetailsModal(item.id);
        }
      }
      return;
    }

    const quickTaskBtn = e.target.closest("[data-quick-add-task]");
    if (quickTaskBtn) {
      const item = state.schedule.find((s) => s.id === quickTaskBtn.dataset.quickAddTask);
      openTaskModalFor(item || null);
      return;
    }

    const editTaskBtn = e.target.closest("[data-edit-task]");
    if (editTaskBtn) {
      closeModal("modal-item-details");
      const task = state.tasks.find((t) => t.id === editTaskBtn.dataset.editTask);
      if (!task) return;
      state.contextClassItem = null;
      state.draftTaskPhotos = [...(task.photos || [])];
      document.getElementById("task-edit-id").value = task.id;
      document.getElementById("modal-task-title").textContent = "Редактировать ДЗ";
      document.getElementById("task-subject").value = task.subject;
      document.getElementById("task-text").value = task.text;
      document.getElementById("task-deadline").value = String(task.deadline).slice(0, 10);
      document.getElementById("task-completed").checked = Boolean(task.completed);
      document.getElementById("btn-delete-task-from-modal")?.classList.remove("hidden");
      renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
      openModal("modal-task");
      return;
    }

    const shiftTaskBtn = e.target.closest("[data-shift-task-week]");
    if (shiftTaskBtn) {
      const task = state.tasks.find((t) => t.id === shiftTaskBtn.dataset.shiftTaskWeek);
      if (!task) return;
      task.deadline = addDaysISO(String(task.deadline).slice(0, 10), 7);
      await saveTaskItem(task);
      return;
    }

    const quickNoteBtn = e.target.closest("[data-quick-add-note]");
    if (quickNoteBtn) {
      const item = state.schedule.find((s) => s.id === quickNoteBtn.dataset.quickAddNote);
      openNoteModalFor(item || null);
      return;
    }

    const pinNoteBtn = e.target.closest("[data-toggle-pin-note]");
    if (pinNoteBtn) {
      const note = state.notes.find((n) => n.id === pinNoteBtn.dataset.togglePinNote);
      if (!note) return;
      note.pinned = !note.pinned;
      await saveNoteItem(note);
      return;
    }

    const editNoteBtn = e.target.closest("[data-edit-note]");
    if (editNoteBtn) {
      closeModal("modal-item-details");
      const note = state.notes.find((n) => n.id === editNoteBtn.dataset.editNote);
      if (!note) return;
      state.contextClassItem = null;
      state.draftNotePhotos = [...(note.photos || [])];
      state.noteModalPinned = Boolean(note.pinned);
      syncNoteModalPinUI();
      document.getElementById("note-edit-id").value = note.id;
      document.getElementById("modal-note-title").textContent = "Заметка";
      document.getElementById("note-title").value = note.title || "";
      document.getElementById("note-subject").value = note.subject || "";
      document.getElementById("note-date").value = note.date || "";
      document.getElementById("note-content").value = note.content || "";
      document.getElementById("note-notify-enabled").checked = Boolean(note.notifyEnabled);
      document.getElementById("note-notify-time").value = note.notifyTime || "";
      document.getElementById("note-notify-time-wrap")?.classList.toggle("hidden", !note.notifyEnabled);
      document.getElementById("btn-delete-note-from-modal")?.classList.remove("hidden");
      applyNoteTargetMode(note.date ? "custom" : "none");
      renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
      openModal("modal-note");
      return;
    }

    const copyNextWeekBtn = e.target.closest("[data-copy-next-week]");
    if (copyNextWeekBtn) {
      closeModal("modal-item-details");
      const item = state.schedule.find((s) => s.id === copyNextWeekBtn.dataset.copyNextWeek);
      if (!item) return;
      const nextDate = addDaysISO(item.date, 7);
      const copyItem = {
        ...item,
        id: `copy_${nextDate}_${Date.now()}`,
        date: nextDate
      };
      await saveScheduleItems([copyItem]);
      state.selectedDate = nextDate;
      renderScheduleSection();
      showInAppToast("Пара скопирована", `Добавлена на ${formatShortDate(nextDate)}`);
      return;
    }

    const restoreBtn = e.target.closest("[data-restore-hidden]");
    if (restoreBtn) {
      await removeHiddenRule(restoreBtn.dataset.restoreHidden);
      renderHiddenClassesModal();
      return;
    }

    const editBtn = e.target.closest("[data-edit-schedule]");
    if (editBtn) {
      const item = state.schedule.find((s) => s.id === editBtn.dataset.editSchedule);
      if (!item) return;
      document.getElementById("sched-edit-id").value = item.id;
      document.getElementById("modal-schedule-title").textContent = "Изменить пару";
      document.getElementById("scope-selector-wrapper")?.classList.add("hidden");
      setScopeMode("date");
      document.getElementById("sched-date").value = item.date;
      document.getElementById("sched-number").value = String(item.number || 1);
      document.getElementById("sched-start").value = item.startTime;
      document.getElementById("sched-end").value = item.endTime;
      document.getElementById("sched-subject").value = item.subject;
      document.getElementById("sched-topic").value = item.topic || "";
      document.getElementById("sched-type").value = item.type;
      document.getElementById("sched-room").value = item.room;
      document.getElementById("sched-teacher").value = item.teacher || "";
      openModal("modal-schedule");
      return;
    }

    const askDelBtn = e.target.closest("[data-ask-delete-schedule]");
    if (askDelBtn) {
      const item = state.schedule.find((s) => s.id === askDelBtn.dataset.askDeleteSchedule);
      if (!item) return;
      state.pendingDeleteItem = item;
      const info = document.getElementById("delete-sched-info");
      if (info) info.textContent = `${item.number} пара · ${item.subject} (${formatShortDate(item.date)})`;
      openModal("modal-delete-schedule");
      return;
    }

    const collapseTaskCardIfInList = (taskId) =>
      new Promise((resolve) => {
        const card = document.querySelector(`#tasks-list [data-task-card-id="${taskId}"]`);
        if (!card || isReducedMotion() || state.activeTab !== "tasks") {
          resolve();
          return;
        }
        const h = card.offsetHeight;
        card.style.overflow = "hidden";
        card.style.willChange = "transform, opacity";
        animateTrackedSpring(
          `collapse_${taskId}`,
          1,
          0,
          SPRING_SHEET,
          (p) => {
            const clamped = Math.max(0, p);
            card.style.opacity = String(clamped);
            card.style.transform = `translate3d(${(1 - clamped) * 24}px, 0, 0)`;
            card.style.marginBottom = `${(clamped - 1) * h}px`;
          },
          () => resolve()
        );
      });

    const toggleTaskBtn = e.target.closest("[data-toggle-task]");
    if (toggleTaskBtn) {
      const id = toggleTaskBtn.dataset.toggleTask;
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      await collapseTaskCardIfInList(id);
      task.completed = !task.completed;
      if (state.user && db) await updateDoc(doc(db, "users", state.user.uid, "tasks", id), { completed: task.completed });
      else {
        saveLocalData();
        renderTasks();
        renderScheduleSection();
      }
      return;
    }

    const delTaskBtn = e.target.closest("[data-delete-task]");
    if (delTaskBtn) {
      const id = delTaskBtn.dataset.deleteTask;
      await collapseTaskCardIfInList(id);
      if (state.user && db) await deleteDoc(doc(db, "users", state.user.uid, "tasks", id));
      else {
        state.tasks = state.tasks.filter((t) => t.id !== id);
        saveLocalData();
        renderTasks();
        renderScheduleSection();
      }
      return;
    }

    const delNoteBtn = e.target.closest("[data-delete-note]");
    if (delNoteBtn) {
      const id = delNoteBtn.dataset.deleteNote;
      if (state.user && db) await deleteDoc(doc(db, "users", state.user.uid, "notes", id));
      else {
        state.notes = state.notes.filter((n) => n.id !== id);
        saveLocalData();
        renderNotes();
        renderScheduleSection();
      }
    }
  });
}

// ============================================================================
// 17. ПОДРОБНЫЙ ПРОСМОТР ПАРЫ И МЕРОПРИЯТИЯ (ПО РЕФЕРЕНСУ image_680c11.jpg)
// ============================================================================
function openEventDetailsModal(eventId) {
  const ev = state.events.find((x) => x.id === eventId);
  if (!ev) return;

  const headerEl = document.getElementById("details-modal-header");
  const bodyEl = document.getElementById("details-modal-body");
  if (!bodyEl) return;

  if (headerEl) headerEl.textContent = "Событие";

  const fullDate = parseDateISO(ev.date).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const timeLabel =
    ev.startTime && ev.endTime
      ? `${escapeHtml(ev.startTime)} – ${escapeHtml(ev.endTime)}`
      : ev.startTime
      ? `Начало в ${escapeHtml(ev.startTime)}`
      : ev.endTime
      ? `До ${escapeHtml(ev.endTime)}`
      : "Весь день";

  bodyEl.innerHTML = `
    <div class="space-y-1.5">
      <div class="text-[12px] font-semibold text-ios-accent">${timeLabel}</div>
      <h3 class="text-[24px] font-bold tracking-tight leading-snug text-primary-adaptive break-words whitespace-pre-wrap">${escapeHtml(ev.title)}</h3>
      <p class="text-[14px] text-secondary-adaptive capitalize">${escapeHtml(fullDate)}</p>
    </div>

    <div class="divide-y ios-divider border-t border-b ios-divider">
      <div class="py-3.5 flex items-center justify-between gap-3">
        <span class="text-[13px] text-secondary-adaptive flex items-center gap-2">
          <i data-lucide="clock" class="w-4 h-4 text-ios-accent"></i>
          Время
        </span>
        <span class="text-[14px] font-semibold text-primary-adaptive">${timeLabel}</span>
      </div>

      <div class="py-3.5 flex items-start justify-between gap-3">
        <span class="text-[13px] text-secondary-adaptive flex items-center gap-2 shrink-0">
          <i data-lucide="map-pin" class="w-4 h-4 text-ios-accent"></i>
          Место
        </span>
        <span class="text-[14px] font-medium text-primary-adaptive text-right break-words whitespace-pre-wrap">${escapeHtml(ev.location || "Не указано")}</span>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5 pt-1">
      <button type="button" data-edit-event="${ev.id}" class="ios-press py-3 rounded-2xl ios-accent-soft-btn text-[14px] font-semibold flex items-center justify-center gap-1.5">
        <i data-lucide="pencil" class="w-4 h-4"></i>
        <span>Изменить</span>
      </button>
      <button type="button" data-delete-event="${ev.id}" class="ios-press py-3 rounded-2xl bg-ios-red/15 text-ios-red text-[14px] font-semibold flex items-center justify-center gap-1.5">
        <i data-lucide="trash-2" class="w-4 h-4"></i>
        <span>Удалить</span>
      </button>
    </div>
  `;

  openModal("modal-item-details");
  refreshIcons();
}

function openClassDetailsModal(classId) {
  const item = state.schedule.find((s) => s.id === classId);
  if (!item) return;

  const headerEl = document.getElementById("details-modal-header");
  const bodyEl = document.getElementById("details-modal-body");
  if (!bodyEl) return;

  const weekNum = getStudyWeekNumber(item.date);
  const parityText = Math.abs(weekNum) % 2 === 1 ? "Нечетная неделя" : "Четная неделя";

  if (headerEl) headerEl.textContent = `${item.number} пара · ${parityText}`;

  const fullDate = parseDateISO(item.date).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  const subjectTasks = state.tasks.filter(
    (t) =>
      String(t.subject).trim().toLowerCase() === String(item.subject).trim().toLowerCase() &&
      (t.deadline === item.date || (!t.completed && t.deadline >= item.date))
  );

  const classNotes = state.notes.filter(
    (n) =>
      n.subject &&
      String(n.subject).trim().toLowerCase() === String(item.subject).trim().toLowerCase() &&
      (!n.date || n.date === item.date)
  );

  bodyEl.innerHTML = `
    <!-- Заголовок пары (крупная типографика без коробки, по референсу image_680c11.jpg) -->
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-[12px] font-semibold text-ios-accent">
        <span>${escapeHtml(item.type)}</span>
        <span>·</span>
        <span class="capitalize">${escapeHtml(fullDate)}</span>
      </div>
      <h3 class="text-[24px] font-bold tracking-tight leading-snug text-primary-adaptive break-words whitespace-pre-wrap">${escapeHtml(item.subject)}</h3>
      <p class="text-[14px] text-secondary-adaptive">
        Ауд. ${escapeHtml(item.room || "—")}${item.teacher ? ` · ${escapeHtml(item.teacher)}` : ""}
      </p>
    </div>

    <!-- Время и неделя -->
    <div class="flex items-center justify-between py-3 px-3.5 rounded-2xl ios-surface">
      <div class="flex items-center gap-2.5">
        <i data-lucide="clock" class="w-4 h-4 text-ios-accent shrink-0"></i>
        <span class="text-[15px] font-semibold text-primary-adaptive tabular-nums">${escapeHtml(item.startTime)} – ${escapeHtml(item.endTime)}</span>
      </div>
      <span class="text-[12px] text-secondary-adaptive">${parityText}</span>
    </div>

    <!-- Разделы с тонкими разделителями (Тема пары, ДЗ, Заметки) -->
    <div class="divide-y ios-divider border-t border-b ios-divider">
      <!-- Тема пары -->
      <div class="py-3.5 flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="text-[12px] font-medium text-secondary-adaptive">Тема пары</div>
          <p class="text-[15px] font-medium text-primary-adaptive break-words whitespace-pre-wrap mt-0.5">
            ${escapeHtml(item.topic || "Не указана")}
          </p>
        </div>
        <button type="button" data-quick-topic="${item.id}" class="ios-press text-[13px] font-semibold text-ios-accent shrink-0 pt-0.5">
          ${item.topic ? "Изменить" : "+ Добавить"}
        </button>
      </div>

      <!-- Домашнее задание -->
      <div class="py-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-medium text-secondary-adaptive">Домашнее задание (${subjectTasks.length})</span>
          <button type="button" data-quick-add-task="${item.id}" class="ios-press text-[13px] font-semibold text-ios-accent">+ Добавить ДЗ</button>
        </div>
        ${
          subjectTasks.length > 0
            ? `<div class="space-y-2">
                ${subjectTasks
                  .map(
                    (t) => `
                  <div class="flex items-start gap-2.5">
                    <button type="button" data-toggle-task="${t.id}" class="ios-press mt-0.5 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                      t.completed ? "ios-accent-btn border-transparent" : "border-white/30"
                    }">
                      ${t.completed ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ""}
                    </button>
                    <div data-edit-task="${t.id}" class="flex-1 min-w-0 cursor-pointer">
                      <p class="text-[14px] text-primary-adaptive whitespace-pre-wrap break-words ${t.completed ? "line-through opacity-50" : ""}">${escapeHtml(t.text)}</p>
                      <span class="text-[11px] text-ios-accent">Сдать до ${escapeHtml(formatShortDate(t.deadline))}</span>
                      ${renderPhotosRow(t.photos)}
                    </div>
                  </div>`
                  )
                  .join("")}
              </div>`
            : `<p class="text-[13px] text-tertiary-adaptive">Заданий по этому предмету нет</p>`
        }
      </div>

      <!-- Заметки к паре -->
      <div class="py-3.5 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-medium text-secondary-adaptive">Заметки к паре (${classNotes.length})</span>
          <button type="button" data-quick-add-note="${item.id}" class="ios-press text-[13px] font-semibold text-ios-accent">+ Заметка</button>
        </div>
        ${
          classNotes.length > 0
            ? `<div class="divide-y ios-divider">
                ${classNotes
                  .map(
                    (n) => `
                  <div data-edit-note="${n.id}" class="py-2 cursor-pointer">
                    <div class="text-[14px] font-semibold text-primary-adaptive break-words">${escapeHtml(n.title || "Заметка")}</div>
                    <p class="text-[13px] text-secondary-adaptive whitespace-pre-wrap break-words mt-0.5">${escapeHtml(n.content)}</p>
                    ${renderPhotosRow(n.photos)}
                  </div>`
                  )
                  .join("")}
              </div>`
            : `<p class="text-[13px] text-tertiary-adaptive">Заметок пока нет</p>`
        }
      </div>
    </div>

    <!-- Действия с парой -->
    <div class="space-y-2">
      <button type="button" data-copy-next-week="${item.id}" class="ios-press w-full py-3 rounded-2xl ios-accent-soft-btn text-[14px] font-semibold flex items-center justify-center gap-2">
        <i data-lucide="calendar-plus" class="w-4 h-4"></i>
        <span>Дублировать на следующую неделю</span>
      </button>

      <div class="grid grid-cols-2 gap-2">
        <button type="button" data-edit-schedule="${item.id}" data-close-modal="modal-item-details" class="ios-press py-3 rounded-2xl ios-surface text-[13px] font-semibold text-primary-adaptive flex items-center justify-center gap-1.5">
          <i data-lucide="pencil" class="w-3.5 h-3.5 text-secondary-adaptive"></i>
          <span>Изменить пару</span>
        </button>
        <button type="button" data-ask-delete-schedule="${item.id}" data-close-modal="modal-item-details" class="ios-press py-3 rounded-2xl bg-ios-red/15 text-[13px] font-semibold text-ios-red flex items-center justify-center gap-1.5">
          <i data-lucide="eye-off" class="w-3.5 h-3.5"></i>
          <span>Скрыть / Удалить</span>
        </button>
      </div>
    </div>
  `;

  openModal("modal-item-details");
  refreshIcons();
}

function openTaskModalFor(classItem) {
  closeModal("modal-item-details");
  state.contextClassItem = classItem;
  state.draftTaskPhotos = [];
  document.getElementById("form-task")?.reset();
  document.getElementById("task-edit-id").value = "";
  document.getElementById("modal-task-title").textContent = "Новое ДЗ";
  document.getElementById("task-subject").value = classItem ? classItem.subject : "";
  document.getElementById("task-completed").checked = false;
  document.getElementById("btn-delete-task-from-modal")?.classList.add("hidden");
  renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
  applyTaskTargetMode(classItem ? "next" : "current");
  openModal("modal-task");
}

function openNoteModalFor(classItem) {
  closeModal("modal-item-details");
  state.contextClassItem = classItem;
  state.draftNotePhotos = [];
  state.noteModalPinned = false;
  syncNoteModalPinUI();
  document.getElementById("form-note")?.reset();
  document.getElementById("note-edit-id").value = "";
  document.getElementById("modal-note-title").textContent = classItem ? "Заметка к паре" : "Новая заметка";
  document.getElementById("note-title").value = classItem?.topic ? classItem.topic : "";
  document.getElementById("note-subject").value = classItem ? classItem.subject : "";
  document.getElementById("note-notify-enabled").checked = false;
  document.getElementById("note-notify-time").value = "";
  document.getElementById("note-notify-time-wrap")?.classList.add("hidden");
  document.getElementById("btn-delete-note-from-modal")?.classList.add("hidden");
  renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
  applyNoteTargetMode(classItem ? "current" : "none");
  openModal("modal-note");
}

function parseICSFile(icsText) {
  const events = [];
  const blocks = icsText.split("BEGIN:VEVENT").slice(1);
  let idx = 1;
  for (const block of blocks) {
    const dtStartMatch = block.match(/DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const locationMatch = block.match(/LOCATION:(.*)/);
    if (!dtStartMatch || !summaryMatch) continue;
    const [, y, m, d] = dtStartMatch;
    const dateStr = `${y}-${m}-${d}`;
    const rawSummary = summaryMatch[1].replace(/\\,/g, ",").trim();
    const room = locationMatch ? locationMatch[1].replace(/\\,/g, ",").trim() : "Ауд.";
    const metaMatch = rawSummary.match(/\[Пара\s*(\d+),\s*(\d{2}:\d{2})-(\d{2}:\d{2})\]\s*(.*)/i);
    let number = 1, startTime = "08:00", endTime = "09:30", rest = rawSummary;
    if (metaMatch) {
      number = Number(metaMatch[1]);
      startTime = metaMatch[2];
      endTime = metaMatch[3];
      rest = metaMatch[4];
    }
    const [subjAndType, teacherPart] = rest.split(/\s+—\s+/);
    const teacher = teacherPart ? teacherPart.trim() : "";
    let subject = subjAndType ? subjAndType.trim() : "Предмет";
    let type = "Лекция";
    const typeMatch = subject.match(/^(.*)\(([^)]+)\)\s*$/);
    if (typeMatch) {
      subject = typeMatch[1].trim();
      const rawType = typeMatch[2].toLowerCase();
      if (rawType.includes("лаб")) type = "Лабораторная";
      else if (rawType.includes("практ")) type = "Практика";
    }
    events.push({ id: `ics_${dateStr}_${idx++}`, date: dateStr, number, startTime, endTime, subject, topic: "", type, room, teacher });
  }
  return events;
}

// ============================================================================
// 18. ПРОСМОТРЩИК ФОТО С ЗУМОМ И СМАХИВАНИЕМ
// ============================================================================
const photoZoomState = {
  scale: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  initialPinchDist: 0,
  initialPinchScale: 1,
  lastTapTime: 0
};

function applyPhotoViewerTransform() {
  const img = document.getElementById("photo-viewer-img");
  const resetBtn = document.getElementById("btn-zoom-reset");
  if (!img) return;

  if (photoZoomState.scale <= 1.01) {
    photoZoomState.scale = 1;
    photoZoomState.panX = 0;
    photoZoomState.panY = 0;
  }

  img.style.transform = `translate3d(${photoZoomState.panX}px, ${photoZoomState.panY}px, 0) scale(${photoZoomState.scale})`;
  if (resetBtn) {
    resetBtn.textContent = `${Math.round(photoZoomState.scale * 100)}%`;
  }
}

function resetPhotoViewerZoom() {
  photoZoomState.scale = 1;
  photoZoomState.panX = 0;
  photoZoomState.panY = 0;
  photoZoomState.isDragging = false;
  photoZoomState.initialPinchDist = 0;
  applyPhotoViewerTransform();
}

function setPhotoViewerZoom(newScale) {
  photoZoomState.scale = Math.min(5, Math.max(1, newScale));
  applyPhotoViewerTransform();
}

async function saveOrShareCurrentPhoto() {
  const img = document.getElementById("photo-viewer-img");
  const src = img?.getAttribute("src") || "";
  if (!src) return;

  const fileName = `diary_photo_${formatDateISO(new Date())}_${Date.now().toString().slice(-4)}.jpg`;

  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });

    const isMobile = window.matchMedia("(pointer: coarse)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Фото из дневника"
      });
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
    showInAppToast("Фото сохранено", "Изображение загружено на устройство.");
  } catch (err) {
    if (err && err.name === "AbortError") return;
    const a = document.createElement("a");
    a.href = src;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function initPhotoViewerGestures() {
  const modal = document.getElementById("modal-photo-viewer");
  const stage = document.getElementById("photo-viewer-stage");
  const img = document.getElementById("photo-viewer-img");
  if (!stage || !modal || !img) return;

  const vTracker = createVelocityTracker();
  let isDismissSwipe = false;
  let dismissStartY = 0;
  let dismissStartX = 0;
  let dismissDy = 0;

  document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
    setPhotoViewerZoom(photoZoomState.scale + 0.6);
  });
  document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
    setPhotoViewerZoom(photoZoomState.scale - 0.6);
  });
  document.getElementById("btn-zoom-reset")?.addEventListener("click", () => {
    resetPhotoViewerZoom();
  });
  document.getElementById("btn-save-photo")?.addEventListener("click", () => {
    saveOrShareCurrentPhoto();
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.35 : -0.35;
      setPhotoViewerZoom(photoZoomState.scale + delta);
    },
    { passive: false }
  );

  stage.addEventListener(
    "touchstart",
    (e) => {
      stopTrackedSpring("photo_dismiss");
      if (e.touches.length === 2) {
        photoZoomState.isDragging = false;
        isDismissSwipe = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        photoZoomState.initialPinchDist = Math.hypot(dx, dy);
        photoZoomState.initialPinchScale = photoZoomState.scale;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const now = performance.now();
        if (now - photoZoomState.lastTapTime < 280) {
          if (photoZoomState.scale > 1.1) resetPhotoViewerZoom();
          else setPhotoViewerZoom(2.6);
          photoZoomState.lastTapTime = 0;
          return;
        }
        photoZoomState.lastTapTime = now;

        if (photoZoomState.scale > 1.01) {
          photoZoomState.isDragging = true;
          isDismissSwipe = false;
          photoZoomState.startX = t.clientX - photoZoomState.panX;
          photoZoomState.startY = t.clientY - photoZoomState.panY;
        } else {
          isDismissSwipe = true;
          dismissStartX = t.clientX;
          dismissStartY = t.clientY - dismissDy;
          vTracker.reset();
          vTracker.add(t.clientX, t.clientY, now);
        }
      }
    },
    { passive: true }
  );

  stage.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && photoZoomState.initialPinchDist > 0) {
        e.preventDefault();
        isDismissSwipe = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        setPhotoViewerZoom(photoZoomState.initialPinchScale * (dist / photoZoomState.initialPinchDist));
      } else if (e.touches.length === 1 && photoZoomState.isDragging && photoZoomState.scale > 1.01) {
        e.preventDefault();
        photoZoomState.panX = e.touches[0].clientX - photoZoomState.startX;
        photoZoomState.panY = e.touches[0].clientY - photoZoomState.startY;
        applyPhotoViewerTransform();
      } else if (e.touches.length === 1 && isDismissSwipe && photoZoomState.scale <= 1.01) {
        e.preventDefault();
        const t = e.touches[0];
        vTracker.add(t.clientX, t.clientY);
        dismissDy = t.clientY - dismissStartY;
        const dismissDx = (t.clientX - dismissStartX) * 0.35;
        const progress = Math.min(1, Math.abs(dismissDy) / 380);
        const sc = Math.max(0.76, 1 - progress * 0.22);
        const bgAlpha = Math.max(0.15, 0.95 - progress * 0.8);

        img.style.transition = "none";
        img.style.transform = `translate3d(${dismissDx}px, ${dismissDy}px, 0) scale(${sc})`;
        modal.style.backgroundColor = `rgba(0, 0, 0, ${bgAlpha})`;
      }
    },
    { passive: false }
  );

  const finishPhotoGesture = () => {
    photoZoomState.initialPinchDist = 0;
    photoZoomState.isDragging = false;
    if (!isDismissSwipe) return;
    isDismissSwipe = false;

    const { vy } = vTracker.getVelocity();
    const projectedY = projectPosition(dismissDy, vy);

    if (Math.abs(projectedY) > 170 || Math.abs(vy) > SWIPE_CONFIG.SHEET_VELOCITY_THRESHOLD) {
      const targetY = (dismissDy >= 0 ? 1 : -1) * (window.innerHeight * 0.85);
      animateTrackedSpring(
        "photo_dismiss",
        dismissDy,
        targetY,
        { ...SPRING_SHEET, velocity: vy },
        (y) => {
          const p = Math.min(1, Math.abs(y) / 380);
          img.style.transform = `translate3d(0, ${y}px, 0) scale(${Math.max(0.72, 1 - p * 0.25)})`;
          modal.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0, 0.95 * (1 - p))})`;
        },
        () => {
          dismissDy = 0;
          modal.style.backgroundColor = "";
          img.style.transform = "";
          modal.classList.add("hidden");
          modal.classList.remove("flex");
        }
      );
    } else {
      animateTrackedSpring(
        "photo_dismiss",
        dismissDy,
        0,
        { ...SPRING_SHEET, velocity: vy },
        (y) => {
          dismissDy = y;
          const p = Math.min(1, Math.abs(y) / 380);
          img.style.transform = `translate3d(0, ${y}px, 0) scale(${1 - p * 0.22})`;
          modal.style.backgroundColor = `rgba(0, 0, 0, ${0.95 - p * 0.8})`;
        },
        () => {
          dismissDy = 0;
          modal.style.backgroundColor = "";
          applyPhotoViewerTransform();
        }
      );
    }
  };

  stage.addEventListener("touchend", finishPhotoGesture, { passive: true });
  stage.addEventListener("touchcancel", finishPhotoGesture, { passive: true });
}

// ============================================================================
// 19. ИНТЕРАКТИВНЫЕ ВКЛАДКИ, ДВУХПАНЕЛЬНЫЙ СВАЙП ДНЕЙ, ШТОРКИ И КНОПКИ
// ============================================================================
function resetAllTabViewsToCleanState(activeTabName) {
  const tabOrder = ["schedule", "tasks", "notes"];
  tabOrder.forEach((t) => {
    const v = document.getElementById(`view-${t}`);
    if (!v) return;
    v.classList.toggle("hidden", t !== activeTabName);
    v.style.transform = "";
    v.style.opacity = "";
    v.style.position = "";
    v.style.top = "";
    v.style.left = "";
    v.style.right = "";
    v.style.width = "";
    v.style.pointerEvents = "";
    v.style.willChange = "";
  });
}

let currentNavGliderX = 0;

function getNavGliderTargetX(tabName) {
  const glider = document.getElementById("tg-nav-glider");
  const targetBtn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (glider && targetBtn && targetBtn.offsetWidth > 0) {
    return targetBtn.offsetLeft - glider.offsetLeft;
  }
  const tabOrder = ["schedule", "tasks", "notes"];
  const idx = Math.max(0, tabOrder.indexOf(tabName));
  const btnWidth = glider?.offsetWidth || 110;
  return idx * (btnWidth + 4);
}

function syncNavGliderImmediate(tabName) {
  const glider = document.getElementById("tg-nav-glider");
  if (!glider) return;
  currentNavGliderX = getNavGliderTargetX(tabName);
  glider.style.transform = `translate3d(${currentNavGliderX}px, 0, 0)`;
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => syncNavGliderImmediate(state.activeTab));
}

function switchTabWithSpring(newTab, options = {}) {
  const tabOrder = ["schedule", "tasks", "notes"];
  const oldIdx = tabOrder.indexOf(state.activeTab);
  const newIdx = tabOrder.indexOf(newTab);
  if (newIdx === -1) return;

  const glider = document.getElementById("tg-nav-glider");
  if (glider) {
    const targetX = getNavGliderTargetX(newTab);
    animateTrackedSpring(
      "nav_glider",
      currentNavGliderX,
      targetX,
      SPRING_SNAPPY,
      (x) => {
        currentNavGliderX = x;
        glider.style.transform = `translate3d(${x}px, 0, 0)`;
      },
      () => {
        currentNavGliderX = targetX;
        glider.style.transform = `translate3d(${targetX}px, 0, 0)`;
      }
    );
  }

  document.querySelectorAll(".nav-tab").forEach((b) => {
    const active = b.dataset.tab === newTab;
    b.classList.toggle("active-tg-pill", active);
    b.classList.toggle("text-ios-accent", active);
    b.classList.toggle("text-secondary-adaptive", !active);

    if (active && !isReducedMotion()) {
      const icon = b.querySelector("svg, i");
      if (icon) {
        animateTrackedSpring(
          `nav_icon_${newTab}`,
          0.78,
          1,
          { ...SPRING_SNAPPY, velocity: 3.5 },
          (sc) => {
            icon.style.transform = `scale(${sc}) translateY(${(1 - sc) * 6}px)`;
          },
          () => {
            icon.style.transform = "";
          }
        );
      }
    }
  });

  if (oldIdx === newIdx && !options.fromDrag) return;

  stopTrackedSpring("tab_switch");
  const oldTab = state.activeTab;
  resetAllTabViewsToCleanState(oldTab);

  state.activeTab = newTab;

  if (newTab !== "schedule" && state.weekGridMode) {
    toggleWeekGridView(false);
  }

  const mainContainer = document.getElementById("main-container");
  const oldView = document.getElementById(`view-${oldTab}`);
  const newView = document.getElementById(`view-${newTab}`);

  if (!mainContainer || !oldView || !newView || isReducedMotion() || oldIdx === newIdx) {
    resetAllTabViewsToCleanState(newTab);
    refreshIcons();
    return;
  }

  const dir = newIdx > oldIdx ? 1 : -1;
  const width = mainContainer.clientWidth || window.innerWidth || 375;
  const startOffset = options.startOffsetPx !== undefined ? options.startOffsetPx : dir * width;

  newView.classList.remove("hidden");
  oldView.classList.remove("hidden");

  oldView.style.position = "absolute";
  oldView.style.top = "0.25rem";
  oldView.style.left = "1.25rem";
  oldView.style.right = "1.25rem";
  oldView.style.pointerEvents = "none";
  oldView.style.willChange = "transform, opacity";
  newView.style.willChange = "transform, opacity";

  newView.style.transform = `translate3d(${startOffset}px, 0, 0)`;
  oldView.style.transform = `translate3d(${startOffset - dir * width}px, 0, 0)`;

  animateTrackedSpring(
    "tab_switch",
    startOffset,
    0,
    { ...SPRING_PAGE, velocity: options.velocity ?? 0 },
    (pos) => {
      const progress = Math.min(1, Math.max(0, 1 - Math.abs(pos) / width));
      newView.style.transform = `translate3d(${pos}px, 0, 0)`;
      oldView.style.transform = `translate3d(${pos - dir * width}px, 0, 0)`;
      oldView.style.opacity = String(Math.max(0, 1 - progress * 1.25));
    },
    () => {
      resetAllTabViewsToCleanState(state.activeTab);
    }
  );

  refreshIcons();
}

// Чистая генерация превью соседнего дня В ПАМЯТИ (минималистичный таймлайн)
function buildDetachedDayPreviewNode(dateISO) {
  const previewWrap = document.createElement("div");
  previewWrap.className = "space-y-4";
  previewWrap.style.position = "absolute";
  previewWrap.style.top = "0";
  previewWrap.style.left = "0";
  previewWrap.style.width = "100%";
  previewWrap.style.pointerEvents = "none";

  const todayISO = getTodayISO();
  const visibleSchedule = getVisibleSchedule();

  const dayEvents = state.events
    .filter((ev) => ev.date === dateISO)
    .sort((a, b) => timeToMinutes(a.startTime || "00:00") - timeToMinutes(b.startTime || "00:00"));

  let html = "";

  if (state.showEvents && dayEvents.length > 0) {
    html += `
      <div class="space-y-1 pb-3 border-b ios-divider">
        <span class="text-[12px] font-semibold uppercase tracking-wider text-ios-accent flex items-center gap-1.5">
          События · ${dayEvents.length}
        </span>
        <div class="divide-y ios-divider">
          ${dayEvents
            .map((ev) => {
              const timeLabel =
                ev.startTime && ev.endTime
                  ? `${escapeHtml(ev.startTime)}–${escapeHtml(ev.endTime)}`
                  : ev.startTime
                  ? `в ${escapeHtml(ev.startTime)}`
                  : "Весь день";
              return `
                <div class="py-3 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <span class="w-2 h-2 rounded-full bg-ios-accent shrink-0"></span>
                    <span class="text-[15px] font-semibold text-primary-adaptive truncate">${escapeHtml(ev.title)}</span>
                  </div>
                  <span class="text-[13px] font-medium text-ios-accent shrink-0">${timeLabel}</span>
                </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  const dayClasses = visibleSchedule
    .filter((item) => item.date === dateISO)
    .sort(
      (a, b) =>
        Number(a.number || 0) - Number(b.number || 0) ||
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

  if (dayClasses.length === 0) {
    const readableDate = parseDateISO(dateISO).toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
    html += `
      <div class="py-12 text-center space-y-2">
        <p class="font-semibold text-[16px] text-primary-adaptive capitalize">${escapeHtml(readableDate)}</p>
        <p class="text-[13px] text-secondary-adaptive">Свободный день — пар по расписанию нет</p>
      </div>`;
  } else {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    html += `<div>${dayClasses
      .map((item) => {
        const isLiveNow =
          item.date === todayISO &&
          nowMinutes >= timeToMinutes(item.startTime) &&
          nowMinutes < timeToMinutes(item.endTime);

        return `
        <div class="timeline-row ${isLiveNow ? "is-live" : ""}">
          <div class="timeline-rail-col">
            <span class="timeline-dot"></span>
            <span class="timeline-rail-line"></span>
          </div>
          <div class="flex-1 min-w-0 flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-[16px] font-semibold leading-snug text-primary-adaptive break-words">${escapeHtml(item.subject)}</h3>
              <p class="text-[13px] text-secondary-adaptive truncate mt-0.5">${escapeHtml(item.room)} · ${escapeHtml(item.type)}</p>
            </div>
            <div class="text-right shrink-0 tabular-nums">
              <div class="text-[13px] font-medium text-secondary-adaptive">${escapeHtml(item.startTime)}–${escapeHtml(item.endTime)}</div>
              <div class="text-[11px] text-tertiary-adaptive mt-0.5">${escapeHtml(item.number)} пара</div>
            </div>
          </div>
        </div>`;
      })
      .join("")}</div>`;
  }

  previewWrap.innerHTML = html;
  return previewWrap;
}

function initInteractiveDayAndTabSwipes() {
  const mainEl = document.getElementById("main-container");
  if (!mainEl) return;

  const vTracker = createVelocityTracker();
  let mode = null;
  let isPointerDown = false;
  let isLocked = false;
  let isIgnored = false;
  let startX = 0;
  let startY = 0;
  let currentDx = 0;
  let activePreviewDir = 0;
  let previewNode = null;
  let lastTouchTimestamp = 0;

  const clearPreview = () => {
    if (previewNode) {
      previewNode.remove();
      previewNode = null;
    }
    activePreviewDir = 0;
  };

  const onStart = (x, y, target) => {
    if (
      target?.closest(
        "input, textarea, select, button, a, label, #week-grid-view, #dynamic-island-capsule, [data-view-photo]"
      )
    ) {
      isIgnored = true;
      return;
    }
    if (document.querySelector('div[id^="modal-"].fixed:not(.hidden)')) {
      isIgnored = true;
      return;
    }

    isIgnored = false;
    isLocked = false;
    isPointerDown = true;
    startX = x;
    startY = y;
    currentDx = 0;
    vTracker.reset();
    vTracker.add(x, y);

    const isEdge =
      x <= SWIPE_CONFIG.EDGE_TAB_ZONE_PX || x >= window.innerWidth - SWIPE_CONFIG.EDGE_TAB_ZONE_PX;
    mode = state.activeTab === "schedule" && !state.weekGridMode && !isEdge ? "day" : "tab";

    if (mode === "day") {
      if (activeSpringsMap.has("day-swipe-track")) {
        forceFinishDaySwipe();
      }
    } else if (mode === "tab") {
      if (activeSpringsMap.has("tab_switch")) {
        stopTrackedSpring("tab_switch");
        resetAllTabViewsToCleanState(state.activeTab);
      }
    }
  };

  const onMove = (x, y, ev) => {
    if (!isPointerDown || isIgnored) return;
    const rawDx = x - startX;
    const rawDy = y - startY;

    if (!isLocked) {
      if (Math.abs(rawDy) > 12 && Math.abs(rawDy) > Math.abs(rawDx)) {
        isIgnored = true;
        return;
      }
      if (Math.abs(rawDx) > 10 && Math.abs(rawDx) > Math.abs(rawDy) * 1.15) {
        isLocked = true;
      }
    }

    if (!isLocked) return;
    if (ev && ev.cancelable) ev.preventDefault();
    vTracker.add(x, y);

    if (mode === "day") {
      const { viewport, track } = ensureDaySwipeViewport();
      if (!viewport || !track) return;
      const width = viewport.clientWidth || window.innerWidth || 375;
      currentDx = rawDx;
      const neededDir = currentDx < 0 ? 1 : -1;

      if (neededDir !== activePreviewDir) {
        clearPreview();
        activePreviewDir = neededDir;
        previewNode = buildDetachedDayPreviewNode(addDaysISO(state.selectedDate, neededDir));
        if (previewNode) {
          viewport.appendChild(previewNode);
          if (window.lucide) window.lucide.createIcons();
        }
      }

      track.style.willChange = "transform";
      track.style.transform = `translate3d(${currentDx}px, 0, 0)`;
      if (previewNode) {
        previewNode.style.willChange = "transform";
        previewNode.style.transform = `translate3d(${currentDx + neededDir * width}px, 0, 0)`;
      }
    } else if (mode === "tab") {
      const tabOrder = ["schedule", "tasks", "notes"];
      const curIdx = tabOrder.indexOf(state.activeTab);
      const width = mainEl.clientWidth || window.innerWidth || 375;
      const atLeftBound = curIdx === 0 && rawDx > 0;
      const atRightBound = curIdx === tabOrder.length - 1 && rawDx < 0;

      currentDx = atLeftBound || atRightBound ? rubberBand(rawDx, width * 0.45) : rawDx;
      const curView = document.getElementById(`view-${state.activeTab}`);
      if (curView) {
        curView.style.willChange = "transform";
        curView.style.transform = `translate3d(${currentDx}px, 0, 0)`;
      }
      const glider = document.getElementById("tg-nav-glider");
      if (glider) {
        const baseX = getNavGliderTargetX(state.activeTab);
        const stepW = (glider.offsetWidth || 110) + 4;
        currentNavGliderX = baseX - (currentDx / width) * stepW;
        glider.style.transform = `translate3d(${currentNavGliderX}px, 0, 0)`;
      }
    }
  };

  const onEnd = () => {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (isIgnored || !isLocked) {
      clearPreview();
      return;
    }
    isLocked = false;

    const { vx } = vTracker.getVelocity();

    if (mode === "day") {
      const { viewport, track } = ensureDaySwipeViewport();
      const width = viewport?.clientWidth || window.innerWidth || 375;
      const projectedX = projectPosition(currentDx, vx);
      const dir = activePreviewDir || (currentDx < 0 ? 1 : -1);

      const shouldCommit =
        (dir > 0 &&
          (projectedX < -width * SWIPE_CONFIG.DAY_COMMIT_RATIO ||
            vx < -SWIPE_CONFIG.DAY_VELOCITY_THRESHOLD ||
            currentDx < -width * 0.28)) ||
        (dir < 0 &&
          (projectedX > width * SWIPE_CONFIG.DAY_COMMIT_RATIO ||
            vx > SWIPE_CONFIG.DAY_VELOCITY_THRESHOLD ||
            currentDx > width * 0.28));

      if (shouldCommit) {
        clearPreview();
        const ghost = track.cloneNode(true);
        ghost.removeAttribute("id");
        ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
        ghost.style.position = "absolute";
        ghost.style.top = "0";
        ghost.style.left = "0";
        ghost.style.width = "100%";
        ghost.style.pointerEvents = "none";
        viewport.appendChild(ghost);

        selectDateWithSlide(addDaysISO(state.selectedDate, dir), {
          existingGhost: ghost,
          startOffsetPx: currentDx + dir * width,
          velocity: vx
        });
      } else {
        const ghost = previewNode;
        previewNode = null;
        activePreviewDir = 0;

        animateTrackedSpring(
          "day-swipe-track",
          currentDx,
          0,
          { ...SPRING_PAGE, velocity: vx },
          (pos) => {
            if (track) track.style.transform = `translate3d(${pos}px, 0, 0)`;
            if (ghost) ghost.style.transform = `translate3d(${pos + dir * width}px, 0, 0)`;
          },
          () => {
            if (track) {
              track.style.transform = "";
              track.style.willChange = "";
            }
            if (ghost) ghost.remove();
          }
        );
      }
    } else if (mode === "tab") {
      const tabOrder = ["schedule", "tasks", "notes"];
      const curIdx = tabOrder.indexOf(state.activeTab);
      const width = mainEl.clientWidth || window.innerWidth || 375;
      const projectedX = projectPosition(currentDx, vx);
      const dir = currentDx < 0 ? 1 : -1;
      const nextIdx = curIdx + dir;
      const curView = document.getElementById(`view-${state.activeTab}`);

      const canSwitch = nextIdx >= 0 && nextIdx < tabOrder.length;
      const shouldCommit =
        canSwitch &&
        ((dir > 0 && (projectedX < -width * 0.32 || vx < -400)) ||
          (dir < 0 && (projectedX > width * 0.32 || vx > 400)));

      if (shouldCommit) {
        if (curView) curView.style.transform = "";
        switchTabWithSpring(tabOrder[nextIdx], {
          fromDrag: true,
          startOffsetPx: currentDx + dir * width,
          velocity: vx
        });
      } else if (curView) {
        const backTargetX = getNavGliderTargetX(state.activeTab);
        const glider = document.getElementById("tg-nav-glider");
        if (glider) {
          animateTrackedSpring("nav_glider", currentNavGliderX, backTargetX, SPRING_SNAPPY, (x) => {
            currentNavGliderX = x;
            glider.style.transform = `translate3d(${x}px, 0, 0)`;
          });
        }
        animateTrackedSpring(
          "tab_switch",
          currentDx,
          0,
          { ...SPRING_PAGE, velocity: vx },
          (pos) => {
            curView.style.transform = `translate3d(${pos}px, 0, 0)`;
          },
          () => {
            curView.style.transform = "";
            curView.style.willChange = "";
          }
        );
      }
    }
  };

  mainEl.addEventListener(
    "touchstart",
    (e) => {
      lastTouchTimestamp = performance.now();
      if (e.touches.length !== 1) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!isPointerDown || e.touches.length !== 1) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY, e);
    },
    { passive: false }
  );

  window.addEventListener(
    "touchend",
    () => {
      lastTouchTimestamp = performance.now();
      if (!isPointerDown) return;
      onEnd();
    },
    { passive: true }
  );

  window.addEventListener(
    "touchcancel",
    () => {
      isPointerDown = false;
      isLocked = false;
      clearPreview();
      forceFinishDaySwipe();
    },
    { passive: true }
  );

  mainEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || performance.now() - lastTouchTimestamp < 650) return;
    onStart(e.clientX, e.clientY, e.target);
  });
  window.addEventListener("mousemove", (e) => {
    if (!isPointerDown || performance.now() - lastTouchTimestamp < 650) return;
    onMove(e.clientX, e.clientY, e);
  });
  window.addEventListener("mouseup", () => {
    if (!isPointerDown || performance.now() - lastTouchTimestamp < 650) return;
    onEnd();
  });
}

// Физический отклик кнопок (.ios-press) и морфинг Live-блока
function initPressAndIslandPhysics() {
  let pressedEl = null;

  const releasePressed = () => {
    if (!pressedEl) return;
    const el = pressedEl;
    pressedEl = null;
    animateTrackedSpring(
      el,
      null,
      1,
      { ...SPRING_SNAPPY, velocity: 1.8 },
      (sc) => {
        el.style.transform = `scale(${sc})`;
      },
      () => {
        el.style.transform = "";
      }
    );
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      const btn = e.target.closest(".ios-press");
      if (!btn || isReducedMotion()) return;
      pressedEl = btn;
      animateTrackedSpring(
        btn,
        1,
        0.94,
        { stiffness: 820, damping: 48, mass: 1 },
        (sc) => {
          btn.style.transform = `scale(${sc})`;
        }
      );
    },
    { passive: true }
  );

  window.addEventListener("pointerup", releasePressed, { passive: true });
  window.addEventListener("pointercancel", releasePressed, { passive: true });
  window.addEventListener("blur", releasePressed);

  window.__animateIslandMorph = (capsule, enteringSlide) => {
    if (!capsule || isReducedMotion()) return;
    capsule.style.willChange = "transform";
    animateTrackedSpring(
      "island_morph",
      0,
      1,
      { ...SPRING_SNAPPY, velocity: 4.0 },
      (p) => {
        const sc = 0.97 + 0.03 * p;
        capsule.style.transform = `scale3d(${sc}, ${sc}, 1)`;
      },
      () => {
        capsule.style.transform = "";
        capsule.style.willChange = "";
      }
    );

    if (enteringSlide) {
      enteringSlide.style.willChange = "transform, opacity";
      animateTrackedSpring(
        "island_slide_content",
        0,
        1,
        SPRING_SHEET,
        (p) => {
          enteringSlide.style.opacity = String(Math.min(1, Math.max(0, p)));
          enteringSlide.style.transform = `translate3d(0, ${(1 - p) * 6}px, 0)`;
        },
        () => {
          enteringSlide.style.opacity = "";
          enteringSlide.style.transform = "";
          enteringSlide.style.willChange = "";
        }
      );
    }
  };
}

// ============================================================================
// 20. ШТОРКИ (BOTTOM SHEETS) С ПЕРЕХВАТОМ И СМАХИВАНИЕМ ВНИЗ
// ============================================================================
function ensureSheetStructure(modalEl) {
  if (!modalEl || modalEl.id === "modal-photo-viewer") return null;
  let st = sheetRuntimeState.get(modalEl.id);
  if (st) return st;

  const panel = modalEl.querySelector(":scope > div");
  if (!panel) return null;

  const backdrop = document.createElement("div");
  backdrop.className = "ios-sheet-backdrop";
  backdrop.addEventListener("click", () => closeModal(modalEl.id));

  panel.classList.add("ios-sheet-panel");
  if (!panel.querySelector(".ios-sheet-grabber")) {
    const grabber = document.createElement("div");
    grabber.className = "ios-sheet-grabber";
    panel.insertBefore(grabber, panel.firstChild);
  }

  modalEl.insertBefore(backdrop, panel);

  st = { modalEl, panel, backdrop, currentY: 0, height: 420 };
  sheetRuntimeState.set(modalEl.id, st);
  attachSheetSwipeHandlers(st);
  return st;
}

function attachSheetSwipeHandlers(st) {
  const { modalEl, panel, backdrop } = st;
  const vTracker = createVelocityTracker();
  let isDragging = false;
  let isSheetLocked = false;
  let startY = 0;
  let startX = 0;
  let baseOffsetY = 0;

  panel.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = e.target;

      const running = stopTrackedSpring(`sheet_${modalEl.id}`);
      const isMidFlight = running && Math.abs(running.pos) > 2;

      if (!isMidFlight) {
        if (target.closest('input[type="range"]')) return;
        const rect = panel.getBoundingClientRect();
        const touchInTopHeader = t.clientY - rect.top <= 56;
        if (panel.scrollTop > 0 && !touchInTopHeader) return;
      }

      isDragging = true;
      isSheetLocked = Boolean(isMidFlight);
      startY = t.clientY;
      startX = t.clientX;
      baseOffsetY = running ? running.pos : st.currentY;
      st.height = panel.offsetHeight || 420;
      vTracker.reset();
      vTracker.add(t.clientX, t.clientY);
    },
    { passive: true }
  );

  panel.addEventListener(
    "touchmove",
    (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      if (!isSheetLocked) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          isDragging = false;
          return;
        }
        if (dy > 6 && panel.scrollTop <= 0) {
          isSheetLocked = true;
          startY = t.clientY;
        } else if (dy < -6 && panel.scrollTop > 0) {
          isDragging = false;
          return;
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();
      vTracker.add(t.clientX, t.clientY);

      const rawY = baseOffsetY + (t.clientY - startY);
      const nextY = rawY < 0 ? rubberBand(rawY, 90) : rawY;
      st.currentY = nextY;

      panel.style.willChange = "transform";
      backdrop.style.willChange = "opacity";
      panel.style.transform = `translate3d(0, ${nextY}px, 0)`;
      const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, nextY) / st.height));
      backdrop.style.opacity = String(alpha);
    },
    { passive: false }
  );

  const onSheetTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    if (!isSheetLocked) return;
    isSheetLocked = false;

    const { vy } = vTracker.getVelocity();
    const projectedY = projectPosition(st.currentY, vy);

    if (
      projectedY > st.height * SWIPE_CONFIG.SHEET_DISMISS_RATIO ||
      vy > SWIPE_CONFIG.SHEET_VELOCITY_THRESHOLD
    ) {
      closeModal(modalEl.id, vy);
    } else {
      openModal(modalEl.id, vy);
    }
  };

  panel.addEventListener("touchend", onSheetTouchEnd, { passive: true });
  panel.addEventListener("touchcancel", onSheetTouchEnd, { passive: true });
}

function initBottomSheetsPhysics() {
  document.querySelectorAll('[id^="modal-"]').forEach((el) => {
    if (el.id !== "modal-photo-viewer") {
      ensureSheetStructure(el);
    }
  });
}

function openModal(id, initialVelocity = 0) {
  const el = document.getElementById(id);
  if (!el) return;

  if (id === "modal-photo-viewer") {
    el.classList.remove("hidden");
    el.classList.add("flex");
    return;
  }

  const st = ensureSheetStructure(el);
  const wasHidden = el.classList.contains("hidden");
  el.classList.remove("hidden");
  el.classList.add("flex");

  if (!st) return;

  st.height = st.panel.offsetHeight || 420;
  const startY = wasHidden ? st.height : st.currentY;

  st.panel.style.willChange = "transform";
  st.backdrop.style.willChange = "opacity";

  animateTrackedSpring(
    `sheet_${id}`,
    startY,
    0,
    { ...SPRING_SHEET, velocity: initialVelocity },
    (y) => {
      st.currentY = y;
      st.panel.style.transform = `translate3d(0, ${y}px, 0)`;
      const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, y) / st.height));
      st.backdrop.style.opacity = String(alpha);
    },
    () => {
      st.currentY = 0;
      st.panel.style.transform = "translate3d(0, 0, 0)";
      st.backdrop.style.opacity = "1";
      st.panel.style.willChange = "";
      st.backdrop.style.willChange = "";
    }
  );
}

function closeModal(id, initialVelocity = 0) {
  const el = document.getElementById(id);
  if (!el || el.classList.contains("hidden")) return;

  if (id === "modal-photo-viewer") {
    el.classList.add("hidden");
    el.classList.remove("flex");
    return;
  }

  const st = ensureSheetStructure(el);
  if (!st) {
    el.classList.add("hidden");
    el.classList.remove("flex");
    return;
  }

  st.height = st.panel.offsetHeight || 420;
  st.panel.style.willChange = "transform";
  st.backdrop.style.willChange = "opacity";

  animateTrackedSpring(
    `sheet_${id}`,
    st.currentY,
    st.height,
    { ...SPRING_SHEET, velocity: initialVelocity },
    (y) => {
      st.currentY = y;
      st.panel.style.transform = `translate3d(0, ${Math.max(0, y)}px, 0)`;
      const alpha = Math.max(0, Math.min(1, 1 - Math.max(0, y) / st.height));
      st.backdrop.style.opacity = String(alpha);
    },
    () => {
      st.currentY = st.height;
      el.classList.add("hidden");
      el.classList.remove("flex");
      st.panel.style.willChange = "";
      st.backdrop.style.willChange = "";
    }
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

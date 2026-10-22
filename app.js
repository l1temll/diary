import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ============================================================================
// 1. КОНФИГУРАЦИЯ FIREBASE
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

try {
  if (isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  }
} catch (err) {
  console.warn("Firebase init warning:", err);
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
// 3. ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
const state = {
  user: null,
  colorMode: localStorage.getItem("diary_color_mode_v6") || "dark",
  theme: localStorage.getItem("diary_theme_v6") || "classic",
  btnStyle: localStorage.getItem("diary_btn_style_v6") || "matte",
  bgMode: localStorage.getItem("diary_bg_mode_v6") || "black",
  customBgDataUrl: localStorage.getItem("diary_custom_bg_img_v6") || "",
  customBgDim: Number(localStorage.getItem("diary_custom_bg_dim_v6") ?? 45),
  navStyle: localStorage.getItem("diary_nav_style_v5") || "floating",
  rimStyle: localStorage.getItem("diary_rim_style_v5") || "normal",

  activeTab: "schedule",
  weekGridMode: false, // Режим обзора расписания на всю неделю
  weekLayout: localStorage.getItem("diary_week_layout_v1") || "cards", // "cards" | "list" | "table"
  selectedDate: getTodayISO(),
  addScope: "date",
  taskFilter: "active",
  noteFilter: "all",
  taskTargetMode: "current",
  noteTargetMode: "none",
  contextClassItem: null,
  showEvents: localStorage.getItem("diary_show_events_v4") !== "false",

  schedule: [],
  events: [],
  tasks: [],
  notes: [],
  hiddenRules: [],

  keepDraft: {
    pinned: false,
    photos: []
  },
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

function formatShortDate(dateStr) {
  if (!dateStr) return "—";
  const d = parseDateISO(String(dateStr).slice(0, 10));
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Форматирование секунд в вид "1ч 12м 05с" или "24м 09с"
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
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  }

  loadLocalDataOrSeed();
  syncStateFromStorage();
  if (typeof window.__applyDiaryAppearance === "function") {
    window.__applyDiaryAppearance();
  }

  renderAll();
  updateLiveWidget();
  setInterval(updateLiveWidget, 1000);

  initNetworkListeners();
  initUIListeners();
  initNotificationUI();

  setInterval(checkScheduledNotifications, 25000);
  setTimeout(checkScheduledNotifications, 3000);

  if (isFirebaseConfigured && auth) {
    initFirebaseAuth();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}

function syncStateFromStorage() {
  state.colorMode = localStorage.getItem("diary_color_mode_v6") || "dark";
  state.theme = localStorage.getItem("diary_theme_v6") || "classic";
  state.btnStyle = localStorage.getItem("diary_btn_style_v6") || "matte";
  state.bgMode = localStorage.getItem("diary_bg_mode_v6") || "black";
  state.customBgDataUrl = localStorage.getItem("diary_custom_bg_img_v6") || "";
  state.customBgDim = Number(localStorage.getItem("diary_custom_bg_dim_v6") ?? 45);
  state.navStyle = localStorage.getItem("diary_nav_style_v5") || "floating";
  state.rimStyle = localStorage.getItem("diary_rim_style_v5") || "normal";

  const slider = document.getElementById("bg-dim-slider");
  const label = document.getElementById("bg-dim-value");
  if (slider) slider.value = String(state.customBgDim);
  if (label) label.textContent = `${state.customBgDim}%`;
}

window.addEventListener("diary-appearance-changed", () => {
  syncStateFromStorage();
  renderScheduleSection();
  updateLiveWidget();
  refreshIcons();
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
      dot.className = "w-2 h-2 rounded-full bg-ios-green shrink-0";
      text.textContent = "Онлайн";
    } else {
      dot.className = "w-2 h-2 rounded-full bg-ios-orange animate-pulse shrink-0";
      text.textContent = "Оффлайн";
    }
  };
  window.addEventListener("online", updateUI);
  window.addEventListener("offline", updateUI);
  updateUI();
}

function setSyncIndicator(active) {
  const el = document.getElementById("sync-indicator");
  if (el) el.classList.toggle("hidden", !active);
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
    if (statusEl) statusEl.textContent = "Нажмите «Разрешить» для пушей";
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
  toast.className = "ios26-card rounded-2xl p-3.5 shadow-2xl pointer-events-auto flex items-start gap-3 transition-all border border-white/20";
  toast.innerHTML = `
    <div class="w-8 h-8 rounded-xl ios-active-orange flex items-center justify-center shrink-0 font-bold">🔔</div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-extrabold text-white">${escapeHtml(title)}</p>
      <p class="text-[11px] text-gray-200 mt-0.5 break-words">${escapeHtml(body)}</p>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
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
          `${cls.number} пара (${cls.startTime}) • Каб. ${cls.room}`,
          `cls_10m_${cls.id}_${todayISO}`
        );
      } else if (diff === 0) {
        sendAppNotification(
          `Началась пара: ${cls.subject}`,
          `Кабинет: ${cls.room} • ${cls.type}`,
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
// 10. УМНЫЙ ВИДЖЕТ РЕАЛЬНОГО ВРЕМЕНИ С СЕКУНДАМИ:
//     - Текущая пара
//     - Обед (12:50 - 13:20) и сколько он еще продлится
//     - Окно / Перемена между парами
//     - Сейчас нет пары (если пары еще не начались или уже закончились)
//     - Внизу вместо просто "Отдыхайте" -> "Отдыхайте еще *время*"
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

  const curLabel = document.getElementById("live-current-label");
  const curTitle = document.getElementById("live-current-title");
  const curTimer = document.getElementById("live-current-timer");
  const curMeta = document.getElementById("live-current-meta");
  const curBox = document.getElementById("live-current-box");
  const curProgWrap = document.getElementById("live-current-progress-wrap");
  const curProg = document.getElementById("live-current-progress");

  if (!curTitle || !curBox) return;

  // Строка "Отдыхайте еще *время*" до следующей пары сегодня
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

    curBox.className = "flex flex-col justify-between min-w-0";
    if (curLabel) curLabel.textContent = `Идет ${currentClass.number} пара`;
    curTitle.textContent = currentClass.subject;
    curTimer.textContent = `Еще ${formatDurationWithSeconds(remSec)}`;
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(currentClass.room)} • ${escapeHtml(currentClass.type)}</span><span class="font-bold text-white shrink-0">${escapeHtml(currentClass.startTime)}–${escapeHtml(currentClass.endTime)}</span>`;
    curProgWrap?.classList.remove("hidden");
    if (curProg) curProg.style.width = `${pct}%`;
  } else if (nowSec >= LUNCH_START_SEC && nowSec < LUNCH_END_SEC) {
    // 2. ОБЕДЕННЫЙ ПЕРЕРЫВ (12:50 - 13:20)
    const remLunchSec = LUNCH_END_SEC - nowSec;
    const lunchPct = Math.min(100, Math.max(0, Math.round(((nowSec - LUNCH_START_SEC) / (LUNCH_END_SEC - LUNCH_START_SEC)) * 100)));

    curBox.className = "flex flex-col justify-between min-w-0";
    if (curLabel) curLabel.textContent = "Обеденный перерыв";
    curTitle.textContent = "Обед (12:50–13:20)";
    curTimer.textContent = `Еще ${formatDurationWithSeconds(remLunchSec)}`;
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(getRestTextUntilNext())}</span><span class="font-bold text-white shrink-0">до 13:20</span>`;
    curProgWrap?.classList.remove("hidden");
    if (curProg) curProg.style.width = `${lunchPct}%`;
  } else if (prevClassToday && nextClassToday) {
    // 3. ОКНО ИЛИ ПЕРЕМЕНА МЕЖДУ ПАРАМИ СЕГОДНЯ
    const prevEndSec = timeToMinutes(prevClassToday.endTime) * 60;
    const nextStartSec = timeToMinutes(nextClassToday.startTime) * 60;
    const totalGapMin = Math.round((nextStartSec - prevEndSec) / 60);
    const remGapSec = nextStartSec - nowSec;
    const isWindow = totalGapMin > 20;

    curBox.className = "flex flex-col justify-between min-w-0";
    if (curLabel) curLabel.textContent = isWindow ? "Окно в расписании" : "Перемена";
    curTitle.textContent = isWindow ? "Сейчас окно" : "Перемена между парами";
    curTimer.textContent = formatDurationWithSeconds(remGapSec);
    curMeta.innerHTML = `<span class="truncate">${escapeHtml(getRestTextUntilNext())}</span><span class="shrink-0">${escapeHtml(prevClassToday.endTime)}–${escapeHtml(nextClassToday.startTime)}</span>`;
    curProgWrap?.classList.add("hidden");
  } else {
    // 4. ПАРЫ ЕЩЕ НЕ НАЧАЛИСЬ ИЛИ УЖЕ ЗАКОНЧИЛИСЬ ("Сейчас нет пары")
    curBox.className = "flex flex-col justify-between min-w-0";
    if (curLabel) curLabel.textContent = "Текущая пара";
    curTitle.textContent = "Сейчас нет пары";

    if (nextClassToday) {
      const remToStart = timeToMinutes(nextClassToday.startTime) * 60 - nowSec;
      curTimer.textContent = "До старта";
      curMeta.innerHTML = `<span class="truncate">Отдыхайте еще ${escapeHtml(formatDurationWithSeconds(remToStart))}</span><span class="shrink-0">Старт в ${escapeHtml(nextClassToday.startTime)}</span>`;
    } else {
      curTimer.textContent = "Свободно";
      curMeta.innerHTML = `<span class="truncate">Отдыхайте • Пары закончились</span><span></span>`;
    }
    curProgWrap?.classList.add("hidden");
  }

  // Блок: СЛЕДУЮЩАЯ ПАРА (с секундами)
  const nextTitle = document.getElementById("live-next-title");
  const nextTimer = document.getElementById("live-next-timer");
  const nextRoom = document.getElementById("live-next-room");
  const nextRange = document.getElementById("live-next-time-range");

  if (nextClassAny && nextTitle && nextTimer && nextRoom && nextRange) {
    nextTitle.textContent = nextClassAny.subject;
    nextRoom.textContent = `${nextClassAny.room} (${nextClassAny.type})`;
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

  // Обновляем линию текущего времени в сетке недели, если она открыта
  updateWeekGridNowLine();
}

// ============================================================================
// 11. ТАБЛИЦА РАСПИСАНИЯ НА ВСЮ НЕДЕЛЮ В СТИЛЕ GOOGLE КАЛЕНДАРЯ
// ============================================================================
function toggleWeekGridView(forceState) {
  state.weekGridMode = typeof forceState === "boolean" ? forceState : !state.weekGridMode;
  document.body.classList.toggle("week-grid-open", state.weekGridMode && state.weekLayout === "table");

  const gridView = document.getElementById("week-grid-view");
  const dayView = document.getElementById("day-schedule-view");
  const btnText = document.getElementById("week-grid-toggle-text");
  const btnToggle = document.getElementById("btn-week-grid-toggle");

  if (gridView && dayView) {
    gridView.classList.toggle("hidden", !state.weekGridMode);
    dayView.classList.toggle("hidden", state.weekGridMode);
  }
  if (btnText) {
    btnText.textContent = state.weekGridMode ? "День" : "Неделя";
  }
  if (btnToggle) {
    btnToggle.classList.toggle("ios-active-orange", state.weekGridMode);
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
    btn.className = `week-layout-btn ios-press px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
      active ? "ios-active-orange" : "text-ios-gray hover:text-white"
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
  const dayLabels = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
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

  // ВАРИАНТ 1: НАГЛЯДНЫЕ ПЛИТКИ (2 КОЛОНКИ НА ТЕЛЕФОНЕ — ВСЯ НЕДЕЛЯ БЕЗ СКРОЛЛА ВБОК)
  if (state.weekLayout === "cards") {
    let cardsHtml = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">`;

    for (const wd of weekDates) {
      const isToday = wd.iso === todayISO;
      const isSelected = wd.iso === state.selectedDate;
      const dayClasses = visibleSchedule
        .filter((s) => s.date === wd.iso)
        .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const dayEvents = state.showEvents ? state.events.filter((e) => e.date === wd.iso) : [];

      const borderClass = isToday
        ? "border-ios-orange/60 bg-ios-orange/[0.06]"
        : isSelected
        ? "border-white/30 bg-white/[0.05]"
        : "border-white/10 bg-black/25";

      cardsHtml += `
        <div data-grid-pick-date="${wd.iso}" class="rounded-2xl border ${borderClass} p-2.5 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all min-w-0">
          <div>
            <div class="flex items-center justify-between gap-1 pb-1.5 mb-2 border-b border-white/10">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${
                  isToday ? "ios-active-orange text-black" : "bg-white/10 text-white"
                }">${wd.dayName}</span>
                <span class="text-[11px] font-bold text-gray-300 truncate">${escapeHtml(wd.shortLabel)}</span>
              </div>
              <span class="text-[10px] font-bold text-ios-gray shrink-0">${dayClasses.length > 0 ? `${dayClasses.length} п.` : "Вых."}</span>
            </div>

            ${
              dayEvents.length > 0
                ? `<div class="mb-1.5 space-y-1">
                    ${dayEvents
                      .map(
                        (ev) => `
                      <div class="px-2 py-1 rounded-lg bg-ios-purple/20 border border-ios-purple/40 text-[10px] font-bold text-white truncate">
                        ✦ ${escapeHtml(ev.title)}
                      </div>`
                      )
                      .join("")}
                  </div>`
                : ""
            }

            ${
              dayClasses.length > 0
                ? `<div class="space-y-1.5">
                    ${dayClasses
                      .map((cls) => {
                        const hasHw = state.tasks.some(
                          (t) =>
                            !t.completed &&
                            t.deadline === wd.iso &&
                            String(t.subject).trim().toLowerCase() === String(cls.subject).trim().toLowerCase()
                        );
                        return `
                        <div class="rounded-xl bg-white/[0.05] border border-white/10 p-1.5 space-y-0.5">
                          <div class="flex items-center justify-between gap-1 text-[9px] font-bold">
                            <span class="text-ios-orange">${escapeHtml(cls.number)} пара • ${escapeHtml(cls.startTime)}</span>
                            ${hasHw ? `<span class="px-1 rounded bg-ios-orange text-black font-extrabold">ДЗ</span>` : ""}
                          </div>
                          <div class="text-[11px] font-extrabold text-white leading-tight line-clamp-2 break-words">${escapeHtml(cls.subject)}</div>
                          <div class="flex items-center justify-between gap-1 text-[9px] text-gray-300 pt-0.5">
                            <span class="truncate text-ios-gray">${escapeHtml(cls.type)}</span>
                            <span class="font-bold text-white shrink-0">${escapeHtml(cls.room)}</span>
                          </div>
                        </div>
                      `;
                      })
                      .join("")}
                  </div>`
                : `<div class="py-5 text-center text-[11px] text-ios-gray italic">Пар нет</div>`
            }
          </div>
        </div>
      `;
    }

    cardsHtml += `</div>`;
    wrapper.innerHTML = cardsHtml;
    return;
  }

  // ВАРИАНТ 2: ПОДРОБНЫЙ СПИСОК ВСЕЙ НЕДЕЛИ СВЕРХУ ВНИЗ
  if (state.weekLayout === "list") {
    let listHtml = `<div class="space-y-2.5">`;

    for (const wd of weekDates) {
      const isToday = wd.iso === todayISO;
      const dayClasses = visibleSchedule
        .filter((s) => s.date === wd.iso)
        .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const dayEvents = state.showEvents ? state.events.filter((e) => e.date === wd.iso) : [];

      listHtml += `
        <div data-grid-pick-date="${wd.iso}" class="rounded-2xl border ${
          isToday ? "border-ios-orange/60 bg-ios-orange/[0.06]" : "border-white/10 bg-black/25"
        } p-3 space-y-2 cursor-pointer transition-all">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-lg text-xs font-extrabold ${
                isToday ? "ios-active-orange text-black" : "bg-white/10 text-white"
              }">${wd.dayName}</span>
              <span class="text-xs font-extrabold text-white">${escapeHtml(wd.dayFull)}, ${escapeHtml(wd.shortLabel)}</span>
            </div>
            <span class="text-[11px] font-semibold text-ios-gray">${dayClasses.length > 0 ? `${dayClasses.length} пар(ы)` : "Выходной"}</span>
          </div>

          ${
            dayEvents.length > 0
              ? `<div class="space-y-1">
                  ${dayEvents
                    .map(
                      (ev) => `
                    <div class="px-2.5 py-1.5 rounded-xl bg-ios-purple/20 border border-ios-purple/40 text-xs font-bold text-white flex items-center justify-between gap-2">
                      <span class="truncate">✦ ${escapeHtml(ev.title)}</span>
                      <span class="text-[10px] text-ios-purple shrink-0">${escapeHtml(ev.startTime || "Весь день")}</span>
                    </div>`
                    )
                    .join("")}
                </div>`
              : ""
          }

          ${
            dayClasses.length > 0
              ? `<div class="space-y-1.5">
                  ${dayClasses
                    .map((cls) => {
                      const hasHw = state.tasks.some(
                        (t) =>
                          !t.completed &&
                          t.deadline === wd.iso &&
                          String(t.subject).trim().toLowerCase() === String(cls.subject).trim().toLowerCase()
                      );
                      return `
                      <div class="flex items-center gap-2.5 rounded-xl bg-white/[0.04] border border-white/10 px-2.5 py-2">
                        <div class="text-center min-w-[52px] shrink-0">
                          <div class="text-[10px] font-extrabold text-ios-orange">${escapeHtml(cls.number)} пара</div>
                          <div class="text-[10px] font-bold text-gray-300">${escapeHtml(cls.startTime)}</div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-extrabold text-white truncate">${escapeHtml(cls.subject)}</div>
                          <div class="text-[10px] text-gray-300 truncate mt-0.5">
                            ${escapeHtml(cls.type)}${cls.teacher ? ` • ${escapeHtml(cls.teacher)}` : ""}
                          </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                          <span class="text-[11px] font-extrabold text-white bg-white/10 px-2 py-0.5 rounded-lg">${escapeHtml(cls.room)}</span>
                          ${hasHw ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-ios-orange text-black font-extrabold">Есть ДЗ</span>` : ""}
                        </div>
                      </div>
                    `;
                    })
                    .join("")}
                </div>`
              : `<p class="text-xs text-ios-gray italic">Учебных пар нет</p>`
          }
        </div>
      `;
    }

    listHtml += `</div>`;
    wrapper.innerHTML = listHtml;
    return;
  }

  // ВАРИАНТ 3: ТАБЛИЦА КАЛЕНДАРЯ (С ИСПРАВЛЕННОЙ ШИРИНОЙ БЕЗ ОБРЕЗКИ СУББОТЫ)
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

  html += `<div class="gcal-cell p-2 flex items-center justify-center text-[10px] font-bold text-ios-gray bg-black/20">Пара</div>`;
  for (const wd of weekDates) {
    const isToday = wd.iso === todayISO;
    const isSelected = wd.iso === state.selectedDate;
    html += `
      <div data-grid-pick-date="${wd.iso}" class="gcal-cell py-2.5 px-2 text-center cursor-pointer hover:bg-white/[0.04] transition-colors bg-black/20">
        <div class="text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-ios-blue" : "text-ios-gray"}">${wd.dayName}</div>
        <div class="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-base font-extrabold ${
          isToday
            ? "bg-ios-blue text-white shadow"
            : isSelected
            ? "bg-white/15 text-white"
            : "text-white"
        }">${wd.dayNum}</div>
      </div>
    `;
  }

  for (const slot of slots) {
    if (slot.type === "lunch") {
      html += `
        <div class="gcal-cell px-1.5 py-1.5 flex flex-col items-center justify-center text-center bg-white/[0.02]">
          <span class="text-[10px] font-extrabold text-ios-green">Обед</span>
          <span class="text-[9px] text-ios-gray">12:50</span>
        </div>
      `;
      for (const wd of weekDates) {
        html += `
          <div class="gcal-cell px-2 py-1.5 flex items-center justify-center bg-white/[0.02]" data-grid-slot-cell="${wd.iso}:${slot.startMin}:${slot.endMin}">
            <span class="text-[10px] text-ios-gray/70 font-medium">Обеденный перерыв (12:50–13:20)</span>
          </div>
        `;
      }
      continue;
    }

    html += `
      <div class="gcal-cell p-1.5 flex flex-col items-center justify-center text-center bg-black/10">
        <span class="text-[11px] font-extrabold text-white">${slot.number} пара</span>
        <span class="text-[9px] text-ios-gray leading-tight mt-0.5">${slot.time.replace("–", "<br/>")}</span>
      </div>
    `;

    for (const wd of weekDates) {
      const cellClasses = visibleSchedule.filter(
        (s) => s.date === wd.iso && Number(s.number) === slot.number
      );

      html += `
        <div class="gcal-cell p-1.5 min-h-[78px] space-y-1" data-grid-slot-cell="${wd.iso}:${slot.startMin}:${slot.endMin}">
          ${cellClasses
            .map(
              (cls) => `
            <div data-grid-open-class="${cls.id}" data-grid-pick-date="${wd.iso}" class="gcal-event-card">
              <div class="font-extrabold truncate">[Пара ${escapeHtml(cls.number)}, ${escapeHtml(cls.startTime)}-${escapeHtml(cls.endTime)}] ${escapeHtml(cls.subject)}</div>
              <div class="opacity-90 truncate text-[10px] mt-0.5">${escapeHtml(cls.type)}${cls.teacher ? ` • ${escapeHtml(cls.teacher)}` : ""}</div>
              <div class="font-bold text-[10px] mt-0.5 truncate">${escapeHtml(cls.room)}</div>
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

// Отрисовка красной линии текущего времени в сетке недели (как в Google Календаре)
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
// 12. РЕНДЕРИНГ РАСПИСАНИЯ
// ============================================================================
function renderAll() {
  renderScheduleSection();
  renderTasks();
  renderNotes();
  updateSubjectsDatalist();
}

function renderScheduleSection() {
  const todayISO = getTodayISO();
  const monday = getMondayOfDate(state.selectedDate);
  const weekNum = getStudyWeekNumber(state.selectedDate);
  const currentActualWeekNum = getStudyWeekNumber(todayISO);
  const isCurrentStudyWeek = weekNum === currentActualWeekNum;
  const mono = isMonoMode();
  const light = isLightMode();

  const isOdd = Math.abs(weekNum) % 2 === 1;
  const parityText = isOdd ? "Нечетная (Числитель)" : "Четная (Знаменатель)";
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmtShort = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  const weekHeaderCard = document.getElementById("week-header-card");
  const weekCurrentBadge = document.getElementById("week-current-badge");
  const weekTitle = document.getElementById("week-title");
  const weekSubtitle = document.getElementById("week-subtitle");
  const datePicker = document.getElementById("date-jump-picker");

  if (weekTitle) {
    weekTitle.textContent = weekNum >= 1 && weekNum <= 24 ? `Учебная неделя №${weekNum}` : `Календарная неделя`;
    weekTitle.className = isCurrentStudyWeek && !mono
      ? "text-sm font-extrabold text-ios-orange truncate"
      : "text-sm font-extrabold text-white truncate";
  }
  weekCurrentBadge?.classList.toggle("hidden", !isCurrentStudyWeek || mono);
  if (weekHeaderCard) {
    weekHeaderCard.className = isCurrentStudyWeek && !mono
      ? "ios26-card-orange rounded-3xl p-3 space-y-2.5 transition-all"
      : "ios26-card rounded-3xl p-3 space-y-2.5 transition-all";
  }

  if (weekSubtitle) weekSubtitle.textContent = `${parityText} • ${fmtShort(monday)} – ${fmtShort(sunday)}`;
  if (datePicker) datePicker.value = state.selectedDate;

  const textToggleEvents = document.getElementById("text-toggle-events");
  if (textToggleEvents) {
    textToggleEvents.textContent = state.showEvents ? "События: Вкл" : "События: Скрыты";
  }

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

  // Если включен режим сетки на неделю — обновляем также таблицу
  if (state.weekGridMode) {
    renderWeekGridTable();
  }

  const visibleSchedule = getVisibleSchedule();
  const dayNames = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
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

    let btnClass = "ios26-card border-white/10 text-ios-gray font-medium";
    if (mono) {
      if (isSelected) {
        btnClass = light
          ? "bg-black text-white border-black font-extrabold"
          : "bg-white text-black border-white font-extrabold";
      } else if (isToday) {
        btnClass = light
          ? "ios26-card border-black/40 text-black font-bold"
          : "ios26-card border-white/40 text-white font-bold";
      }
    } else {
      if (isSelected && isToday) {
        btnClass = "ios-active-orange font-extrabold";
      } else if (isSelected) {
        btnClass = light
          ? "bg-ios-blue text-white border-ios-blue font-extrabold shadow"
          : "bg-white text-black border-white font-extrabold shadow";
      } else if (isToday) {
        btnClass = "bg-ios-orange/20 border-2 border-ios-orange text-ios-orange font-extrabold";
      }
    }

    const dotColor = isSelected
      ? "bg-current"
      : mono
      ? "bg-current opacity-60"
      : isToday
      ? "bg-ios-orange"
      : "bg-ios-blue";

    const eventDotColor = mono ? "bg-current" : "bg-ios-purple";

    buttonsHtml.push(`
      <button type="button" data-select-date="${iso}" class="ios-press relative flex flex-col items-center py-2 rounded-2xl border transition-all min-w-0 ${btnClass}">
        <span class="text-[9px] font-bold uppercase tracking-tighter opacity-85">${dayNames[i]}</span>
        <span class="text-xs sm:text-sm mt-0.5">${d.getDate()}</span>
        <div class="flex gap-0.5 mt-1 h-1.5 items-center">
          ${countForDay > 0 ? Array.from({ length: Math.min(countForDay, 3) }).map(() => `<span class="w-1 h-1 rounded-full ${dotColor}"></span>`).join("") : ""}
          ${hasEventForDay ? `<span class="w-1.5 h-1.5 rounded-full ${eventDotColor}"></span>` : ""}
        </div>
      </button>
    `);
  }
  if (daySelector) daySelector.innerHTML = buttonsHtml.join("");

  // Рендеринг блока Мероприятий
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
        <div class="ios26-card rounded-2xl p-3 border border-ios-purple/40 flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="px-2.5 py-1.5 rounded-xl bg-ios-purple/20 border border-ios-purple/40 text-center shrink-0 min-w-[68px]">
              <span class="block text-[9px] font-extrabold uppercase text-ios-purple">Событие</span>
              <span class="block text-[11px] font-bold text-white">${timeLabel}</span>
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-extrabold text-white truncate">${escapeHtml(ev.title)}</h4>
              ${
                ev.location
                  ? `<p class="text-xs text-gray-300 flex items-center gap-1 truncate mt-0.5">
                      <i data-lucide="map-pin" class="w-3 h-3 text-ios-purple shrink-0"></i>
                      <span class="truncate">${escapeHtml(ev.location)}</span>
                    </p>`
                  : ""
              }
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" data-edit-event="${ev.id}" class="ios-press w-8 h-8 rounded-full ios26-pill text-gray-300 hover:text-white flex items-center justify-center" title="Изменить">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" data-delete-event="${ev.id}" class="ios-press px-2.5 h-8 rounded-full bg-ios-red/20 border border-ios-red/40 text-ios-red text-xs font-bold flex items-center gap-1" title="Удалить">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
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

  // Рендеринг учебных пар выбранного дня
  const listEl = document.getElementById("schedule-list");
  if (!listEl) return;

  const dayClasses = visibleSchedule
    .filter((item) => item.date === state.selectedDate)
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  if (dayClasses.length === 0) {
    const readableDate = parseDateISO(state.selectedDate).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
    listEl.innerHTML = `
      <div class="ios26-card rounded-3xl p-7 text-center space-y-2">
        <div class="w-11 h-11 rounded-2xl bg-ios-orange/15 text-ios-orange flex items-center justify-center mx-auto">
          <i data-lucide="coffee" class="w-5 h-5"></i>
        </div>
        <p class="font-extrabold text-base capitalize">${escapeHtml(readableDate)}</p>
        <p class="text-xs text-gray-300">Учебных пар в этот день нет. Нажмите «+» сверху, чтобы добавить пару или событие.</p>
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
        !mono &&
        item.date === todayISO &&
        nowMinutes >= timeToMinutes(item.startTime) &&
        nowMinutes < timeToMinutes(item.endTime);

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

      return `
      <article class="${isLiveNow ? "ios26-card-orange" : "ios26-card"} rounded-3xl p-3.5 space-y-3 transition-all">
        <div class="flex gap-3 items-start">
          <div class="flex flex-col items-center justify-center ${isLiveNow ? "ios-active-orange" : "bg-white/[0.07] border border-white/15"} rounded-2xl px-2 py-2 min-w-[68px] text-center shrink-0">
            <span class="text-[11px] font-extrabold ${isLiveNow ? "text-black" : "text-ios-orange"}">${escapeHtml(item.number)} пара</span>
            <span class="text-xs font-extrabold ${isLiveNow ? "text-black" : "text-white"} mt-0.5">${escapeHtml(item.startTime)}</span>
            <span class="text-[10px] ${isLiveNow ? "text-black/80" : "text-gray-300"}">${escapeHtml(item.endTime)}</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap mb-1">
              ${isLiveNow ? `<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-ios-orange text-black">Сейчас</span>` : ""}
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full border ${getBadgeStyle(item.type)}">${escapeHtml(item.type)}</span>
              <span class="text-xs text-gray-200 flex items-center gap-1">
                <i data-lucide="map-pin" class="w-3 h-3 text-ios-orange shrink-0"></i>
                <span class="truncate">${escapeHtml(item.room)}</span>
              </span>
            </div>
            <h3 class="font-extrabold text-sm sm:text-base leading-snug text-white break-words">${escapeHtml(item.subject)}</h3>
            ${item.teacher ? `<p class="text-xs text-gray-300 mt-1 flex items-center gap-1"><i data-lucide="user" class="w-3 h-3 shrink-0"></i><span class="truncate">${escapeHtml(item.teacher)}</span></p>` : ""}
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button type="button" data-copy-next-week="${item.id}" class="ios-press w-7 h-7 rounded-full ios26-pill text-gray-300 hover:text-ios-orange flex items-center justify-center" title="Перенести на след. неделю">
              <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" data-edit-schedule="${item.id}" class="ios-press w-7 h-7 rounded-full ios26-pill text-gray-300 hover:text-white flex items-center justify-center" title="Изменить">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" data-ask-delete-schedule="${item.id}" class="ios-press w-7 h-7 rounded-full ios26-pill text-gray-300 hover:text-ios-red flex items-center justify-center" title="Скрыть пару">
              <i data-lucide="eye-off" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="pt-2.5 border-t border-white/10 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-ios-orange"></i>
              ДЗ (${subjectTasks.length})
            </span>
            <button type="button" data-quick-add-task="${item.id}" class="ios-press text-xs font-bold text-ios-orange flex items-center gap-1">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>+ ДЗ</span>
            </button>
          </div>

          ${
            subjectTasks.length > 0
              ? `<div class="space-y-1.5">
                  ${subjectTasks
                    .map(
                      (t) => `
                    <div class="rounded-2xl bg-black/35 border border-white/10 p-2.5 flex items-start gap-2.5">
                      <button type="button" data-toggle-task="${t.id}" class="ios-press mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${t.completed ? "bg-ios-green border-ios-green text-black" : "border-ios-orange"}">
                        ${t.completed ? '<i data-lucide="check" class="w-3 h-3 stroke-[3]"></i>' : ""}
                      </button>
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-white whitespace-pre-wrap break-words ${t.completed ? "line-through text-ios-gray" : ""}">${escapeHtml(t.text)}</p>
                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                          <span class="text-[10px] text-ios-orange bg-ios-orange/15 px-2 py-0.5 rounded-md font-semibold">До: ${escapeHtml(formatShortDate(t.deadline))}</span>
                          <button type="button" data-shift-task-week="${t.id}" class="text-[10px] text-ios-blue hover:underline font-semibold">+7д</button>
                          <button type="button" data-edit-task="${t.id}" class="text-[10px] text-gray-300 hover:text-white">Изм.</button>
                        </div>
                        ${renderPhotosRow(t.photos)}
                      </div>
                    </div>
                  `
                    )
                    .join("")}
                </div>`
              : `<p class="text-[11px] text-gray-400 italic">ДЗ не записано</p>`
          }
        </div>

        <div class="pt-2 border-t border-white/10">
          <div class="flex items-center justify-between gap-2 bg-white/[0.04] border border-white/10 rounded-2xl px-3 py-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <i data-lucide="bookmark" class="w-3.5 h-3.5 text-ios-orange shrink-0"></i>
              <span class="text-xs ${item.topic ? "font-bold text-white" : "text-gray-400 italic"} truncate">
                ${item.topic ? `Тема: ${escapeHtml(item.topic)}` : "Тема пары не указана"}
              </span>
            </div>
            <button type="button" data-quick-topic="${item.id}" class="ios-press text-[11px] font-bold text-ios-orange shrink-0">
              ${item.topic ? "Изм." : "+ Тема"}
            </button>
          </div>
        </div>

        <div class="pt-2 border-t border-white/10 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
              <i data-lucide="notebook-pen" class="w-3.5 h-3.5 text-ios-blue"></i>
              Заметки к паре
            </span>
            <button type="button" data-quick-add-note="${item.id}" class="ios-press text-xs font-bold text-ios-blue flex items-center gap-1">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
              <span>Расширенная</span>
            </button>
          </div>

          ${
            classNotes.length > 0
              ? `<div class="space-y-1.5">
                  ${classNotes
                    .map(
                      (n) => `
                    <div class="rounded-2xl bg-black/35 border border-white/10 p-2.5 space-y-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-extrabold text-white truncate">${escapeHtml(n.title || "Заметка к паре")}</span>
                        <div class="flex items-center gap-2 shrink-0">
                          <button type="button" data-edit-note="${n.id}" class="text-[10px] text-gray-300 hover:text-white">Изм.</button>
                          <button type="button" data-delete-note="${n.id}" class="text-[10px] text-gray-300 hover:text-ios-red">Удал.</button>
                        </div>
                      </div>
                      <p class="text-xs text-gray-200 whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(n.content)}</p>
                      ${renderPhotosRow(n.photos)}
                    </div>
                  `
                    )
                    .join("")}
                </div>`
              : ""
          }

          <div class="flex items-end gap-1.5">
            <textarea
              rows="2"
              data-inline-note-input="${item.id}"
              placeholder="Быстрая заметка к паре..."
              class="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-2xl px-3 py-2 text-xs text-white placeholder-gray-400 outline-none resize-y leading-relaxed"
            ></textarea>
            <button type="button" data-inline-note-save="${item.id}" class="ios-press px-3 py-2 rounded-2xl ios-active-orange text-xs font-extrabold shrink-0">
              ОК
            </button>
          </div>
        </div>
      </article>
    `;
    })
    .join("");

  refreshIcons();
}

function renderPhotosRow(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return "";
  return `
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar pt-1.5">
      ${photos
        .map(
          (src) => `
        <img src="${src}" data-view-photo="${src}" alt="Вложение" class="w-14 h-14 rounded-xl object-cover border border-white/20 cursor-pointer shrink-0 hover:opacity-90" />
      `
        )
        .join("")}
    </div>
  `;
}

function getBadgeStyle(type) {
  const t = String(type).toLowerCase();
  if (t.includes("дистант")) return "bg-ios-indigo/25 text-indigo-300 border-ios-indigo/50";
  if (t.includes("лаб")) return "bg-ios-orange/25 text-ios-orange border-ios-orange/50";
  if (t.includes("практ")) return "bg-ios-green/25 text-ios-green border-ios-green/50";
  return "bg-ios-blue/25 text-ios-blue border-ios-blue/50";
}

// ============================================================================
// 13. РЕНДЕРИНГ ТРЕКЕРА ДЗ
// ============================================================================
function renderTasks() {
  const container = document.getElementById("tasks-list");
  if (!container) return;

  const todayISO = getTodayISO();
  const currentWeekNum = getStudyWeekNumber(state.selectedDate);

  const activeTasks = state.tasks.filter((t) => !t.completed);
  const completedTasks = state.tasks.filter((t) => t.completed);
  const weekTasks = state.tasks.filter((t) => !t.completed && getStudyWeekNumber(String(t.deadline).slice(0, 10)) === currentWeekNum);

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

  let list = activeTasks;
  if (state.taskFilter === "this-week") list = weekTasks;
  else if (state.taskFilter === "completed") list = completedTasks;

  list.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="ios26-card rounded-3xl p-8 text-center">
        <p class="font-bold text-base">Заданий в этой категории нет</p>
        <p class="text-xs text-gray-300 mt-1">Нажмите «Добавить ДЗ» выше или в карточке нужной пары</p>
      </div>`;
    return;
  }

  container.innerHTML = list
    .map((task) => {
      const deadlineDate = String(task.deadline).slice(0, 10);
      const overdue = !task.completed && deadlineDate < todayISO;
      const dateLabel = formatShortDate(deadlineDate);

      return `
      <article class="ios26-card rounded-3xl p-4 space-y-2.5">
        <div class="flex items-start gap-3">
          <button type="button" data-toggle-task="${task.id}" class="ios-press mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${task.completed ? "bg-ios-green border-ios-green text-black" : "border-ios-orange"}">
            ${task.completed ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ""}
          </button>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <span class="text-xs font-extrabold text-ios-orange truncate">${escapeHtml(task.subject)}</span>
              <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${overdue ? "bg-ios-red/20 text-ios-red border border-ios-red/40" : "bg-white/10 text-gray-200"}">
                Дедлайн: ${escapeHtml(dateLabel)}
              </span>
            </div>
            <p class="text-sm text-white whitespace-pre-wrap break-words ${task.completed ? "line-through text-ios-gray" : ""}">${escapeHtml(task.text)}</p>
            ${renderPhotosRow(task.photos)}

            <div class="flex items-center gap-3 mt-2 pt-2 border-t border-white/10 text-xs">
              <button type="button" data-shift-task-week="${task.id}" class="ios-press text-ios-blue font-semibold flex items-center gap-1">
                <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i>
                <span>+7 дней</span>
              </button>
              <button type="button" data-edit-task="${task.id}" class="ios-press text-gray-300 hover:text-white font-semibold ml-auto">Изменить</button>
              <button type="button" data-delete-task="${task.id}" class="ios-press text-gray-300 hover:text-ios-red font-semibold">Удалить</button>
            </div>
          </div>
        </div>
      </article>
    `;
    })
    .join("");
  refreshIcons();
}

// ============================================================================
// 14. РЕНДЕРИНГ РАЗДЕЛА ЗАМЕТОК
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

  list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="ios26-card rounded-3xl p-8 text-center">
        <p class="font-bold text-base">Заметок пока нет</p>
        <p class="text-xs text-gray-300 mt-1">Создайте заметку в поле выше</p>
      </div>`;
    return;
  }

  container.innerHTML = list
    .map((note) => {
      const hasSubject = Boolean(note.subject);
      const hasDate = Boolean(note.date);
      const hasNotify = Boolean(note.notifyEnabled && note.notifyTime);

      return `
      <article class="ios26-card rounded-3xl p-4 space-y-2.5 ${note.pinned ? "border-ios-orange/50" : ""}">
        <div class="flex items-start justify-between gap-2">
          <input
            type="text"
            data-note-title-input="${note.id}"
            value="${escapeHtml(note.title || "")}"
            placeholder="Название"
            class="flex-1 min-w-0 bg-transparent font-extrabold text-base text-white placeholder-gray-400 outline-none"
          />
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" data-toggle-pin-note="${note.id}" class="ios-press p-1.5 rounded-full ${note.pinned ? "text-ios-orange bg-ios-orange/15" : "text-gray-400 hover:text-white"}" title="Закрепить">
              <i data-lucide="pin" class="w-4 h-4"></i>
            </button>
            <button type="button" data-edit-note="${note.id}" class="ios-press text-gray-300 hover:text-white p-1.5" title="Настроить">
              <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>
            </button>
            <button type="button" data-delete-note="${note.id}" class="ios-press text-gray-300 hover:text-ios-red p-1.5" title="Удалить">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <textarea
          data-note-input="${note.id}"
          rows="3"
          placeholder="Заметка..."
          class="w-full bg-black/30 rounded-2xl p-3 text-xs text-white placeholder-gray-400 outline-none resize-y leading-relaxed"
        >${escapeHtml(note.content || "")}</textarea>

        ${renderPhotosRow(note.photos)}

        ${
          hasSubject || hasDate || hasNotify
            ? `<div class="flex items-center gap-1.5 flex-wrap pt-1">
                ${
                  hasSubject
                    ? `<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ios-orange/20 text-ios-orange flex items-center gap-1">
                        <i data-lucide="graduation-cap" class="w-3 h-3"></i>${escapeHtml(note.subject)}
                      </span>`
                    : ""
                }
                ${
                  hasDate
                    ? `<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ios-blue/20 text-ios-blue flex items-center gap-1">
                        <i data-lucide="calendar" class="w-3 h-3"></i>${escapeHtml(formatShortDate(note.date))}
                      </span>`
                    : ""
                }
                ${
                  hasNotify
                    ? `<span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ios-green/20 text-ios-green flex items-center gap-1">
                        <i data-lucide="bell-ring" class="w-3 h-3"></i>${escapeHtml(new Date(note.notifyTime).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}
                      </span>`
                    : ""
                }
              </div>`
            : ""
        }
      </article>
    `;
    })
    .join("");
  refreshIcons();
}

// ============================================================================
// 15. СКРЫТЫЕ ПАРЫ И DATALIST
// ============================================================================
function renderHiddenClassesModal() {
  const container = document.getElementById("hidden-classes-list");
  if (!container) return;
  if (state.hiddenRules.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-gray-300">Скрытых пар сейчас нет. Все дисциплины отображаются в расписании.</div>`;
    return;
  }

  container.innerHTML = state.hiddenRules
    .map(
      (rule) => `
    <div class="bg-ios-elevated rounded-2xl p-3.5 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${rule.mode === "forever" ? "bg-ios-red/20 text-ios-red" : "bg-ios-orange/20 text-ios-orange"}">
          ${rule.mode === "forever" ? "Скрыто насовсем" : `Только на неделе №${rule.weekNum}`}
        </span>
        <p class="text-sm font-bold text-white truncate mt-1">${escapeHtml(rule.subject)}</p>
      </div>
      <button type="button" data-restore-hidden="${rule.id}" class="ios-press px-3 py-1.5 rounded-xl bg-ios-green/20 border border-ios-green/40 text-ios-green text-xs font-bold shrink-0">
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
    btn.className = `task-target-btn py-2 rounded-xl text-xs font-bold transition-all ${active ? "ios-active-orange" : "text-ios-gray"}`;
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
    btn.className = `note-target-btn py-1.5 rounded-lg text-[11px] font-bold transition-all ${active ? "ios-active-orange" : "text-ios-gray"}`;
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
      <img src="${src}" class="w-16 h-16 rounded-xl object-cover border border-white/20" />
      <button type="button" data-remove-draft-photo="${type}:${idx}" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ios-red text-white text-[10px] font-bold flex items-center justify-center">✕</button>
    </div>
  `
    )
    .join("");
}

function setScopeMode(scope) {
  state.addScope = scope;
  document.querySelectorAll(".scope-btn").forEach((btn) => {
    const active = btn.dataset.scope === scope;
    btn.className = `scope-btn py-1.5 rounded-xl text-[11px] font-bold transition-all ${active ? "ios-active-orange" : "text-ios-gray"}`;
  });
  document.getElementById("scope-box-date")?.classList.toggle("hidden", scope !== "date");
  document.getElementById("scope-box-week")?.classList.toggle("hidden", scope !== "week" && scope !== "next-week");
  document.getElementById("scope-box-semester")?.classList.toggle("hidden", scope !== "semester");
}

function resetKeepComposer() {
  state.keepDraft.pinned = false;
  state.keepDraft.photos = [];
  const t = document.getElementById("keep-title-input");
  const c = document.getElementById("keep-content-input");
  const s = document.getElementById("keep-subject-input");
  const d = document.getElementById("keep-date-input");
  const n = document.getElementById("keep-notify-input");
  if (t) t.value = "";
  if (c) c.value = "";
  if (s) s.value = "";
  if (d) d.value = "";
  if (n) n.value = "";
  document.getElementById("keep-panel-subject")?.classList.add("hidden");
  document.getElementById("keep-panel-date")?.classList.add("hidden");
  document.getElementById("keep-panel-notify")?.classList.add("hidden");
  const pinBtn = document.getElementById("keep-pin-btn");
  if (pinBtn) pinBtn.className = "ios-press w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-ios-orange shrink-0";
  renderDraftPhotos("keep-photos-preview", state.keepDraft.photos, "keep");
}

// ============================================================================
// 16. ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================================
function initUIListeners() {
  // Кнопка показа расписания на всю неделю (как в Google Календаре)
  document.getElementById("btn-week-grid-toggle")?.addEventListener("click", () => {
    if (state.activeTab !== "schedule") {
      document.querySelector('[data-tab="schedule"]')?.click();
    }
    toggleWeekGridView();
  });
  document.getElementById("btn-close-week-grid")?.addEventListener("click", () => {
    toggleWeekGridView(false);
  });

  document.querySelectorAll(".week-layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.weekLayout = btn.dataset.weekLayout || "cards";
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
      localStorage.setItem("diary_bg_mode_v6", "custom");
      if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
      showInAppToast("Фон обновлен", "Ваш фон из галереи установлен.");
    } catch {
      alert("Не удалось загрузить изображение фона");
    }
    e.target.value = "";
  });

  document.getElementById("btn-clear-custom-bg")?.addEventListener("click", () => {
    localStorage.removeItem("diary_custom_bg_img_v6");
    localStorage.setItem("diary_bg_mode_v6", isLightMode() ? "white" : "black");
    if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
  });

  document.getElementById("bg-dim-slider")?.addEventListener("input", (e) => {
    const val = Math.min(85, Math.max(0, Number(e.target.value) || 0));
    localStorage.setItem("diary_custom_bg_dim_v6", String(val));
    const label = document.getElementById("bg-dim-value");
    if (label) label.textContent = `${val}%`;
    if (window.__applyDiaryAppearance) window.__applyDiaryAppearance();
  });

  // Модальное окно уведомлений
  document.getElementById("btn-notifications")?.addEventListener("click", () => {
    closeModal("modal-tools");
    updateNotifPermissionStatusUI();
    openModal("modal-notifications");
  });
  document.getElementById("btn-open-notif-from-tools")?.addEventListener("click", () => {
    closeModal("modal-tools");
    updateNotifPermissionStatusUI();
    openModal("modal-notifications");
  });

  document.getElementById("btn-request-notif-permission")?.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showInAppToast("Уведомления активны", "В вашем браузере включены внутриэкранные уведомления.");
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifPermissionStatusUI();
    if (perm === "granted") {
      sendAppNotification("Уведомления включены!", "Мы напомним о парах, дедлайнах ДЗ и заметках.");
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

  // Навигация по неделям и дням
  document.getElementById("btn-prev-week")?.addEventListener("click", () => {
    state.selectedDate = addDaysISO(state.selectedDate, -7);
    renderScheduleSection();
  });
  document.getElementById("btn-next-week")?.addEventListener("click", () => {
    state.selectedDate = addDaysISO(state.selectedDate, 7);
    renderScheduleSection();
  });
  document.getElementById("btn-today")?.addEventListener("click", () => {
    state.selectedDate = getInitialStudyDate();
    renderScheduleSection();
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
      state.selectedDate = e.target.value;
      renderScheduleSection();
    }
  });
  document.getElementById("day-selector")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-select-date]");
    if (btn) {
      state.selectedDate = btn.dataset.selectDate;
      renderScheduleSection();
    }
  });

  // Свайпы влево и вправо для переключения дней в неделе
  let touchStartX = 0;
  let touchStartY = 0;
  const dayScheduleEl = document.getElementById("day-schedule-view");
  dayScheduleEl?.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.closest("[data-view-photo]")) {
        touchStartX = 0;
        return;
      }
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  dayScheduleEl?.addEventListener(
    "touchend",
    (e) => {
      if (!touchStartX || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      touchStartX = 0;

      // Горизонтальный свайп (минимум 55px и заметно горизонтальнее вертикального скролла)
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        if (dx < 0) {
          // Свайп влево -> следующий день
          state.selectedDate = addDaysISO(state.selectedDate, 1);
        } else {
          // Свайп вправо -> предыдущий день
          state.selectedDate = addDaysISO(state.selectedDate, -1);
        }
        renderScheduleSection();
      }
    },
    { passive: true }
  );

  // Скрытие / показ мероприятий
  const toggleEventsVisibility = () => {
    state.showEvents = !state.showEvents;
    localStorage.setItem("diary_show_events_v4", String(state.showEvents));
    renderScheduleSection();
  };
  document.getElementById("btn-toggle-events")?.addEventListener("click", toggleEventsVisibility);
  document.getElementById("btn-hide-events-inline")?.addEventListener("click", toggleEventsVisibility);

  document.getElementById("btn-add-event")?.addEventListener("click", () => {
    document.getElementById("form-event")?.reset();
    const editId = document.getElementById("event-edit-id");
    const title = document.getElementById("modal-event-title");
    const df = document.getElementById("event-date-from");
    const dt = document.getElementById("event-date-to");
    const st = document.getElementById("event-start");
    const et = document.getElementById("event-end");
    if (editId) editId.value = "";
    if (title) title.textContent = "Новое мероприятие";
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

  // Конструктор заметок
  document.getElementById("keep-pin-btn")?.addEventListener("click", () => {
    state.keepDraft.pinned = !state.keepDraft.pinned;
    const btn = document.getElementById("keep-pin-btn");
    if (btn) {
      btn.className = `ios-press w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        state.keepDraft.pinned ? "bg-ios-orange/20 text-ios-orange" : "text-gray-400 hover:text-ios-orange"
      }`;
    }
  });

  document.querySelectorAll("[data-toggle-keep-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = btn.dataset.toggleKeepOpt;
      const panel = document.getElementById(`keep-panel-${opt}`);
      if (!panel) return;
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) {
        const input = panel.querySelector("input");
        if (opt === "date" && input && !input.value) input.value = state.selectedDate;
        if (input) input.focus();
      }
    });
  });

  document.querySelectorAll("[data-clear-keep-opt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = btn.dataset.clearKeepOpt;
      const panel = document.getElementById(`keep-panel-${opt}`);
      if (panel) {
        const input = panel.querySelector("input");
        if (input) input.value = "";
        panel.classList.add("hidden");
      }
    });
  });

  document.getElementById("keep-photo-input")?.addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      const dataUrl = await compressImageFile(f);
      state.keepDraft.photos.push(dataUrl);
    }
    renderDraftPhotos("keep-photos-preview", state.keepDraft.photos, "keep");
    e.target.value = "";
  });

  document.getElementById("keep-btn-clear")?.addEventListener("click", resetKeepComposer);

  document.getElementById("keep-btn-save")?.addEventListener("click", async () => {
    const title = document.getElementById("keep-title-input")?.value.trim() || "";
    const content = document.getElementById("keep-content-input")?.value.trim() || "";
    const subject = document.getElementById("keep-subject-input")?.value.trim() || "";
    const date = document.getElementById("keep-date-input")?.value || "";
    const notifyTime = document.getElementById("keep-notify-input")?.value || "";

    if (!title && !content && state.keepDraft.photos.length === 0) {
      document.getElementById("keep-content-input")?.focus();
      return;
    }

    await saveNoteItem({
      id: `note_${Date.now()}`,
      title: title || (subject ? `Заметка: ${subject}` : "Без названия"),
      content,
      subject: subject || "",
      date: date || "",
      pinned: state.keepDraft.pinned,
      photos: [...state.keepDraft.photos],
      notifyEnabled: Boolean(notifyTime),
      notifyTime: notifyTime || ""
    });

    resetKeepComposer();
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

  document.getElementById("btn-header-add")?.addEventListener("click", () => {
    if (state.activeTab === "schedule") {
      document.getElementById("form-schedule")?.reset();
      const editId = document.getElementById("sched-edit-id");
      const title = document.getElementById("modal-schedule-title");
      const wrap = document.getElementById("scope-selector-wrapper");
      const sDate = document.getElementById("sched-date");
      const semDay = document.getElementById("sched-sem-day");
      if (editId) editId.value = "";
      if (title) title.textContent = "Добавить пару";
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
      document.getElementById("keep-title-input")?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  document.getElementById("btn-new-task-top")?.addEventListener("click", () => openTaskModalFor(null));

  const openHiddenModal = () => {
    closeModal("modal-tools");
    renderHiddenClassesModal();
    openModal("modal-hidden-classes");
  };
  document.getElementById("btn-hidden-classes")?.addEventListener("click", openHiddenModal);
  document.getElementById("btn-open-hidden-inline")?.addEventListener("click", openHiddenModal);
  document.getElementById("btn-open-hidden-from-tools")?.addEventListener("click", openHiddenModal);

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

  document.getElementById("form-note")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("note-edit-id")?.value || "";
    const existing = state.notes.find((n) => n.id === editId);
    const title = document.getElementById("note-title")?.value.trim() || "";
    const subject = document.getElementById("note-subject")?.value.trim() || "";
    const noteObj = {
      id: editId || `note_${Date.now()}`,
      title: title || (subject ? `Заметка: ${subject}` : "Заметка"),
      content: document.getElementById("note-content")?.value.trim() || "",
      subject,
      date: document.getElementById("note-date")?.value || "",
      pinned: existing ? Boolean(existing.pinned) : false,
      photos: [...state.draftNotePhotos],
      notifyEnabled: Boolean(document.getElementById("note-notify-enabled")?.checked),
      notifyTime: document.getElementById("note-notify-time")?.value || ""
    };
    await saveNoteItem(noteObj);
    closeModal("modal-note");
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
      state.activeTab = btn.dataset.tab;
      if (state.activeTab !== "schedule" && state.weekGridMode) {
        toggleWeekGridView(false);
      }
      const titles = { schedule: "Расписание", tasks: "ДЗ и Задачи", notes: "Заметки" };
      const hTitle = document.getElementById("header-title");
      if (hTitle) hTitle.textContent = titles[state.activeTab];
      document.getElementById("view-schedule")?.classList.toggle("hidden", state.activeTab !== "schedule");
      document.getElementById("view-tasks")?.classList.toggle("hidden", state.activeTab !== "tasks");
      document.getElementById("view-notes")?.classList.toggle("hidden", state.activeTab !== "notes");

      document.querySelectorAll(".nav-tab").forEach((b) => {
        const active = b.dataset.tab === state.activeTab;
        b.classList.toggle("active-tg-pill", active);
        b.classList.toggle("text-ios-orange", active);
        b.classList.toggle("text-ios-gray", !active);
      });

      refreshIcons();
    });
  });

  document.querySelectorAll(".task-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.status;
      document.querySelectorAll(".task-filter-tab").forEach((b) => {
        const active = b.dataset.status === state.taskFilter;
        b.className = `task-filter-tab ios-press py-2 rounded-full text-xs font-bold transition-all ${active ? "bg-white/15 text-white shadow" : "text-ios-gray"}`;
      });
      renderTasks();
    });
  });

  document.querySelectorAll(".note-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.noteFilter = btn.dataset.noteFilter;
      document.querySelectorAll(".note-filter-tab").forEach((b) => {
        const active = b.dataset.noteFilter === state.noteFilter;
        b.className = `note-filter-tab ios-press py-1.5 rounded-full text-xs font-bold transition-all ${active ? "bg-white/15 text-white shadow" : "text-ios-gray"}`;
      });
      renderNotes();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  document.addEventListener("click", async (e) => {
    // Клик по дню или карточке пары в сетке на всю неделю -> переход к этому дню
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
      openModal("modal-photo-viewer");
      return;
    }

    const rmPhotoBtn = e.target.closest("[data-remove-draft-photo]");
    if (rmPhotoBtn) {
      const [type, idxStr] = rmPhotoBtn.dataset.removeDraftPhoto.split(":");
      const idx = Number(idxStr);
      if (type === "task") {
        state.draftTaskPhotos.splice(idx, 1);
        renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
      } else if (type === "keep") {
        state.keepDraft.photos.splice(idx, 1);
        renderDraftPhotos("keep-photos-preview", state.keepDraft.photos, "keep");
      } else {
        state.draftNotePhotos.splice(idx, 1);
        renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
      }
      return;
    }

    const delEventBtn = e.target.closest("[data-delete-event]");
    if (delEventBtn) {
      await deleteEventById(delEventBtn.dataset.deleteEvent);
      return;
    }

    const editEventBtn = e.target.closest("[data-edit-event]");
    if (editEventBtn) {
      const ev = state.events.find((x) => x.id === editEventBtn.dataset.editEvent);
      if (!ev) return;
      document.getElementById("event-edit-id").value = ev.id;
      document.getElementById("modal-event-title").textContent = "Изменить мероприятие";
      document.getElementById("event-title").value = ev.title;
      document.getElementById("event-date-from").value = ev.date;
      document.getElementById("event-date-to").value = ev.date;
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

    const inlineNoteSaveBtn = e.target.closest("[data-inline-note-save]");
    if (inlineNoteSaveBtn) {
      const classId = inlineNoteSaveBtn.dataset.inlineNoteSave;
      const area = document.querySelector(`[data-inline-note-input="${classId}"]`);
      const item = state.schedule.find((s) => s.id === classId);
      if (item && area && area.value.trim()) {
        await saveNoteItem({
          id: `note_${Date.now()}`,
          title: item.topic ? `${item.subject}: ${item.topic}` : item.subject,
          subject: item.subject,
          date: item.date,
          content: area.value.trim(),
          pinned: false,
          photos: [],
          notifyEnabled: false,
          notifyTime: ""
        });
        area.value = "";
      }
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
      const note = state.notes.find((n) => n.id === editNoteBtn.dataset.editNote);
      if (!note) return;
      state.contextClassItem = null;
      state.draftNotePhotos = [...(note.photos || [])];
      document.getElementById("note-edit-id").value = note.id;
      document.getElementById("modal-note-title").textContent = "Изменить заметку";
      document.getElementById("note-title").value = note.title || "";
      document.getElementById("note-subject").value = note.subject || "";
      document.getElementById("note-date").value = note.date || "";
      document.getElementById("note-content").value = note.content || "";
      document.getElementById("note-notify-enabled").checked = Boolean(note.notifyEnabled);
      document.getElementById("note-notify-time").value = note.notifyTime || "";
      applyNoteTargetMode(note.date ? "custom" : "none");
      renderDraftPhotos("note-photos-preview", state.draftNotePhotos, "note");
      openModal("modal-note");
      return;
    }

    const copyNextWeekBtn = e.target.closest("[data-copy-next-week]");
    if (copyNextWeekBtn) {
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
      if (info) info.textContent = `${item.number} пара • ${item.subject} (${formatShortDate(item.date)})`;
      openModal("modal-delete-schedule");
      return;
    }

    const toggleTaskBtn = e.target.closest("[data-toggle-task]");
    if (toggleTaskBtn) {
      const id = toggleTaskBtn.dataset.toggleTask;
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
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

  document.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const area = e.target.closest("[data-inline-note-input]");
    if (!area) return;

    const isMobileTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (e.shiftKey || isMobileTouch) return;

    e.preventDefault();
    const classId = area.dataset.inlineNoteInput;
    const item = state.schedule.find((s) => s.id === classId);
    if (item && area.value.trim()) {
      await saveNoteItem({
        id: `note_${Date.now()}`,
        title: item.topic ? `${item.subject}: ${item.topic}` : item.subject,
        subject: item.subject,
        date: item.date,
        content: area.value.trim(),
        pinned: false,
        photos: [],
        notifyEnabled: false,
        notifyTime: ""
      });
      area.value = "";
    }
  });

  document.addEventListener("input", (e) => {
    const contentArea = e.target.closest("[data-note-input]");
    const titleInput = e.target.closest("[data-note-title-input]");
    if (!contentArea && !titleInput) return;

    const noteId = contentArea ? contentArea.dataset.noteInput : titleInput.dataset.noteTitleInput;
    const statusEl = document.getElementById("note-save-status");
    if (statusEl) {
      statusEl.textContent = "Печатает...";
      statusEl.className = "text-[10px] font-semibold text-ios-orange bg-ios-orange/15 px-2 py-0.5 rounded-full";
    }

    clearTimeout(state.noteDebounceTimers[noteId]);
    state.noteDebounceTimers[noteId] = setTimeout(async () => {
      const note = state.notes.find((n) => n.id === noteId);
      if (!note) return;
      if (contentArea) note.content = contentArea.value;
      if (titleInput) note.title = titleInput.value;
      saveLocalData();
      if (state.user && db) {
        await setDoc(
          doc(db, "users", state.user.uid, "notes", noteId),
          { title: note.title || "", content: note.content || "" },
          { merge: true }
        );
      }
      if (statusEl) {
        statusEl.textContent = "Сохранено";
        statusEl.className = "text-[10px] font-semibold text-ios-green bg-ios-green/15 px-2 py-0.5 rounded-full";
      }
    }, 450);
  });
}

function openTaskModalFor(classItem) {
  state.contextClassItem = classItem;
  state.draftTaskPhotos = [];
  document.getElementById("form-task")?.reset();
  document.getElementById("task-edit-id").value = "";
  document.getElementById("modal-task-title").textContent = "Домашнее задание";
  document.getElementById("task-subject").value = classItem ? classItem.subject : "";
  document.getElementById("task-completed").checked = false;
  renderDraftPhotos("task-photos-preview", state.draftTaskPhotos, "task");
  applyTaskTargetMode(classItem ? "next" : "current");
  openModal("modal-task");
}

function openNoteModalFor(classItem) {
  state.contextClassItem = classItem;
  state.draftNotePhotos = [];
  document.getElementById("form-note")?.reset();
  document.getElementById("note-edit-id").value = "";
  document.getElementById("modal-note-title").textContent = classItem ? "Заметка к паре" : "Новая заметка";
  document.getElementById("note-title").value = classItem?.topic ? classItem.topic : "";
  document.getElementById("note-subject").value = classItem ? classItem.subject : "";
  document.getElementById("note-notify-enabled").checked = false;
  document.getElementById("note-notify-time").value = "";
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

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("hidden");
    el.classList.add("flex");
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("hidden");
    el.classList.remove("flex");
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

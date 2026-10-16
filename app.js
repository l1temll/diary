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
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* ==========================================================================
   1. НАСТРОЙКИ FIREBASE (ВСТАВЬ СВОИ КЛЮЧИ СЮДА ПО ИНСТРУКЦИИ НИЖЕ)
   Пока ключи не вставлены, приложение работает в автономном режиме и
   сохраняет все изменения прямо в память твоего телефона/браузера!
   ========================================================================== */
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

/* ==========================================================================
   2. ВСТРОЕННАЯ БАЗА ТВОЕГО РАСПИСАНИЯ ИЗ RASPISANIE_SEMESTR1.ICS (275 ПАР)
   ========================================================================== */
const BELL_SCHEDULE = {
  "1": { start: "08:00", end: "09:30" },
  "2": { start: "09:40", end: "11:10" },
  "3": { start: "11:20", end: "12:50" },
  "4": { start: "13:20", end: "14:50" },
  "5": { start: "15:00", end: "16:30" },
  "6": { start: "16:40", end: "18:10" },
  "7": { start: "18:20", end: "19:50" }
};

// Шаблоны пар из твоего файла raspisanie_semestr1.ics
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

// Полная карта дат 1 семестра (сентябрь - декабрь 2026)
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
        type,
        room,
        teacher
      });
    }
  }
  return list;
}

/* ==========================================================================
   3. СОСТОЯНИЕ ПРИЛОЖЕНИЯ И ДАТЫ
   ========================================================================== */
const SEMESTER_START_MONDAY = "2026-08-31"; // Понедельник 1-й учебной недели

const state = {
  user: null,
  activeTab: "schedule",
  selectedDate: getInitialStudyDate(), // 'YYYY-MM-DD'
  addScope: "date", // 'date' | 'week' | 'semester'
  taskFilter: "active",
  schedule: [],
  tasks: [],
  notes: [],
  pendingDeleteItem: null,
  unsubscribers: [],
  noteDebounceTimers: {}
};

function formatDateISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateISO(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getInitialStudyDate() {
  const now = new Date();
  // Если воскресенье — переключаем на понедельник следующей недели
  if (now.getDay() === 0) {
    now.setDate(now.getDate() + 1);
  }
  const iso = formatDateISO(now);
  // Если дата вне 1 семестра 2026, но в пределах учебного года — оставляем её
  return iso;
}

function getMondayOfDate(dateStr) {
  const d = parseDateISO(dateStr);
  const day = d.getDay(); // 0 (Вс) .. 6 (Сб)
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

/* ==========================================================================
   4. СТАРТ ПРИЛОЖЕНИЯ
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  initNetworkListeners();
  initUIListeners();

  // Загружаем локальные данные (или инициализируем 275 пар по умолчанию)
  loadLocalDataOrSeed();
  renderAll();

  if (isFirebaseConfigured) {
    initFirebaseAuth();
  }
});

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function initNetworkListeners() {
  const updateUI = () => {
    const dot = document.getElementById("network-dot");
    const text = document.getElementById("network-text");
    if (navigator.onLine) {
      dot.className = "w-2 h-2 rounded-full bg-ios-green";
      text.textContent = "Онлайн";
    } else {
      dot.className = "w-2 h-2 rounded-full bg-ios-orange animate-pulse";
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

/* ==========================================================================
   5. ХРАНИЛИЩЕ: LOCALSTORAGE + FIREBASE FIRESTORE
   ========================================================================== */
function loadLocalDataOrSeed() {
  const savedSched = localStorage.getItem("diary_schedule_v2");
  if (savedSched) {
    state.schedule = JSON.parse(savedSched);
  } else {
    state.schedule = buildDefaultSchedule();
    localStorage.setItem("diary_schedule_v2", JSON.stringify(state.schedule));
  }

  state.tasks = JSON.parse(localStorage.getItem("diary_tasks_v2") || "[]");
  state.notes = JSON.parse(localStorage.getItem("diary_notes_v2") || "[]");
}

function saveLocalData() {
  localStorage.setItem("diary_schedule_v2", JSON.stringify(state.schedule));
  localStorage.setItem("diary_tasks_v2", JSON.stringify(state.tasks));
  localStorage.setItem("diary_notes_v2", JSON.stringify(state.notes));
}

function initFirebaseAuth() {
  getRedirectResult(auth).catch((e) => console.warn(e));

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    state.unsubscribers.forEach((u) => u());
    state.unsubscribers = [];

    const btnLogin = document.getElementById("btn-login");
    const userProfile = document.getElementById("user-profile");
    const userAvatar = document.getElementById("user-avatar");

    if (user) {
      btnLogin.classList.add("hidden");
      userProfile.classList.remove("hidden");
      userProfile.classList.add("flex");
      userAvatar.src =
        user.photoURL ||
        "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%230A84FF'/></svg>";

      subscribeFirestore(user.uid);
    } else {
      btnLogin.classList.remove("hidden");
      userProfile.classList.add("hidden");
      userProfile.classList.remove("flex");
      loadLocalDataOrSeed();
      renderAll();
    }
  });
}

function subscribeFirestore(uid) {
  setSyncIndicator(true);

  const schedRef = collection(db, "users", uid, "schedule");
  const unsubSched = onSnapshot(schedRef, async (snap) => {
    if (snap.empty && !localStorage.getItem(`seeded_${uid}`)) {
      // Первая авторизация: автоматически заливаем расписание 1 семестра в облако
      localStorage.setItem(`seeded_${uid}`, "1");
      await uploadBatchScheduleToCloud(buildDefaultSchedule());
      return;
    }
    state.schedule = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderScheduleSection();
    updateSubjectsDatalist();
    setSyncIndicator(false);
  });

  const tasksRef = collection(db, "users", uid, "tasks");
  const unsubTasks = onSnapshot(tasksRef, (snap) => {
    state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderTasks();
  });

  const notesRef = collection(db, "users", uid, "notes");
  const unsubNotes = onSnapshot(notesRef, (snap) => {
    state.notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    saveLocalData();
    renderNotes();
  });

  state.unsubscribers.push(unsubSched, unsubTasks, unsubNotes);
}

async function uploadBatchScheduleToCloud(items) {
  if (!state.user || !db) return;
  setSyncIndicator(true);
  // Firestore writeBatch поддерживает до 500 операций за раз (у нас 275)
  const chunks = [];
  for (let i = 0; i < items.length; i += 400) {
    chunks.push(items.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const item of chunk) {
      const ref = doc(db, "users", state.user.uid, "schedule", item.id);
      batch.set(ref, item);
    }
    await batch.commit();
  }
  setSyncIndicator(false);
}

/* ==========================================================================
   6. ОПЕРАЦИИ С РАСПИСАНИЕМ (КАСТОМИЗАЦИЯ НА ДАТУ / НЕДЕЛЮ / СЕМЕСТР)
   ========================================================================== */
async function saveScheduleItems(itemsToSave) {
  if (state.user && db) {
    await uploadBatchScheduleToCloud(itemsToSave);
  } else {
    for (const newItem of itemsToSave) {
      const idx = state.schedule.findIndex((s) => s.id === newItem.id);
      if (idx >= 0) {
        state.schedule[idx] = newItem;
      } else {
        state.schedule.push(newItem);
      }
    }
    saveLocalData();
    renderScheduleSection();
    updateSubjectsDatalist();
  }
}

async function removeScheduleItemsByIds(ids) {
  const idSet = new Set(ids);
  if (state.user && db) {
    setSyncIndicator(true);
    const batch = writeBatch(db);
    for (const id of idSet) {
      batch.delete(doc(db, "users", state.user.uid, "schedule", id));
    }
    await batch.commit();
    setSyncIndicator(false);
  } else {
    state.schedule = state.schedule.filter((item) => !idSet.has(item.id));
    saveLocalData();
    renderScheduleSection();
    updateSubjectsDatalist();
  }
}

/* ==========================================================================
   7. ИМПОРТ ЛЮБОГО .ICS ФАЙЛА
   ========================================================================== */
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

    // Парсим формат: [Пара 2, 09:40-11:10] Предмет (тип) — Преподаватель
    const metaMatch = rawSummary.match(/\[Пара\s*(\d+),\s*(\d{2}:\d{2})-(\d{2}:\d{2})\]\s*(.*)/i);
    let number = 1;
    let startTime = "08:00";
    let endTime = "09:30";
    let rest = rawSummary;

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
      else if (rawType.includes("практ") && rawType.includes("дист")) type = "Практика (Дистант)";
      else if (rawType.includes("лек") && rawType.includes("дист")) type = "Лекция (Дистант)";
      else if (rawType.includes("практ")) type = "Практика";
      else type = "Лекция";
    }

    events.push({
      id: `ics_${dateStr}_${idx++}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      number,
      startTime,
      endTime,
      subject,
      type,
      room,
      teacher
    });
  }

  return events;
}

/* ==========================================================================
   8. РЕНДЕРИНГ ИНТЕРФЕЙСА
   ========================================================================== */
function renderAll() {
  renderScheduleSection();
  renderTasks();
  renderNotes();
  updateSubjectsDatalist();
}

function renderScheduleSection() {
  const monday = getMondayOfDate(state.selectedDate);
  const weekNum = getStudyWeekNumber(state.selectedDate);
  const isOdd = Math.abs(weekNum) % 2 === 1;
  const parityText = isOdd ? "Нечетная (Числитель)" : "Четная (Знаменатель)";

  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);

  const fmtShort = (d) =>
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  document.getElementById("week-title").textContent =
    weekNum >= 1 && weekNum <= 22
      ? `Учебная неделя №${weekNum}`
      : `Календарная неделя`;
  document.getElementById("week-subtitle").textContent = `${parityText} • ${fmtShort(monday)} – ${fmtShort(saturday)}`;
  document.getElementById("date-jump-picker").value = state.selectedDate;

  // Рендерим кнопки дней недели (ПН - СБ) с реальными датами
  const dayNames = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
  const daySelector = document.getElementById("day-selector");
  const buttonsHtml = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = formatDateISO(d);
    const isSelected = iso === state.selectedDate;
    const countForDay = state.schedule.filter((s) => s.date === iso).length;

    buttonsHtml.push(`
      <button data-select-date="${iso}" class="ios-press flex flex-col items-center py-2 rounded-2xl border transition-all ${
        isSelected
          ? "bg-ios-blue border-ios-blue text-white font-bold shadow"
          : "bg-ios-card border-white/5 text-ios-gray font-medium"
      }">
        <span class="text-[10px] opacity-80">${dayNames[i]}</span>
        <span class="text-sm mt-0.5 ${isSelected ? "text-white" : "text-gray-200"}">${d.getDate()}</span>
        <div class="flex gap-0.5 mt-1 h-1.5 items-center">
          ${
            countForDay > 0
              ? Array.from({ length: Math.min(countForDay, 4) })
                  .map(
                    () =>
                      `<span class="w-1 h-1 rounded-full ${
                        isSelected ? "bg-white" : "bg-ios-blue"
                      }"></span>`
                  )
                  .join("")
              : ""
          }
        </div>
      </button>
    `);
  }
  daySelector.innerHTML = buttonsHtml.join("");

  // Рендерим карточки пар на выбранную дату
  const listEl = document.getElementById("schedule-list");
  const dayClasses = state.schedule
    .filter((item) => item.date === state.selectedDate)
    .sort((a, b) => Number(a.number) - Number(b.number));

  if (dayClasses.length === 0) {
    const readableDate = parseDateISO(state.selectedDate).toLocaleDateString(
      "ru-RU",
      { weekday: "long", day: "numeric", month: "long" }
    );
    listEl.innerHTML = `
      <div class="bg-ios-card rounded-2xl p-8 text-center border border-white/5">
        <div class="w-12 h-12 rounded-2xl bg-ios-elevated text-ios-gray mx-auto flex items-center justify-center mb-3">
          <i data-lucide="coffee" class="w-6 h-6"></i>
        </div>
        <p class="font-semibold text-base capitalize">${escapeHtml(readableDate)}</p>
        <p class="text-xs text-ios-gray mt-1">В этот день пар нет. Нажми «+» сверху, чтобы добавить занятие на эту дату, неделю или весь семестр.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  listEl.innerHTML = dayClasses
    .map(
      (item) => `
      <article class="bg-ios-card rounded-2xl p-4 border border-white/5 flex gap-3.5 items-start">
        <div class="flex flex-col items-center justify-center bg-ios-elevated rounded-xl px-2.5 py-2 min-w-[70px] text-center shrink-0">
          <span class="text-xs font-bold text-ios-blue">${escapeHtml(item.number)} пара</span>
          <span class="text-[11px] font-semibold text-white mt-1">${escapeHtml(item.startTime)}</span>
          <span class="text-[10px] text-ios-gray">${escapeHtml(item.endTime)}</span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getBadgeStyle(item.type)}">
              ${escapeHtml(item.type)}
            </span>
            <span class="text-xs text-ios-gray flex items-center gap-1">
              <i data-lucide="map-pin" class="w-3 h-3"></i>
              ${escapeHtml(item.room)}
            </span>
          </div>

          <h3 class="font-bold text-base leading-snug text-white break-words">
            ${escapeHtml(item.subject)}
          </h3>

          ${
            item.teacher
              ? `<p class="text-xs text-ios-gray mt-1 flex items-center gap-1.5">
                   <i data-lucide="user" class="w-3.5 h-3.5"></i>
                   <span>${escapeHtml(item.teacher)}</span>
                 </p>`
              : ""
          }
        </div>

        <div class="flex flex-col gap-1 shrink-0">
          <button data-edit-schedule="${item.id}" class="ios-press text-ios-gray hover:text-ios-blue p-1.5 rounded-lg" title="Изменить">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button data-ask-delete-schedule="${item.id}" class="ios-press text-ios-gray hover:text-ios-red p-1.5 rounded-lg" title="Удалить">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </article>
    `
    )
    .join("");

  refreshIcons();
}

function getBadgeStyle(type) {
  const t = String(type).toLowerCase();
  if (t.includes("дистант")) return "bg-ios-indigo/20 text-ios-indigo border-ios-indigo/40";
  if (t.includes("лаб")) return "bg-ios-orange/15 text-ios-orange border-ios-orange/30";
  if (t.includes("практ")) return "bg-ios-green/15 text-ios-green border-ios-green/30";
  return "bg-ios-blue/15 text-ios-blue border-ios-blue/30";
}

/* ==========================================================================
   9. ДОМАШНИЕ ЗАДАНИЯ И ЗАМЕТКИ
   ========================================================================== */
function renderTasks() {
  const container = document.getElementById("tasks-list");
  const activeTasks = state.tasks.filter((t) => !t.completed);
  const completedTasks = state.tasks.filter((t) => t.completed);

  document.getElementById("count-active-tasks").textContent = activeTasks.length;
  document.getElementById("count-completed-tasks").textContent = completedTasks.length;

  const badge = document.getElementById("nav-badge-tasks");
  badge.textContent = activeTasks.length;
  badge.classList.toggle("hidden", activeTasks.length === 0);

  const list = state.taskFilter === "active" ? activeTasks : completedTasks;
  list.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  if (list.length === 0) {
    container.innerHTML = `
      <div class="bg-ios-card rounded-2xl p-8 text-center border border-white/5">
        <p class="font-semibold text-base">${
          state.taskFilter === "active" ? "Нет активных заданий" : "Нет выполненных заданий"
        }</p>
        <p class="text-xs text-ios-gray mt-1">Нажми «+» в правом верхнем углу, чтобы добавить дедлайн.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list
    .map((task) => {
      const d = new Date(task.deadline);
      const overdue = !task.completed && d < new Date();
      const dateLabel = isNaN(d)
        ? task.deadline
        : d.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          });

      return `
        <article class="bg-ios-card rounded-2xl p-4 border border-white/5 flex items-start gap-3.5">
          <button data-toggle-task="${task.id}" class="ios-press mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
            task.completed
              ? "bg-ios-green border-ios-green text-black"
              : "border-ios-gray"
          }">
            ${task.completed ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ""}
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-semibold text-ios-blue truncate">${escapeHtml(task.subject)}</span>
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-md ${
                overdue ? "bg-ios-red/20 text-ios-red" : "bg-ios-elevated text-ios-gray"
              }">${escapeHtml(dateLabel)}</span>
            </div>
            <p class="text-sm text-white break-words ${task.completed ? "line-through text-ios-gray" : ""}">
              ${escapeHtml(task.text)}
            </p>
          </div>
          <button data-delete-task="${task.id}" class="ios-press text-ios-gray hover:text-ios-red p-1">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </article>
      `;
    })
    .join("");
  refreshIcons();
}

function renderNotes() {
  const container = document.getElementById("notes-list");
  if (state.notes.length === 0) {
    container.innerHTML = `
      <div class="bg-ios-card rounded-2xl p-8 text-center border border-white/5">
        <p class="font-semibold text-base">Заметок пока нет</p>
        <p class="text-xs text-ios-gray mt-1">Нажми «+», чтобы создать карточку заметки к нужному предмету.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.notes
    .map(
      (note) => `
      <article class="bg-ios-card rounded-2xl p-4 border border-white/5 space-y-2.5">
        <div class="flex items-center justify-between gap-2 ios-hairline-b pb-2">
          <h3 class="font-bold text-sm text-white truncate">${escapeHtml(note.subject)}</h3>
          <button data-delete-note="${note.id}" class="ios-press text-ios-gray hover:text-ios-red p-1">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
        <textarea data-note-input="${note.id}" rows="4" placeholder="Пиши заметку здесь..." class="w-full bg-ios-elevated/60 rounded-xl p-3 text-white placeholder-ios-gray outline-none focus:ring-1 focus:ring-ios-blue resize-y">${escapeHtml(note.content || "")}</textarea>
      </article>
    `
    )
    .join("");
  refreshIcons();
}

function updateSubjectsDatalist() {
  const dl = document.getElementById("subjects-datalist");
  if (!dl) return;
  const subjects = [...new Set(state.schedule.map((s) => s.subject))];
  dl.innerHTML = subjects
    .map((s) => `<option value="${escapeHtml(s)}"></option>`)
    .join("");
}

/* ==========================================================================
   10. ОБРАБОТЧИКИ КНОПОК И ФОРМ
   ========================================================================== */
function setScopeMode(scope) {
  state.addScope = scope;
  document.querySelectorAll(".scope-btn").forEach((btn) => {
    const active = btn.dataset.scope === scope;
    btn.className = `scope-btn py-1.5 rounded-lg text-xs font-semibold transition-all ${
      active ? "bg-ios-blue text-white" : "text-ios-gray"
    }`;
  });
  document.getElementById("scope-box-date").classList.toggle("hidden", scope !== "date");
  document.getElementById("scope-box-week").classList.toggle("hidden", scope !== "week");
  document.getElementById("scope-box-semester").classList.toggle("hidden", scope !== "semester");
}

function initUIListeners() {
  // Навигация по неделям
  document.getElementById("btn-prev-week").addEventListener("click", () => {
    const d = parseDateISO(state.selectedDate);
    d.setDate(d.getDate() - 7);
    state.selectedDate = formatDateISO(d);
    renderScheduleSection();
  });

  document.getElementById("btn-next-week").addEventListener("click", () => {
    const d = parseDateISO(state.selectedDate);
    d.setDate(d.getDate() + 7);
    state.selectedDate = formatDateISO(d);
    renderScheduleSection();
  });

  document.getElementById("btn-today").addEventListener("click", () => {
    state.selectedDate = getInitialStudyDate();
    renderScheduleSection();
  });

  document.getElementById("date-jump-picker").addEventListener("change", (e) => {
    if (e.target.value) {
      state.selectedDate = e.target.value;
      renderScheduleSection();
    }
  });

  // Клик по дню недели (ПН - СБ)
  document.getElementById("day-selector").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-select-date]");
    if (btn) {
      state.selectedDate = btn.dataset.selectDate;
      renderScheduleSection();
    }
  });

  // Переключение режимов добавления (На дату / На неделю / На семестр)
  document.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => setScopeMode(btn.dataset.scope));
  });

  // Автоподстановка времени звонков при выборе номера пары
  document.getElementById("sched-number").addEventListener("change", (e) => {
    const bell = BELL_SCHEDULE[e.target.value];
    if (bell) {
      document.getElementById("sched-start").value = bell.start;
      document.getElementById("sched-end").value = bell.end;
    }
  });

  // Кнопка "+" в шапке
  document.getElementById("btn-header-add").addEventListener("click", () => {
    if (state.activeTab === "schedule") {
      document.getElementById("form-schedule").reset();
      document.getElementById("sched-edit-id").value = "";
      document.getElementById("modal-schedule-title").textContent = "Добавить пару";
      document.getElementById("scope-selector-wrapper").classList.remove("hidden");
      document.getElementById("sched-date").value = state.selectedDate;

      const dayOfWeek = parseDateISO(state.selectedDate).getDay() || 1;
      document.getElementById("sched-sem-day").value = String(dayOfWeek);
      document.querySelectorAll(".week-day-cb").forEach((cb) => {
        cb.checked = Number(cb.value) === dayOfWeek;
      });

      setScopeMode("date");
      openModal("modal-schedule");
    } else if (state.activeTab === "tasks") {
      const tomorrow = new Date(Date.now() + 86400000);
      tomorrow.setHours(9, 0, 0, 0);
      const tzOffset = tomorrow.getTimezoneOffset() * 60000;
      document.getElementById("task-deadline").value = new Date(tomorrow - tzOffset)
        .toISOString()
        .slice(0, 16);
      openModal("modal-task");
    } else {
      openModal("modal-note");
    }
  });

  // Кнопка настроек расписания (Импорт / Сброс)
  document.getElementById("btn-tools").addEventListener("click", () => {
    openModal("modal-tools");
  });

  document.getElementById("btn-restore-default").addEventListener("click", async () => {
    const def = buildDefaultSchedule();
    state.schedule = def;
    saveLocalData();
    if (state.user && db) {
      await uploadBatchScheduleToCloud(def);
    }
    renderScheduleSection();
    updateSubjectsDatalist();
    closeModal("modal-tools");
  });

  document.getElementById("ics-file-input").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseICSFile(text);
    if (imported.length === 0) {
      alert("Не удалось найти пары в файле .ics");
      return;
    }
    await saveScheduleItems(imported);
    e.target.value = "";
    closeModal("modal-tools");
  });

  // Сохранение пары (На дату / На неделю / На весь семестр / Редактирование)
  document.getElementById("form-schedule").addEventListener("submit", async (e) => {
    e.preventDefault();
    const editId = document.getElementById("sched-edit-id").value;
    const number = Number(document.getElementById("sched-number").value);
    const startTime = document.getElementById("sched-start").value;
    const endTime = document.getElementById("sched-end").value;
    const subject = document.getElementById("sched-subject").value.trim();
    const type = document.getElementById("sched-type").value;
    const room = document.getElementById("sched-room").value.trim();
    const teacher = document.getElementById("sched-teacher").value.trim();

    const targetDates = [];

    if (editId) {
      // Редактирование конкретной пары
      const singleDate = document.getElementById("sched-date").value;
      await saveScheduleItems([
        { id: editId, date: singleDate, number, startTime, endTime, subject, type, room, teacher }
      ]);
      closeModal("modal-schedule");
      return;
    }

    if (state.addScope === "date") {
      targetDates.push(document.getElementById("sched-date").value);
    } else if (state.addScope === "week") {
      const monday = getMondayOfDate(state.selectedDate);
      const checkedDays = [...document.querySelectorAll(".week-day-cb:checked")].map((cb) =>
        Number(cb.value)
      );
      for (const dayIdx of checkedDays) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + (dayIdx - 1));
        targetDates.push(formatDateISO(d));
      }
    } else if (state.addScope === "semester") {
      const targetDow = Number(document.getElementById("sched-sem-day").value); // 1..6
      const parity = document.getElementById("sched-sem-parity").value; // 'all' | 'odd' | 'even'
      const fromDate = parseDateISO(document.getElementById("sched-sem-from").value);
      const toDate = parseDateISO(document.getElementById("sched-sem-to").value);

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

  // Удаление пары (только в этот день ИЛИ во всем семестре)
  document.getElementById("btn-del-single").addEventListener("click", async () => {
    if (!state.pendingDeleteItem) return;
    await removeScheduleItemsByIds([state.pendingDeleteItem.id]);
    closeModal("modal-delete-schedule");
  });

  document.getElementById("btn-del-series").addEventListener("click", async () => {
    const target = state.pendingDeleteItem;
    if (!target) return;
    const targetDow = parseDateISO(target.date).getDay();
    const matchingIds = state.schedule
      .filter(
        (s) =>
          s.subject === target.subject &&
          Number(s.number) === Number(target.number) &&
          parseDateISO(s.date).getDay() === targetDow
      )
      .map((s) => s.id);
    await removeScheduleItemsByIds(matchingIds);
    closeModal("modal-delete-schedule");
  });

  // Добавление ДЗ
  document.getElementById("form-task").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newTask = {
      id: `task_${Date.now()}`,
      subject: document.getElementById("task-subject").value.trim(),
      text: document.getElementById("task-text").value.trim(),
      deadline: document.getElementById("task-deadline").value,
      completed: false
    };
    if (state.user && db) {
      await setDoc(doc(db, "users", state.user.uid, "tasks", newTask.id), newTask);
    } else {
      state.tasks.push(newTask);
      saveLocalData();
      renderTasks();
    }
    e.target.reset();
    closeModal("modal-task");
  });

  // Добавление заметки
  document.getElementById("form-note").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newNote = {
      id: `note_${Date.now()}`,
      subject: document.getElementById("note-subject").value.trim(),
      content: document.getElementById("note-content").value
    };
    if (state.user && db) {
      await setDoc(doc(db, "users", state.user.uid, "notes", newNote.id), newNote);
    } else {
      state.notes.unshift(newNote);
      saveLocalData();
      renderNotes();
    }
    e.target.reset();
    closeModal("modal-note");
  });

  // Вход / Выход Google
  document.getElementById("btn-login").addEventListener("click", async () => {
    if (!isFirebaseConfigured) {
      alert(
        "Чтобы включить синхронизацию между устройствами через Google, вставь свои ключи firebaseConfig в начале файла app.js (см. Шаг 3 в инструкции)."
      );
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      await signInWithRedirect(auth, googleProvider);
    }
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    if (auth) signOut(auth);
  });

  // Переключение вкладок внизу
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      const titles = {
        schedule: "Расписание",
        tasks: "Домашние задания",
        notes: "Заметки"
      };
      document.getElementById("header-title").textContent = titles[state.activeTab];
      document.getElementById("view-schedule").classList.toggle("hidden", state.activeTab !== "schedule");
      document.getElementById("view-tasks").classList.toggle("hidden", state.activeTab !== "tasks");
      document.getElementById("view-notes").classList.toggle("hidden", state.activeTab !== "notes");

      document.querySelectorAll(".nav-tab").forEach((b) => {
        const active = b.dataset.tab === state.activeTab;
        b.classList.toggle("text-ios-blue", active);
        b.classList.toggle("text-ios-gray", !active);
      });
    });
  });

  // Переключение фильтра ДЗ
  document.querySelectorAll(".task-filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.status;
      document.querySelectorAll(".task-filter-tab").forEach((b) => {
        const active = b.dataset.status === state.taskFilter;
        b.className = `task-filter-tab ios-press py-1.5 rounded-lg text-xs font-semibold transition-all ${
          active ? "bg-ios-elevated text-white shadow" : "text-ios-gray"
        }`;
      });
      renderTasks();
    });
  });

  // Закрытие модалок
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  // Глобальное делегирование кликов по карточкам
  document.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-schedule]");
    if (editBtn) {
      const item = state.schedule.find((s) => s.id === editBtn.dataset.editSchedule);
      if (!item) return;
      document.getElementById("sched-edit-id").value = item.id;
      document.getElementById("modal-schedule-title").textContent = "Изменить пару";
      document.getElementById("scope-selector-wrapper").classList.add("hidden");
      setScopeMode("date");
      document.getElementById("sched-date").value = item.date;
      document.getElementById("sched-number").value = String(item.number);
      document.getElementById("sched-start").value = item.startTime;
      document.getElementById("sched-end").value = item.endTime;
      document.getElementById("sched-subject").value = item.subject;
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
      document.getElementById("delete-sched-info").textContent = `${item.number} пара • ${item.subject} (${item.date})`;
      openModal("modal-delete-schedule");
      return;
    }

    const toggleTaskBtn = e.target.closest("[data-toggle-task]");
    if (toggleTaskBtn) {
      const id = toggleTaskBtn.dataset.toggleTask;
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      task.completed = !task.completed;
      if (state.user && db) {
        await updateDoc(doc(db, "users", state.user.uid, "tasks", id), {
          completed: task.completed
        });
      } else {
        saveLocalData();
        renderTasks();
      }
      return;
    }

    const delTaskBtn = e.target.closest("[data-delete-task]");
    if (delTaskBtn) {
      const id = delTaskBtn.dataset.deleteTask;
      if (state.user && db) {
        await deleteDoc(doc(db, "users", state.user.uid, "tasks", id));
      } else {
        state.tasks = state.tasks.filter((t) => t.id !== id);
        saveLocalData();
        renderTasks();
      }
      return;
    }

    const delNoteBtn = e.target.closest("[data-delete-note]");
    if (delNoteBtn) {
      const id = delNoteBtn.dataset.deleteNote;
      if (state.user && db) {
        await deleteDoc(doc(db, "users", state.user.uid, "notes", id));
      } else {
        state.notes = state.notes.filter((n) => n.id !== id);
        saveLocalData();
        renderNotes();
      }
    }
  });

  // Автосохранение заметок при печати
  document.addEventListener("input", (e) => {
    const area = e.target.closest("[data-note-input]");
    if (!area) return;
    const noteId = area.dataset.noteInput;
    const statusEl = document.getElementById("note-save-status");
    statusEl.textContent = "Печатает...";
    statusEl.className = "text-xs font-medium text-ios-orange";

    clearTimeout(state.noteDebounceTimers[noteId]);
    state.noteDebounceTimers[noteId] = setTimeout(async () => {
      const note = state.notes.find((n) => n.id === noteId);
      if (note) note.content = area.value;
      saveLocalData();
      if (state.user && db) {
        await setDoc(
          doc(db, "users", state.user.uid, "notes", noteId),
          { content: area.value },
          { merge: true }
        );
      }
      statusEl.textContent = "Сохранено";
      statusEl.className = "text-xs font-medium text-ios-green";
    }, 500);
  });
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

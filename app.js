// ============================================================================
// 1. КОНФИГУРАЦИЯ FIREBASE (НЕБЛОКИРУЮЩАЯ ФОНОВАЯ ЗАГРУЗКА КАК В ДНЕВНИКЕ)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBkJMhoEC18iK_khQA_ax03TvEobKHa5WY",
  authDomain: "solo-fpi-bank.firebaseapp.com",
  projectId: "solo-fpi-bank",
  storageBucket: "solo-fpi-bank.firebasestorage.app",
  messagingSenderId: "60894842735",
  appId: "1:60894842735:web:5d2f6755834e7e6136e29a"
};

const FIREBASE_VERSION = "10.13.1";
const STORAGE_KEY = "solo_fpi_state_v1";
const PLANNER_KEY = "solo_fpi_planner_v2";
const QP_KEY = "solo_fpi_quick_payments_v1";
const GROUP_ID = "solo_fpi_v1";

let db = null;
let collection, doc, setDoc, deleteDoc, onSnapshot;

async function initFirebaseInBackground() {
  try {
    setSyncDot("busy");
    const [appMod, fsMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
    ]);
    collection = fsMod.collection;
    doc = fsMod.doc;
    setDoc = fsMod.setDoc;
    deleteDoc = fsMod.deleteDoc;
    onSnapshot = fsMod.onSnapshot;

    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
    db = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({
        tabManager: fsMod.persistentMultipleTabManager()
      })
    });

    setSyncDot("online");
    const lbl = document.getElementById("sync-status-label");
    if (lbl) lbl.textContent = "Синхронизировано";

    onSnapshot(collection(db, "groups", GROUP_ID, "cards"), (snap) => {
      if (!snap.empty) {
        state.cards = normalizeCards(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
        writeLocal();
        renderAll();
      } else {
        state.cards.forEach((c) => syncCardToCloud(c));
      }
      setSyncDot("online");
    });

    onSnapshot(collection(db, "groups", GROUP_ID, "expenses"), (snap) => {
      state.expenses = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      writeLocal();
      renderAll();
      setSyncDot("online");
    });

    onSnapshot(doc(db, "groups", GROUP_ID, "meta", "quick_payments"), (snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.items)) {
        state.quickPayments = snap.data().items;
        saveQuickPaymentsLocal();
        renderQuickPayments();
      }
    });
  } catch (err) {
    console.warn("Firebase background init warning:", err);
    setSyncDot("offline");
  }
}

// ============================================================================
// 2. ФИЗИЧЕСКИЙ ДВИЖОК ПРУЖИН И ЖЕСТОВ (1-В-1 ИЗ ДНЕВНИКА)
// ============================================================================
const SPRING_SHEET  = { stiffness: 380, damping: 38, mass: 1 };
const SPRING_SNAPPY = { stiffness: 540, damping: 34, mass: 1 };
const SPRING_PAGE   = { stiffness: 420, damping: 41, mass: 1 };

const SWIPE_CONFIG = {
  DECELERATION_RATE: 0.998,
  RUBBER_CONSTANT: 0.55,
  SHEET_DISMISS_RATIO: 0.38,
  SHEET_VELOCITY_THRESHOLD: 520,
  EDGE_TAB_ZONE_PX: 28
};

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
function isReducedMotion() {
  return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
}

function rubberBand(offset, dimension, constant = SWIPE_CONFIG.RUBBER_CONSTANT) {
  if (dimension <= 0 || offset === 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const abs = Math.abs(offset);
  return sign * (1 - 1 / ((abs * constant) / dimension + 1)) * dimension;
}

function projectPosition(position, velocity, rate = SWIPE_CONFIG.DECELERATION_RATE) {
  return position + (velocity / 1000) * (rate / (1 - rate));
}

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
    return { stop() {}, getCurrent: () => ({ pos: to, vel: 0 }) };
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
      if (activeSpringsMap.get(key) === ctrl) activeSpringsMap.delete(key);
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
// 3. КАТЕГОРИИ, КАРТЫ И СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================================
const CATEGORIES = {
  food:      { label: "Еда",         icon: "utensils",       color: "#a855f7" },
  groceries: { label: "Продукты",    icon: "shopping-cart",  color: "#30D158" },
  cafe:      { label: "Кафе",        icon: "coffee",         color: "#FF9F0A" },
  transport: { label: "Транспорт",   icon: "bus",            color: "#0A84FF" },
  shopping:  { label: "Покупки",     icon: "shopping-bag",   color: "#FF375F" },
  home:      { label: "Дом",         icon: "home",           color: "#6E5CE6" },
  subs:      { label: "Подписки",    icon: "sparkles",       color: "#2dd4bf" },
  fun:       { label: "Развлечения", icon: "gamepad-2",      color: "#facc15" },
  health:    { label: "Аптека",      icon: "heart-pulse",    color: "#fb7185" },
  beauty:    { label: "Уход",        icon: "wand-sparkles",  color: "#e879f9" },
  transfer:  { label: "Переводы",    icon: "arrow-left-right", color: "#94a3b8" },
  other:     { label: "Другое",      icon: "ellipsis",       color: "#64748b" }
};

function getDefaultPlanner() {
  try {
    const s = JSON.parse(localStorage.getItem(PLANNER_KEY) || "{}");
    return {
      busPrice: Number.isFinite(Number(s.busPrice)) ? Number(s.busPrice) : 42,
      homeTicketPrice: Number.isFinite(Number(s.homeTicketPrice)) ? Number(s.homeTicketPrice) : 175,
      creditLimit: Number.isFinite(Number(s.creditLimit)) && Number(s.creditLimit) > 0 ? Number(s.creditLimit) : 10000,
      autoResetCredit: s.autoResetCredit !== false,
      lastResetMonth: String(s.lastResetMonth || "")
    };
  } catch (_) {
    return { busPrice: 42, homeTicketPrice: 175, creditLimit: 10000, autoResetCredit: true, lastResetMonth: "" };
  }
}

function getDefaultQuickPayments(planner) {
  const bus = planner?.busPrice ?? 42;
  const home = planner?.homeTicketPrice ?? 175;
  return [
    { id: "qp_bus",  title: "Автобус до вокзала", amount: bus,        category: "transport", cardId: "card_1", type: "expense", isCommute: true, systemKey: "bus" },
    { id: "qp_home", title: "Билет домой",        amount: home,       category: "home",      cardId: "card_1", type: "expense", isCommute: true, systemKey: "home" },
    { id: "qp_both", title: "Дорога комбо",       amount: bus + home, category: "transport", cardId: "card_1", type: "expense", isCommute: true, systemKey: "both" }
  ];
}

function readQuickPayments(planner) {
  try {
    const raw = JSON.parse(localStorage.getItem(QP_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw;
  } catch (_) {}
  return getDefaultQuickPayments(planner);
}

function getDefaultCards() {
  return [
    { id: "card_1", slot: 0, name: "Кредитка ФПИ", bank: "ФПИ БАНК", digits: "2004", balance: 10000, skin: "fpi-obsidian", updatedAt: 0 },
    { id: "card_2", slot: 1, name: "Повседневная", bank: "ФПИ BLACK", digits: "7741", balance: 0,     skin: "titanium-dark", updatedAt: 0 },
    { id: "card_3", slot: 2, name: "Накопительная", bank: "ФПИ ПРАЙМ", digits: "9012", balance: 0,    skin: "pacific-blue", updatedAt: 0 }
  ];
}

function localISODate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

const initPlanner = getDefaultPlanner();

const state = {
  cards: getDefaultCards(),
  expenses: [],
  planner: initPlanner,
  quickPayments: readQuickPayments(initPlanner),
  qpEditMode: false,
  activeTab: "home",
  cardOrder: [0, 1, 2],
  isAnimatingDeck: false,
  filterCardId: "all",
  analyticsCardId: "all",
  periodMode: "month",
  analyticsMonth: localISODate().slice(0, 7),
  selectedAnalyticsCategory: null,
  selectedCalendarDate: localISODate(),
  editingCardSlot: 0,
  editingCardSkin: "fpi-obsidian",
  txType: "expense",
  txCardId: "card_1",
  txCategory: "food",
  txIsCommute: false,
  qpFormType: "expense",
  qpFormCardId: "card_1",
  qpFormCategory: "cafe",
  qpFormIsCommute: false,
  animateNextCascade: true
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function roundMoney(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
function money(v) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(v) || 0) + " ₽"; }
function compactMoney(v) {
  const n = Math.abs(Number(v) || 0);
  if (!n) return "";
  if (n >= 10000) return `${Math.round(n / 1000)}к`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}к`;
  return `${Math.round(n)}`;
}
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function dateLabel(iso) {
  if (!iso) return "";
  const today = localISODate();
  const yesterday = localISODate(new Date(Date.now() - 86400000));
  if (iso === today) return "Сегодня";
  if (iso === yesterday) return "Вчера";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
function shortDate(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

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

function setSyncDot(mode) {
  const dot = $("#sync-dot");
  if (!dot) return;
  if (mode === "online") dot.className = "w-2 h-2 rounded-full bg-ios-green shrink-0";
  else if (mode === "busy") dot.className = "w-2 h-2 rounded-full bg-ios-accent animate-pulse shrink-0";
  else dot.className = "w-2 h-2 rounded-full bg-ios-orange shrink-0";
}

/* Внутриэкранный iOS-тост (в стиле дневника + кнопка «Отменить») */
function showInAppToast(title, body, undoCallback = null) {
  let container = document.getElementById("ios-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "ios-toast-container";
    container.className = "fixed top-4 inset-x-4 z-[100] max-w-md mx-auto space-y-2 pointer-events-none";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "ios-tabbar-shell rounded-2xl p-3.5 shadow-2xl pointer-events-auto flex items-center justify-between gap-3 transition-all";
  toast.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-8 h-8 rounded-full ios-accent-btn flex items-center justify-center shrink-0">
        <i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i>
      </div>
      <div class="min-w-0">
        <p class="text-[13px] font-semibold text-primary-adaptive truncate">${escapeHtml(title)}</p>
        ${body ? `<p class="text-[12px] text-secondary-adaptive truncate">${escapeHtml(body)}</p>` : ""}
      </div>
    </div>
    ${undoCallback ? `<button type="button" class="toast-undo-btn ios-press px-3 py-1.5 rounded-full ios-accent-soft-btn text-[12px] font-semibold shrink-0">Отменить</button>` : ""}
  `;
  container.appendChild(toast);
  refreshIcons();

  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translate3d(0, -10px, 0)";
    setTimeout(() => toast.remove(), 250);
  };

  if (undoCallback) {
    toast.querySelector(".toast-undo-btn")?.addEventListener("click", async () => {
      dismiss();
      await undoCallback();
    });
  }

  setTimeout(dismiss, undoCallback ? 4500 : 2800);
}

/* ================= ЛОКАЛЬНОЕ ХРАНИЛИЩЕ ================= */

function mapLegacySkin(skin) {
  const valid = ["fpi-obsidian", "titanium-dark", "pacific-blue", "alpine-green", "natural-titanium", "crimson-noir"];
  if (valid.includes(skin)) return skin;
  if (skin === "fpi-purple" || skin === "cyber") return "fpi-obsidian";
  if (skin === "emerald") return "alpine-green";
  if (skin === "ruby") return "crimson-noir";
  if (skin === "gold") return "natural-titanium";
  if (skin === "holo" || skin === "liquid-glass") return "pacific-blue";
  return "titanium-dark";
}

function normalizeCards(raw) {
  const defs = getDefaultCards();
  if (!Array.isArray(raw) || !raw.length) return defs;
  return defs.map((def, idx) => {
    const f = raw.find((c) => c && (c.id === def.id || Number(c.slot) === idx)) || {};
    return {
      id: def.id,
      slot: idx,
      name: String(f.name || def.name).slice(0, 28),
      bank: String(f.bank || def.bank).slice(0, 20),
      digits: String(f.digits || def.digits).replace(/\D/g, "").slice(-4) || def.digits,
      balance: Number.isFinite(Number(f.balance)) ? roundMoney(Number(f.balance)) : def.balance,
      skin: mapLegacySkin(f.skin || def.skin),
      updatedAt: Number(f.updatedAt) || 0
    };
  });
}

function readLocal() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.cards = normalizeCards(p.cards);
    state.expenses = Array.isArray(p.expenses) ? p.expenses : [];
  } catch (_) {
    state.cards = getDefaultCards();
    state.expenses = [];
  }
}

function writeLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: state.cards, expenses: state.expenses })); } catch (_) {}
}

function savePlanner() {
  try { localStorage.setItem(PLANNER_KEY, JSON.stringify(state.planner)); } catch (_) {}
}

function saveQuickPaymentsLocal() {
  try { localStorage.setItem(QP_KEY, JSON.stringify(state.quickPayments)); } catch (_) {}
}

function compressImageFile(file, maxWidth = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ================= СТОПКА КАРТ С ПРУЖИННЫМ ПЕРЕЛИСТЫВАНИЕМ ================= */

function buildCardDeckOnce() {
  const deck = $("#card-deck");
  if (!deck) return;

  deck.innerHTML = [0, 1, 2].map((slot) => `
    <article class="bank-card" data-slot="${slot}" data-pos="${slot}" data-skin="fpi-obsidian">
      <svg class="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 340 214" preserveAspectRatio="none" aria-hidden="true">
        <path d="M95 214 C140 135, 225 90, 340 24 L340 214 Z" fill="rgba(255,255,255,0.06)"/>
        <path d="M185 0 C225 58, 285 95, 340 112 L340 0 Z" fill="rgba(255,255,255,0.07)"/>
      </svg>
      <div class="relative z-10 flex items-center justify-between">
        <span class="card-bank-name text-[13.5px] font-bold tracking-wider uppercase opacity-90"></span>
        <button type="button" data-edit-card="${slot}" class="ios-press w-7 h-7 rounded-full bg-white/10 flex items-center justify-center opacity-80 hover:opacity-100" aria-label="Настроить карту">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <div class="relative z-10 flex items-center gap-3 my-1">
        <div class="emv-chip"></div>
        <i data-lucide="wifi" class="w-5 h-5 rotate-90 opacity-75"></i>
      </div>
      <div class="relative z-10 flex items-end justify-between gap-2">
        <div class="min-w-0">
          <div class="card-name-sub text-[11px] font-medium opacity-70 mb-0.5 truncate"></div>
          <div class="card-balance text-[32px] font-extrabold tracking-tight leading-none tabular-nums whitespace-nowrap"></div>
        </div>
        <div class="card-digits text-[13.5px] font-semibold tracking-widest opacity-80 tabular-nums whitespace-nowrap mb-1"></div>
      </div>
    </article>
  `).join("");
  refreshIcons();
}

function updateCardDeckContent() {
  const deck = $("#card-deck");
  if (!deck) return;
  if (!deck.children.length) buildCardDeckOnce();

  state.cards.forEach((card, slot) => {
    const el = deck.querySelector(`.bank-card[data-slot="${slot}"]`);
    if (!el) return;
    el.dataset.skin = card.skin;
    el.querySelector(".card-bank-name").textContent = card.bank || "ФПИ БАНК";
    el.querySelector(".card-name-sub").textContent = card.name;
    el.querySelector(".card-balance").textContent = money(card.balance);
    el.querySelector(".card-digits").textContent = `•••• ${card.digits || "2004"}`;

    const anPill = $(`#an-pill-${slot}`);
    if (anPill) anPill.textContent = card.name;
    const txBtn = $(`#expense-card-selector [data-select-card="${card.id}"]`);
    if (txBtn) txBtn.textContent = card.name;
    const qpBtn = $(`#qp-card-selector [data-qp-card="${card.id}"]`);
    if (qpBtn) qpBtn.textContent = card.name;
  });

  if (!state.isAnimatingDeck) syncDeckPositions();
}

function syncDeckPositions() {
  const deck = $("#card-deck");
  if (!deck) return;
  state.cardOrder.forEach((slot, pos) => {
    const el = deck.querySelector(`.bank-card[data-slot="${slot}"]`);
    if (!el) return;
    el.dataset.pos = String(pos);
    el.style.transform = "";
    el.style.opacity = "";
    el.style.filter = "";
    el.style.zIndex = "";
  });
}

function flipDeckNext(startX = 0, velocityX = 0) {
  if (state.isAnimatingDeck) return;
  const deck = $("#card-deck");
  if (!deck) return;
  state.isAnimatingDeck = true;

  const [frontSlot, midSlot, backSlot] = state.cardOrder;
  const frontEl = deck.querySelector(`.bank-card[data-slot="${frontSlot}"]`);
  const midEl   = deck.querySelector(`.bank-card[data-slot="${midSlot}"]`);
  const backEl  = deck.querySelector(`.bank-card[data-slot="${backSlot}"]`);
  const width   = deck.clientWidth || 340;

  frontEl.style.zIndex = "35";
  midEl.style.zIndex   = "30";
  backEl.style.zIndex  = "20";

  animateTrackedSpring(
    "deck_flip",
    startX,
    -width * 1.05,
    { ...SPRING_PAGE, velocity: velocityX },
    (x) => {
      const p = Math.min(1, Math.abs(x) / width);
      frontEl.style.transform = `translate3d(${x}px, ${-p * 8}px, 0) rotate(${-p * 6}deg) scale(${1 - p * 0.06})`;
      midEl.style.transform   = `translate3d(${13 * (1 - p)}px, 0, 0) scale(${0.935 + 0.065 * p})`;
      midEl.style.opacity     = String(0.86 + 0.14 * p);
      midEl.style.filter      = `brightness(${0.76 + 0.24 * p})`;
      backEl.style.transform  = `translate3d(${24 - 11 * p}px, 0, 0) scale(${0.87 + 0.065 * p})`;
      backEl.style.opacity    = String(0.56 + 0.30 * p);
    },
    () => {
      state.cardOrder = [midSlot, backSlot, frontSlot];
      frontEl.style.zIndex = "5";
      animateTrackedSpring(
        "deck_tuck",
        -width * 0.65,
        24,
        SPRING_SHEET,
        (tx) => {
          const tp = Math.min(1, Math.max(0, (tx + width * 0.65) / (width * 0.65 + 24)));
          frontEl.style.transform = `translate3d(${tx}px, 0, 0) rotate(${(1 - tp) * -3}deg) scale(${0.87})`;
          frontEl.style.opacity   = String(0.56);
          frontEl.style.filter    = `brightness(0.55)`;
        },
        () => {
          syncDeckPositions();
          state.isAnimatingDeck = false;
        }
      );
    }
  );
}

function flipDeckPrev(velocityX = 0) {
  if (state.isAnimatingDeck) return;
  const deck = $("#card-deck");
  if (!deck) return;
  state.isAnimatingDeck = true;

  const [frontSlot, midSlot, backSlot] = state.cardOrder;
  const frontEl = deck.querySelector(`.bank-card[data-slot="${frontSlot}"]`);
  const midEl   = deck.querySelector(`.bank-card[data-slot="${midSlot}"]`);
  const backEl  = deck.querySelector(`.bank-card[data-slot="${backSlot}"]`);
  const width   = deck.clientWidth || 340;

  backEl.style.zIndex  = "8";
  frontEl.style.zIndex = "20";
  midEl.style.zIndex   = "10";

  animateTrackedSpring(
    "deck_prev_out",
    24,
    -width * 0.96,
    { ...SPRING_PAGE, velocity: -Math.abs(velocityX) },
    (x) => {
      const p = Math.min(1, Math.abs(x - 24) / width);
      backEl.style.transform  = `translate3d(${x}px, ${-p * 8}px, 0) rotate(${-p * 5}deg) scale(${0.87 + 0.06 * p})`;
      backEl.style.opacity    = String(0.56 + 0.44 * p);
      backEl.style.filter     = `brightness(${0.55 + 0.45 * p})`;
      frontEl.style.transform = `translate3d(${13 * p}px, 0, 0) scale(${1 - 0.065 * p})`;
      frontEl.style.opacity   = String(1 - 0.14 * p);
      frontEl.style.filter    = `brightness(${1 - 0.24 * p})`;
      midEl.style.transform   = `translate3d(${13 + 11 * p}px, 0, 0) scale(${0.935 - 0.065 * p})`;
      midEl.style.opacity     = String(0.86 - 0.30 * p);
    },
    () => {
      state.cardOrder = [backSlot, frontSlot, midSlot];
      backEl.style.zIndex = "35";
      animateTrackedSpring(
        "deck_prev_land",
        -width * 0.96,
        0,
        SPRING_SHEET,
        (lx) => {
          const lp = Math.min(1, Math.max(0, 1 - Math.abs(lx) / width));
          backEl.style.transform = `translate3d(${lx}px, 0, 0) rotate(${(1 - lp) * -4}deg) scale(${0.93 + 0.07 * lp})`;
        },
        () => {
          syncDeckPositions();
          state.isAnimatingDeck = false;
        }
      );
    }
  );
}

function initDeckGestures() {
  const deck = $("#card-deck");
  if (!deck) return;

  const vTracker = createVelocityTracker();
  let startX = 0, startY = 0, dx = 0;
  let tracking = false, lockedHorizontal = false;
  let frontEl = null, midEl = null, backEl = null;

  deck.addEventListener("pointerdown", (e) => {
    if (state.isAnimatingDeck || e.target.closest("[data-edit-card]")) return;
    const card = e.target.closest(".bank-card");
    if (!card) return;
    if (card.dataset.pos !== "0") {
      flipDeckNext();
      return;
    }

    tracking = true;
    lockedHorizontal = false;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    vTracker.reset();
    vTracker.add(e.clientX, e.clientY);

    const [f, m, b] = state.cardOrder;
    frontEl = deck.querySelector(`.bank-card[data-slot="${f}"]`);
    midEl   = deck.querySelector(`.bank-card[data-slot="${m}"]`);
    backEl  = deck.querySelector(`.bank-card[data-slot="${b}"]`);
  });

  deck.addEventListener("pointermove", (e) => {
    if (!tracking || !frontEl) return;
    const mx = e.clientX - startX;
    const my = e.clientY - startY;

    if (!lockedHorizontal) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) {
        tracking = false;
        return;
      }
      lockedHorizontal = true;
      frontEl.setPointerCapture?.(e.pointerId);
    }

    vTracker.add(e.clientX, e.clientY);
    dx = mx;
    const width = deck.clientWidth || 340;
    const p = Math.min(1, Math.abs(dx) / width);

    if (dx < 0) {
      const rot = Math.max(-7, dx * 0.025);
      frontEl.style.transform = `translate3d(${dx}px, ${-p * 8}px, 0) rotate(${rot}deg) scale(${1 - p * 0.06})`;
      midEl.style.transform   = `translate3d(${13 * (1 - p)}px, 0, 0) scale(${0.935 + 0.065 * p})`;
      midEl.style.opacity     = String(0.86 + 0.14 * p);
      midEl.style.filter      = `brightness(${0.76 + 0.24 * p})`;
      backEl.style.transform  = `translate3d(${24 - 11 * p}px, 0, 0) scale(${0.87 + 0.065 * p})`;
    } else {
      const damped = rubberBand(dx, width * 0.45);
      frontEl.style.transform = `translate3d(${damped}px, 0, 0) rotate(${Math.min(4, damped * 0.03)}deg)`;
    }
  });

  const endDrag = () => {
    if (!tracking) return;
    tracking = false;
    if (!lockedHorizontal || !frontEl) return;

    const { vx } = vTracker.getVelocity();
    if (dx < -48 || vx < -380) {
      flipDeckNext(dx, vx);
    } else if (dx > 48 || vx > 380) {
      syncDeckPositions();
      flipDeckPrev(vx);
    } else {
      animateTrackedSpring(
        "deck_snapback",
        dx,
        0,
        { ...SPRING_SNAPPY, velocity: vx },
        (x) => {
          frontEl.style.transform = `translate3d(${x}px, 0, 0)`;
        },
        () => syncDeckPositions()
      );
    }
  };

  deck.addEventListener("pointerup", endDrag);
  deck.addEventListener("pointercancel", endDrag);

  deck.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit-card]");
    if (editBtn) {
      e.stopPropagation();
      openCardModal(Number(editBtn.dataset.editCard));
    }
  });
}

/* ================= ИСПРАВЛЕННЫЙ РАСЧЁТ ДНЕВНОГО ЛИМИТА ================= */

function isTxCommute(tx) {
  if (tx.isCommute === true) return true;
  if (tx.isCommute === false) return false;
  return /билет домой|билет на вокзал|до вокзала|автобус \+ билет|дорога комбо/i.test(String(tx.description || ""));
}

function calculateCreditMath() {
  const card = state.cards[0] || getDefaultCards()[0];
  const balance = roundMoney(Number(card.balance) || 0);
  const limit = roundMoney(Number(state.planner.creditLimit) || 10000);
  const busPrice = roundMoney(Number(state.planner.busPrice) || 42);
  const homePrice = roundMoney(Number(state.planner.homeTicketPrice) || 175);
  const dailyCommuteCost = roundMoney(busPrice + homePrice);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const todayISO = localISODate(now);

  const daysLeft = Math.max(1, lastDay - todayDate + 1);
  let futureWeekdays = 0;
  for (let d = todayDate + 1; d <= lastDay; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow >= 1 && dow <= 5) futureWeekdays++;
  }
  const todayDow = now.getDay();
  const isTodayWeekday = todayDow >= 1 && todayDow <= 5;
  const totalWeekdaysLeft = futureWeekdays + (isTodayWeekday ? 1 : 0);

  const todayTxs = state.expenses.filter(
    (tx) => tx.cardId === "card_1" && tx.type !== "income" && tx.date === todayISO
  );

  const todayTotalSpent = roundMoney(todayTxs.reduce((s, tx) => s + (Number(tx.amount) || 0), 0));
  const todayCommuteSpent = roundMoney(
    todayTxs.filter(isTxCommute).reduce((s, tx) => s + (Number(tx.amount) || 0), 0)
  );

  const todayCommuteCovered = isTodayWeekday ? Math.min(todayCommuteSpent, dailyCommuteCost) : 0;
  const todayNonCommuteSpent = roundMoney(todayTotalSpent - todayCommuteCovered);
  const todayRemainingCommute = isTodayWeekday ? roundMoney(Math.max(0, dailyCommuteCost - todayCommuteCovered)) : 0;

  const reservedForCommute = roundMoney(futureWeekdays * dailyCommuteCost + todayRemainingCommute);
  const freeBalance = roundMoney(Math.max(0, balance - reservedForCommute));

  const dailyFreeAllowance = roundMoney(Math.max(0, (freeBalance + todayNonCommuteSpent) / daysLeft));
  const todayFreeLeft = roundMoney(dailyFreeAllowance - todayNonCommuteSpent);

  const dailyFullAllowance = roundMoney(Math.max(0, (balance + todayTotalSpent) / daysLeft));
  const todayFullLeft = roundMoney(dailyFullAllowance - todayTotalSpent);

  const base = Math.max(limit, balance, 1);
  const spentPct = Math.min(100, Math.max(0, ((base - balance) / base) * 100));
  const reservedPct = Math.min(100 - spentPct, Math.max(0, (reservedForCommute / base) * 100));

  return {
    balance, limit, busPrice, homePrice, dailyCommuteCost,
    daysLeft, totalWeekdaysLeft, reservedForCommute, freeBalance,
    dailyFreeAllowance, todayFreeLeft, dailyFullAllowance, todayFullLeft,
    spentPct, reservedPct
  };
}

function renderCreditPlanner() {
  const info = calculateCreditMath();

  $("#home-daily-free").innerHTML = `${money(info.dailyFreeAllowance)} <span class="text-[13.5px] font-normal text-secondary-adaptive">/ день</span>`;
  $("#home-daily-full").textContent = money(info.dailyFullAllowance);

  $("#bar-spent").style.width = `${Math.max(info.spentPct, 4)}%`;
  $("#bar-reserved").style.width = `${info.reservedPct}%`;

  const detFree = $("#det-today-free");
  detFree.textContent = info.todayFreeLeft >= 0 ? money(info.todayFreeLeft) : `−${money(Math.abs(info.todayFreeLeft))}`;
  detFree.className = `font-semibold tabular-nums ${info.todayFreeLeft >= 0 ? "text-ios-green" : "text-ios-red"}`;

  const detFull = $("#det-today-full");
  detFull.textContent = info.todayFullLeft >= 0 ? money(info.todayFullLeft) : `−${money(Math.abs(info.todayFullLeft))}`;
  detFull.className = `font-semibold tabular-nums ${info.todayFullLeft >= 0 ? "text-primary-adaptive" : "text-ios-red"}`;

  $("#det-reserved").textContent = `${money(info.reservedForCommute)} (${info.totalWeekdaysLeft} будн.)`;
  $("#det-free-bal").textContent = money(info.freeBalance);

  $("#an-daily-free").textContent = `${money(info.dailyFreeAllowance)}/д`;
  $("#an-daily-full").textContent = `${money(info.dailyFullAllowance)}/д`;
  $("#an-reserve-line").textContent = `Бронь Пн–Пт: ${money(info.reservedForCommute)} (${info.totalWeekdaysLeft} будн.)`;
  $("#an-days-line").textContent = `Осталось ${info.daysLeft} дн.`;
  $("#an-bar-spent").style.width = `${Math.max(info.spentPct, 4)}%`;
  $("#an-bar-reserved").style.width = `${info.reservedPct}%`;

  if (document.activeElement !== $("#setting-bus-price")) $("#setting-bus-price").value = String(info.busPrice);
  if (document.activeElement !== $("#setting-home-price")) $("#setting-home-price").value = String(info.homePrice);
  if (document.activeElement !== $("#setting-credit-limit")) $("#setting-credit-limit").value = String(info.limit);
  const autoSw = $("#setting-autoreset-checkbox");
  if (autoSw) autoSw.checked = Boolean(state.planner.autoResetCredit);
  $("#settings-reset-credit-now").textContent = `Выставить баланс ${money(info.limit)} сейчас`;
}

async function checkMonthlyCreditReset() {
  const curMonth = localISODate().slice(0, 7);
  if (!state.planner.autoResetCredit) return;
  if (!state.planner.lastResetMonth) {
    state.planner.lastResetMonth = curMonth;
    savePlanner();
    return;
  }
  if (state.planner.lastResetMonth !== curMonth) {
    state.planner.lastResetMonth = curMonth;
    savePlanner();
    const lim = roundMoney(state.planner.creditLimit || 10000);
    if (state.cards[0]) {
      state.cards[0].balance = lim;
      state.cards[0].updatedAt = Date.now();
      writeLocal();
      renderAll();
      showInAppToast("1-е число", `Баланс Кредитки обновлён до ${money(lim)}`);
      await syncCardToCloud(state.cards[0]);
    }
  }
}

/* ================= СВОИ БЫСТРЫЕ ПЛАТЕЖИ (МГНОВЕННОЕ СОХРАНЕНИЕ В 1 ТАП) ================= */

function renderQuickPayments() {
  const grid = $("#quick-payments-grid");
  if (!grid) return;

  const editToggle = $("#qp-edit-toggle");
  if (editToggle) {
    editToggle.classList.toggle("ios-accent-soft-btn", state.qpEditMode);
    editToggle.classList.toggle("text-secondary-adaptive", !state.qpEditMode);
  }

  grid.innerHTML = state.quickPayments.map((qp) => {
    const cat = CATEGORIES[qp.category] || CATEGORIES.other;
    const sign = qp.type === "income" ? "+" : "";
    return `
      <button type="button" data-qp-id="${escapeHtml(qp.id)}" class="ios-press inline-flex items-center gap-2 px-3 py-2 rounded-2xl ios-surface text-[12.5px] font-semibold ${
        state.qpEditMode ? "border-dashed border-ios-orange" : ""
      }">
        <i data-lucide="${cat.icon}" class="w-3.5 h-3.5 text-ios-accent shrink-0"></i>
        <span>${escapeHtml(qp.title)}</span>
        <strong class="text-ios-accent tabular-nums">${sign}${money(qp.amount)}</strong>
      </button>
    `;
  }).join("");
  refreshIcons();
}

async function executeQuickPayment(qpId) {
  const qp = state.quickPayments.find((x) => x.id === qpId);
  if (!qp) return;

  if (state.qpEditMode) {
    openQuickPayEditor(qp);
    return;
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : `tx_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const tx = {
    id,
    type: qp.type === "income" ? "income" : "expense",
    amount: roundMoney(qp.amount),
    cardId: qp.cardId || "card_1",
    category: qp.category || "other",
    description: qp.title,
    isCommute: Boolean(qp.isCommute),
    date: localISODate(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await adjustCardBalance(tx.cardId, tx.type === "income" ? tx.amount : -tx.amount);

  if (db) {
    setSyncDot("busy");
    await setDoc(doc(db, "groups", GROUP_ID, "expenses", id), tx);
    setSyncDot("online");
  } else {
    state.expenses.push(tx);
    writeLocal();
  }

  renderAll();
  closeModal("modal-expense");
  const sign = tx.type === "income" ? "+" : "−";
  showInAppToast(`${tx.description} · ${sign}${money(tx.amount)}`, "Записано на сегодня", async () => {
    await adjustCardBalance(tx.cardId, tx.type === "income" ? -tx.amount : tx.amount);
    if (db) {
      await deleteDoc(doc(db, "groups", GROUP_ID, "expenses", tx.id));
    } else {
      state.expenses = state.expenses.filter((x) => x.id !== tx.id);
      writeLocal();
    }
    renderAll();
    showInAppToast("Платёж отменён");
  });
}

function openQuickPayEditor(qp = null) {
  $("#qp-form").reset();
  $("#qp-id").value = qp ? qp.id : "";
  $("#qp-dialog-title").textContent = qp ? "Изменить быстрый платёж" : "Новый быстрый платёж";
  $("#qp-delete").classList.toggle("hidden", !qp);

  $("#qp-title").value = qp ? qp.title : "";
  $("#qp-amount").value = qp ? String(qp.amount) : "";
  state.qpFormType = qp?.type === "income" ? "income" : "expense";
  state.qpFormCardId = qp?.cardId || state.cards[state.cardOrder[0]]?.id || "card_1";
  state.qpFormCategory = qp?.category || "cafe";
  state.qpFormIsCommute = Boolean(qp?.isCommute);

  $$(".qp-type-btn").forEach((b) => {
    const act = b.dataset.qpType === state.qpFormType;
    b.className = `qp-type-btn ios-press py-2 rounded-[11px] text-[13px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
  });
  $$(".qp-card-btn").forEach((b) => {
    const act = b.dataset.qpCard === state.qpFormCardId;
    b.className = `qp-card-btn ios-press py-1.5 rounded-[11px] text-[12px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
  });
  $$("#qp-category-grid [data-qp-category]").forEach((b) => {
    b.classList.toggle("ios-accent-soft-btn", b.dataset.qpCategory === state.qpFormCategory);
  });
  const qpCb = $("#qp-commute-checkbox");
  if (qpCb) qpCb.checked = state.qpFormIsCommute;

  openModal("modal-quick-pay");
  refreshIcons();
}

async function saveQuickPaymentForm(e) {
  e.preventDefault();
  const title = ($("#qp-title").value || "").trim();
  const amount = roundMoney(Number($("#qp-amount").value));
  if (!title || !Number.isFinite(amount) || amount <= 0) return;

  const existingId = $("#qp-id").value;
  const isCommute = Boolean($("#qp-commute-checkbox")?.checked);
  const obj = {
    id: existingId || `qp_${Date.now()}`,
    title,
    amount,
    type: state.qpFormType,
    cardId: state.qpFormCardId,
    category: state.qpFormCategory,
    isCommute
  };

  if (existingId) {
    state.quickPayments = state.quickPayments.map((x) => (x.id === existingId ? { ...x, ...obj } : x));
  } else {
    state.quickPayments.push(obj);
  }

  state.qpEditMode = false;
  saveQuickPaymentsLocal();
  renderQuickPayments();
  closeModal("modal-quick-pay");
  showInAppToast(existingId ? "Быстрый платёж обновлён" : "Быстрый платёж добавлен");
  if (db) {
    await setDoc(doc(db, "groups", GROUP_ID, "meta", "quick_payments"), {
      items: state.quickPayments,
      updatedAt: Date.now()
    });
  }
}

async function deleteQuickPayment() {
  const id = $("#qp-id").value;
  if (!id) return;
  state.quickPayments = state.quickPayments.filter((x) => x.id !== id);
  state.qpEditMode = false;
  saveQuickPaymentsLocal();
  renderQuickPayments();
  closeModal("modal-quick-pay");
  showInAppToast("Быстрый платёж удалён");
  if (db) {
    await setDoc(doc(db, "groups", GROUP_ID, "meta", "quick_payments"), {
      items: state.quickPayments,
      updatedAt: Date.now()
    });
  }
}

/* ================= ЛЕНТА ОПЕРАЦИЙ (ЧИСТЫЕ СТРОКИ БЕЗ ПЛИТОК) ================= */

function triggerCascadeOnce(el) {
  if (!el || isReducedMotion()) return;
  el.classList.remove("play-cascade");
  void el.offsetWidth;
  el.classList.add("play-cascade");
  setTimeout(() => el.classList.remove("play-cascade"), 420);
}

function renderHomeExpenses() {
  const list = $("#expense-list");
  if (!list) return;

  const filtered = state.expenses.filter((tx) => state.filterCardId === "all" || tx.cardId === state.filterCardId);
  const sorted = [...filtered].sort(
    (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || Number(b.createdAt || 0) - Number(a.createdAt || 0)
  );

  const cardObj = state.cards.find((c) => c.id === state.filterCardId);
  $("#home-filter-label").textContent = cardObj ? cardObj.name : "Все операции";

  if (!sorted.length) {
    list.innerHTML = `<div class="py-10 text-center text-[13px] text-secondary-adaptive">Пока нет операций. Нажми «+» внизу, чтобы записать первую трату.</div>`;
    return;
  }

  const todayISO = localISODate();
  let lastDate = "";
  const html = [];

  for (const tx of sorted) {
    const d = tx.date || "";
    if (d !== lastDate) {
      if (d !== todayISO || lastDate !== "") {
        const daySum = roundMoney(
          sorted.filter((x) => x.date === d && x.type !== "income").reduce((s, x) => s + (Number(x.amount) || 0), 0)
        );
        html.push(`
          <div class="pt-4 pb-1 flex items-center justify-between text-[12px] font-semibold text-secondary-adaptive border-0">
            <span>${escapeHtml(dateLabel(d))}</span>
            <span class="tabular-nums">${daySum > 0 ? `−${money(daySum)}` : ""}</span>
          </div>
        `);
      }
      lastDate = d;
    }

    const cat = CATEGORIES[tx.category] || CATEGORIES.other;
    const isInc = tx.type === "income";

    html.push(`
      <button type="button" data-expense-id="${escapeHtml(tx.id)}" class="w-full py-3.5 flex items-center justify-between gap-3.5 text-left active:opacity-60 transition-opacity">
        <div class="flex items-center gap-3.5 min-w-0 flex-1">
          <i data-lucide="${cat.icon}" class="w-5 h-5 text-secondary-adaptive shrink-0"></i>
          <span class="text-[15.5px] font-medium text-primary-adaptive truncate">${escapeHtml(tx.description || cat.label)}</span>
        </div>
        <span class="text-[15.5px] font-semibold tabular-nums whitespace-nowrap ${isInc ? "text-ios-green" : "text-primary-adaptive"}">
          ${isInc ? "+" : "−"}${money(tx.amount)}
        </span>
      </button>
    `);
  }

  list.innerHTML = html.join("");
  if (state.animateNextCascade) triggerCascadeOnce(list);
  refreshIcons();
}

/* ================= СОВРЕМЕННАЯ АНАЛИТИКА (ГРАФИК + КАТЕГОРИИ + КАЛЕНДАРЬ) ================= */

function getPeriodRange() {
  if (state.periodMode === "28days") {
    const end = new Date();
    const start = new Date(Date.now() - 27 * 86400000);
    const prevEnd = new Date(Date.now() - 28 * 86400000);
    const prevStart = new Date(Date.now() - 55 * 86400000);
    const startISO = localISODate(start);
    const endISO = localISODate(end);
    return {
      startISO,
      endISO,
      prevStartISO: localISODate(prevStart),
      prevEndISO: localISODate(prevEnd),
      daysCount: 28,
      label: `${shortDate(startISO)} — ${shortDate(endISO)}`
    };
  }
  const [y, m] = state.analyticsMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const prevFirst = new Date(y, m - 2, 1);
  const prevLast = new Date(y, m - 1, 0);
  const raw = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return {
    startISO: localISODate(first),
    endISO: localISODate(last),
    prevStartISO: localISODate(prevFirst),
    prevEndISO: localISODate(prevLast),
    daysCount: last.getDate(),
    label: raw.charAt(0).toUpperCase() + raw.slice(1),
    year: y,
    month: m
  };
}

function buildDailySeries(range, txs) {
  const map = {};
  for (const t of txs) {
    if (!t.date) continue;
    map[t.date] = roundMoney((map[t.date] || 0) + (Number(t.amount) || 0));
  }
  const points = [];
  const start = new Date(`${range.startISO}T12:00:00`);
  for (let i = 0; i < range.daysCount; i++) {
    const cur = new Date(start.getTime() + i * 86400000);
    const iso = localISODate(cur);
    points.push({ iso, day: cur.getDate(), label: shortDate(iso), value: map[iso] || 0 });
  }
  return points;
}

function renderSpendingChart(points, total, avgDaily, prevTotal) {
  const svg = $("#spending-chart-svg");
  const axisEl = $("#chart-axis-labels");
  const heroAmt = $("#chart-hero-amount");
  const avgEl = $("#chart-avg-label");
  const deltaEl = $("#chart-delta-label");
  const kickerEl = $("#chart-kicker");
  if (!svg || !points.length) return;

  const resetHeroHeader = () => {
    if (kickerEl) kickerEl.textContent = "Потрачено за период";
    if (heroAmt) heroAmt.textContent = money(total);
    if (avgEl) avgEl.textContent = `~${money(avgDaily)} / день`;
    if (deltaEl) {
      if (prevTotal > 0) {
        const diffPct = Math.round(((total - prevTotal) / prevTotal) * 100);
        const sign = diffPct > 0 ? "+" : "";
        deltaEl.textContent = `${sign}${diffPct}% к прошл. пер.`;
        deltaEl.className = `text-[11px] tabular-nums ${diffPct <= 0 ? "text-ios-green" : "text-ios-orange"}`;
      } else {
        deltaEl.textContent = `${points.filter((p) => p.value > 0).length} дн. с тратами`;
        deltaEl.className = "text-[11px] text-secondary-adaptive tabular-nums";
      }
    }
  };

  resetHeroHeader();

  const W = 360, H = 128, padX = 6, padTop = 14, padBot = 10;
  const maxVal = Math.max(...points.map((p) => p.value), 100);
  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(1, points.length - 1)) * (W - padX * 2);
    const y = padTop + (1 - p.value / maxVal) * (H - padTop - padBot);
    return { x, y, ...p };
  });

  // Плавная кривая Безье (Catmull-Rom -> Cubic Bezier)
  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.min(H - padBot, Math.max(padTop, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.min(H - padBot, Math.max(padTop, p2.y - (p3.y - p1.y) / 6));
    linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${H - padBot} L ${coords[0].x.toFixed(1)} ${H - padBot} Z`;

  const avgY = padTop + (1 - Math.min(avgDaily, maxVal) / maxVal) * (H - padTop - padBot);

  svg.innerHTML = `
    <defs>
      <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgb(var(--accent-rgb))" stop-opacity="0.34" />
        <stop offset="100%" stop-color="rgb(var(--accent-rgb))" stop-opacity="0.0" />
      </linearGradient>
    </defs>
    ${avgDaily > 0 ? `<line x1="${padX}" y1="${avgY.toFixed(1)}" x2="${W - padX}" y2="${avgY.toFixed(1)}" stroke="currentColor" stroke-opacity="0.14" stroke-dasharray="3 3" stroke-width="1" />` : ""}
    <path d="${areaPath}" fill="url(#chartAreaGrad)" />
    <path d="${linePath}" fill="none" stroke="rgb(var(--accent-rgb))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    <g id="chart-scrubber" class="hidden">
      <line id="scrub-line" x1="0" y1="${padTop}" x2="0" y2="${H - padBot}" stroke="rgb(var(--accent-rgb))" stroke-width="1.2" stroke-dasharray="2 2" />
      <circle id="scrub-dot" cx="0" cy="0" r="4.5" fill="rgb(var(--accent-rgb))" stroke="#ffffff" stroke-width="1.8" />
    </g>
  `;

  if (axisEl) {
    const mid = coords[Math.floor(coords.length / 2)];
    axisEl.innerHTML = `
      <span>${escapeHtml(coords[0].label)}</span>
      <span>${escapeHtml(mid.label)}</span>
      <span>${escapeHtml(coords[coords.length - 1].label)}</span>
    `;
  }

  // Интерактивный скраббер пальцем/мышью по графику
  const scrubToClientX = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(relX * (coords.length - 1));
    const pt = coords[idx];
    if (!pt) return;

    const scrubber = $("#chart-scrubber");
    const sLine = $("#scrub-line");
    const sDot = $("#scrub-dot");
    scrubber?.classList.remove("hidden");
    sLine?.setAttribute("x1", pt.x.toFixed(1));
    sLine?.setAttribute("x2", pt.x.toFixed(1));
    sDot?.setAttribute("cx", pt.x.toFixed(1));
    sDot?.setAttribute("cy", pt.y.toFixed(1));

    if (kickerEl) kickerEl.textContent = dateLabel(pt.iso);
    if (heroAmt) heroAmt.textContent = money(pt.value);
  };

  svg.onpointerdown = (e) => {
    svg.setPointerCapture?.(e.pointerId);
    scrubToClientX(e.clientX);
  };
  svg.onpointermove = (e) => {
    if (e.buttons > 0 || e.pointerType === "touch") scrubToClientX(e.clientX);
  };
  svg.onpointerup = () => {
    $("#chart-scrubber")?.classList.add("hidden");
    resetHeroHeader();
  };
  svg.onpointercancel = () => {
    $("#chart-scrubber")?.classList.add("hidden");
    resetHeroHeader();
  };
}

function renderAnalytics() {
  const range = getPeriodRange();
  $("#analytics-period-label").textContent = range.label;
  $("#month-prev").style.visibility = state.periodMode === "28days" ? "hidden" : "visible";
  $("#month-next").style.visibility = state.periodMode === "28days" ? "hidden" : "visible";

  const txs = state.expenses.filter((tx) => {
    if (tx.type === "income") return false;
    if (state.analyticsCardId !== "all" && tx.cardId !== state.analyticsCardId) return false;
    return String(tx.date || "") >= range.startISO && String(tx.date || "") <= range.endISO;
  });

  const prevTxs = state.expenses.filter((tx) => {
    if (tx.type === "income") return false;
    if (state.analyticsCardId !== "all" && tx.cardId !== state.analyticsCardId) return false;
    return String(tx.date || "") >= range.prevStartISO && String(tx.date || "") <= range.prevEndISO;
  });

  const total = roundMoney(txs.reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const prevTotal = roundMoney(prevTxs.reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const avgDaily = range.daysCount > 0 ? roundMoney(total / range.daysCount) : 0;

  // График
  const series = buildDailySeries(range, txs);
  renderSpendingChart(series, total, avgDaily, prevTotal);

  // Категории
  const byCat = {};
  for (const t of txs) {
    const k = CATEGORIES[t.category] ? t.category : "other";
    byCat[k] = roundMoney((byCat[k] || 0) + (Number(t.amount) || 0));
  }
  const entries = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const stackBar = $("#cat-stacked-bar");
  const catList = $("#category-bars-list");
  const topHint = $("#an-top-cat-hint");

  if (!entries.length || total <= 0) {
    if (stackBar) stackBar.innerHTML = "";
    if (topHint) topHint.textContent = "";
    if (catList) catList.innerHTML = `<div class="py-6 text-center text-[13px] text-secondary-adaptive">Нет трат за выбранный период</div>`;
  } else {
    if (topHint) topHint.textContent = `Топ: ${CATEGORIES[entries[0][0]].label}`;
    if (stackBar) {
      stackBar.innerHTML = entries
        .map(([k, v]) => `<div style="width:${Math.max(2, (v / total) * 100)}%; background:${CATEGORIES[k].color};" class="h-full rounded-full"></div>`)
        .join("");
    }
    if (catList) {
      catList.innerHTML = entries
        .map(([k, v]) => {
          const cat = CATEGORIES[k];
          const pct = Math.round((v / total) * 100);
          return `
            <div class="py-3 flex items-center justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${cat.color};"></span>
                <span class="text-[14.5px] font-medium text-primary-adaptive truncate">${cat.label}</span>
                <span class="text-[12px] text-tertiary-adaptive tabular-nums">${pct}%</span>
              </div>
              <span class="text-[14.5px] font-semibold text-primary-adaptive tabular-nums whitespace-nowrap">${money(v)}</span>
            </div>
          `;
        })
        .join("");
    }
  }

  // Календарь
  const byDate = {};
  for (const t of txs) {
    if (!t.date) continue;
    if (!byDate[t.date]) byDate[t.date] = { sum: 0, items: [] };
    byDate[t.date].sum = roundMoney(byDate[t.date].sum + (Number(t.amount) || 0));
    byDate[t.date].items.push(t);
  }

  const todayISO = localISODate();
  const cells = [];
  if (state.periodMode === "28days") {
    const startObj = new Date(`${range.startISO}T12:00:00`);
    const pad = (startObj.getDay() + 6) % 7;
    for (let i = 0; i < pad; i++) cells.push(`<div></div>`);
    for (let i = 0; i < 28; i++) {
      const cur = new Date(startObj.getTime() + i * 86400000);
      const iso = localISODate(cur);
      const info = byDate[iso];
      const isSel = iso === state.selectedCalendarDate;
      const isTod = iso === todayISO;
      cells.push(`
        <button type="button" data-cal-date="${iso}" class="ios-press py-1 flex flex-col items-center gap-0.5 rounded-xl">
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold ${
            isSel ? "ios-accent-btn" : isTod ? "border border-ios-accent text-ios-accent" : "text-primary-adaptive"
          }">${cur.getDate()}</span>
          <span class="text-[9px] text-secondary-adaptive tabular-nums h-3">${info ? compactMoney(info.sum) : ""}</span>
        </button>
      `);
    }
  } else {
    const firstObj = new Date(range.year, range.month - 1, 1);
    const pad = (firstObj.getDay() + 6) % 7;
    for (let i = 0; i < pad; i++) cells.push(`<div></div>`);
    for (let d = 1; d <= range.daysCount; d++) {
      const iso = `${state.analyticsMonth}-${String(d).padStart(2, "0")}`;
      const info = byDate[iso];
      const isSel = iso === state.selectedCalendarDate;
      const isTod = iso === todayISO;
      cells.push(`
        <button type="button" data-cal-date="${iso}" class="ios-press py-1 flex flex-col items-center gap-0.5 rounded-xl">
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold ${
            isSel ? "ios-accent-btn" : isTod ? "border border-ios-accent text-ios-accent" : "text-primary-adaptive"
          }">${d}</span>
          <span class="text-[9px] text-secondary-adaptive tabular-nums h-3">${info ? compactMoney(info.sum) : ""}</span>
        </button>
      `);
    }
  }
  $("#calendar-grid").innerHTML = cells.join("");

  const detBox = $("#calendar-day-details");
  const dayData = byDate[state.selectedCalendarDate];
  if (!state.selectedCalendarDate) {
    detBox.classList.add("hidden");
  } else {
    detBox.classList.remove("hidden");
    $("#cal-selected-date").textContent = dateLabel(state.selectedCalendarDate);
    $("#cal-selected-total").textContent = dayData ? `−${money(dayData.sum)}` : "0 ₽";
    $("#cal-detail-list").innerHTML = dayData?.items.length
      ? dayData.items.map((t) => {
          const cat = CATEGORIES[t.category] || CATEGORIES.other;
          return `
            <button type="button" data-expense-id="${escapeHtml(t.id)}" class="w-full py-2.5 flex items-center justify-between gap-3 text-left">
              <div class="flex items-center gap-3 min-w-0">
                <i data-lucide="${cat.icon}" class="w-4 h-4 text-secondary-adaptive shrink-0"></i>
                <span class="text-[14px] font-medium text-primary-adaptive truncate">${escapeHtml(t.description || cat.label)}</span>
              </div>
              <span class="text-[14px] font-semibold text-primary-adaptive tabular-nums">−${money(t.amount)}</span>
            </button>
          `;
        }).join("")
      : `<div class="py-2 text-[12px] text-secondary-adaptive">Расходов в этот день не было</div>`;
  }
  refreshIcons();
}

/* ================= МОДАЛКИ: ОПЕРАЦИИ И КАРТЫ ================= */

function buildCategoryGrids() {
  const mainGrid = $("#category-grid");
  if (mainGrid) {
    mainGrid.innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `
      <button type="button" data-category="${k}" class="ios-press p-2 rounded-2xl ios-surface flex flex-col items-center gap-1 text-[10.5px] font-semibold text-secondary-adaptive ${
        k === state.txCategory ? "ios-accent-soft-btn" : ""
      }">
        <i data-lucide="${v.icon}" class="w-4 h-4"></i>
        <span class="truncate max-w-full">${v.label}</span>
      </button>
    `).join("");
  }
  const qpGrid = $("#qp-category-grid");
  if (qpGrid) {
    qpGrid.innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `
      <button type="button" data-qp-category="${k}" class="ios-press p-2 rounded-2xl ios-surface flex flex-col items-center gap-1 text-[10.5px] font-semibold text-secondary-adaptive ${
        k === state.qpFormCategory ? "ios-accent-soft-btn" : ""
      }">
        <i data-lucide="${v.icon}" class="w-4 h-4"></i>
        <span class="truncate max-w-full">${v.label}</span>
      </button>
    `).join("");
  }
  refreshIcons();
}

function setTxType(t) {
  state.txType = t === "income" ? "income" : "expense";
  $$(".tx-type-btn").forEach((b) => {
    const act = b.dataset.txType === state.txType;
    b.className = `tx-type-btn ios-press py-2 rounded-[11px] text-[13px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
  });
  updateCommuteToggleVisibility();
}
function setTxCard(id) {
  state.txCardId = id;
  $$(".tx-card-btn").forEach((b) => {
    const act = b.dataset.selectCard === id;
    b.className = `tx-card-btn ios-press py-1.5 rounded-[11px] text-[12px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
  });
  updateCommuteToggleVisibility();
}
function setTxCategory(c) {
  state.txCategory = CATEGORIES[c] ? c : "other";
  $$("#category-grid [data-category]").forEach((b) => {
    const act = b.dataset.category === state.txCategory;
    b.classList.toggle("ios-accent-soft-btn", act);
    b.classList.toggle("text-secondary-adaptive", !act);
  });
  updateCommuteToggleVisibility();
}
function updateCommuteToggleVisibility() {
  const show = state.txType === "expense" && state.txCardId === "card_1" && (state.txCategory === "transport" || state.txCategory === "home");
  $("#commute-toggle-row")?.classList.toggle("hidden", !show);
  const cb = $("#tx-commute-checkbox");
  if (cb) cb.checked = Boolean(state.txIsCommute);
}

function openNewExpense() {
  state.qpEditMode = false;
  $("#quick-payments-section").classList.remove("hidden");
  renderQuickPayments();
  $("#expense-form").reset();
  $("#expense-id").value = "";
  $("#expense-date").value = localISODate();
  $("#expense-dialog-title").textContent = "Новая операция";
  $("#expense-delete").classList.add("hidden");
  $("#expense-error").textContent = "";
  state.txIsCommute = false;
  setTxType("expense");
  setTxCard(state.cards[state.cardOrder[0]]?.id || "card_1");
  setTxCategory("food");
  openModal("modal-expense");
}

function openEditExpense(id) {
  const item = state.expenses.find((e) => e.id === id);
  if (!item) return;
  $("#quick-payments-section").classList.add("hidden");
  $("#expense-id").value = id;
  $("#expense-amount").value = String(item.amount);
  $("#expense-description").value = item.description || "";
  $("#expense-date").value = item.date || localISODate();
  $("#expense-dialog-title").textContent = "Изменить операцию";
  $("#expense-delete").classList.remove("hidden");
  $("#expense-error").textContent = "";
  state.txIsCommute = isTxCommute(item);
  setTxType(item.type);
  setTxCard(item.cardId || "card_1");
  setTxCategory(item.category || "other");
  openModal("modal-expense");
}

async function saveExpense(e) {
  e.preventDefault();
  const amount = roundMoney(Number($("#expense-amount").value));
  const date = $("#expense-date").value;
  if (!Number.isFinite(amount) || amount <= 0) {
    $("#expense-error").textContent = "Введите сумму больше нуля";
    return;
  }
  const id = $("#expense-id").value || (crypto.randomUUID ? crypto.randomUUID() : `tx_${Date.now()}`);
  const existing = state.expenses.find((x) => x.id === id);
  const isCommute = Boolean($("#tx-commute-checkbox")?.checked);
  const tx = {
    id,
    type: state.txType,
    amount,
    cardId: state.txCardId,
    category: state.txCategory,
    description: ($("#expense-description").value || "").trim(),
    isCommute,
    date,
    createdAt: existing ? Number(existing.createdAt) : Date.now(),
    updatedAt: Date.now()
  };

  if (existing) {
    await adjustCardBalance(existing.cardId, existing.type === "income" ? -existing.amount : existing.amount);
  }
  await adjustCardBalance(tx.cardId, tx.type === "income" ? tx.amount : -tx.amount);

  if (db) {
    setSyncDot("busy");
    await setDoc(doc(db, "groups", GROUP_ID, "expenses", id), tx);
    setSyncDot("online");
  } else {
    state.expenses = existing ? state.expenses.map((r) => (r.id === id ? tx : r)) : [...state.expenses, tx];
    writeLocal();
  }
  renderAll();
  closeModal("modal-expense");
  showInAppToast(existing ? "Операция обновлена" : "Операция сохранена");
}

async function deleteExpense() {
  const id = $("#expense-id").value;
  const ex = state.expenses.find((x) => x.id === id);
  if (!ex) return;
  await adjustCardBalance(ex.cardId, ex.type === "income" ? -ex.amount : ex.amount);
  if (db) {
    setSyncDot("busy");
    await deleteDoc(doc(db, "groups", GROUP_ID, "expenses", id));
    setSyncDot("online");
  } else {
    state.expenses = state.expenses.filter((x) => x.id !== id);
    writeLocal();
  }
  renderAll();
  closeModal("modal-expense");
  showInAppToast("Операция удалена");
}

function openCardModal(slot = state.cardOrder[0]) {
  state.editingCardSlot = slot;
  const c = state.cards[slot] || getDefaultCards()[slot];
  state.editingCardSkin = c.skin;
  $$(".card-slot-btn").forEach((b) => {
    const i = Number(b.dataset.editCardSlot);
    const act = i === slot;
    b.className = `card-slot-btn ios-press py-1.5 rounded-[11px] text-[12px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
    b.textContent = state.cards[i]?.name || `Карта ${i + 1}`;
  });
  $("#card-balance-input").value = String(c.balance);
  $("#card-name-input").value = c.name;
  $("#card-bank-input").value = c.bank;
  $("#card-digits-input").value = c.digits;
  $$("#card-skins-grid [data-card-skin]").forEach((b) => {
    const act = b.dataset.cardSkin === c.skin;
    b.classList.toggle("border-ios-accent", act);
    b.classList.toggle("border-transparent", !act);
  });
  openModal("modal-card");
}

async function saveCard(e) {
  e.preventDefault();
  const idx = state.editingCardSlot;
  const cur = state.cards[idx];
  const updated = {
    ...cur,
    balance: roundMoney(Number($("#card-balance-input").value) || 0),
    name: ($("#card-name-input").value || "").trim() || cur.name,
    bank: ($("#card-bank-input").value || "").trim() || "ФПИ БАНК",
    digits: ($("#card-digits-input").value || "").replace(/\D/g, "").slice(-4) || "2004",
    skin: state.editingCardSkin,
    updatedAt: Date.now()
  };
  state.cards[idx] = updated;
  writeLocal();
  renderAll();
  closeModal("modal-card");
  showInAppToast("Карта обновлена", updated.name);
  await syncCardToCloud(updated);
}

async function adjustCardBalance(cardId, delta) {
  const i = state.cards.findIndex((c) => c.id === cardId);
  if (i === -1 || !delta) return;
  state.cards[i] = { ...state.cards[i], balance: roundMoney((Number(state.cards[i].balance) || 0) + delta), updatedAt: Date.now() };
  writeLocal();
  await syncCardToCloud(state.cards[i]);
}

async function syncCardToCloud(card) {
  if (!db) return;
  try {
    setSyncDot("busy");
    await setDoc(doc(db, "groups", GROUP_ID, "cards", card.id), card);
    setSyncDot("online");
  } catch (_) {}
}

/* ================= ВКЛАДКИ, СВАЙП ВКЛАДОК, КНОПКИ И ШТОРКИ (1-В-1 ИЗ ДНЕВНИКА) ================= */

function resetAllTabViewsToCleanState(activeTabName) {
  ["home", "analytics"].forEach((t) => {
    const v = document.getElementById(`view-${t}`);
    if (!v) return;
    v.classList.toggle("hidden", t !== activeTabName);
    v.style.transform = "";
    v.style.opacity = "";
    v.style.position = "";
    v.style.top = "";
    v.style.left = "";
    v.style.right = "";
    v.style.pointerEvents = "";
    v.style.willChange = "";
  });
}

function switchTabWithSpring(newTab, options = {}) {
  const tabOrder = ["home", "analytics"];
  const oldIdx = tabOrder.indexOf(state.activeTab);
  const newIdx = tabOrder.indexOf(newTab);
  if (newIdx === -1) return;

  $$(".nav-tab").forEach((b) => {
    const active = b.dataset.tab === newTab;
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
            icon.style.transform = `scale(${sc}) translateY(${(1 - sc) * 5}px)`;
          },
          () => {
            icon.style.transform = "";
          }
        );
      }
    }
  });

  $("#screen-heading").textContent = newTab === "analytics" ? "Аналитика" : "ФПИ Банк";
  if (newTab === "analytics") renderAnalytics();

  if (oldIdx === newIdx && !options.fromDrag) return;

  stopTrackedSpring("tab_switch");
  const oldTab = state.activeTab;
  resetAllTabViewsToCleanState(oldTab);
  state.activeTab = newTab;

  const mainContainer = $("#main-container");
  const oldView = $(`#view-${oldTab}`);
  const newView = $(`#view-${newTab}`);

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

function initInteractiveTabSwipe() {
  const mainEl = $("#main-container");
  if (!mainEl) return;

  const vTracker = createVelocityTracker();
  let isDown = false, isLocked = false, isIgnored = false;
  let startX = 0, startY = 0, currentDx = 0;

  mainEl.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target?.closest("#card-deck, #spending-chart-wrap, input, textarea, select, button, a, label")) {
      isIgnored = true;
      return;
    }
    if (document.querySelector('div[id^="modal-"].fixed:not(.hidden)')) {
      isIgnored = true;
      return;
    }
    isIgnored = false;
    isLocked = false;
    isDown = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentDx = 0;
    vTracker.reset();
    vTracker.add(startX, startY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!isDown || isIgnored || e.touches.length !== 1) return;
    const rawDx = e.touches[0].clientX - startX;
    const rawDy = e.touches[0].clientY - startY;

    if (!isLocked) {
      if (Math.abs(rawDy) > 12 && Math.abs(rawDy) > Math.abs(rawDx)) {
        isIgnored = true;
        return;
      }
      if (Math.abs(rawDx) > 12 && Math.abs(rawDx) > Math.abs(rawDy) * 1.2) {
        isLocked = true;
      }
    }
    if (!isLocked) return;
    if (e.cancelable) e.preventDefault();
    vTracker.add(e.touches[0].clientX, e.touches[0].clientY);

    const tabOrder = ["home", "analytics"];
    const curIdx = tabOrder.indexOf(state.activeTab);
    const width = mainEl.clientWidth || window.innerWidth || 375;
    const atLeft = curIdx === 0 && rawDx > 0;
    const atRight = curIdx === 1 && rawDx < 0;

    currentDx = atLeft || atRight ? rubberBand(rawDx, width * 0.45) : rawDx;
    const curView = $(`#view-${state.activeTab}`);
    if (curView) {
      curView.style.willChange = "transform";
      curView.style.transform = `translate3d(${currentDx}px, 0, 0)`;
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    if (!isDown) return;
    isDown = false;
    if (isIgnored || !isLocked) return;
    isLocked = false;

    const { vx } = vTracker.getVelocity();
    const tabOrder = ["home", "analytics"];
    const curIdx = tabOrder.indexOf(state.activeTab);
    const width = mainEl.clientWidth || window.innerWidth || 375;
    const projectedX = projectPosition(currentDx, vx);
    const dir = currentDx < 0 ? 1 : -1;
    const nextIdx = curIdx + dir;
    const curView = $(`#view-${state.activeTab}`);

    const canSwitch = nextIdx >= 0 && nextIdx < tabOrder.length;
    const shouldCommit = canSwitch && ((dir > 0 && (projectedX < -width * 0.32 || vx < -400)) || (dir < 0 && (projectedX > width * 0.32 || vx > 400)));

    if (shouldCommit) {
      if (curView) curView.style.transform = "";
      switchTabWithSpring(tabOrder[nextIdx], {
        fromDrag: true,
        startOffsetPx: currentDx + dir * width,
        velocity: vx
      });
    } else if (curView) {
      animateTrackedSpring(
        "tab_switch",
        currentDx,
        0,
        { ...SPRING_PAGE, velocity: vx },
        (pos) => { curView.style.transform = `translate3d(${pos}px, 0, 0)`; },
        () => { curView.style.transform = ""; curView.style.willChange = ""; }
      );
    }
  }, { passive: true });
}

/* Физический отклик кнопок (.ios-press) из дневника */
function initPressPhysics() {
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
      (sc) => { el.style.transform = `scale(${sc})`; },
      () => { el.style.transform = ""; }
    );
  };

  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".ios-press");
    if (!btn || isReducedMotion()) return;
    pressedEl = btn;
    animateTrackedSpring(
      btn,
      1,
      0.94,
      { stiffness: 820, damping: 48, mass: 1 },
      (sc) => { btn.style.transform = `scale(${sc})`; }
    );
  }, { passive: true });

  window.addEventListener("pointerup", releasePressed, { passive: true });
  window.addEventListener("pointercancel", releasePressed, { passive: true });
  window.addEventListener("blur", releasePressed);
}

/* Bottom Sheets с перехватом и смахиванием вниз из дневника */
function ensureSheetStructure(modalEl) {
  if (!modalEl) return null;
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
  let isDragging = false, isSheetLocked = false;
  let startY = 0, startX = 0, baseOffsetY = 0;

  panel.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const running = stopTrackedSpring(`sheet_${modalEl.id}`);
    const isMidFlight = running && Math.abs(running.pos) > 2;

    if (!isMidFlight) {
      if (e.target.closest('input[type="range"]')) return;
      const rect = panel.getBoundingClientRect();
      const inTop = t.clientY - rect.top <= 56;
      if (panel.scrollTop > 0 && !inTop) return;
    }

    isDragging = true;
    isSheetLocked = Boolean(isMidFlight);
    startY = t.clientY;
    startX = t.clientX;
    baseOffsetY = running ? running.pos : st.currentY;
    st.height = panel.offsetHeight || 420;
    vTracker.reset();
    vTracker.add(t.clientX, t.clientY);
  }, { passive: true });

  panel.addEventListener("touchmove", (e) => {
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
    backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.max(0, nextY) / st.height)));
  }, { passive: false });

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    if (!isSheetLocked) return;
    isSheetLocked = false;

    const { vy } = vTracker.getVelocity();
    const projectedY = projectPosition(st.currentY, vy);

    if (projectedY > st.height * SWIPE_CONFIG.SHEET_DISMISS_RATIO || vy > SWIPE_CONFIG.SHEET_VELOCITY_THRESHOLD) {
      closeModal(modalEl.id, vy);
    } else {
      openModal(modalEl.id, vy);
    }
  };

  panel.addEventListener("touchend", onEnd, { passive: true });
  panel.addEventListener("touchcancel", onEnd, { passive: true });
}

function openModal(id, initialVelocity = 0) {
  const el = document.getElementById(id);
  if (!el) return;
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
      st.backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.max(0, y) / st.height)));
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
      st.backdrop.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.max(0, y) / st.height)));
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

/* ================= ЗАПУСК И ПРИВЯЗКА СОБЫТИЙ ================= */

function renderAll() {
  updateCardDeckContent();
  renderCreditPlanner();
  renderHomeExpenses();
  renderAnalytics();
  state.animateNextCascade = false;
}

function bindEvents() {
  $$(".nav-tab").forEach((b) => b.addEventListener("click", () => switchTabWithSpring(b.dataset.tab)));
  $("#btn-settings")?.addEventListener("click", () => openModal("modal-settings"));
  $("#btn-fab-add")?.addEventListener("click", openNewExpense);

  $("#limit-capsule-head")?.addEventListener("click", () => {
    $("#limit-capsule")?.classList.toggle("expanded");
  });

  $("#home-filter-cycle")?.addEventListener("click", () => {
    const order = ["all", "card_1", "card_2", "card_3"];
    state.filterCardId = order[(order.indexOf(state.filterCardId) + 1) % order.length];
    state.animateNextCascade = true;
    renderHomeExpenses();
    state.animateNextCascade = false;
  });

  document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest("[data-close-modal]");
    if (closeBtn) {
      closeModal(closeBtn.dataset.closeModal);
      return;
    }
    const expRow = e.target.closest("[data-expense-id]");
    if (expRow) {
      openEditExpense(expRow.dataset.expenseId);
      return;
    }
  });

  // Быстрые платежи
  $("#quick-payments-grid")?.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-qp-id]");
    if (pill) executeQuickPayment(pill.dataset.qpId);
  });
  $("#qp-edit-toggle")?.addEventListener("click", () => {
    state.qpEditMode = !state.qpEditMode;
    renderQuickPayments();
  });
  $("#qp-add-open")?.addEventListener("click", () => openQuickPayEditor(null));
  $("#settings-add-qp")?.addEventListener("click", () => {
    closeModal("modal-settings");
    openQuickPayEditor(null);
  });

  $$(".qp-type-btn").forEach((b) => b.addEventListener("click", () => {
    state.qpFormType = b.dataset.qpType;
    $$(".qp-type-btn").forEach((x) => {
      const act = x === b;
      x.className = `qp-type-btn ios-press py-2 rounded-[11px] text-[13px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
    });
  }));
  $$(".qp-card-btn").forEach((b) => b.addEventListener("click", () => {
    state.qpFormCardId = b.dataset.qpCard;
    $$(".qp-card-btn").forEach((x) => {
      const act = x === b;
      x.className = `qp-card-btn ios-press py-1.5 rounded-[11px] text-[12px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
    });
  }));
  $("#qp-category-grid")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-qp-category]");
    if (!b) return;
    state.qpFormCategory = b.dataset.qpCategory;
    $$("#qp-category-grid [data-qp-category]").forEach((x) => {
      const act = x === b;
      x.classList.toggle("ios-accent-soft-btn", act);
      x.classList.toggle("text-secondary-adaptive", !act);
    });
  });
  $("#qp-form")?.addEventListener("submit", saveQuickPaymentForm);
  $("#qp-delete")?.addEventListener("click", deleteQuickPayment);

  // Форма операции
  $$(".tx-type-btn").forEach((b) => b.addEventListener("click", () => setTxType(b.dataset.txType)));
  $$(".tx-card-btn").forEach((b) => b.addEventListener("click", () => setTxCard(b.dataset.selectCard)));
  $("#category-grid")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-category]");
    if (b) setTxCategory(b.dataset.category);
  });
  $("#expense-form")?.addEventListener("submit", saveExpense);
  $("#expense-delete")?.addEventListener("click", deleteExpense);

  // Карты
  $$(".card-slot-btn").forEach((b) => b.addEventListener("click", () => openCardModal(Number(b.dataset.editCardSlot))));
  $("#card-skins-grid")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-card-skin]");
    if (!b) return;
    state.editingCardSkin = b.dataset.cardSkin;
    $$("#card-skins-grid [data-card-skin]").forEach((x) => {
      const act = x === b;
      x.classList.toggle("border-ios-accent", act);
      x.classList.toggle("border-transparent", !act);
    });
  });
  $("#card-custom-form")?.addEventListener("submit", saveCard);

  // Аналитика
  $("#analytics-card-pills")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-analytics-card]");
    if (!b) return;
    state.analyticsCardId = b.dataset.analyticsCard;
    $$(".an-card-pill").forEach((x) => {
      const act = x === b;
      x.className = `an-card-pill ios-press px-3.5 py-1.5 rounded-full text-[12px] font-semibold shrink-0 ${
        act ? "ios-accent-btn" : "ios-icon-btn text-secondary-adaptive"
      }`;
    });
    renderAnalytics();
  });
  $$(".period-mode-btn").forEach((b) => b.addEventListener("click", () => {
    state.periodMode = b.dataset.periodMode;
    $$(".period-mode-btn").forEach((x) => {
      const act = x === b;
      x.className = `period-mode-btn ios-press py-2 rounded-[11px] text-[13px] font-semibold ${act ? "ios-seg-active" : "text-secondary-adaptive"}`;
    });
    renderAnalytics();
  }));
  $("#month-prev")?.addEventListener("click", () => {
    const [y, m] = state.analyticsMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    state.analyticsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    renderAnalytics();
  });
  $("#month-next")?.addEventListener("click", () => {
    const [y, m] = state.analyticsMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    state.analyticsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    renderAnalytics();
  });
  $("#calendar-grid")?.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cal-date]");
    if (!c) return;
    state.selectedCalendarDate = c.dataset.calDate;
    renderAnalytics();
  });

  // Загрузка своего фона из галереи и затемнение (как в дневнике)
  const dimSlider = $("#bg-dim-slider");
  const dimVal = $("#bg-dim-value");
  const savedDim = Number(localStorage.getItem("fpi_custom_bg_dim_v1") ?? 25);
  if (dimSlider) dimSlider.value = String(savedDim);
  if (dimVal) dimVal.textContent = `${savedDim}%`;

  $("#custom-bg-input")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 1400, 0.78);
      localStorage.setItem("fpi_custom_bg_img_v1", compressed);
      localStorage.setItem("fpi_bg_mode_v1", "custom");
      window.__applyAppAppearance?.();
      showInAppToast("Фон обновлён", "Фото из галереи установлено");
    } catch (_) {}
    e.target.value = "";
  });

  $("#btn-clear-custom-bg")?.addEventListener("click", () => {
    localStorage.removeItem("fpi_custom_bg_img_v1");
    localStorage.setItem("fpi_bg_mode_v1", "abstract");
    window.__applyAppAppearance?.();
  });

  dimSlider?.addEventListener("input", (e) => {
    const val = Math.min(85, Math.max(0, Number(e.target.value) || 0));
    localStorage.setItem("fpi_custom_bg_dim_v1", String(val));
    if (dimVal) dimVal.textContent = `${val}%`;
    window.__applyAppAppearance?.();
  });

  // Настройки бюджета и дороги
  const onPlannerChange = () => {
    const b = Number($("#setting-bus-price").value);
    const h = Number($("#setting-home-price").value);
    const l = Number($("#setting-credit-limit").value);
    if (Number.isFinite(b) && b >= 0) state.planner.busPrice = roundMoney(b);
    if (Number.isFinite(h) && h >= 0) state.planner.homeTicketPrice = roundMoney(h);
    if (Number.isFinite(l) && l > 0) state.planner.creditLimit = roundMoney(l);
    savePlanner();

    state.quickPayments = state.quickPayments.map((qp) => {
      if (qp.systemKey === "bus") return { ...qp, amount: state.planner.busPrice };
      if (qp.systemKey === "home") return { ...qp, amount: state.planner.homeTicketPrice };
      if (qp.systemKey === "both") return { ...qp, amount: roundMoney(state.planner.busPrice + state.planner.homeTicketPrice) };
      return qp;
    });
    saveQuickPaymentsLocal();
    renderCreditPlanner();
    renderQuickPayments();
  };
  ["#setting-bus-price", "#setting-home-price", "#setting-credit-limit"].forEach((s) => $(s)?.addEventListener("input", onPlannerChange));

  $("#setting-autoreset-checkbox")?.addEventListener("change", (e) => {
    state.planner.autoResetCredit = Boolean(e.target.checked);
    savePlanner();
  });

  $("#settings-reset-credit-now")?.addEventListener("click", async () => {
    const lim = roundMoney(state.planner.creditLimit || 10000);
    state.cards[0].balance = lim;
    state.cards[0].updatedAt = Date.now();
    writeLocal();
    renderAll();
    showInAppToast("Баланс обновлён", `Кредитка: ${money(lim)}`);
    await syncCardToCloud(state.cards[0]);
  });

  $("#settings-open-cards")?.addEventListener("click", () => openCardModal(state.cardOrder[0]));
}

function bootstrapApp() {
  readLocal();
  buildCategoryGrids();
  buildCardDeckOnce();
  renderAll();
  renderQuickPayments();
  initDeckGestures();
  initInteractiveTabSwipe();
  initPressPhysics();
  document.querySelectorAll('[id^="modal-"]').forEach((el) => ensureSheetStructure(el));
  initNetworkListeners();
  bindEvents();
  checkMonthlyCreditReset();
  refreshIcons();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).catch(() => {});
    }, { once: true });
  }

  setTimeout(() => {
    initFirebaseInBackground();
  }, 50);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp, { once: true });
} else {
  bootstrapApp();
}

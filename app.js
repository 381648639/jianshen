const DB_NAME = "workout-log-db";
const DB_VERSION = 1;
const DEFAULT_EXERCISES = [
  ["固定推胸", "胸"],
  ["夹胸", "胸"],
  ["器械推肩", "肩"],
  ["助力引体向上", "背"],
  ["哑铃弯举", "手臂"],
  ["坐姿划船", "背"],
  ["高位下拉", "背"],
  ["腿举", "腿"],
  ["腿屈伸", "腿"],
  ["绳索下压", "手臂"]
];

const state = {
  db: null,
  exercises: [],
  workouts: [],
  selectedDate: todayKey(),
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  selectedHistoryDate: todayKey()
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  wireEvents();
  state.db = await openDb();
  await seedDefaultExercises();
  await loadAll();
  render();
  registerServiceWorker();
});

function cacheElements() {
  Object.assign(els, {
    date: document.querySelector("#workout-date"),
    picker: document.querySelector("#exercise-picker"),
    options: document.querySelector("#exercise-options"),
    load: document.querySelector("#load-value"),
    unit: document.querySelector("#load-unit"),
    sets: document.querySelector("#target-sets"),
    reps: document.querySelector("#target-reps"),
    quickAdd: document.querySelector("#quick-add-form"),
    todayList: document.querySelector("#today-list"),
    todayEmpty: document.querySelector("#today-empty"),
    todaySets: document.querySelector("#today-sets"),
    todayVolume: document.querySelector("#today-volume"),
    cardTemplate: document.querySelector("#exercise-card-template"),
    tabs: document.querySelectorAll(".tab"),
    views: document.querySelectorAll(".view"),
    prevMonth: document.querySelector("#prev-month"),
    nextMonth: document.querySelector("#next-month"),
    calendarTitle: document.querySelector("#calendar-title"),
    calendarGrid: document.querySelector("#calendar-grid"),
    monthDays: document.querySelector("#month-days"),
    currentStreak: document.querySelector("#current-streak"),
    bestStreak: document.querySelector("#best-streak"),
    historyDetail: document.querySelector("#history-detail"),
    historyPanel: document.querySelector("#history-panel h3"),
    libraryForm: document.querySelector("#library-form"),
    libraryName: document.querySelector("#library-name"),
    libraryCategory: document.querySelector("#library-category"),
    libraryList: document.querySelector("#library-list"),
    exportData: document.querySelector("#export-data"),
    importData: document.querySelector("#import-data"),
    backupShortcut: document.querySelector("#backup-shortcut"),
    backupWorkouts: document.querySelector("#backup-workouts"),
    backupExercises: document.querySelector("#backup-exercises"),
    backupTime: document.querySelector("#backup-time")
  });
}

function wireEvents() {
  els.date.value = state.selectedDate;
  els.date.addEventListener("change", () => {
    state.selectedDate = els.date.value || todayKey();
    state.selectedHistoryDate = state.selectedDate;
    const parts = parseKey(state.selectedDate);
    state.calendarYear = parts.year;
    state.calendarMonth = parts.month - 1;
    render();
  });

  els.quickAdd.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = normalizeName(els.picker.value);
    if (!name) return;
    const exercise = await ensureExercise(name, "其他");
    const workout = getOrCreateWorkout(state.selectedDate);
    const previous = findLastExerciseRecord(name);
    workout.items.push({
      id: crypto.randomUUID(),
      exerciseId: exercise.id,
      name,
      category: exercise.category,
      loadValue: numericOrFallback(els.load.value, previous?.loadValue ?? 0),
      unit: els.unit.value || previous?.unit || "kg",
      targetSets: numericOrFallback(els.sets.value, previous?.targetSets ?? 5),
      reps: numericOrFallback(els.reps.value, previous?.reps ?? 12),
      completedSets: 0,
      createdAt: new Date().toISOString()
    });
    await saveWorkout(workout);
    els.picker.value = "";
    els.load.value = "";
    els.unit.value = "kg";
    await loadAll();
    render();
  });

  els.picker.addEventListener("change", () => {
    const previous = findLastExerciseRecord(els.picker.value);
    if (!previous) return;
    els.load.value = previous.loadValue || "";
    els.unit.value = previous.unit || "kg";
    els.sets.value = previous.targetSets || 5;
    els.reps.value = previous.reps || 12;
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  els.prevMonth.addEventListener("click", () => changeMonth(-1));
  els.nextMonth.addEventListener("click", () => changeMonth(1));

  els.libraryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = normalizeName(els.libraryName.value);
    if (!name) return;
    await ensureExercise(name, els.libraryCategory.value);
    els.libraryName.value = "";
    await loadAll();
    render();
  });

  els.exportData.addEventListener("click", exportBackup);
  els.backupShortcut.addEventListener("click", exportBackup);
  els.importData.addEventListener("change", importBackup);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("exercises")) {
        const store = db.createObjectStore("exercises", { keyPath: "id" });
        store.createIndex("name", "name", { unique: true });
      }
      if (!db.objectStoreNames.contains("workouts")) {
        db.createObjectStore("workouts", { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, value) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, key) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seedDefaultExercises() {
  const existing = await getAll("exercises");
  if (existing.length) return;
  await Promise.all(
    DEFAULT_EXERCISES.map(([name, category]) =>
      put("exercises", {
        id: crypto.randomUUID(),
        name,
        category,
        createdAt: new Date().toISOString()
      })
    )
  );
}

async function loadAll() {
  const [exercises, workouts, settings] = await Promise.all([
    getAll("exercises"),
    getAll("workouts"),
    getAll("settings")
  ]);
  state.exercises = exercises.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  state.workouts = workouts.sort((a, b) => a.date.localeCompare(b.date));
  state.settings = Object.fromEntries(settings.map((item) => [item.key, item.value]));
}

function render() {
  els.date.value = state.selectedDate;
  renderExerciseOptions();
  renderToday();
  renderCalendar();
  renderLibrary();
  renderBackupMeta();
}

function renderExerciseOptions() {
  els.options.replaceChildren(
    ...state.exercises.map((exercise) => {
      const option = document.createElement("option");
      option.value = exercise.name;
      return option;
    })
  );
}

function renderToday() {
  const workout = getWorkout(state.selectedDate);
  const items = workout?.items ?? [];
  els.todayList.replaceChildren(...items.map(renderExerciseCard));
  els.todayEmpty.hidden = items.length > 0;

  const stats = getWorkoutStats(workout ?? { items: [] });
  els.todaySets.textContent = `${stats.sets} 组`;
  els.todayVolume.textContent = `${formatNumber(stats.volume)} kg`;
}

function getWorkoutStats(workout) {
  return workout.items.reduce(
    (stats, item) => {
      stats.sets += item.completedSets;
      if (item.unit === "kg") {
        stats.volume += item.completedSets * item.reps * item.loadValue;
      }
      return stats;
    },
    { sets: 0, volume: 0 }
  );
}

function renderExerciseCard(item) {
  const node = els.cardTemplate.content.firstElementChild.cloneNode(true);
  const title = node.querySelector("h3");
  const meta = node.querySelector(".exercise-meta");
  const setCount = node.querySelector(".set-count");
  const bar = node.querySelector(".progress-track span");
  const minus = node.querySelector(".minus-set");
  const plus = node.querySelector(".plus-set");
  const del = node.querySelector(".delete-button");
  const ratio = item.targetSets ? Math.min(100, (item.completedSets / item.targetSets) * 100) : 0;

  title.textContent = item.name;
  meta.textContent = `${formatLoad(item)} · ${item.targetSets}组 × ${item.reps}次`;
  setCount.textContent = `${item.completedSets}/${item.targetSets}`;
  bar.style.width = `${ratio}%`;

  minus.addEventListener("click", () => updateSetCount(item.id, -1));
  plus.addEventListener("click", () => updateSetCount(item.id, 1));
  del.addEventListener("click", () => deleteWorkoutItem(item.id));
  return node;
}

async function updateSetCount(itemId, delta) {
  const workout = getWorkout(state.selectedDate);
  if (!workout) return;
  const item = workout.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.completedSets = Math.max(0, item.completedSets + delta);
  item.updatedAt = new Date().toISOString();
  await saveWorkout(workout);
  await loadAll();
  render();
}

async function deleteWorkoutItem(itemId) {
  const workout = getWorkout(state.selectedDate);
  if (!workout) return;
  workout.items = workout.items.filter((item) => item.id !== itemId);
  await saveWorkout(workout);
  await loadAll();
  render();
}

function renderCalendar() {
  const monthStart = new Date(state.calendarYear, state.calendarMonth, 1);
  const daysInMonth = new Date(state.calendarYear, state.calendarMonth + 1, 0).getDate();
  const startOffset = (monthStart.getDay() + 6) % 7;
  const trainedDates = new Set(state.workouts.filter(hasTraining).map((workout) => workout.date));
  const cells = [];

  els.calendarTitle.textContent = `${state.calendarYear}年${state.calendarMonth + 1}月`;
  for (let i = 0; i < startOffset; i += 1) {
    const blank = document.createElement("span");
    blank.className = "day-cell blank";
    cells.push(blank);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatKey(state.calendarYear, state.calendarMonth + 1, day);
    const workout = getWorkout(dateKey);
    const stats = workout ? getWorkoutStats(workout) : { sets: 0, volume: 0 };
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    cell.innerHTML = `
      <span class="day-number">${day}</span>
      <span class="day-badge">${stats.sets ? `${stats.sets}组` : ""}</span>
    `;
    if (trainedDates.has(dateKey)) {
      cell.classList.add("trained");
      cell.title = `${dateKey} 已训练 ${stats.sets} 组`;
    }
    if (dateKey === state.selectedHistoryDate) cell.classList.add("selected");
    cell.addEventListener("click", () => {
      state.selectedHistoryDate = dateKey;
      renderCalendar();
    });
    cells.push(cell);
  }
  els.calendarGrid.replaceChildren(...cells);

  const monthCount = state.workouts.filter((workout) => {
    const date = parseKey(workout.date);
    return hasTraining(workout) && date.year === state.calendarYear && date.month === state.calendarMonth + 1;
  }).length;
  const streaks = calculateStreaks([...trainedDates]);
  els.monthDays.textContent = `${monthCount} 天训练`;
  els.currentStreak.textContent = `连续 ${streaks.current} 天`;
  els.bestStreak.textContent = `最长 ${streaks.best} 天`;
  renderHistoryDetail();
}

function renderHistoryDetail() {
  const workout = getWorkout(state.selectedHistoryDate);
  els.historyPanel.textContent = `${state.selectedHistoryDate} 记录`;
  if (!workout || !hasTraining(workout)) {
    els.historyDetail.textContent = "这天还没有训练记录。";
    return;
  }
  const list = document.createElement("ul");
  workout.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.name} ${formatLoad(item)} ${item.completedSets}组 × ${item.reps}次`;
    list.append(li);
  });
  els.historyDetail.replaceChildren(list);
}

function renderLibrary() {
  els.libraryList.replaceChildren(
    ...state.exercises.map((exercise) => {
      const item = document.createElement("article");
      item.className = "library-item";
      const body = document.createElement("div");
      const name = document.createElement("h3");
      const category = document.createElement("p");
      name.textContent = exercise.name;
      category.textContent = exercise.category;
      body.append(name, category);
      item.append(body);
      return item;
    })
  );
}

function renderBackupMeta() {
  els.backupWorkouts.textContent = String(state.workouts.filter(hasTraining).length);
  els.backupExercises.textContent = String(state.exercises.length);
  els.backupTime.textContent = state.settings?.lastExportAt
    ? new Date(state.settings.lastExportAt).toLocaleString("zh-CN")
    : "从未";
}

function switchView(viewId) {
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
}

function changeMonth(delta) {
  const date = new Date(state.calendarYear, state.calendarMonth + delta, 1);
  state.calendarYear = date.getFullYear();
  state.calendarMonth = date.getMonth();
  renderCalendar();
}

function getWorkout(date) {
  return state.workouts.find((workout) => workout.date === date);
}

function getOrCreateWorkout(date) {
  return getWorkout(date) ?? { date, items: [], createdAt: new Date().toISOString() };
}

async function saveWorkout(workout) {
  workout.updatedAt = new Date().toISOString();
  if (workout.items.length === 0) {
    await remove("workouts", workout.date);
  } else {
    await put("workouts", workout);
  }
}

async function ensureExercise(name, category) {
  const existing = state.exercises.find((exercise) => exercise.name === name);
  if (existing) return existing;
  const exercise = {
    id: crypto.randomUUID(),
    name,
    category,
    createdAt: new Date().toISOString()
  };
  await put("exercises", exercise);
  state.exercises.push(exercise);
  return exercise;
}

function findLastExerciseRecord(name) {
  const cleanName = normalizeName(name);
  if (!cleanName) return null;
  for (let i = state.workouts.length - 1; i >= 0; i -= 1) {
    const found = [...state.workouts[i].items].reverse().find((item) => item.name === cleanName);
    if (found) return found;
  }
  return null;
}

async function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: state.exercises,
    workouts: state.workouts
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `训练记录备份-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  await put("settings", { key: "lastExportAt", value: payload.exportedAt });
  await loadAll();
  renderBackupMeta();
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.exercises) || !Array.isArray(data.workouts)) {
      throw new Error("备份文件格式不正确");
    }
    const idMap = await importExercises(data.exercises);
    await importWorkouts(data.workouts, idMap);
    await loadAll();
    render();
    alert("备份已导入");
  } catch (error) {
    alert(error.message || "导入失败，请确认选择的是训练记录 JSON 备份。");
  } finally {
    event.target.value = "";
  }
}

async function importExercises(importedExercises) {
  const currentExercises = await getAll("exercises");
  const byName = new Map(currentExercises.map((exercise) => [exercise.name, exercise]));
  const byId = new Map(currentExercises.map((exercise) => [exercise.id, exercise]));
  const idMap = new Map();

  for (const imported of importedExercises) {
    const name = normalizeName(imported?.name || "");
    if (!name) continue;

    const existingByName = byName.get(name);
    if (existingByName) {
      idMap.set(imported.id, existingByName.id);
      continue;
    }

    const idIsTaken = imported?.id && byId.has(imported.id);
    const exercise = {
      id: idIsTaken ? crypto.randomUUID() : imported?.id || crypto.randomUUID(),
      name,
      category: imported?.category || "其他",
      createdAt: imported?.createdAt || new Date().toISOString()
    };
    await put("exercises", exercise);
    byName.set(name, exercise);
    byId.set(exercise.id, exercise);
    idMap.set(imported.id, exercise.id);
  }

  return idMap;
}

async function importWorkouts(importedWorkouts, exerciseIdMap) {
  const currentWorkouts = await getAll("workouts");
  const byDate = new Map(currentWorkouts.map((workout) => [workout.date, workout]));

  for (const imported of importedWorkouts) {
    if (!imported?.date || !Array.isArray(imported.items)) continue;

    const existing = byDate.get(imported.date) ?? {
      date: imported.date,
      items: [],
      createdAt: imported.createdAt || new Date().toISOString()
    };
    const itemById = new Map(existing.items.map((item) => [item.id, item]));

    for (const item of imported.items) {
      const id = item?.id || crypto.randomUUID();
      const normalized = normalizeWorkoutItem(item, exerciseIdMap);
      if (!normalized) continue;

      if (itemById.has(id)) {
        Object.assign(itemById.get(id), normalized, { id });
      } else {
        const nextItem = { ...normalized, id };
        existing.items.push(nextItem);
        itemById.set(id, nextItem);
      }
    }

    await saveWorkout(existing);
    byDate.set(existing.date, existing);
  }
}

function normalizeWorkoutItem(item, exerciseIdMap) {
  const name = normalizeName(item?.name || "");
  if (!name) return null;

  return {
    exerciseId: exerciseIdMap.get(item.exerciseId) || item.exerciseId || "",
    name,
    category: item.category || "其他",
    loadValue: Number.isFinite(Number(item.loadValue)) ? Number(item.loadValue) : 0,
    unit: item.unit || "kg",
    targetSets: Number.isFinite(Number(item.targetSets)) ? Number(item.targetSets) : 1,
    reps: Number.isFinite(Number(item.reps)) ? Number(item.reps) : 1,
    completedSets: Number.isFinite(Number(item.completedSets)) ? Number(item.completedSets) : 0,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function calculateStreaks(dateKeys) {
  const dates = dateKeys.sort();
  const set = new Set(dates);
  let best = 0;
  let run = 0;
  let previous = null;

  dates.forEach((key) => {
    const current = keyToDate(key);
    if (previous && daysBetween(previous, current) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = current;
  });

  let current = 0;
  let cursor = keyToDate(todayKey());
  while (set.has(dateToKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best };
}

function hasTraining(workout) {
  return workout.items.some((item) => item.completedSets > 0);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function numericOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

function formatLoad(item) {
  if (item.unit === "自重") return "自重";
  return `${formatNumber(item.loadValue)}${item.unit || "kg"}`;
}

function todayKey() {
  return dateToKey(new Date());
}

function dateToKey(date) {
  return formatKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function keyToDate(key) {
  const { year, month, day } = parseKey(key);
  return new Date(year, month - 1, day);
}

function daysBetween(left, right) {
  const ms = keyToDate(dateToKey(right)) - keyToDate(dateToKey(left));
  return Math.round(ms / 86400000);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

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

const EXERCISE_CATEGORIES = ["胸", "背", "肩", "腿", "臀", "手臂", "核心", "其他"];
const MUSCLE_GROUPS = ["胸", "背", "肩", "手臂", "腿", "臀", "核心"];
const MUSCLE_METRICS = {
  sets: { label: "组数", unit: "" },
  reps: { label: "次数", unit: "次" },
  volume: { label: "总重量", unit: "kg" },
  maxLoad: { label: "最大重量", unit: "kg" }
};

const state = {
  db: null,
  exercises: [],
  workouts: [],
  selectedDate: todayKey(),
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  selectedHistoryDate: todayKey(),
  musclePeriod: "week",
  muscleMetric: "sets"
};

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  await loadMuscleMap();
  cacheMuscleElements();
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
    muscleMapHost: document.querySelector("#muscle-map-host"),
    muscleRange: document.querySelector("#muscle-range"),
    musclePeriodButtons: document.querySelectorAll("[data-muscle-period]"),
    muscleMetricButtons: document.querySelectorAll("[data-muscle-metric]"),
    muscleTotalSets: document.querySelector("#muscle-total-sets"),
    muscleTotalReps: document.querySelector("#muscle-total-reps"),
    muscleTotalVolume: document.querySelector("#muscle-total-volume"),
    muscleMaxLoad: document.querySelector("#muscle-max-load"),
    exportData: document.querySelector("#export-data"),
    importData: document.querySelector("#import-data"),
    backupShortcut: document.querySelector("#backup-shortcut"),
    backupWorkouts: document.querySelector("#backup-workouts"),
    backupExercises: document.querySelector("#backup-exercises"),
    backupTime: document.querySelector("#backup-time")
  });
  cacheMuscleElements();
}

async function loadMuscleMap() {
  if (!els.muscleMapHost) return;
  try {
    const response = await fetch("muscle-map.svg", { cache: "no-store" });
    if (!response.ok) throw new Error("muscle map unavailable");
    els.muscleMapHost.innerHTML = await response.text();
  } catch {
    els.muscleMapHost.replaceChildren();
  }
}

function cacheMuscleElements() {
  Object.assign(els, {
    muscleMapRange: document.querySelector("#muscle-map-range"),
    muscleShapes: document.querySelectorAll("[data-muscle]"),
    muscleLabelValues: document.querySelectorAll("[data-muscle-value]"),
    muscleLabelSubs: document.querySelectorAll("[data-muscle-sub]")
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
    const existing = state.exercises.find((exercise) => exercise.name === name);
    if (existing) {
      await updateExercise(existing.id, name, els.libraryCategory.value);
    } else {
      await ensureExercise(name, els.libraryCategory.value);
      await loadAll();
      render();
    }
    els.libraryName.value = "";
  });

  els.musclePeriodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.musclePeriod = button.dataset.musclePeriod;
      renderMuscles();
    });
  });

  els.muscleMetricButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.muscleMetric = button.dataset.muscleMetric;
      renderMuscles();
    });
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
  renderMuscles();
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
      const form = document.createElement("form");
      form.className = "library-edit";

      const nameInput = document.createElement("input");
      nameInput.value = exercise.name;
      nameInput.autocomplete = "off";
      nameInput.setAttribute("aria-label", "动作名称");

      const categorySelect = document.createElement("select");
      categorySelect.setAttribute("aria-label", "动作分类");
      categorySelect.replaceChildren(...createCategoryOptions(exercise.category));

      const save = document.createElement("button");
      save.className = "secondary-button";
      save.type = "submit";
      save.textContent = "保存";

      form.append(nameInput, categorySelect, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await updateExercise(exercise.id, nameInput.value, categorySelect.value);
      });
      item.append(form);
      return item;
    })
  );
}

function createCategoryOptions(selectedCategory) {
  const selected = EXERCISE_CATEGORIES.includes(selectedCategory) ? selectedCategory : "其他";
  return EXERCISE_CATEGORIES.map((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === selected;
    return option;
  });
}

async function updateExercise(exerciseId, rawName, rawCategory) {
  const exercise = state.exercises.find((item) => item.id === exerciseId);
  if (!exercise) return;

  const name = normalizeName(rawName);
  const category = EXERCISE_CATEGORIES.includes(rawCategory) ? rawCategory : "其他";
  if (!name) {
    alert("动作名称不能为空");
    renderLibrary();
    return;
  }

  const duplicate = state.exercises.find((item) => item.id !== exerciseId && item.name === name);
  if (duplicate) {
    alert("动作名称已存在");
    renderLibrary();
    return;
  }

  const nextExercise = {
    ...exercise,
    name,
    category,
    updatedAt: new Date().toISOString()
  };

  await put("exercises", nextExercise);
  await syncWorkoutItemsForExercise(exercise, nextExercise);
  await loadAll();
  render();
}

async function syncWorkoutItemsForExercise(previousExercise, nextExercise) {
  const changedWorkouts = [];

  state.workouts.forEach((workout) => {
    let changed = false;
    workout.items.forEach((item) => {
      if (item.exerciseId !== previousExercise.id && item.name !== previousExercise.name) return;
      item.exerciseId = nextExercise.id;
      item.name = nextExercise.name;
      item.category = nextExercise.category;
      item.updatedAt = new Date().toISOString();
      changed = true;
    });
    if (changed) changedWorkouts.push(workout);
  });

  await Promise.all(changedWorkouts.map((workout) => saveWorkout(workout)));
}

function renderMuscles() {
  if (!els.muscleShapes.length) return;

  const range = getMuscleDateRange(state.musclePeriod);
  const report = getMuscleReport(range.start, range.end);
  const maxMetric = Math.max(...MUSCLE_GROUPS.map((group) => report.groups[group][state.muscleMetric]), 0);

  els.muscleRange.textContent = formatDateRange(range.start, range.end);
  if (els.muscleMapRange) els.muscleMapRange.textContent = formatCompactDateRange(range.start, range.end);
  els.muscleTotalSets.textContent = formatNumber(report.totals.sets);
  els.muscleTotalReps.textContent = `${formatNumber(report.totals.reps)} 次`;
  els.muscleTotalVolume.textContent = `${formatNumber(report.totals.volume)} kg`;
  els.muscleMaxLoad.textContent = `${formatNumber(report.totals.maxLoad)} kg`;

  els.musclePeriodButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.musclePeriod === state.musclePeriod);
  });
  els.muscleMetricButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.muscleMetric === state.muscleMetric);
  });

  els.muscleShapes.forEach((shape) => {
    const group = shape.dataset.muscle;
    const value = report.groups[group]?.[state.muscleMetric] ?? 0;
    const intensity = maxMetric > 0 ? value / maxMetric : 0;
    shape.style.setProperty("--heat-color", heatColor(intensity));
    shape.classList.toggle("active", value > 0);
  });

  els.muscleLabelValues.forEach((label) => {
    const stats = report.groups[label.dataset.muscleValue];
    label.textContent = stats ? `${formatNumber(stats.sets)}组` : "0组";
  });
  els.muscleLabelSubs.forEach((label) => {
    const stats = report.groups[label.dataset.muscleSub];
    label.textContent = stats
      ? `${formatNumber(stats.reps)}次/${formatNumber(stats.volume)}kg/${formatNumber(stats.maxLoad)}kg`
      : "0次/0kg/0kg";
  });
}

function getMuscleReport(start, end) {
  const groups = Object.fromEntries(
    MUSCLE_GROUPS.map((group) => [
      group,
      { sets: 0, reps: 0, volume: 0, maxLoad: 0 }
    ])
  );
  const totals = { sets: 0, reps: 0, volume: 0, maxLoad: 0 };

  state.workouts.forEach((workout) => {
    const date = keyToDate(workout.date);
    if (date < start || date > end) return;

    workout.items.forEach((item) => {
      if (!item.completedSets) return;
      const group = getMuscleGroup(item);
      if (!groups[group]) return;

      const reps = item.completedSets * item.reps;
      const volume = item.unit === "kg" ? reps * item.loadValue : 0;
      const maxLoad = item.unit === "kg" ? item.loadValue : 0;

      groups[group].sets += item.completedSets;
      groups[group].reps += reps;
      groups[group].volume += volume;
      groups[group].maxLoad = Math.max(groups[group].maxLoad, maxLoad);

      totals.sets += item.completedSets;
      totals.reps += reps;
      totals.volume += volume;
      totals.maxLoad = Math.max(totals.maxLoad, maxLoad);
    });
  });

  return { groups, totals };
}

function getMuscleGroup(item) {
  const text = `${item.category || ""} ${item.name || ""}`;
  if (/胸/.test(text)) return "胸";
  if (/背|划船|下拉|引体/.test(text)) return "背";
  if (/肩|推肩|侧平举|飞鸟/.test(text)) return "肩";
  if (/臂|二头|三头|弯举|下压/.test(text)) return "手臂";
  if (/臀/.test(text)) return "臀";
  if (/腿|股|蹲|腿举|腿屈伸|腿弯举|小腿/.test(text)) return "腿";
  if (/核心|腹|卷腹|平板/.test(text)) return "核心";
  return item.category && MUSCLE_GROUPS.includes(item.category) ? item.category : "其他";
}

function getMuscleDateRange(period) {
  const today = keyToDate(todayKey());
  const start = new Date(today);
  const end = new Date(today);

  if (period === "week") {
    const offset = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - offset);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatDateRange(start, end) {
  if (dateToKey(start) === dateToKey(end)) {
    return `${dateToKey(start)} 今天`;
  }
  return `${dateToKey(start)} 至 ${dateToKey(end)}`;
}

function formatCompactDateRange(start, end) {
  const shortKey = (date) => `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  if (dateToKey(start) === dateToKey(end)) {
    return `${shortKey(start)} 今天`;
  }
  return `${shortKey(start)}-${shortKey(end)}`;
}

function heatColor(intensity) {
  if (intensity <= 0) return "#e3ded3";
  const stops = [
    [254, 202, 202],
    [248, 113, 113],
    [220, 38, 38],
    [127, 29, 29]
  ];
  const scaled = Math.min(0.999, Math.max(0, intensity)) * (stops.length - 1);
  const index = Math.floor(scaled);
  const mix = scaled - index;
  const from = stops[index];
  const to = stops[index + 1] ?? from;
  const channel = (i) => Math.round(from[i] + (to[i] - from[i]) * mix);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
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

const TYPE_LABELS = {
  single: "单选题",
  multiple: "多选题",
  judgment: "判断题",
  short: "简答题",
};
const STORAGE_KEY = "fde-quiz-progress-v1";
const RECOVERY_KEY = "fde-quiz-recovery-v1";
const SCHEMA_VERSION = 1;
const COMPATIBLE_BANK_VERSIONS = new Map([
  ["fde-211-7d069eed", new Set(["fde-210-aeea5465"])],
]);

let questions = [];
let questionById = new Map();
let bankVersion = "";
let state = emptyState();
let currentView = "home";
let draftSelection = new Set();
let shortDraft = "";
let replayId = null;
let noticeTimer = null;
let unreadableProgressRaw = null;
let storageCanWrite = true;

function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    bankVersion,
    viewed: [],
    attempts: {},
    study: { type: "all", index: 0 },
    quiz: { type: "all", order: "sequential", review: false, ids: [], index: 0 },
  };
}

function fingerprintQuestions(list) {
  const content = JSON.stringify(list);
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  }
  return `fde-${list.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validateQuestionBank(list) {
  const expectedMinimum = { single: 80, multiple: 41, judgment: 80, short: 10 };
  if (!Array.isArray(list) || list.length < 211) return false;
  const counts = { single: 0, multiple: 0, judgment: 0, short: 0 };
  const ids = new Set();
  for (const question of list) {
    if (!question || !Object.hasOwn(counts, question.type) ||
        typeof question.id !== "string" || ids.has(question.id) ||
        !question.stem || !question.chapter) return false;
    ids.add(question.id);
    counts[question.type] += 1;
    if (question.type === "short") {
      if (!question.reference) return false;
    } else {
      if (!Array.isArray(question.options) || !question.explanation ||
          typeof question.answer !== "string" || !question.answer) return false;
      const optionKeys = question.options.map((option) => option.key);
      if (new Set(optionKeys).size !== optionKeys.length ||
          [...question.answer].some((key) => !optionKeys.includes(key))) return false;
    }
  }
  const prefixes = { single: "S", multiple: "M", judgment: "J", short: "A" };
  return Object.entries(expectedMinimum).every(([type, count]) =>
    counts[type] >= count && Array.from({ length: count }, (_, index) =>
      `${prefixes[type]}${String(index + 1).padStart(3, "0")}`).every((id) => ids.has(id)));
}

function isCompatibleBankVersion(version) {
  return version === bankVersion || COMPATIBLE_BANK_VERSIONS.get(bankVersion)?.has(version) === true;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function showNotice(message, error = false, persistent = false) {
  const notice = document.getElementById("notice");
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.hidden = false;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (!persistent) noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
}

function saveState() {
  if (!storageCanWrite) {
    showNotice("旧进度无法安全备份，新进度暂时不能保存。请到「备份进度」下载旧记录。", true, true);
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    showNotice("浏览器未能保存进度。你仍可继续使用，但关闭页面后记录可能丢失。", true, true);
    return false;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    unreadableProgressRaw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return;
    let restored = null;
    try { restored = validateProgress(JSON.parse(raw)); } catch { /* Keep the raw backup below. */ }
    if (restored) {
      state = restored;
      return;
    }
    unreadableProgressRaw = raw;
    try {
      localStorage.setItem(RECOVERY_KEY, raw);
    } catch {
      storageCanWrite = false;
    }
    showNotice("原有进度与当前题库不兼容，已保留旧记录。可在「备份进度」下载后检查。", true, true);
  } catch {
    showNotice("本机进度无法读取。你仍可看题，但本次进度可能无法保存。", true, true);
  }
  updateRecoveryButton();
}

function updateRecoveryButton() {
  document.getElementById("export-recovery").hidden = !unreadableProgressRaw;
}

function validType(value) {
  return value === "all" || Object.hasOwn(TYPE_LABELS, value);
}

function validateProgress(input) {
  if (!input || input.schema !== SCHEMA_VERSION || !Array.isArray(input.viewed) ||
      !input.attempts || typeof input.attempts !== "object" || Array.isArray(input.attempts) ||
      !input.study || typeof input.study !== "object" ||
      !input.quiz || typeof input.quiz !== "object" ||
      (Object.hasOwn(input, "bankVersion") && !isCompatibleBankVersion(input.bankVersion))) return null;

  const clean = emptyState();
  if (input.viewed.some((id) => !questionById.has(id))) return null;
  clean.viewed = [...new Set(input.viewed)];

  for (const [id, attempt] of Object.entries(input.attempts)) {
    const question = questionById.get(id);
    if (!question || !attempt || typeof attempt !== "object") return null;
    if (question.type === "short") {
      if (![null, "know", "unsure", "unknown"].includes(attempt.grade)) return null;
      clean.attempts[id] = {
        grade: attempt.grade,
        correct: attempt.grade === null ? null : attempt.grade === "know",
        shortText: String(attempt.shortText || "").slice(0, 10000),
      };
    } else {
      if (!Array.isArray(attempt.selected) ||
          attempt.selected.length === 0 ||
          (question.type !== "multiple" && attempt.selected.length !== 1) ||
          attempt.selected.some((key) => !question.options.some((option) => option.key === key))) return null;
      const selected = [...new Set(attempt.selected)].sort();
      clean.attempts[id] = { selected, correct: selected.join("") === question.answer };
    }
  }

  clean.study.type = validType(input.study.type) ? input.study.type : "all";
  clean.study.index = Number.isInteger(input.study.index) ? Math.max(0, input.study.index) : 0;
  clean.quiz.type = validType(input.quiz.type) ? input.quiz.type : "all";
  clean.quiz.order = input.quiz.order === "random" ? "random" : "sequential";
  clean.quiz.review = input.quiz.review === true;
  const allowed = new Set((clean.quiz.review ? questions : filteredQuestions(clean.quiz.type)).map((question) => question.id));
  if (!Array.isArray(input.quiz.ids) || input.quiz.ids.some((id) => !allowed.has(id)) ||
      new Set(input.quiz.ids).size !== input.quiz.ids.length) return null;
  clean.quiz.ids = input.quiz.ids;
  clean.quiz.index = Number.isInteger(input.quiz.index) ? Math.max(0, input.quiz.index) : 0;
  return clean;
}

function filteredQuestions(type) {
  return type === "all" ? questions : questions.filter((question) => question.type === type);
}

function shuffle(ids) {
  const copy = [...ids];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function extendQuizQueue(ids, pool, order) {
  if (!ids.length || new Set(ids).size !== ids.length ||
      ids.some((id) => !pool.includes(id))) return null;
  if (ids.length === pool.length) return ids;
  const additions = pool.filter((id) => !ids.includes(id));
  return order === "random" ? [...ids, ...shuffle(additions)] : pool;
}

function resetQuizQueue() {
  const ids = filteredQuestions(state.quiz.type).map((question) => question.id);
  state.quiz.review = false;
  state.quiz.ids = state.quiz.order === "random" ? shuffle(ids) : ids;
  state.quiz.index = 0;
  draftSelection = new Set();
  shortDraft = "";
  replayId = null;
  saveState();
}

function ensureQuizQueue() {
  if (state.quiz.review) {
    state.quiz.index = Math.min(state.quiz.index, Math.max(state.quiz.ids.length - 1, 0));
    return;
  }
  const pool = filteredQuestions(state.quiz.type).map((question) => question.id);
  if (state.quiz.ids.length !== pool.length || !state.quiz.ids.every((id) => pool.includes(id))) {
    const extended = extendQuizQueue(state.quiz.ids, pool, state.quiz.order);
    if (extended) {
      state.quiz.ids = extended;
      saveState();
    } else resetQuizQueue();
  }
  state.quiz.index = Math.min(state.quiz.index, Math.max(state.quiz.ids.length - 1, 0));
}

function setView(view, preserveReview = false) {
  if (!document.getElementById(`view-${view}`)) return;
  if (view === "quiz" && state.quiz.review && !preserveReview) resetQuizQueue();
  currentView = view;
  document.querySelectorAll(".view").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.classList.toggle("active", active);
    section.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (button.classList.contains("nav-item") || button.classList.contains("mobile-nav-item")) {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  if (view === "home") renderHome();
  if (view === "study") renderStudy();
  if (view === "quiz") renderQuiz();
  if (view === "wrong") renderWrong();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function wrongIds() {
  return Object.entries(state.attempts)
    .filter(([, attempt]) => attempt.correct === false)
    .map(([id]) => id);
}

function answeredCount() {
  return Object.values(state.attempts).filter((attempt) => attempt.correct !== null).length;
}

function renderHome() {
  const counts = Object.fromEntries(Object.keys(TYPE_LABELS).map((type) =>
    [type, questions.filter((question) => question.type === type).length]));
  document.getElementById("hero-total").textContent = questions.length;
  document.getElementById("hero-seal").setAttribute("aria-label", `共 ${questions.length} 道题`);
  document.getElementById("progress-total").textContent = `共 ${questions.length} 题`;
  for (const [type, count] of Object.entries(counts)) {
    document.getElementById(`legend-${type}`).textContent = `${TYPE_LABELS[type].replace("题", "")} ${count}`;
    document.querySelector(`.seg-${type}`).style.width = `${count / questions.length * 100}%`;
  }
  document.getElementById("stat-viewed").textContent = state.viewed.length;
  document.getElementById("stat-answered").textContent = answeredCount();
  document.getElementById("stat-wrong").textContent = wrongIds().length;
  const hasProgress = state.viewed.length || answeredCount();
  document.getElementById("resume-copy").textContent = hasProgress
    ? `已看 ${state.viewed.length} 题，已作答 ${answeredCount()} 题。两种模式都会回到上次的位置。`
    : "还没有学习记录。从一道题开始就好。";
}

function answerText(question) {
  if (question.type === "short") return question.reference;
  if (question.type === "judgment") return question.answer === "A" ? "正确" : "错误";
  return question.answer.split("").join("、");
}

function questionHeader(question, index, total) {
  return `<div class="question-topline"><span class="question-count">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span><span class="question-type">${TYPE_LABELS[question.type]}</span></div>`;
}

function questionIntro(question) {
  const source = question.sourceNote ? ` · ${question.sourceNote}` : "";
  return `<p class="question-chapter">${escapeHtml(question.chapter + source)}</p><h2 class="question-stem">${escapeHtml(question.stem)}</h2>`;
}

function optionsHtml(question, selected = [], showResult = false) {
  const choiceRole = question.type === "multiple" ? "checkbox" : "radio";
  return `<div class="option-list" role="${question.type === "multiple" ? "group" : "radiogroup"}" aria-label="选项">${question.options.map((option) => {
    const isSelected = selected.includes(option.key);
    const isCorrect = question.answer.includes(option.key);
    const resultClass = showResult ? (isCorrect ? "correct" : isSelected ? "incorrect" : "") : "";
    return `<button type="button" role="${choiceRole}" class="option ${isSelected ? "selected" : ""} ${resultClass}" data-option="${option.key}" ${showResult ? "disabled" : ""} aria-checked="${isSelected}"><span class="option-key">${option.key}</span><span class="option-text">${escapeHtml(option.text)}</span></button>`;
  }).join("")}</div>`;
}

function answerPanel(question, attempt = null) {
  const wrong = attempt && attempt.correct === false;
  const heading = attempt
    ? question.type === "short" ? "参考答案" : attempt.correct ? "答对了" : "再看一遍"
    : "正确答案";
  const explanation = question.type === "short" ? "" : `<div class="explanation"><strong>解析</strong>${escapeHtml(question.explanation)}</div>`;
  return `<div class="answer-panel ${wrong ? "wrong-answer" : ""} ${question.type === "short" ? "reference-answer" : ""}"><p class="answer-heading">${heading}</p><p class="answer-value">${escapeHtml(answerText(question))}</p>${explanation}</div>`;
}

function navigationFooter(index, total, mode, action = "") {
  return `<div class="question-footer"><div class="footer-side"><button class="secondary-button" type="button" data-nav="previous" ${index === 0 ? "disabled" : ""}>上一题</button><button class="secondary-button" type="button" data-nav="next" ${index >= total - 1 ? "disabled" : ""}>下一题</button></div>${action}</div>`;
}

function renderStudy() {
  const pool = filteredQuestions(state.study.type);
  if (!pool.length) return;
  state.study.index = Math.min(state.study.index, pool.length - 1);
  const question = pool[state.study.index];
  if (!state.viewed.includes(question.id)) {
    state.viewed.push(question.id);
    saveState();
  }
  document.getElementById("study-type").value = state.study.type;
  document.getElementById("study-content").innerHTML = `
    <article class="question-card">${questionHeader(question, state.study.index, pool.length)}
      <div class="question-body">${questionIntro(question)}
        ${question.type === "short" ? "" : optionsHtml(question, [], true)}
        ${answerPanel(question)}
      </div>
    </article>${navigationFooter(state.study.index, pool.length, "study")}`;
}

function renderQuiz() {
  ensureQuizQueue();
  document.getElementById("quiz-title").textContent = state.quiz.review ? "错题复习" : "刷题";
  document.getElementById("quiz-type").value = state.quiz.type;
  document.getElementById("quiz-order").value = state.quiz.order;
  const question = questionById.get(state.quiz.ids[state.quiz.index]);
  if (!question) return;
  const saved = state.attempts[question.id];
  const revealed = Boolean(saved && replayId !== question.id);
  const selected = revealed ? (saved.selected || []) : [...draftSelection];
  let body;
  let action;
  if (question.type === "short") {
    body = revealed
      ? `<div class="short-draft">${saved.shortText ? `<p class="short-label">你的作答</p><p class="answer-value">${escapeHtml(saved.shortText)}</p>` : ""}</div>${answerPanel(question, saved)}
        <div class="self-grades" aria-label="自评"><button type="button" data-grade="know" class="${saved.grade === "know" ? "selected" : ""}">会</button><button type="button" data-grade="unsure" class="${saved.grade === "unsure" ? "selected" : ""}">模糊</button><button type="button" data-grade="unknown" class="${saved.grade === "unknown" ? "selected" : ""}">不会</button></div>`
      : `<label class="short-label" for="short-answer">先想一想，或写下你的答案</label><textarea id="short-answer" class="short-answer-input" placeholder="可以留空，直接查看参考答案">${escapeHtml(shortDraft)}</textarea><p class="short-tip">简答题由你自己对照评分标准判断掌握程度。</p>`;
    action = revealed
      ? `<button type="button" class="primary-button" data-action="retry">再做一次</button>`
      : `<button type="button" class="primary-button" data-action="submit">查看参考答案</button>`;
  } else {
    body = optionsHtml(question, selected, revealed) + (revealed ? answerPanel(question, saved) : "");
    action = revealed
      ? `<button type="button" class="primary-button" data-action="retry">再做一次</button>`
      : `<button type="button" class="primary-button" data-action="submit" ${selected.length ? "" : "disabled"}>提交答案</button>`;
  }
  document.getElementById("quiz-content").innerHTML = `
    <article class="question-card">${questionHeader(question, state.quiz.index, state.quiz.ids.length)}
      <div class="question-body">${questionIntro(question)}${body}</div>
    </article>${navigationFooter(state.quiz.index, state.quiz.ids.length, "quiz", action)}`;
}

function renderWrong() {
  const ids = wrongIds();
  const container = document.getElementById("wrong-content");
  if (!ids.length) {
    container.innerHTML = `<div class="empty-state"><h2>目前没有待复习的题</h2><p>刷题时答错的题，会自动出现在这里。</p><button class="primary-button" type="button" data-view="quiz">去刷题</button></div>`;
    return;
  }
  container.innerHTML = `<div class="wrong-list">${ids.map((id) => {
    const question = questionById.get(id);
    return `<article class="wrong-item"><div><small>${TYPE_LABELS[question.type]} · ${escapeHtml(question.chapter)}</small><p>${escapeHtml(question.stem)}</p></div><button type="button" class="secondary-button" data-retry="${id}">再做一遍</button></article>`;
  }).join("")}</div>`;
}

function moveQuestion(direction) {
  if (currentView === "study") {
    const total = filteredQuestions(state.study.type).length;
    state.study.index = Math.max(0, Math.min(total - 1, state.study.index + direction));
    saveState();
    renderStudy();
  } else if (currentView === "quiz") {
    state.quiz.index = Math.max(0, Math.min(state.quiz.ids.length - 1, state.quiz.index + direction));
    draftSelection = new Set();
    shortDraft = "";
    replayId = null;
    saveState();
    renderQuiz();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function submitCurrent() {
  const question = questionById.get(state.quiz.ids[state.quiz.index]);
  if (!question) return;
  if (question.type === "short") {
    shortDraft = document.getElementById("short-answer")?.value || "";
    state.attempts[question.id] = { grade: null, correct: null, shortText: shortDraft };
  } else {
    if (!draftSelection.size) return;
    const selected = [...draftSelection].sort();
    state.attempts[question.id] = { selected, correct: selected.join("") === question.answer };
  }
  replayId = null;
  saveState();
  renderQuiz();
}

function setGrade(grade) {
  const id = state.quiz.ids[state.quiz.index];
  const question = questionById.get(id);
  if (!question || question.type !== "short" || !state.attempts[id]) return;
  state.attempts[id].grade = grade;
  state.attempts[id].correct = grade === "know";
  saveState();
  renderQuiz();
}

function openIndex() {
  const pool = filteredQuestions(state.study.type);
  document.getElementById("question-index").innerHTML = pool.map((question, index) => `
    <button type="button" class="index-button ${state.viewed.includes(question.id) ? "seen" : ""} ${state.study.index === index ? "current" : ""}"
      data-index="${index}" aria-label="第 ${index + 1} 题">${index + 1}</button>`).join("");
  document.getElementById("question-dialog").showModal();
}

function exportProgress() {
  const content = JSON.stringify({ app: "fde-quiz", schema: SCHEMA_VERSION, bankVersion, exportedAt: new Date().toISOString(), progress: state }, null, 2);
  downloadJson(content, `FDE刷题进度-${new Date().toISOString().slice(0, 10)}.json`);
  showNotice("进度文件已下载。请保存在你容易找到的位置。");
}

function downloadJson(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function decodeProgressBackup(content) {
  const parsed = JSON.parse(content);
  if (!parsed || parsed.app !== "fde-quiz" || parsed.schema !== SCHEMA_VERSION) throw new Error("format");
  if (Object.hasOwn(parsed, "bankVersion") && !isCompatibleBankVersion(parsed.bankVersion)) throw new Error("bank");
  const restored = validateProgress(parsed.progress);
  if (!restored) throw new Error("invalid");
  return restored;
}

async function importProgress(file) {
  if (!file || file.size > 2_000_000) {
    showNotice("请选择不超过 2 MB 的进度文件。", true);
    return;
  }
  try {
    const restored = decodeProgressBackup(await file.text());
    if (!window.confirm(`导入后将替换本机进度。文件中有 ${restored.viewed.length} 道已看题、${Object.values(restored.attempts).filter((attempt) => attempt.correct !== null).length} 道已作答题。确定导入吗？`)) return;
    state = restored;
    draftSelection = new Set();
    shortDraft = "";
    replayId = null;
    saveState();
    showNotice("进度已导入。可以继续看解答或刷题。");
    setView("home");
  } catch (error) {
    if (error.message === "bank") {
      showNotice("无法导入：这份进度属于另一版题库，现有进度没有更改。", true);
      return;
    }
    showNotice("无法导入：文件不是此题库的有效进度记录。现有进度没有更改。", true);
  }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { setView(viewButton.dataset.view); return; }

    const option = event.target.closest("[data-option]");
    if (option && currentView === "quiz") {
      const question = questionById.get(state.quiz.ids[state.quiz.index]);
      if (!question || state.attempts[question.id] && replayId !== question.id) return;
      const key = option.dataset.option;
      if (question.type === "multiple") {
        if (draftSelection.has(key)) draftSelection.delete(key);
        else draftSelection.add(key);
      } else draftSelection = new Set([key]);
      renderQuiz();
      document.querySelector(`#quiz-content [data-option="${key}"]`)?.focus();
      return;
    }

    const navButton = event.target.closest("[data-nav]");
    if (navButton) { moveQuestion(navButton.dataset.nav === "next" ? 1 : -1); return; }

    const action = event.target.closest("[data-action]");
    if (action?.dataset.action === "submit") { submitCurrent(); return; }
    if (action?.dataset.action === "retry") {
      replayId = state.quiz.ids[state.quiz.index];
      draftSelection = new Set();
      shortDraft = "";
      renderQuiz();
      return;
    }

    const grade = event.target.closest("[data-grade]");
    if (grade) { setGrade(grade.dataset.grade); return; }

    const retry = event.target.closest("[data-retry]");
    if (retry) {
      const ids = wrongIds();
      state.quiz.type = "all";
      state.quiz.order = "sequential";
      state.quiz.review = true;
      state.quiz.ids = ids;
      state.quiz.index = ids.indexOf(retry.dataset.retry);
      replayId = retry.dataset.retry;
      draftSelection = new Set();
      shortDraft = "";
      saveState();
      setView("quiz", true);
      return;
    }

    const indexButton = event.target.closest("[data-index]");
    if (indexButton) {
      state.study.index = Number(indexButton.dataset.index);
      saveState();
      document.getElementById("question-dialog").close();
      renderStudy();
      return;
    }
  });

  document.getElementById("study-type").addEventListener("change", (event) => {
    state.study.type = event.target.value;
    state.study.index = 0;
    saveState();
    renderStudy();
  });
  document.getElementById("quiz-type").addEventListener("change", (event) => {
    state.quiz.type = event.target.value;
    resetQuizQueue();
    renderQuiz();
  });
  document.getElementById("quiz-order").addEventListener("change", (event) => {
    state.quiz.order = event.target.value;
    resetQuizQueue();
    renderQuiz();
  });
  document.getElementById("open-index").addEventListener("click", openIndex);
  document.getElementById("close-index").addEventListener("click", () => document.getElementById("question-dialog").close());
  document.getElementById("export-progress").addEventListener("click", exportProgress);
  document.getElementById("export-recovery").addEventListener("click", () => {
    if (!unreadableProgressRaw) return;
    downloadJson(unreadableProgressRaw, `FDE旧进度-${new Date().toISOString().slice(0, 10)}.json`);
    showNotice("旧记录已下载。请保留这份文件。");
  });
  document.getElementById("import-progress").addEventListener("change", async (event) => {
    await importProgress(event.target.files[0]);
    event.target.value = "";
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "short-answer") shortDraft = event.target.value;
  });
}

async function start() {
  bindEvents();
  try {
    if (Array.isArray(window.FDE_QUESTIONS)) {
      questions = window.FDE_QUESTIONS;
    } else {
      const response = await fetch("questions.json");
      if (!response.ok) throw new Error(String(response.status));
      questions = await response.json();
    }
    if (!validateQuestionBank(questions)) throw new Error("question bank");
    bankVersion = fingerprintQuestions(questions);
    state = emptyState();
    questionById = new Map(questions.map((question) => [question.id, question]));
    loadState();
    updateRecoveryButton();
    ensureQuizQueue();
    renderHome();
  } catch {
    showNotice("题库没有加载成功。请确认 questions.js 与页面文件放在同一个文件夹。", true, true);
  }
}

if (typeof window === "undefined") {
  module.exports = {
    emptyState,
    fingerprintQuestions,
    validateQuestionBank,
    validateProgress,
    decodeProgressBackup,
    extendQuizQueue,
    initializeQuestionBankForTests(list) {
      questions = list;
      questionById = new Map(list.map((question) => [question.id, question]));
      bankVersion = fingerprintQuestions(list);
      return bankVersion;
    },
  };
} else {
  start();
}

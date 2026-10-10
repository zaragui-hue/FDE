const test = require("node:test");
const assert = require("node:assert/strict");
const questions = require("../quiz-app/questions.json");
const app = require("../quiz-app/app.js");

const bankVersion = app.initializeQuestionBankForTests(questions);

test("published bank contains the expected complete question set", () => {
  assert.equal(app.validateQuestionBank(questions), true);
  assert.equal(questions.length, 211);
  assert.equal(new Set(questions.map((question) => question.id)).size, 211);
  assert.equal(questions.filter((question) => question.type === "multiple").length, 41);
  assert.equal(questions.at(-1).id, "M041");
  assert.equal(questions.at(-1).variantOf, "M038");
  const original = questions.find((question) => question.id === "M038");
  assert.deepEqual(questions.at(-1).options, original.options);
  assert.equal(questions.at(-1).answer, original.answer);
});

test("bank fingerprint changes when question content changes", () => {
  assert.equal(app.fingerprintQuestions(questions), bankVersion);
  const changed = structuredClone(questions);
  changed[0].answer = "A";
  assert.notEqual(app.fingerprintQuestions(changed), bankVersion);
});

test("progress validates against the current bank and preserves prototype records", () => {
  const legacy = app.emptyState();
  delete legacy.bankVersion;
  legacy.viewed = ["S001", "S002"];
  legacy.attempts.S001 = { selected: ["D"], correct: true };
  legacy.quiz.ids = questions.slice(0, 210).map((question) => question.id);
  assert.equal(app.validateProgress(legacy).bankVersion, bankVersion);
  assert.deepEqual(app.validateProgress(legacy).viewed, ["S001", "S002"]);
  assert.deepEqual(Object.keys(app.validateProgress(legacy).attempts), ["S001"]);

  const previousBank = app.fingerprintQuestions(questions.slice(0, 210));
  assert.equal(previousBank, "fde-210-aeea5465");
  const earlier = { ...legacy, bankVersion: previousBank };
  assert.equal(app.validateProgress(earlier).bankVersion, bankVersion);
  const extended = app.extendQuizQueue(earlier.quiz.ids, questions.map((question) => question.id), "sequential");
  assert.equal(extended.length, 211);
  assert.equal(extended.at(-1), "M041");
  assert.deepEqual(extended.slice(0, 210), earlier.quiz.ids);
});

test("another question bank and malformed answers cannot replace progress", () => {
  const progress = app.emptyState();
  progress.quiz.ids = questions.map((question) => question.id);
  assert.equal(progress.bankVersion, bankVersion);

  assert.equal(app.validateProgress({ ...progress, bankVersion: "different-bank" }), null);
  assert.equal(app.validateProgress({ ...progress, viewed: ["missing-id"] }), null);
  assert.equal(app.validateProgress({ ...progress, attempts: { S001: { selected: ["X"] } } }), null);
  assert.equal(app.validateProgress({ ...progress, attempts: { S001: { selected: [] } } }), null);
  assert.equal(app.validateProgress({ ...progress, attempts: { S001: { selected: ["A", "B"] } } }), null);
});

test("backup import accepts current and legacy files, rejects other banks", () => {
  const progress = app.emptyState();
  progress.viewed = ["S001"];
  const current = { app: "fde-quiz", schema: 1, bankVersion, progress };
  assert.deepEqual(app.decodeProgressBackup(JSON.stringify(current)).viewed, ["S001"]);

  const legacy = structuredClone(current);
  delete legacy.bankVersion;
  delete legacy.progress.bankVersion;
  assert.deepEqual(app.decodeProgressBackup(JSON.stringify(legacy)).viewed, ["S001"]);

  const previousBank = app.fingerprintQuestions(questions.slice(0, 210));
  const previous = { ...current, bankVersion: previousBank,
    progress: { ...progress, bankVersion: previousBank, quiz: { ...progress.quiz, ids: questions.slice(0, 210).map((question) => question.id) } } };
  assert.deepEqual(app.decodeProgressBackup(JSON.stringify(previous)).viewed, ["S001"]);

  assert.throws(() => app.decodeProgressBackup(JSON.stringify({ ...current, bankVersion: "other" })), /bank/);
  assert.throws(() => app.decodeProgressBackup(JSON.stringify({ ...current, progress: { ...progress, viewed: ["bad-id"] } })), /invalid/);
  assert.throws(() => app.decodeProgressBackup("not-json"), SyntaxError);
});

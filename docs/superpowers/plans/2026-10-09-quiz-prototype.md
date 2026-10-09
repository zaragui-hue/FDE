# FDE Quiz HTML Prototype Implementation Plan

> **For agentic workers:** Implement in this session. The user explicitly requested an interactive HTML sample now.

**Goal:** Build a mobile-first HTML prototype using the supplied 210 real questions, with answer viewing, quiz interaction, and local progress.

**Architecture:** A static site in `quiz-app/` loads a generated `questions.json`. A small Python exporter reads the source workbook; the browser handles modes, answer checking, and local state without a server. A local HTTP server is used only for preview.

**Tech Stack:** HTML, CSS, vanilla JavaScript, JSON, Python `openpyxl` for read-only import.

---

### Task 1: Export and validate questions

**Files:** Create `scripts/export_questions.py`, `quiz-app/questions.json`, `quiz-app/questions.js`.

- [x] Read the four content sheets in the source workbook and map them to stable IDs `S001`–`S080`, `M001`–`M040`, `J001`–`J080`, `A001`–`A010`.
- [x] Normalize objective answers to option letters (`A`–`E`) or Boolean judgment; retain the raw text of questions, options, explanations, chapters, and reference answers.
- [x] Write UTF-8 JSON and browser-loadable JavaScript; validate counts, required fields, and that every objective answer points to an existing option.
- [x] Run the exporter with the bundled Python runtime and inspect counts; expected `80/40/80/10`, 210 total, no invalid answers.

### Task 2: Build the mobile page

**Files:** Create `quiz-app/index.html`, `quiz-app/styles.css`.

- [x] Add direct entry into a home view with two clear actions: `看解答` and `开始刷题`.
- [x] Provide study, quiz, wrong-question, and backup views in one page. Use buttons, labels, and status regions with semantic HTML.
- [x] Use a cool paper and deep blue ink palette. Make the actual `80/40/80/10` question distribution the visual signature, not decorative charts. Keep question text and answer controls readable on a narrow phone.
- [x] Preview at phone width and review the desktop layout rules; all controls remain reachable on the inspected phone view without sideways scrolling.

### Task 3: Implement interactions and local state

**Files:** Create `quiz-app/app.js`.

- [x] Load and render questions. Switch between home, study, quiz, wrong-question, and backup views without reloading.
- [x] Study mode shows the answer immediately and records viewed questions. Quiz mode hides it until submission; exact-match grade single/multiple/judgment questions, and self-grade short answers.
- [x] Support type filters, previous/next navigation, a nonrepeating random round, and a current wrong-question queue.
- [x] Persist progress in local storage, and validate exported/imported progress before replacing it. If storage fails, keep the page usable and show a clear message.

### Task 4: Verify and deliver the prototype

**Files:** Review `quiz-app/` and the design spec.

- [x] Run the local HTTP preview and test the primary flows as a user: enter study mode, reveal answers in quiz mode, create and clear a wrong question, refresh to confirm saved progress, and export.
- [x] Check the phone layout and correct the low-contrast study options found there. Syntax checks pass for both JavaScript files.
- [x] Open the prototype for the user in Codex and provide a direct file link. Keep GitHub publishing for the user's later review of this working sample.

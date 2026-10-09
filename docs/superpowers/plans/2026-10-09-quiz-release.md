# FDE Quiz Release Implementation Plan

**Goal:** Turn the approved 210-question prototype into a reliable static app ready for GitHub Pages.

**Architecture:** Keep the existing dependency-free HTML/CSS/JavaScript app. Add a deterministic question-bank fingerprint to local progress and exported backups, strengthen import and loading checks, refine small-screen controls, and publish only `quiz-app/` through a Pages workflow.

**Tech Stack:** Python/openpyxl for the one-time export, vanilla JavaScript, CSS, GitHub Actions.

---

### Task 1: Protect progress against a changed question bank

**Files:** `quiz-app/app.js`

- [x] Compute a stable fingerprint from the full ordered question array at startup.
- [x] Store it with new local progress and exported files, while accepting the prototype's version-one progress that lacks a fingerprint.
- [x] Reject an import with a different fingerprint before changing in-memory or local progress; show a specific message.
- [x] Reject malformed local progress visibly and preserve a downloadable copy before starting fresh.

### Task 2: Finish the practice flow

**Files:** `quiz-app/app.js`, `quiz-app/index.html`, `quiz-app/styles.css`

- [x] Check question IDs, type totals, and objective answers when the app starts.
- [x] Make all key mobile controls at least 44 pixels tall and check 320-pixel wrapping.
- [x] Keep answer and review states clear, including short-answer self-grading and returning to normal practice.

### Task 3: Prepare a reproducible GitHub Pages release

**Files:** `.github/workflows/pages.yml`, `README.md`

- [x] Add an Actions workflow that uploads only `quiz-app/` and deploys it to Pages.
- [x] Explain local preview, question export, local-only progress, backup, and Pages setup in the README.
- [x] Confirm raw Excel files remain excluded from Git and the published artifact.

### Task 4: Verify the finished app

**Files:** `scripts/export_questions.py`, `quiz-app/*`

- [x] Regenerate and check 210 questions: 80 single, 40 multiple, 80 judgment, 10 short.
- [x] Check JavaScript syntax and compare generated data against the committed files.
- [x] Use an isolated local origin to test fresh progress, study, quiz, wrong-answer review, export, and refresh persistence; test import parsing with valid, old-format, changed-bank, and malformed backups.
- [x] Check 320-pixel and 390-pixel mobile views and a desktop view for clipping or hidden controls.

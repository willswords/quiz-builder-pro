# QuizBuilder Pro

QuizBuilder Pro is a Windows desktop app for building quizzes and assessments. You write the questions once and export them in the format you need: a SCORM 2004 package, a standalone HTML quiz, an import file for Cornerstone, Articulate Storyline or Moodle, or an answer key.

Quizzes are saved as `.quiz` files on your computer. Double-click one to open it in the app.

## What it does

- **Build quizzes:** true/false, single-answer and multiple-answer questions, plus information blocks for instructions, section introductions and scenarios.
- **Add media:** attach an image, a video file, or a YouTube or Vimeo link to any question.
- **Preview:** take the quiz yourself before you export it, from the beginning or from the current question.
- **Import existing content:** bring in questions from CSV, Moodle XML or a SCORM 2004 package, or paste a question and its answers with Smart Paste.
- **Export:** see [Exports](#exports) below.

## Getting started

1. Install QuizBuilder Pro with `QuizBuilderPro-Setup-<version>.exe`, or run `QuizBuilderPro-Portable-<version>.exe` without installing.
2. Open the app. A new quiz starts with an **Instructions** block.
3. Give the quiz a title and description at the top of the left panel.
4. Add questions with the buttons at the bottom of the left panel.
5. Click **Save Quiz** to choose where to save the `.quiz` file.

## Building a quiz

The window has three panels:

- **Left: question list.** Drag items to reorder them. Click an item to edit it, or use the trash icon to delete it.
- **Middle: editor.** Edit the selected question's text, answers, media and explanation.
- **Right: Quiz Settings.** Set the passing score and quiz options, then save, preview, import and export.

### Question types

| Type | Use it for |
|---|---|
| **True / False** | A statement learners mark true or false. |
| **Single Answer Multiple Choice** | One correct answer. |
| **Multiple Answer Multiple Choice** | More than one correct answer; learners must select all of them. |
| **Info Block** | Text with no answers, such as instructions or the start of a new section. Supports Markdown formatting (**Ctrl+B** bold, **Ctrl+I** italic, **Ctrl+K** link). |
| **Add Instructions** | Adds the standard Instructions block at the top of the quiz. |

Marking an Info Block as a **Scenario** lets the questions after it show the scenario text: turn on **Reference Scenario** on each of those questions.

**Smart Paste** fills in a question from pasted text. Put the question on the first line and one answer per line after it, with an asterisk (`*`) in front of each correct answer.

### Quiz settings

- **Passing Score (%):** the score learners need to pass. The Instructions block updates to match.
- **Encrypt Quiz Data:** hides the answers in exported HTML and SCORM files so learners can't read them in the page source.
- **Show Immediate Feedback:** tells learners whether each answer was right before they move on.
- **Answer Explanation** (on each question, optional): text shown after the learner answers.

Before every save, preview or export, the app checks that each question has text, at least two answers where needed, and at least one correct answer.

## Saving and opening

- **Save Quiz** (**Ctrl+S**) saves to the current `.quiz` file. The first time, it asks where to save.
- **Save As...** (**Ctrl+Shift+S**) saves a copy to a new file.
- **Open** (**Ctrl+O**) opens a `.quiz` file. **Recent** lists quizzes you've opened recently.
- After a quiz has been saved once, changes are auto-saved to its file 30 seconds after you stop editing.
- **Undo** (**Ctrl+Z**) and **Redo** (**Ctrl+Y**) are at the top of the left panel.

## Exports

All exports are in the right-hand panel.

| Export | What you get |
|---|---|
| **Export SCORM 2004** | A `.zip` package to upload to any SCORM 2004 LMS. Turn on **Enable SCORM Debug** to add logging when troubleshooting an LMS. |
| **Export Cornerstone XLSX** | A workbook for Cornerstone **Edge Import**. See [Cornerstone export](#cornerstone-export). |
| **Export HTML** | A single HTML file that runs the quiz offline in any browser. |
| **Export Storyline XLSX / CSV** | Questions in the format Articulate Storyline imports. |
| **Export XML** | Moodle XML. |
| **Export CSV** | All questions, including information blocks, as a CSV you can edit and import again. |
| **Export Answer Key (HTML)** | A printable answer key that you can open in Word. |

**Import CSV**, **Import XML** and **Import SCORM 2004 Zip** bring questions back in. **Download Guide (PDF)** explains the CSV format, which is also described in [CSV_IMPORT_GUIDE.md](CSV_IMPORT_GUIDE.md).

## Cornerstone export

**Export Cornerstone XLSX** opens a dialog and creates a workbook with three tabs:

- **Test-Worksheet:** the test itself (Test ID, title, provider, subject, attempts, passing score and so on).
- **Question-Category-Worksheet:** a question category for the quiz.
- **Questions-Mapping-Worksheet:** one row per question, with answers, the correct answer, and the section it belongs to.

Edge Import loads one tab at a time, and Cornerstone needs them in this order: question category, then questions, then the test, then the test mapping.

### The export dialog

| Field | Notes |
|---|---|
| **Test Number** | Required. A serial number for the test, used in the filename (`<number>-<title>.xlsx`) and in each question's reference number (for example `ConcreteandMasonry-002-00`). Remembered for each quiz. |
| **Vendor/Provider** | Defaults to **Safety & Health**. Must be a provider that already exists in Cornerstone. |
| **Provider Type** | ILT or Online. Must match how the provider is set up in Cornerstone. Providers whose names end in "-Online" switch this to Online automatically. |
| **Subject** | Defaults to **Safety & Health**. The subject ID is filled in for you. |
| **Author ID** | The Cornerstone user ID recorded as each question's author. |
| **Attempts Allowed** | Defaults to 3. Leave blank for unlimited attempts. |
| **Training Time** | Hours and minutes, exported in Cornerstone's `HHHH:MM:SS` format. |
| **Test Instructions** | Filled in from the quiz's opening Information Block. If there isn't one, standard text is generated from the passing score and attempts. You can edit it in the dialog; **Reset to default** restores it. |
| **Recurrence** | Three checkboxes, worded as in Cornerstone. The app works out the Recurrence number from them. |
| **Advanced** | Review Level, which score and review options managers and users get, and the Parent Category Id. |

Apart from the Test Number and Test Instructions, the dialog remembers your choices for the next export.

### Sections

The first Information Block is the Test Instructions. Every Information Block after it starts a new test section: its title becomes the **Section Name**, and its text becomes the **Section Description**, converted to HTML so formatting carries over. An Information Block that comes straight after the Instructions block names Section 1 instead of starting Section 2. A quiz with no Information Blocks after the Instructions block is exported as a single section.

### Checks before export

The dialog won't export, and explains why, if the file would break Cornerstone's import rules:

- A question has more than 10 answers or no correct answer.
- Two sections have the same name.
- A value is too long. Watch the Question Reference Number, which is limited to 50 characters: long quiz titles may need to be shortened.

## Building from source

You need [Node.js](https://nodejs.org/) installed. In the project folder, install the dependencies:

```bash
npm install
```

Then:

| Task | Command |
|---|---|
| Run in a browser (development) | `npm run dev`, then open http://localhost:3000 |
| Run the desktop app | `npm run electron` |
| Type-check | `npm run lint` |
| Build Windows installers | `npm run dist` (output in `release/`) |

**If the folder path contains `&`** (for example "Burns & McDonnell"), the `npm run` and `npx` commands can fail on Windows. Run the tools through `node` instead:

```bash
node node_modules/vite/bin/vite.js build
```

```bash
node node_modules/electron-builder/cli.js --win
```

The first command builds the app into `dist/`, and the second packages the installers. To run the desktop app without packaging, use `node_modules/electron/dist/electron.exe .` after building.

### Project layout

| Path | Contents |
|---|---|
| `src/components/` | The editor (`QuizEditor.tsx`), quiz preview (`QuizPlayer.tsx`), media library and export dialogs. |
| `src/services/` | Import and export code, one file per format (for example `scormExport.ts` and `cornerstoneExport.ts`). |
| `electron/` | The desktop shell: windows, file dialogs, `.quiz` file handling and the recent-files list. |
| `assets/`, `public/` | App and file icons. |

The version number is in `package.json`. The settings-panel footer and the generated user manual show it too.

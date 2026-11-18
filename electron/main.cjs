// QuizBuilder Pro desktop shell.
// Serves the built web app from a tiny local HTTP server (so embedded YouTube videos
// get a normal http origin) and exposes quiz-file / media storage to the renderer over IPC.
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

const QUIZ_EXT = 'quiz';
const MAX_RECENT = 20;
const DEV_URL = process.env.QB_DEV_URL; // set by `npm run electron:dev`

let mainWindow = null;
let server = null;
let isDirty = false;
let pendingOpenPath = null;

// ---------- helpers ----------
const userFile = (name) => path.join(app.getPath('userData'), name);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

function findQuizArg(argv) {
  return argv.slice(1).find((a) => a.toLowerCase().endsWith('.' + QUIZ_EXT) && fs.existsSync(a)) || null;
}

function wrapQuiz(quiz) {
  return JSON.stringify({ app: 'QuizBuilder Pro', formatVersion: 1, quiz }, null, 2);
}

function parseQuizFile(text) {
  const obj = JSON.parse(text);
  const quiz = obj && obj.quiz ? obj.quiz : obj;
  if (!quiz || !Array.isArray(quiz.questions)) throw new Error('This file is not a valid quiz file.');
  return quiz;
}

// ---------- recent list ----------
function getRecent() {
  return readJson(userFile('recent.json'), []);
}

function addRecent(filePath, quiz) {
  const entry = {
    path: filePath,
    title: quiz.title || 'Untitled Quiz',
    description: quiz.description || '',
    questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
    updatedAt: new Date().toISOString(),
  };
  const list = getRecent().filter((r) => r.path.toLowerCase() !== filePath.toLowerCase());
  list.unshift(entry);
  writeJson(userFile('recent.json'), list.slice(0, MAX_RECENT));
  app.addRecentDocument(filePath);
}

// ---------- local static server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

function startServer() {
  const root = path.join(__dirname, '..', 'dist');
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.normalize(path.join(root, urlPath));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(`http://localhost:${server.address().port}`));
  });
}

// ---------- window ----------
async function createWindow() {
  const baseUrl = DEV_URL || (await startServer());

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F8FAFC',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(baseUrl);

  // Open external links in the default browser, not in the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!isDirty) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', "Close Without Saving"],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved changes',
      message: 'You have unsaved changes in this quiz.',
      detail: `Cancel, then use Save Quiz (${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+S) to keep them.`,
    });
    if (choice === 0) e.preventDefault();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}

// ---------- IPC ----------
function filters() {
  return [{ name: 'QuizBuilder Quiz', extensions: [QUIZ_EXT] }, { name: 'All Files', extensions: ['*'] }];
}

ipcMain.handle('quiz:save', (_e, filePath, quiz) => {
  fs.writeFileSync(filePath, wrapQuiz(quiz), 'utf8');
  addRecent(filePath, quiz);
  return { path: filePath };
});

ipcMain.handle('quiz:saveAs', async (_e, quiz, suggestedName) => {
  const safe = String(suggestedName || 'Quiz').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Quiz';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Quiz',
    defaultPath: path.join(app.getPath('desktop'), `${safe}.${QUIZ_EXT}`),
    filters: filters(),
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, wrapQuiz(quiz), 'utf8');
  addRecent(result.filePath, quiz);
  return { path: result.filePath };
});

function openFromPath(filePath) {
  const quiz = parseQuizFile(fs.readFileSync(filePath, 'utf8'));
  addRecent(filePath, quiz);
  return { path: filePath, quiz };
}

ipcMain.handle('quiz:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Quiz',
    defaultPath: app.getPath('desktop'),
    properties: ['openFile'],
    filters: filters(),
  });
  if (result.canceled || !result.filePaths[0]) return null;
  try { return openFromPath(result.filePaths[0]); }
  catch (err) { return { error: err.message || 'Could not open the file.' }; }
});

ipcMain.handle('quiz:openPath', (_e, filePath) => {
  try { return openFromPath(filePath); }
  catch (err) {
    writeJson(userFile('recent.json'), getRecent().filter((r) => r.path !== filePath));
    return { error: fs.existsSync(filePath) ? (err.message || 'Could not open the file.') : 'That file no longer exists.' };
  }
});

ipcMain.handle('quiz:recent', () => getRecent());

ipcMain.handle('quiz:removeRecent', (_e, filePath) => {
  writeJson(userFile('recent.json'), getRecent().filter((r) => r.path !== filePath));
  return true;
});

ipcMain.handle('app:ready', () => {
  const p = pendingOpenPath;
  pendingOpenPath = null;
  if (!p) return null;
  try { return openFromPath(p); } catch (err) { return { error: err.message }; }
});

ipcMain.on('app:setDirty', (_e, dirty) => { isDirty = !!dirty; });
ipcMain.on('app:setTitle', (_e, title) => { if (mainWindow) mainWindow.setTitle(title); });

ipcMain.handle('media:load', () => readJson(userFile('media.json'), []));
ipcMain.handle('media:save', (_e, items) => { writeJson(userFile('media.json'), items); return true; });

// ---------- lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = findQuizArg(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (p) {
        try { mainWindow.webContents.send('quiz:opened', openFromPath(p)); }
        catch (err) { mainWindow.webContents.send('quiz:opened', { error: err.message }); }
      }
    }
  });

  // macOS: double-clicking a .quiz file (or dropping it on the Dock icon) arrives here, not in argv.
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    if (mainWindow) {
      try { mainWindow.webContents.send('quiz:opened', openFromPath(filePath)); }
      catch (err) { mainWindow.webContents.send('quiz:opened', { error: err.message }); }
    } else {
      pendingOpenPath = filePath;
    }
  });

  app.whenReady().then(() => {
    pendingOpenPath = pendingOpenPath || findQuizArg(process.argv);
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (server) server.close();
    app.quit();
  });
}


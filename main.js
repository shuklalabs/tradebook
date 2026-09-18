const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Database = require('better-sqlite3');
const { autoUpdater } = require('electron-updater');

app.setName('TradeVault'); // controls the userData folder name (%APPDATA%\TradeVault) — must be set before app.whenReady()

let db;
let mainWindow;

function initDb(){
  const dbPath = path.join(app.getPath('userData'), 'tradevault.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // crash-safe writes — the whole reason we moved off a single JSON file
  db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  console.log('Database ready at:', dbPath);
}

function kvGet(key){
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  return row ? row.value : null;
}
function kvSet(key, value){
  db.prepare(`INSERT INTO kv (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#15171d', // matches the app's theme --void so there's no white flash on load
    icon: path.join(__dirname, 'build', 'icon.ico'), // taskbar/title bar icon in dev mode (npm start); the built installer uses build.win.icon in package.json instead
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  Menu.setApplicationMenu(null); // no default File/Edit/View menu bar — this is a focused single-purpose app
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  initDb();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Auto-update: checks GitHub Releases (see package.json "build.publish") for a newer
// version, downloads it quietly in the background, and asks the user to restart once it's
// ready. Does nothing if the app isn't installed via the built installer (e.g. `npm start`
// during development), so this is safe to leave active at all times.
function setupAutoUpdater(){
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });
  autoUpdater.on('error', (err) => {
    console.log('Auto-update error (safe to ignore if offline or in dev mode):', err.message);
  });
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `TradeVault ${info.version} has been downloaded.`,
      detail: 'Restart now to install it, or it will install automatically the next time you close the app.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Check on launch, then every 4 hours while the app stays open.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4 * 60 * 60 * 1000);
}

// ---- IPC: key/value storage, replaces the browser's localStorage 1:1 ----
ipcMain.handle('kv-get', (event, key) => kvGet(key));
ipcMain.handle('kv-set', (event, key, value) => {
  try {
    kvSet(key, value);
    return { ok: true };
  } catch (e) {
    // A write failure here (disk full, permissions, DB locked, etc.) previously vanished
    // silently — the renderer's old catch-and-ignore made the app look like it saved when
    // it hadn't. Now it's logged here and reported back so the UI can warn the user.
    console.error('kv-set failed for key', key, '-', e.message);
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('kv-has', (event, key) => kvGet(key) !== null);

// ---- IPC: backup export/import using native OS dialogs, no browser download quirks ----
ipcMain.handle('export-backup', async (event, jsonString) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Backup',
    defaultPath: `TradeVault-Backup-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, jsonString, 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('import-backup', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Backup',
    properties: ['openFile'],
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { ok: true, content, filePath: filePaths[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-db-path', () => path.join(app.getPath('userData'), 'tradevault.db'));

// ---- IPC: live/EOD price quote for Open Trades → LTP ----
// Runs in the main process (Node), not the renderer, specifically because Yahoo's
// endpoint doesn't send CORS headers — a fetch from inside the browser window would
// be blocked. Node's own https module has no such restriction.
function fetchJSON(url){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain so the socket can be reused/closed cleanly
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Bad JSON from quote source')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Quote request timed out')));
  });
}

ipcMain.handle('fetch-quote', async (event, symbol) => {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) return { ok: false, error: 'Empty symbol' };
  try {
    const json = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}.NS`);
    const result = json?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    if (price == null) return { ok: false, error: json?.chart?.error?.description || 'No price in response' };
    return { ok: true, price, asOf: result?.meta?.regularMarketTime ? result.meta.regularMarketTime * 1000 : Date.now() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

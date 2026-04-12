import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { exec, fork, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import net from 'net';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Windows için UTF-8 encoding ayarı
process.env.LANG = 'tr_TR.UTF-8';
app.commandLine.appendSwitch('charset', 'utf-8');
app.commandLine.appendSwitch('lang', 'tr-TR');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══ DEBUG LOG SİSTEMİ ═══
// Log dosyası: exe'nin yanına veya LOCALAPPDATA'ya yazılır
const DEBUG_LOG_PATHS = [
  path.join(path.dirname(process.execPath), 'debug.log'),
  path.join(process.env.LOCALAPPDATA || '', 'CloudflareProOtomasyon', 'debug.log'),
  path.join(os.homedir(), 'CloudflareProOtomasyon-debug.log'),
];
let debugLogPath = '';
for (const lp of DEBUG_LOG_PATHS) {
  try {
    const dir = path.dirname(lp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(lp, ''); // yazılabilirlik testi
    debugLogPath = lp;
    break;
  } catch (_) {}
}
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { if (debugLogPath) fs.appendFileSync(debugLogPath, line, 'utf-8'); } catch (_) {}
  console.log(msg);
}
// Başlangıçta log dosyasını sıfırla ve temel bilgileri yaz
try {
  if (debugLogPath) fs.writeFileSync(debugLogPath, '', 'utf-8');
} catch (_) {}
debugLog('═══════════════════════════════════════════════');
debugLog('Cloudflare Pro Desktop — DEBUG LOG');
debugLog(`Tarih: ${new Date().toLocaleString('tr-TR')}`);
debugLog(`Log dosyası: ${debugLogPath}`);
debugLog(`process.execPath: ${process.execPath}`);
debugLog(`process.cwd(): ${process.cwd()}`);
debugLog(`__dirname: ${__dirname}`);
debugLog(`__filename: ${__filename}`);
debugLog(`process.resourcesPath: ${(process as any).resourcesPath || 'N/A'}`);
debugLog(`app.getAppPath(): ${app.isReady ? app.getAppPath() : '(app not ready yet)'}`);
debugLog(`app.isPackaged: ${app.isPackaged}`);
debugLog(`process.argv: ${JSON.stringify(process.argv)}`);
debugLog(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
debugLog(`Platform: ${process.platform} ${process.arch}`);
debugLog(`Electron: ${process.versions.electron}`);
debugLog(`Node: ${process.versions.node}`);
debugLog('═══════════════════════════════════════════════');

// ═══ BUNDLED WRANGLER BİNARY ═══
// Kullanıcıda Node.js/npx kurulu olmasa bile çalışması için:
// Electron'un gömülü Node.js runtime'ını ELECTRON_RUN_AS_NODE=1 ile kullanır
// ve wrangler'ın JS entry point'ini doğrudan çalıştırır.
//
// ÖNEMLİ: asar içindeki dosyalar ELECTRON_RUN_AS_NODE=1 child process'te okunamaz!
// Bu yüzden önce .unpacked yolları kontrol edilir, asar'da bulunursa unpacked'a yönlendirilir.
function findWranglerScript(): string {
  const appPath = app.isReady ? app.getAppPath() : __dirname;
  const exeDir = path.dirname(process.execPath);
  const resPath = (process as any).resourcesPath || '';

  debugLog(`[wrangler-find] appPath=${appPath}, exeDir=${exeDir}, resPath=${resPath}, __dirname=${__dirname}`);

  const candidates = [
    // ÖNCELİK 1: Unpacked yollar (ELECTRON_RUN_AS_NODE child process bunları okuyabilir)
    // wrangler-dist/cli.js kullanılıyor — bin/wrangler.js iç spawn yapar, ELECTRON_RUN_AS_NODE ile uyumsuz
    resPath ? path.join(resPath, 'app.asar.unpacked', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js') : '',
    path.join(exeDir, 'resources', 'app.asar.unpacked', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'),
    app.isReady ? path.join(app.getAppPath() + '.unpacked', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js') : '',
    // ÖNCELİK 2: Dev mode yolları
    path.join(__dirname, '..', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'),
    // ÖNCELİK 3: Asar içi yollar (bulunursa unpacked versiyonuna yönlendirilir)
    path.join(appPath, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'),
    path.join(appPath, '..', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'),
    resPath ? path.join(resPath, 'app', 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js') : '',
  ].filter(Boolean);

  for (const c of candidates) {
    const exists = fs.existsSync(c);
    debugLog(`[wrangler-find] ${exists ? '✓' : '✗'} ${c}`);
    if (exists) {
      let resolved = path.resolve(c);
      // asar içindeki dosyalar ELECTRON_RUN_AS_NODE=1 child process'te okunamaz
      // .unpacked versiyonuna yönlendir
      if (resolved.includes('app.asar') && !resolved.includes('.unpacked')) {
        const unpackedPath = resolved.replace(/app\.asar([\\\/])/, 'app.asar.unpacked$1');
        if (fs.existsSync(unpackedPath)) {
          debugLog(`[wrangler-find] asar→unpacked: ${unpackedPath}`);
          return unpackedPath;
        }
        debugLog(`[wrangler-find] SKIP asar path (unpacked yok): ${resolved}`);
        continue; // asar içindeki exec edilemez, sonraki adayı dene
      }
      debugLog(`[wrangler-find] SELECTED: ${resolved}`);
      return resolved;
    }
  }

  debugLog('[wrangler-find] WARNING: Bundled wrangler.js hiçbir yolda bulunamadı!');
  return '';
}

function buildWranglerCommand(scriptPath: string): string {
  if (!scriptPath) {
    // ASLA bare 'wrangler' veya 'npx wrangler' kullanma — kullanıcıda yüklü olmayabilir
    return process.platform === 'win32'
      ? 'echo [HATA] Wrangler bulunamadi - uygulamayi yeniden yukleyin && exit /b 1'
      : 'echo "[HATA] Wrangler bulunamadi" && exit 1';
  }
  // ELECTRON_RUN_AS_NODE=1 olsa bile process.versions.electron set kalır.
  // Wrangler/yargs bunu kontrol edip argv slice index'ini 0 yapar (1 yerine)
  // → hideBin(argv) yanlış keser → "Unknown arguments: cli.js, login" hatası
  // Çözüm: -e ile process.versions.electron silip cli.js'yi require ile yükle
  const patchCode = 'delete process.versions.electron;require(process.argv[1])';
  return `"${process.execPath}" -e "${patchCode}" "${scriptPath}"`;
}

let WRANGLER_SCRIPT = findWranglerScript();
// Electron'u Node.js gibi kullanarak wrangler'ı çalıştıran komut
// ELECTRON_RUN_AS_NODE=1 → Electron binary sade Node.js gibi davranır
let WRANGLER = buildWranglerCommand(WRANGLER_SCRIPT);
// ELECTRON_RUN_AS_NODE=1 ortam değişkeni — exec() options.env olarak geçirilir
// cmd.exe parsing sorunlarını önlemek için komut string'ine gömülmez
const WRANGLER_ENV = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
debugLog(`[wrangler] Initial: ${WRANGLER_SCRIPT ? WRANGLER : 'NOT FOUND (will retry after app ready)'}`);

// Global window reference
let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let SERVER_PORT = 3000;

// Port müsait mi kontrol et
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

// Müsait port bul: önce tercih edilen portu dene, yoksa otomatik bul
async function findAvailablePort(preferred: number = 3000): Promise<number> {
  // Önce tercih edilen portu dene
  if (await isPortAvailable(preferred)) return preferred;
  debugLog(`[port] Port ${preferred} kullanımda, alternatif aranıyor...`);

  // 3001-3020 aralığını dene
  for (let p = preferred + 1; p <= preferred + 20; p++) {
    if (await isPortAvailable(p)) {
      debugLog(`[port] Müsait port bulundu: ${p}`);
      return p;
    }
  }

  // Hiçbiri müsait değilse OS'ten rastgele port al
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => {
        debugLog(`[port] OS'ten rastgele port alındı: ${port}`);
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

// Production modda backend Express sunucusunu başlat
function startBackendServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    debugLog(`[startBackendServer] appPath: ${appPath}`);
    debugLog(`[startBackendServer] resourcesPath: ${process.resourcesPath || 'N/A'}`);
    
    // Bundled server dosyasını bul
    const serverPaths = [
      path.join(appPath, 'dist-server', 'server.cjs'),
      path.join(path.dirname(appPath), 'dist-server', 'server.cjs'),
      path.join(process.resourcesPath || '', 'dist-server', 'server.cjs'),
    ];

    // Her yolun varlığını debug et
    let serverFile = '';
    for (const sp of serverPaths) {
      const exists = fs.existsSync(sp);
      debugLog(`[startBackendServer] Yol kontrol: ${sp} → ${exists ? 'MEVCUT ✓' : 'YOK ✗'}`);
      if (exists && !serverFile) {
        serverFile = sp;
      }
    }

    // appPath dizin içeriğini logla
    try {
      const appItems = fs.readdirSync(appPath);
      debugLog(`[startBackendServer] appPath içeriği (${appPath}): ${appItems.join(', ')}`);
      // dist-server var mı?
      const distServerPath = path.join(appPath, 'dist-server');
      if (fs.existsSync(distServerPath)) {
        const dsItems = fs.readdirSync(distServerPath);
        debugLog(`[startBackendServer] dist-server içeriği: ${dsItems.join(', ')}`);
      } else {
        debugLog(`[startBackendServer] dist-server dizini YOK: ${distServerPath}`);
      }
      // dist var mı?
      const distPath = path.join(appPath, 'dist');
      if (fs.existsSync(distPath)) {
        const dItems = fs.readdirSync(distPath);
        debugLog(`[startBackendServer] dist içeriği: ${dItems.join(', ')}`);
      } else {
        debugLog(`[startBackendServer] dist dizini YOK: ${distPath}`);
      }
    } catch (e: any) {
      debugLog(`[startBackendServer] Dizin okuma hatası: ${e.message}`);
    }

    if (!serverFile) {
      const errMsg = 'Backend sunucu dosyası bulunamadı! Denenen yollar: ' + serverPaths.join(', ');
      debugLog(`[startBackendServer] HATA: ${errMsg}`);
      reject(new Error(errMsg));
      return;
    }

    debugLog(`[startBackendServer] Seçilen server dosyası: ${serverFile}`);
    debugLog(`[startBackendServer] Server dosyası boyut: ${fs.statSync(serverFile).size} bytes`);
    
    // Server modülünü doğrudan bu process'te çalıştır — fork sorunlarını önler
    process.env.NODE_ENV = 'production';
    process.env.PORT = String(SERVER_PORT);
    debugLog(`[startBackendServer] ENV ayarlandı: NODE_ENV=production, PORT=${SERVER_PORT}`);
    
    try {
      debugLog(`[startBackendServer] require() çağrılıyor: ${serverFile}`);
      require(serverFile);
      debugLog(`[startBackendServer] require() başarılı`);
    } catch (err: any) {
      debugLog(`[startBackendServer] require() BAŞARISIZ: ${err.message}`);
      debugLog(`[startBackendServer] Stack: ${err.stack || 'N/A'}`);
      debugLog(`[startBackendServer] fork() deneniyor...`);
      // Fallback: fork ile dene
      serverProcess = fork(serverFile, [], {
        env: { ...process.env, NODE_ENV: 'production', PORT: String(SERVER_PORT) },
        stdio: 'pipe',
      });
      serverProcess.stdout?.on('data', (data: Buffer) => {
        debugLog(`[server-stdout] ${data.toString().trim()}`);
      });
      serverProcess.stderr?.on('data', (data: Buffer) => {
        debugLog(`[server-stderr] ${data.toString().trim()}`);
      });
      serverProcess.on('error', (err2) => {
        debugLog(`[startBackendServer] fork error: ${err2.message}`);
      });
      serverProcess.on('exit', (code) => {
        debugLog(`[startBackendServer] Server process exited with code: ${code}`);
        serverProcess = null;
      });
    }

    // Sunucunun hazır olmasını bekle (polling)
    debugLog(`[startBackendServer] Sunucu polling başlatılıyor: http://127.0.0.1:${SERVER_PORT}/api/auth/status`);
    waitForServer(`http://127.0.0.1:${SERVER_PORT}/api/auth/status`, 30000)
      .then(() => {
        debugLog('[startBackendServer] Backend sunucu HAZIR! ✓');
        resolve();
      })
      .catch((err) => {
        debugLog(`[startBackendServer] Sunucu başlatma ZAMAN AŞIMI: ${err.message}`);
        reject(err);
      });
  });
}

// HTTP GET ile sunucunun ayağa kalkmasını bekle
function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Backend sunucu başlatma zaman aşımı'));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        setTimeout(tryConnect, 300);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

// Splash/loading HTML — anında gösterilir, sunucu hazır olunca gerçek UI yüklenir
function getSplashHTML(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cloudflare Pro Desktop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;
  -webkit-app-region:drag;user-select:none;overflow:hidden}
.logo{width:64px;height:64px;margin-bottom:24px;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(.96)}}
h1{font-size:18px;font-weight:600;color:#f5f5f5;margin-bottom:8px;letter-spacing:-.3px}
.sub{font-size:12px;color:#888;margin-bottom:32px}
.bar-wrap{width:220px;height:3px;background:#1a1a1a;border-radius:3px;overflow:hidden}
.bar{height:100%;width:30%;background:linear-gradient(90deg,#f59e0b,#f97316);border-radius:3px;
  animation:loading 1.2s ease-in-out infinite}
@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
.status{font-size:11px;color:#555;margin-top:16px;transition:color .3s}
</style></head><body>
<svg class="logo" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="28" fill="#1a1a1a"/>
  <path d="M89.3 65.5c-.4-1.4-1.6-2.3-3-2.3l-30.8-.4-.2-.1c-.1-.1-.1-.2 0-.3l.6-1.3c.4-.9.3-2-.2-2.8-.3-.5-.7-1-1.1-1.4l-3.3-3.7c-.2-.2-.1-.5.2-.5h41.8c.3 0 .5-.2.5-.5 0-.2 0-.3-.1-.4-3.6-10.3-13.5-17.7-25-17.7-11.7 0-21.7 7.6-25.2 18.2-.7-.5-1.6-.8-2.5-.8-2.5 0-4.5 2-4.5 4.5v.3c-5.5 1.2-9.5 6.1-9.5 11.8 0 6.8 5.5 12.2 12.2 12.2h52.8c5.2 0 9.5-4.2 9.5-9.5 0-4.3-2.9-8-6.7-9.3z" fill="#F6821F"/>
</svg>
<h1>Cloudflare Pro Desktop</h1>
<div class="sub">saffetcelik.com.tr</div>
<div class="bar-wrap"><div class="bar"></div></div>
<div class="status" id="status">Baslatiliyor...</div>
</body></html>`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true, // Enable DevTools for debugging
      defaultEncoding: 'UTF-8', // Türkçe karakter desteği
    },
    title: "Cloudflare Pro Desktop",
    backgroundColor: '#0a0a0a',
    show: true,
    frame: false, // Remove window frame
    titleBarStyle: 'hidden',
    transparent: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
  });

  // Renderer process çökmesi
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] Renderer çöktü:', details);
  });

  // Console mesajlarını logla (debug için)
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Store window reference globally
  mainWindow = win;

  // Disable F12 and other DevTools shortcuts
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || 
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J') ||
        (input.control && input.key === 'U')) {
      event.preventDefault();
    }
  });

  // Window control handlers
  ipcMain.on('window-minimize', () => {
    win.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    win.close();
  });

  // Open URL in default browser
  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  // Bring window to front
  ipcMain.on('bring-to-front', () => {
    if (win) {
      // Windows'ta pencereyi aktif hale getir
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
      win.setAlwaysOnTop(true);
      win.setAlwaysOnTop(false);
    }
  });

  // Return window instance
  return win;
}

app.whenReady().then(async () => {
  debugLog('[app.whenReady] Uygulama hazır');

  // Wrangler yolu app ready öncesi bulunamadıysa tekrar dene
  // (app.getAppPath() ancak app ready sonrası güvenilir)
  if (!WRANGLER_SCRIPT) {
    debugLog('[wrangler] App ready sonrası tekrar aranıyor...');
    WRANGLER_SCRIPT = findWranglerScript();
    WRANGLER = buildWranglerCommand(WRANGLER_SCRIPT);
    if (WRANGLER_SCRIPT) {
      debugLog(`[wrangler] Tekrar çözümlendi: ${WRANGLER}`);
    } else {
      debugLog('[wrangler] KRİTİK: App ready sonrası da bulunamadı!');
    }
  }

  debugLog(`[app.whenReady] app.getAppPath(): ${app.getAppPath()}`);
  debugLog(`[app.whenReady] app.getPath('userData'): ${app.getPath('userData')}`);
  debugLog(`[app.whenReady] app.getPath('exe'): ${app.getPath('exe')}`);
  debugLog(`[app.whenReady] app.isPackaged: ${app.isPackaged}`);

  // Kurulum dizini içeriğini logla (exe'nin bulunduğu dizin)
  try {
    const exeDir = path.dirname(process.execPath);
    const exeDirItems = fs.readdirSync(exeDir);
    debugLog(`[app.whenReady] EXE dizini (${exeDir}): ${exeDirItems.join(', ')}`);
    // resources dizini var mı?
    const resDir = path.join(exeDir, 'resources');
    if (fs.existsSync(resDir)) {
      const resItems = fs.readdirSync(resDir);
      debugLog(`[app.whenReady] resources/ içeriği: ${resItems.join(', ')}`);
    } else {
      debugLog(`[app.whenReady] resources/ dizini YOK: ${resDir}`);
    }
  } catch (e: any) {
    debugLog(`[app.whenReady] EXE dizini okuma hatası: ${e.message}`);
  }

  const isDev = process.env.NODE_ENV === 'development';
  debugLog(`[app.whenReady] isDev: ${isDev}`);

  // Port çakışmasını önle — müsait port bul
  try {
    SERVER_PORT = await findAvailablePort(3000);
    debugLog(`[app.whenReady] Kullanılacak port: ${SERVER_PORT}`);
  } catch (e: any) {
    debugLog(`[app.whenReady] Port bulma hatası: ${e.message}, varsayılan 3000 kullanılacak`);
    SERVER_PORT = 3000;
  }

  if (isDev) {
    // Development: sunucu zaten dışarıda çalışıyor, direkt yükle
    const win = createWindow();
    const serverUrl = `http://localhost:${SERVER_PORT}`;
    debugLog(`[app.whenReady] Dev mode — loading: ${serverUrl}`);
    await win.loadURL(serverUrl).catch((err: Error) => {
      debugLog(`[app.whenReady] Dev loadURL hatası: ${err.message}`);
    });
  } else {
    // Production: önce pencereyi splash ile göster, sonra sunucuyu başlat
    debugLog('[app.whenReady] Production mode — splash yükleniyor');
    const win = createWindow();
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHTML())}`).catch((e: any) => {
      debugLog(`[app.whenReady] Splash yükleme hatası: ${e.message}`);
    });
    debugLog('[app.whenReady] Splash yüklendi');

    // Splash durumunu güncelle
    const updateSplash = (msg: string) => {
      debugLog(`[splash] ${msg}`);
      if (!win.isDestroyed()) {
        win.webContents.executeJavaScript(
          `document.getElementById('status').textContent = '${msg}';`
        ).catch(() => {});
      }
    };

    try {
      updateSplash('Sunucu baslatiliyor...');
      debugLog(`[app.whenReady] startBackendServer() çağrılıyor... (PORT=${SERVER_PORT})`);
      await startBackendServer();
      debugLog('[app.whenReady] Backend hazır, UI yükleniyor');
      updateSplash('Arayuz yukleniyor...');
      
      const serverUrl = `http://localhost:${SERVER_PORT}`;
      debugLog(`[app.whenReady] win.loadURL(${serverUrl}) çağrılıyor...`);
      await win.loadURL(serverUrl);
      debugLog('[app.whenReady] UI başarıyla yüklendi ✓');
    } catch (err: any) {
      debugLog(`[app.whenReady] BAŞLATMA HATASI: ${err.message}`);
      debugLog(`[app.whenReady] Stack: ${err.stack || 'N/A'}`);
      updateSplash('Baglanti hatasi - yeniden deneniyor...');
      // 2sn bekle tekrar dene
      await new Promise(r => setTimeout(r, 2000));
      try {
        const serverUrl = `http://localhost:${SERVER_PORT}`;
        debugLog(`[app.whenReady] İkinci deneme: ${serverUrl}`);
        await win.loadURL(serverUrl);
        debugLog('[app.whenReady] İkinci deneme başarılı ✓');
      } catch (e: any) {
        debugLog(`[app.whenReady] İKİNCİ DENEME DE BAŞARISIZ: ${e.message}`);
        updateSplash('Sunucu baslatilamadi. Uygulamayi yeniden baslatin.');
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Backend sunucusunu kapat
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

// IPC handler for Wrangler Login
ipcMain.handle('wrangler-login', async () => {
  // Helper: delay
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Helper: run whoami with retries (token diske yazılması zaman alabilir)
  const whoamiWithRetry = (retries = 3, delayMs = 2000): Promise<string> => {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const tryWhoami = () => {
        attempt++;
        exec(`${WRANGLER} whoami`, { timeout: 15000, env: WRANGLER_ENV }, (err, out) => {
          if (!err && out) {
            resolve(out);
          } else if (attempt < retries) {
            console.log(`[wrangler-login] whoami attempt ${attempt} failed, retrying in ${delayMs}ms...`);
            setTimeout(tryWhoami, delayMs);
          } else {
            reject(new Error('Could not verify login after ' + retries + ' attempts'));
          }
        });
      };
      tryWhoami();
    });
  };

  // Port 8976'yı temizle (wrangler OAuth callback portu)
  try {
    const killPort = require('kill-port');
    await killPort(8976).catch(() => {});
  } catch (_) {}

  return new Promise((resolve, reject) => {
      // Run wrangler login which opens browser for OAuth
      const wranglerProcess = exec(`${WRANGLER} login`, { env: WRANGLER_ENV }, async (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          reject(error.message);
          return;
        }
        
        try {
          // Token diske yazılması için bekle, sonra doğrula
          await delay(2000);
          const out = await whoamiWithRetry(3, 2000);

          // Bring window to front after successful login
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true);
            mainWindow.setAlwaysOnTop(false);
          }
          
          resolve({ success: true, output: out });
        } catch (e: any) {
          // Login başarılı oldu ama whoami başarısız — yine de resolve et
          console.warn('[wrangler-login] whoami failed but login was successful:', e.message);
          resolve({ success: true, output: 'Login successful (whoami verification skipped)' });
        }
      });
      
      // Log output in real-time
      if (wranglerProcess.stdout) {
        wranglerProcess.stdout.on('data', (data) => {
          console.log('Wrangler:', data.toString());
          
          // Check if login was successful (OAuth callback completed)
          // NOTE: Only trigger on actual success message, NOT on 'OAuth' in URL
          if (data.toString().includes('Successfully logged in') || 
              data.toString().includes('Wrangler is now authenticated')) {
            // Bring window to front
            if (mainWindow) {
              if (mainWindow.isMinimized()) {
                mainWindow.restore();
              }
              mainWindow.show();
              mainWindow.focus();
              mainWindow.setAlwaysOnTop(true);
              mainWindow.setAlwaysOnTop(false);
              // Renderer'a onay sinyali gönder - UI anında güncellenir
              mainWindow.webContents.send('wrangler-login-approved');
            }
          }
        });
      }
  });
});

// Template download base URL — R2 public access veya Worker URL
// Bu URL set edilirse şablonlar HTTP ile indirilir (herhangi bir kullanıcı erişebilir)
// Set edilmezse wrangler CLI ile R2'den indirilir (sadece bucket sahibi erişebilir)
const TEMPLATE_DOWNLOAD_BASE_URL = process.env.TEMPLATE_DOWNLOAD_BASE_URL || 'https://template-update-service.saffetcelik.com.tr/public';

// HTTPS ile dosya indirme (redirect destekli)
function downloadFileHTTPS(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const request = proto.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFileHTTPS(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: Şablon indirme başarısız`));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => { file.close(() => resolve()); });
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    });
    request.on('error', reject);
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Şablon indirme zaman aşımı (120s)'));
    });
  });
}

// Deploy iptal mekanizması
let deployAborted = false;
let activeDeployProcesses: ChildProcess[] = [];

ipcMain.handle('deploy-cancel', () => {
  console.log('[deploy] İptal istendi — tüm işlemler durduruluyor');
  deployAborted = true;
  for (const proc of activeDeployProcesses) {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
  activeDeployProcesses = [];
  return { cancelled: true };
});

// IPC handler for deployment
ipcMain.handle('deploy-site', async (event, options) => {
  const { projectName, templateKey, downloadUrl } = options;
  deployAborted = false;
  activeDeployProcesses = [];

  const sendProgress = (step: number, message: string) => {
    if (!deployAborted) event.sender.send('deploy-progress', { step, message });
  };

  const checkCancelled = () => {
    if (deployAborted) throw new Error('Kurulum kullanıcı tarafından iptal edildi.');
  };

  const execPromise = (cmd: string, opts: any = {}): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (deployAborted) return reject(new Error('Kurulum iptal edildi.'));
      const proc = exec(cmd, { encoding: 'utf8', timeout: 120000, env: WRANGLER_ENV, ...opts }, (error, stdout, stderr) => {
        activeDeployProcesses = activeDeployProcesses.filter(p => p !== proc);
        if (deployAborted) return reject(new Error('Kurulum iptal edildi.'));
        if (error) return reject(new Error(error.message));
        resolve(String(stdout || ''));
      });
      activeDeployProcesses.push(proc);
    });
  };

  const tempDir = path.join(app.getPath('temp'), 'cf-deploy-' + Date.now());
  const zipPath = path.join(tempDir, 'template.zip');
  const extractPath = path.join(tempDir, 'project');

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Step 1: Şablon indir (HTTP öncelikli, wrangler CLI fallback)
    sendProgress(1, 'Şablon indiriliyor...');
    const httpUrl = downloadUrl || (TEMPLATE_DOWNLOAD_BASE_URL ? `${TEMPLATE_DOWNLOAD_BASE_URL.replace(/\/$/, '')}/${templateKey}` : '');
    
    if (httpUrl) {
      try {
        console.log(`[deploy] HTTP download: ${httpUrl}`);
        await downloadFileHTTPS(httpUrl, zipPath);
        console.log('[deploy] HTTP download successful');
      } catch (httpErr: any) {
        console.warn(`[deploy] HTTP download failed: ${httpErr.message}, trying wrangler CLI...`);
        await execPromise(`${WRANGLER} r2 object get cloudflare-pro-templates/${templateKey} --remote --file="${zipPath}"`);
      }
    } else {
      console.log(`[deploy] Downloading via wrangler CLI: cloudflare-pro-templates/${templateKey}`);
      await execPromise(`${WRANGLER} r2 object get cloudflare-pro-templates/${templateKey} --remote --file="${zipPath}"`);
    }

    checkCancelled();

    // ZIP doğrulama
    if (!fs.existsSync(zipPath)) {
      throw new Error('ZIP dosyası indirilemedi. R2 bağlantısını kontrol edin.');
    }
    const zipSize = fs.statSync(zipPath).size;
    console.log(`[deploy] ZIP downloaded: ${zipSize} bytes`);
    if (zipSize < 1000) {
      throw new Error(`ZIP dosyası çok küçük (${zipSize} bytes). R2 key doğru mu: ${templateKey}`);
    }

    checkCancelled();

    // Step 2: Çıkart
    sendProgress(2, 'Şablon çıkartılıyor...');
    await execPromise(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);

    // Çıkarma doğrulama
    const extractedItems = fs.existsSync(extractPath) ? fs.readdirSync(extractPath) : [];
    console.log(`[deploy] Extracted items: ${extractedItems.join(', ')}`);

    // wrangler.toml'u bul - kökde yoksa alt dizinde ara
    let wranglerPath = path.join(extractPath, 'wrangler.toml');
    if (!fs.existsSync(wranglerPath)) {
      // Alt dizinde olabilir (ZIP'e kök klasör eklenmiş olabilir)
      for (const item of extractedItems) {
        const subPath = path.join(extractPath, item, 'wrangler.toml');
        if (fs.statSync(path.join(extractPath, item)).isDirectory() && fs.existsSync(subPath)) {
          // Alt dizini kök olarak kullan
          console.log(`[deploy] wrangler.toml found in subdirectory: ${item}`);
          const actualProjectDir = path.join(extractPath, item);
          // Dosyaları üst dizine taşı
          const subItems = fs.readdirSync(actualProjectDir);
          for (const si of subItems) {
            fs.renameSync(path.join(actualProjectDir, si), path.join(extractPath, si));
          }
          fs.rmdirSync(actualProjectDir);
          wranglerPath = path.join(extractPath, 'wrangler.toml');
          break;
        }
      }
    }

    if (!fs.existsSync(wranglerPath)) {
      throw new Error(
        `'wrangler.toml' bulunamadı. ZIP içeriği: [${extractedItems.join(', ')}]. ` +
        `R2 key: ${templateKey}. ZIP boyutu: ${zipSize} bytes. ` +
        `Bu ZIP sadece dist/ klasörünü içeriyor olabilir - template-manager'dan yeniden build + yayınlama yapın.`
      );
    }

    checkCancelled();

    // Step 3: Yapılandırma
    sendProgress(3, 'Yapılandırma güncelleniyor...');
    let wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');

    // Proje adı ve DB adı
    wranglerConfig = wranglerConfig.replace(/name = ".*"/, `name = "${projectName}"`);
    wranglerConfig = wranglerConfig.replace(/database_name = ".*"/, `database_name = "${projectName}-db"`);

    // JWT_SECRET: güvenli rastgele değer
    const jwtSecret = crypto.randomBytes(48).toString('base64url');
    wranglerConfig = wranglerConfig.replace(/JWT_SECRET = ".*"/, `JWT_SECRET = "${jwtSecret}"`);

    // CF_PROJECT_NAME: güncelleme sistemi için
    wranglerConfig = wranglerConfig.replace(/CF_PROJECT_NAME = ".*"/, `CF_PROJECT_NAME = "${projectName}"`);

    // Vectorize index adı: proje bazlı
    wranglerConfig = wranglerConfig.replace(/index_name = ".*"/, `index_name = "${projectName}-rag-index"`);

    fs.writeFileSync(wranglerPath, wranglerConfig, 'utf8');
    console.log(`[deploy] wrangler.toml configured for: ${projectName}`);

    checkCancelled();

    // Step 4: D1 veritabanı
    sendProgress(4, 'D1 veritabanı oluşturuluyor...');
    const d1Output = await execPromise(`${WRANGLER} d1 create ${projectName}-db`, { cwd: extractPath });

    const dbIdMatch = d1Output.match(/database_id = "([^"]+)"/);
    const dbId = dbIdMatch ? dbIdMatch[1] : '';
    if (!dbId) throw new Error('Database ID çıkarılamadı. D1 çıktısı: ' + d1Output.substring(0, 200));

    wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');
    wranglerConfig = wranglerConfig.replace(/database_id = ".*"/, `database_id = "${dbId}"`);
    fs.writeFileSync(wranglerPath, wranglerConfig, 'utf8');
    console.log(`[deploy] D1 database created: ${dbId}`);

    checkCancelled();

    // Step 5: Schema + Seed
    sendProgress(5, 'Veritabanı tabloları oluşturuluyor...');
    if (fs.existsSync(path.join(extractPath, 'schema.sql'))) {
      try {
        await execPromise(`${WRANGLER} d1 execute ${projectName}-db --file=schema.sql --remote`, { cwd: extractPath });
        console.log('[deploy] schema.sql executed');
      } catch (e: any) {
        console.warn('[deploy] Schema warning:', e.message);
      }
    }
    if (fs.existsSync(path.join(extractPath, 'seed.sql'))) {
      try {
        await execPromise(`${WRANGLER} d1 execute ${projectName}-db --file=seed.sql --remote`, { cwd: extractPath });
        console.log('[deploy] seed.sql executed');
      } catch (e: any) {
        console.warn('[deploy] Seed warning:', e.message);
      }
    }

    // Step 5b: Vectorize index oluştur
    const vectorizeIndexName = `${projectName}-rag-index`;
    console.log(`[deploy] Creating Vectorize index: ${vectorizeIndexName}`);
    try {
      await execPromise(`${WRANGLER} vectorize create ${vectorizeIndexName} --dimensions=1024 --metric=cosine`, { cwd: extractPath });
      console.log(`[deploy] Vectorize index created: ${vectorizeIndexName}`);
    } catch (e: any) {
      if (e.message.includes('already exists') || e.message.includes('Index with name')) {
        console.log(`[deploy] Vectorize index already exists: ${vectorizeIndexName}`);
      } else {
        console.warn('[deploy] Vectorize creation warning:', e.message);
      }
    }

    checkCancelled();

    // Step 6: Deploy
    sendProgress(6, 'Cloudflare Pages\'e deploy ediliyor...');
    try {
      await execPromise(`${WRANGLER} pages project create ${projectName} --production-branch=main`, { cwd: extractPath });
    } catch (e: any) {
      if (!e.message.includes('already exists')) {
        console.warn('[deploy] Project creation warning:', e.message);
      }
    }

    await execPromise(`${WRANGLER} pages deploy dist --project-name=${projectName}`, { cwd: extractPath });
    console.log(`[deploy] Deployed successfully: https://${projectName}.pages.dev`);

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    return { success: true, url: `https://${projectName}.pages.dev` };

  } catch (error: any) {
    // Cleanup on error
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    console.error('[deploy] Error:', error.message);
    throw new Error(error.message);
  }
});


// Get Wrangler token from config or use wrangler whoami
ipcMain.handle('get-wrangler-token', async () => {
  return new Promise((resolve, reject) => {
    // Try to get account info from wrangler whoami
    exec(`${WRANGLER} whoami --json`, { env: WRANGLER_ENV }, (error, stdout, stderr) => {
      if (error) {
        reject('Could not get wrangler info: ' + error.message);
        return;
      }
      
      try {
        const info = JSON.parse(stdout);
        // Wrangler is authenticated but we need an API token for the app
        // Since OAuth tokens are not accessible, we need to guide user to create API token
        if (info && info.email) {
          resolve({ 
            authenticated: true, 
            email: info.email,
            accountId: info.accounts?.[0]?.id,
            needsApiToken: true 
          });
        } else {
          reject('Not authenticated with wrangler');
        }
      } catch (e) {
        reject('Could not parse wrangler info');
      }
    });
  });
});

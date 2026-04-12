import express from "express";
import path from "path";
import axios from "axios";
import cors from "cors";
import cookieParser from "cookie-parser";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import https from "https";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import os from "os";
import crypto from "crypto";
import net from "net";
import http from "http";

// UTF-8 encoding için Windows ayarı
if (process.platform === 'win32') {
  process.env.LANG = 'tr_TR.UTF-8';
  process.env.LC_ALL = 'tr_TR.UTF-8';
}

const execAsync = promisify(exec);

// ═══ BUNDLED WRANGLER BİNARY ═══
// Kullanıcıda Node.js/npx kurulu olmasa bile çalışması için:
// Electron modunda: ELECTRON_RUN_AS_NODE=1 ile Electron'un gömülü Node.js'ini kullanır
// Dev modunda: node_modules/.bin/wrangler.cmd kullanır
//
// ÖNEMLİ: asar içindeki dosyalar ELECTRON_RUN_AS_NODE=1 child process'te okunamaz!
// Önce .unpacked yolları kontrol edilir, asar'da bulunursa unpacked'a yönlendirilir.
function getWranglerBin(): string {
  const isElectron = !!(process.versions as any).electron;
  const exeDir = path.dirname(process.execPath);
  const resPath = (process as any).resourcesPath || '';

  // Wrangler JS entry point'ini bul
  // ÖNCELİK: unpacked yollar (ELECTRON_RUN_AS_NODE child process asar okuyamaz)
  const searchRoots = [
    // Unpacked paths first
    resPath ? path.join(resPath, 'app.asar.unpacked') : '',
    path.join(exeDir, 'resources', 'app.asar.unpacked'),
    resPath ? path.join(resPath, 'app') : '',
    // Dev/fallback paths
    process.cwd(),
    __dirname,
    path.join(__dirname, '..'),
  ].filter(Boolean);

  for (const root of searchRoots) {
    const jsPath = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    if (fs.existsSync(jsPath)) {
      let resolved = path.resolve(jsPath);

      // asar içindeki dosyalar ELECTRON_RUN_AS_NODE=1 child process'te okunamaz
      // .unpacked versiyonuna yönlendir
      if (resolved.includes('app.asar') && !resolved.includes('.unpacked')) {
        const unpackedPath = resolved.replace(/app\.asar([\\\/])/, 'app.asar.unpacked$1');
        if (fs.existsSync(unpackedPath)) {
          console.log(`[wrangler] asar→unpacked: ${unpackedPath}`);
          resolved = unpackedPath;
        } else {
          console.warn(`[wrangler] SKIP asar path (unpacked yok): ${resolved}`);
          continue;
        }
      }

      if (isElectron) {
        // Electron exe'yi Node.js gibi kullan
        // NOT: ELECTRON_RUN_AS_NODE=1 artık komut string'inde DEĞİL,
        // exec() options.env ile geçiriliyor (WRANGLER_ENV)
        console.log(`[wrangler] Using Electron as Node.js: ${resolved}`);
        return `"${process.execPath}" "${resolved}"`;
      } else {
        // Dev mode: normal node ile çalıştır
        const cmdPath = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
        if (fs.existsSync(cmdPath)) {
          console.log(`[wrangler] Using local bin: ${path.resolve(cmdPath)}`);
          return `"${path.resolve(cmdPath)}"`;
        }
        console.log(`[wrangler] Using node + script: ${resolved}`);
        return `node "${resolved}"`;
      }
    }
  }

  // Electron modunda wrangler bulunamadıysa açık hata mesajı
  // ASLA bare 'wrangler' veya 'npx wrangler' kullanma — kullanıcıda yüklü olmayabilir
  if (isElectron) {
    console.error('[wrangler] KRİTİK: Bundled wrangler hiçbir yolda bulunamadı!');
    console.error(`[wrangler] searchRoots: ${searchRoots.join(', ')}`);
    return process.platform === 'win32'
      ? 'echo [HATA] Wrangler bulunamadi - uygulamayi yeniden yukleyin && exit /b 1'
      : 'echo "[HATA] Wrangler bulunamadi" && exit 1';
  }

  console.warn('[wrangler] Bundled wrangler not found, falling back to global');
  return 'wrangler';
}

const WRANGLER = getWranglerBin();
// ELECTRON_RUN_AS_NODE=1 ortam değişkeni — exec() options.env olarak geçirilir
// cmd.exe parsing sorunlarını önlemek için komut string'ine gömülmez
const WRANGLER_ENV = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
// Wrangler komutları için exec wrapper — ELECTRON_RUN_AS_NODE env otomatik eklenir
const wranglerExecAsync = async (cmd: string, opts: any = {}): Promise<{stdout: string, stderr: string}> => {
  const result = await execAsync(cmd, { encoding: 'utf8', env: WRANGLER_ENV, ...opts });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
};

// Stored API token (persisted to .cloudflare-token file)
const TOKEN_FILE = path.join(os.homedir(), '.cloudflare-dns-token');

function getSavedApiToken(): string | null {
  // First check env, then saved file
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }
  } catch (e) { }
  return null;
}

function saveApiToken(token: string): void {
  fs.writeFileSync(TOKEN_FILE, token, 'utf8');
}

function deleteApiToken(): void {
  try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch (e) { }
}

// Simple in-memory cache for wrangler commands
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

// Template download base URL — R2 public access veya Worker URL
// Bu URL set edilirse şablonlar HTTP ile indirilir (herhangi bir kullanıcı erişebilir)
// Set edilmezse wrangler CLI ile R2'den indirilir (sadece bucket sahibi erişebilir)
const TEMPLATE_DOWNLOAD_BASE_URL = process.env.TEMPLATE_DOWNLOAD_BASE_URL || 'https://template-update-service.saffetcelik.com.tr/public';

// HTTPS ile dosya indirme (redirect destekli)
function downloadFileHTTPS(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const request = (proto as any).get(url, (response: any) => {
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
      const file = createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => { file.close(() => resolve()); });
      file.on('error', (err: any) => { fs.unlinkSync(dest); reject(err); });
    });
    request.on('error', reject);
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Şablon indirme zaman aşımı (120s)'));
    });
  });
}

function getCached(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Helper to get Wrangler OAuth token from config
let _wranglerTokenCache: { token: string | null; timestamp: number } | null = null;
const WRANGLER_TOKEN_CACHE_TTL = 60000; // 1 dakika cache

// Sync version: reads directly from config file (may be expired - use for quick checks only)
function getWranglerToken(bypassCache = false): string | null {
  // Cache'den dön (sık çağrılıyor, her seferinde dosya okumaya gerek yok)
  if (!bypassCache && _wranglerTokenCache && Date.now() - _wranglerTokenCache.timestamp < WRANGLER_TOKEN_CACHE_TTL) {
    return _wranglerTokenCache.token;
  }

  try {
    const possiblePaths = [
      path.join(os.homedir(), '.wrangler', 'config', 'default.toml'),
      path.join(process.env.USERPROFILE || os.homedir(), '.wrangler', 'config', 'default.toml'),
      path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        const match = config.match(/oauth_token\s*=\s*"([^"]+)"/);
        if (match) {
          _wranglerTokenCache = { token: match[1], timestamp: Date.now() };
          return match[1];
        }
      }
    }
  } catch (error) {
    console.error('Error reading wrangler config:', error);
  }
  _wranglerTokenCache = { token: null, timestamp: Date.now() };
  return null;
}

// Async version: uses `wrangler auth token` which auto-refreshes expired tokens
// This should be used for ALL API calls, especially DNS operations
let _wranglerTokenAsyncCache: { token: string; timestamp: number } | null = null;
const WRANGLER_TOKEN_ASYNC_CACHE_TTL = 45000; // 45 saniye cache (refresh'ten önce yenilemek için)

async function getWranglerTokenAsync(): Promise<string | null> {
  // Return cached if still valid
  if (_wranglerTokenAsyncCache && Date.now() - _wranglerTokenAsyncCache.timestamp < WRANGLER_TOKEN_ASYNC_CACHE_TTL) {
    return _wranglerTokenAsyncCache.token;
  }

  // Önce sync token var mı kontrol et - wrangler config dosyası yoksa boşa komut çalıştırma
  const syncToken = getWranglerToken(true);
  if (!syncToken) {
    // Wrangler config dosyası yok veya token yok - wrangler komutu çalıştırmaya gerek yok
    return null;
  }

  try {
    // `wrangler auth token --json` automatically refreshes expired OAuth tokens
    const { stdout } = await wranglerExecAsync(`${WRANGLER} auth token --json`, {
      encoding: 'utf8',
      timeout: 15000
    });
    const result = JSON.parse(stdout.trim());
    if (result.token) {
      console.log(`[WranglerAuth] Fresh token obtained (type: ${result.type})`);
      _wranglerTokenAsyncCache = { token: result.token, timestamp: Date.now() };
      // Also update sync cache so other calls benefit
      _wranglerTokenCache = { token: result.token, timestamp: Date.now() };
      return result.token;
    }
  } catch (error: any) {
    console.error('[WranglerAuth] wrangler auth token failed:', error.message);
  }

  // Fallback: sync token'ı dön (süresi dolmuş olabilir ama hiç yoktan iyidir)
  if (syncToken) {
    console.warn('[WranglerAuth] Falling back to sync token (may be expired)');
  }
  return syncToken;
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  
  // UTF-8 encoding için middleware (sadece API yanıtları için)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });

  // Auth service — AUTH_SERVICE_URL env ile özelleştirilebilir
  const AUTH_SERVICE_DOMAIN = process.env.AUTH_SERVICE_URL || 'https://saffetcelik.com.tr';
  const APP_TOKEN_FILE_NAME = process.env.AUTH_TOKEN_FILE || '.saffetcelik-app-token';
  const APP_TOKEN_FILE = path.join(os.homedir(), APP_TOKEN_FILE_NAME);
  const SAFFETCELIK_API = AUTH_SERVICE_DOMAIN;

  function getSavedAppToken(): string | null {
    try {
      if (fs.existsSync(APP_TOKEN_FILE)) {
        return fs.readFileSync(APP_TOKEN_FILE, 'utf8').trim();
      }
    } catch (e) { }
    return null;
  }

  function saveAppToken(token: string): void {
    fs.writeFileSync(APP_TOKEN_FILE, token, 'utf8');
  }

  function deleteAppToken(): void {
    try { if (fs.existsSync(APP_TOKEN_FILE)) fs.unlinkSync(APP_TOKEN_FILE); } catch (e) { }
  }

  let cachedAppUser: { id: string; email: string; displayName: string; avatarUrl: string | null } | null = null;

  function generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  function sha256Base64url(input: string): string {
    
    const hash = crypto.createHash('sha256').update(input).digest();
    return hash.toString('base64url');
  }

  let pendingAuthState: { state: string; codeVerifier: string; port: number } | null = null;

  app.post("/api/auth/start-login", async (req, res) => {
    try {
      
      const callbackPort = await new Promise<number>((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
          const address = srv.address() as net.AddressInfo;
          const port = address.port;
          srv.close(() => resolve(port));
        });
        srv.on('error', reject);
      });

      const state = generateRandomString(32);
      const codeVerifier = generateRandomString(64);
      const codeChallenge = sha256Base64url(codeVerifier);

      pendingAuthState = { state, codeVerifier, port: callbackPort };

      
      const callbackServer = http.createServer((cbReq: any, cbRes: any) => {
        const url = new URL(cbReq.url, `http://127.0.0.1:${callbackPort}`);

        if (url.pathname === '/auth/callback') {
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          cbRes.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          cbRes.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Dogrulama tamamlandi!</h2><p>Bu pencereyi kapatabilirsiniz.</p><script>setTimeout(()=>window.close(),2000)</script></body></html>');

          if (code && returnedState === pendingAuthState?.state) {
            exchangeCodeForToken(code, pendingAuthState.codeVerifier, req.body.deviceName || os.hostname());
          }

          setTimeout(() => { try { callbackServer.close(); } catch(e) {} }, 3000);
          return;
        }

        cbRes.writeHead(404);
        cbRes.end('Not found');
      });

      callbackServer.listen(callbackPort, '127.0.0.1');
      setTimeout(() => { try { callbackServer.close(); } catch(e) {} }, 120000);

      const authUrl = `${SAFFETCELIK_API}/otomasyon?desktop_auth=1&port=${callbackPort}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}`;

      res.json({ authUrl, port: callbackPort });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Auth baslatilamadi' });
    }
  });

  async function exchangeCodeForToken(code: string, codeVerifier: string, deviceName: string) {
    try {
      const response = await axios.post(`${SAFFETCELIK_API}/api/automation/exchange-auth-code`, {
        code,
        codeVerifier,
        deviceName,
        deviceInfo: { hostname: os.hostname(), platform: os.platform(), arch: os.arch() }
      });

      const data = response.data;
      if (data.token) {
        saveAppToken(data.token);
        cachedAppUser = data.user;
      }
    } catch (error: any) {
      console.error('Token exchange error:', error.message);
    }
  }

  app.get("/api/auth/status", async (req, res) => {
    const savedToken = getSavedAppToken();
    if (!savedToken) {
      return res.json({ authenticated: false });
    }

    if (cachedAppUser) {
      return res.json({ authenticated: true, user: cachedAppUser });
    }

    try {
      const response = await axios.post(`${SAFFETCELIK_API}/api/automation/verify-app-token`, { token: savedToken });
      if (response.data.valid) {
        cachedAppUser = response.data.user;
        return res.json({ authenticated: true, user: response.data.user });
      }
    } catch (e) { }

    deleteAppToken();
    cachedAppUser = null;
    return res.json({ authenticated: false });
  });

  app.post("/api/auth/logout", (req, res) => {
    deleteAppToken();
    cachedAppUser = null;
    pendingAuthState = null;
    res.json({ success: true });
  });

  // Cloudflare API Helper
  const cfApi = (token: string) => axios.create({
    baseURL: "https://api.cloudflare.com/client/v4",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  // API Routes
  app.post("/api/cloudflare/verify", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });

    try {
      const response = await cfApi(token).get("/user/tokens/verify");
      if (response.data.result.status === "active") {
        res.json({ success: true, message: "Token is valid" });
      } else {
        res.status(401).json({ error: "Token is not active" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Verification failed" });
    }
  });

  // Save API Token (user pastes it after creating on Cloudflare)
  app.post("/api/cloudflare/save-api-token", async (req, res) => {
    const { apiToken } = req.body;
    if (!apiToken || !apiToken.trim()) {
      return res.status(400).json({ error: "Token gerekli" });
    }
    
    try {
      // Verify token is valid first
      const verifyResponse = await axios.get('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { 'Authorization': `Bearer ${apiToken.trim()}` },
        timeout: 10000
      });
      
      if (!verifyResponse.data.success || verifyResponse.data.result.status !== 'active') {
        return res.status(401).json({ error: "Token geçersiz veya aktif değil" });
      }
      
      // Test DNS permission: list zones first, then try to list DNS records for one zone
      let hasDnsPermission = false;
      try {
        const zonesResponse = await axios.get('https://api.cloudflare.com/client/v4/zones?per_page=1', {
          headers: { 'Authorization': `Bearer ${apiToken.trim()}` },
          timeout: 5000
        });
        const zones = zonesResponse.data.result || [];
        if (zones.length > 0) {
          // Actually test zone_dns permission by listing DNS records (requires zone_dns:read)
          try {
            const dnsResponse = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zones[0].id}/dns_records?per_page=1`, {
              headers: { 'Authorization': `Bearer ${apiToken.trim()}` },
              timeout: 5000
            });
            hasDnsPermission = dnsResponse.data.success;
          } catch (e: any) {
            // DNS permission denied - zone:edit alone won't work here
            console.log('DNS records access denied:', e.response?.data?.errors?.[0]?.message);
          }
        }
      } catch (e) {
        // Cannot list zones
      }
      
      if (!hasDnsPermission) {
        return res.status(403).json({ error: "Bu token DNS düzenleme yetkisine sahip değil. Token oluştururken 'Zone DNS - Edit' iznini seçtiğinizden emin olun." });
      }
      
      // Save token
      saveApiToken(apiToken.trim());
      console.log('API Token saved successfully');
      
      res.json({ success: true, message: "Token kaydedildi ve doğrulandı" });
    } catch (error: any) {
      console.error('Save API token error:', error.response?.data || error.message);
      res.status(500).json({ error: "Token doğrulanamadı: " + (error.response?.data?.errors?.[0]?.message || error.message) });
    }
  });

  // Delete saved API Token
  app.delete("/api/cloudflare/api-token", async (req, res) => {
    deleteApiToken();
    res.json({ success: true });
  });

  // Get authentication/permissions status
  app.get("/api/cloudflare/auth-status", async (req, res) => {
    try {
      // Get fresh token (auto-refreshes expired OAuth tokens)
      const wranglerToken = await getWranglerTokenAsync();
      const apiToken = getSavedApiToken();
      
      const status = {
        wrangler: {
          authenticated: false,
          email: null as string | null,
          scopes: ['account:read', 'user:read', 'workers:write', 'pages:write', 'zone:read'] // Default wrangler scopes
        },
        apiToken: {
          configured: false,
          hasDnsPermission: false
        },
        canAddDomainWithDns: false
      };

      // Check Wrangler auth
      if (wranglerToken) {
        try {
          const userResponse = await axios.get('https://api.cloudflare.com/client/v4/user', {
            headers: { 'Authorization': `Bearer ${wranglerToken}` },
            timeout: 15000
          });
          if (userResponse.data.success) {
            status.wrangler.authenticated = true;
            status.wrangler.email = userResponse.data.result.email;
            
            // Wrangler OAuth token has full permissions including DNS
            // Wrangler OAuth doğrulandıysa DNS dahil tüm yetkiler otomatik aktif
            status.apiToken.configured = true;
            status.apiToken.hasDnsPermission = true;
          }
        } catch (e) {
          // Token invalid or expired
        }
      }

      // Check API Token (for DNS permissions)
      if (apiToken) {
        try {
          const verifyResponse = await axios.get('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            headers: { 'Authorization': `Bearer ${apiToken}` },
            timeout: 15000
          });
          if (verifyResponse.data.success && verifyResponse.data.result.status === 'active') {
            status.apiToken.configured = true;
            // Test actual zone_dns permission by listing DNS records
            try {
              const zonesResponse = await axios.get('https://api.cloudflare.com/client/v4/zones?per_page=1', {
                headers: { 'Authorization': `Bearer ${apiToken}` },
                timeout: 15000
              });
              const zones = zonesResponse.data.result || [];
              if (zones.length > 0) {
                const dnsResponse = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zones[0].id}/dns_records?per_page=1`, {
                  headers: { 'Authorization': `Bearer ${apiToken}` },
                  timeout: 15000
                });
                status.apiToken.hasDnsPermission = dnsResponse.data.success;
              }
            } catch (e) {
              status.apiToken.hasDnsPermission = false;
            }
          }
        } catch (e) {
          // Token invalid
        }
      }

      // Wrangler bağlı ise DNS dahil tüm yetkiler var, ayrı API token gerekmez
      status.canAddDomainWithDns = status.wrangler.authenticated || (status.apiToken.configured && status.apiToken.hasDnsPermission);

      res.json(status);
    } catch (error: any) {
      console.error('Auth status error:', error);
      res.status(500).json({ error: 'Failed to check auth status' });
    }
  });

  // Logout wrangler (revoke OAuth token + delete config)
  app.delete("/api/cloudflare/wrangler-logout", async (req, res) => {
    try {
      // 1. Try proper wrangler logout (revokes OAuth token on Cloudflare side)
      let wranglerLogoutSuccess = false;
      try {
        await wranglerExecAsync(`${WRANGLER} logout`, { encoding: 'utf8', timeout: 15000 });
        wranglerLogoutSuccess = true;
        console.log('Wrangler logout successful (token revoked)');
      } catch (e: any) {
        console.warn('Wrangler logout command failed, falling back to manual cleanup:', e.message);
      }

      // 2. Fallback: manually delete config files if wrangler logout didn't clean up
      const possiblePaths = [
        path.join(os.homedir(), '.wrangler', 'config', 'default.toml'),
        path.join(process.env.USERPROFILE || os.homedir(), '.wrangler', 'config', 'default.toml'),
        path.join(process.env.APPDATA || '', 'xdg.config', '.wrangler', 'config', 'default.toml'),
      ];

      let deleted = false;
      for (const configPath of possiblePaths) {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
          console.log(`Deleted wrangler config: ${configPath}`);
          deleted = true;
        }
      }

      // 3. Clear in-memory cache
      cache.clear();
      _wranglerTokenCache = null;

      res.json({ success: true, deleted, wranglerLogoutSuccess });
    } catch (error: any) {
      console.error('Wrangler logout error:', error);
      res.status(500).json({ error: 'Wrangler çıkışı başarısız: ' + error.message });
    }
  });

  // Verify wrangler authentication (no token needed)
  app.post("/api/cloudflare/verify-wrangler", async (req, res) => {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get fresh token (auto-refreshes expired OAuth tokens)
        const token = await getWranglerTokenAsync() || getWranglerToken(true);
        if (!token) {
          return res.status(401).json({ 
            error: "Not authenticated with wrangler",
            message: "Wrangler ile giriş yapılmamış. Lütfen önce Wrangler Bağlantısı yapın."
          });
        }

        // Verify token with Cloudflare API
        const response = await axios.get('https://api.cloudflare.com/client/v4/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        });

        if (response.data.success) {
          const user = response.data.result;
          // Get accounts
          const accountsResponse = await axios.get('https://api.cloudflare.com/client/v4/accounts', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 20000
          });

          const accounts = accountsResponse.data.result || [];
          return res.json({ 
            success: true, 
            email: user.email,
            accountId: accounts[0]?.id,
            accountName: accounts[0]?.name
          });
        } else {
          return res.status(401).json({ error: "Token is invalid" });
        }
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        console.error(`Wrangler auth check error (attempt ${attempt}/${maxRetries}):`, error.response?.data || error.message);
        if (isTimeout && attempt < maxRetries) {
          // Timeout — invalidate cache and retry with fresh token
          _wranglerTokenAsyncCache = null;
          _wranglerTokenCache = null;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return res.status(401).json({ 
          error: "Not authenticated with wrangler",
          message: isTimeout 
            ? "Cloudflare API yanıt vermedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin."
            : "Wrangler ile giriş yapılmamış. Lütfen önce Wrangler Bağlantısı yapın."
        });
      }
    }
  });

  app.get("/api/cloudflare/accounts", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    
    // If no token, try using wrangler token
    if (!token || token === 'wrangler') {
      try {
        const wranglerToken = await getWranglerTokenAsync();
        if (!wranglerToken) {
          return res.status(401).json({ 
            error: "Not authenticated",
            message: "Wrangler ile giriş yapılmamış. Lütfen önce Wrangler Bağlantısı yapın."
          });
        }

        const response = await axios.get('https://api.cloudflare.com/client/v4/accounts', {
          headers: {
            'Authorization': `Bearer ${wranglerToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        res.json(response.data.result || []);
      } catch (error: any) {
        console.error('Accounts fetch error:', error.response?.data || error.message);
        res.status(401).json({ 
          error: "Not authenticated",
          message: "Wrangler ile giriş yapılmamış. Lütfen önce Wrangler Bağlantısı yapın."
        });
      }
      return;
    }

    try {
      const response = await cfApi(token).get("/accounts");
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/cloudflare/:accountId/pages", async (req, res) => {
    const { accountId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI
    if (!token || token === 'wrangler') {
      try {
        const wranglerToken = await getWranglerTokenAsync();
        if (!wranglerToken) {
          return res.status(401).json({ error: "Wrangler token not found" });
        }

        const response = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
          {
            headers: {
              'Authorization': `Bearer ${wranglerToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        res.json(response.data.result || []);
      } catch (error: any) {
        console.error('Pages list error:', error.response?.data || error.message);
        res.json([]);
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).get(`/accounts/${accountId}/pages/projects`);
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch Pages projects" });
    }
  });

  app.post("/api/cloudflare/:accountId/pages", async (req, res) => {
    const { accountId } = req.params;
    const { name, production_branch } = req.body;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI
    if (!token || token === 'wrangler') {
      try {
        await wranglerExecAsync(`${WRANGLER} pages project create ${name} --production-branch=${production_branch || 'main'}`, {
          encoding: 'utf8'
        });
        res.json({ id: name, name: name, subdomain: `${name}.pages.dev`, created_on: new Date().toISOString() });
      } catch (error: any) {
        res.status(500).json({ error: "Failed to create Pages project" });
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).post(`/accounts/${accountId}/pages/projects`, {
        name,
        production_branch: production_branch || "main",
      });
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Failed to create Pages project" });
    }
  });

  // Get Cloudflare zones (domains) for custom domain selection
  app.get("/api/cloudflare/:accountId/zones", async (req, res) => {
    const { accountId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI - read OAuth token from config
    if (!token || token === 'wrangler') {
      try {
        // Check cache first
        const cacheKey = `zones_${accountId}`;
        const cached = getCached(cacheKey);
        if (cached) {
          console.log('Returning cached zones data');
          return res.json(cached);
        }

        const wranglerToken = await getWranglerTokenAsync();
        if (!wranglerToken) {
          return res.status(401).json({ error: "Wrangler token not found" });
        }
        
        // Use Cloudflare API to list zones
        const response = await axios.get(`https://api.cloudflare.com/client/v4/zones?account.id=${accountId}`, {
          headers: {
            'Authorization': `Bearer ${wranglerToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        const zones = response.data.result || [];
        setCache(cacheKey, zones);
        res.json(zones);
      } catch (error: any) {
        console.error('Zones list error:', error.response?.data || error);
        res.json([]);
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).get(`/zones?account.id=${accountId}`);
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch zones" });
    }
  });

  // Get custom domains with status for a Pages project
  app.get("/api/cloudflare/:accountId/pages/:projectName/domains", async (req, res) => {
    const { accountId, projectName } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token || token === 'wrangler') {
      try {
        const wranglerToken = await getWranglerTokenAsync();
        if (!wranglerToken) {
          return res.status(401).json({ error: "Wrangler token not found" });
        }
        
        // Use Cloudflare API to get domains with status
        const response = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
          {
            headers: {
              'Authorization': `Bearer ${wranglerToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        res.json(response.data.result || []);
      } catch (error: any) {
        console.error('Get domains error:', error.response?.data || error);
        res.json([]);
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).get(`/accounts/${accountId}/pages/projects/${projectName}/domains`);
      res.json(response.data.result || []);
    } catch (error: any) {
      res.json([]);
    }
  });

  // Add custom domain to Pages project
  app.post("/api/cloudflare/:accountId/pages/:projectName/domains", async (req, res) => {
    const { accountId, projectName } = req.params;
    const { domain } = req.body;
    const token = req.headers.authorization?.split(" ")[1];
    const apiToken = getSavedApiToken();
    
    if (!token || token === 'wrangler') {
      try {
        // Use async token getter to auto-refresh expired OAuth tokens
        const wranglerToken = await getWranglerTokenAsync();
        if (!wranglerToken) {
          return res.status(401).json({ error: "Wrangler token not found" });
        }
        
        // Step 1: Find the zone for this domain
        const rootDomain = domain.split('.').slice(-2).join('.'); // Extract root domain (e.g., example.com from www.example.com)
        
        console.log(`Looking for zone: ${rootDomain}`);
        
        const zonesResponse = await axios.get(
          `https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`,
          {
            headers: {
              'Authorization': `Bearer ${wranglerToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const zones = zonesResponse.data.result || [];
        const zone = zones.find((z: any) => z.name === rootDomain);
        
        if (!zone) {
          return res.status(404).json({ 
            error: `Domain ${rootDomain} is not managed by Cloudflare. Please add it to Cloudflare first.`,
            needsZone: true,
            rootDomain: rootDomain
          });
        }
        
        console.log(`Found zone: ${zone.id} for ${zone.name}`);
        // Step 2: Add custom domain to Pages project directly. 
        // Cloudflare will automatically create the DNS CNAME record if the zone is in the same account!
        console.log(`Adding domain ${domain} to Pages project ${projectName}...`);
        const response = await axios.post(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
          { name: domain },
          {
            headers: {
              'Authorization': `Bearer ${wranglerToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('Domain added to Pages project successfully. Creating CNAME record...');
        
        const targetCname = `${projectName}.pages.dev`;
        let dnsError = null;
        
        // Wrangler OAuth token DOES NOT have Zone DNS permissions.
        // We must use the user-provided API Token for DNS operations.
        const dnsTokenForWrite = apiToken || wranglerToken;
        if (!apiToken) {
          console.warn("No dedicated API Token found! DNS operations will likely fail with 10000 Authentication Error using Wrangler Token.");
        }
        
        try {
          // Check if record exists
          const dnsRecordsResp = await axios.get(
            `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?name=${domain}`,
            {
              headers: {
                'Authorization': `Bearer ${dnsTokenForWrite}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          const existingRecords = dnsRecordsResp.data.result || [];
          if (existingRecords.length > 0) {
            console.log(`DNS record already exists for ${domain}, updating...`);
            // Only update the first matched record
            await axios.patch(
              `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${existingRecords[0].id}`,
              {
                type: 'CNAME',
                name: domain,
                content: targetCname,
                proxied: true,
                comment: 'Autogenerated by Cloudflare Pro Toolkit'
              },
              {
                headers: {
                  'Authorization': `Bearer ${dnsTokenForWrite}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          } else {
            console.log(`Creating new DNS CNAME record for ${domain}...`);
            await axios.post(
              `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`,
              {
                type: 'CNAME',
                name: domain,
                content: targetCname,
                proxied: true,
                comment: 'Autogenerated by Cloudflare Pro Toolkit'
              },
              {
                headers: {
                  'Authorization': `Bearer ${dnsTokenForWrite}`,
                  'Content-Type': 'application/json'
                }
              }
            );
          }
          console.log('DNS CNAME record created/updated successfully.');
        } catch (err: any) {
          console.error('DNS update failed:', err.response?.data || err.message);
          dnsError = err.response?.data?.errors?.[0]?.message || err.message;
        }
        
        // Build response
        const responseData: any = {
          ...response.data.result,
          dnsConfigured: !dnsError,
          dnsError: dnsError,
          dnsManualUrl: dnsError ? `https://dash.cloudflare.com/${accountId}/${domain}/dns/records` : undefined,
          cnameRecord: {
            type: 'CNAME',
            name: domain,
            content: targetCname,
            proxied: true
          }
        };
                
        res.json(responseData);
      } catch (error: any) {
        console.error('Add domain error:', error.response?.data || error);
        res.status(500).json({ 
          error: error.response?.data?.errors?.[0]?.message || "Failed to add domain",
          details: error.response?.data
        });
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).post(`/accounts/${accountId}/pages/projects/${projectName}/domains`, {
        name: domain
      });
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Failed to add domain" });
    }
  });

  // Delete custom domain from Pages project + DNS record cleanup
  app.delete("/api/cloudflare/:accountId/pages/:projectName/domains/:domainName", async (req, res) => {
    const { accountId, projectName, domainName } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    // Use async token getter to auto-refresh expired OAuth tokens
    const wranglerToken = await getWranglerTokenAsync();
    const authToken = (token && token !== 'wrangler') ? token : wranglerToken;
    
    if (!authToken) {
      return res.status(401).json({ error: "No authentication token available" });
    }

    let pagesDeleted = false;
    let dnsDeleted = false;
    let dnsError = '';

    // Step 1: Delete custom domain from Pages project
    try {
      await axios.delete(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains/${domainName}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      pagesDeleted = true;
      console.log(`Pages domain deleted: ${domainName} from ${projectName}`);
    } catch (error: any) {
      console.error('Delete Pages domain error:', error.response?.data || error);
    }

    // Step 2: Delete DNS CNAME record from zone (API Token ile - DNS yetkisi gerektirir)
    const apiToken = getSavedApiToken();
    const dnsToken = apiToken || authToken;
    if (!apiToken) {
      console.warn("No dedicated API Token found! DNS deletion will likely fail with 10000 Authentication Error using Wrangler Token.");
    }
    try {
      // Find the root domain (e.g. "example.com" from "www.example.com")
      const domainParts = domainName.split('.');
      let rootDomain = domainName;
      if (domainParts.length > 2) {
        rootDomain = domainParts.slice(-2).join('.');
      }

      // Find the zone
      const zonesResponse = await axios.get(
        `https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`,
        {
          headers: {
            'Authorization': `Bearer ${dnsToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const zones = zonesResponse.data.result || [];
      if (zones.length > 0) {
        const zoneId = zones[0].id;

        // Find CNAME records matching this domain
        const dnsResponse = await axios.get(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${domainName}`,
          {
            headers: {
              'Authorization': `Bearer ${dnsToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        const dnsRecords = dnsResponse.data.result || [];
        const targetCname = `${projectName}.pages.dev`;

        for (const record of dnsRecords) {
          // Delete CNAME records that point to this project's pages.dev domain
          if (record.content === targetCname || record.name === domainName) {
            await axios.delete(
              `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`,
              {
                headers: {
                  'Authorization': `Bearer ${dnsToken}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            console.log(`DNS record deleted: ${record.name} -> ${record.content} (ID: ${record.id})`);
            dnsDeleted = true;
          }
        }

        if (!dnsDeleted && dnsRecords.length === 0) {
          console.log(`No CNAME DNS record found for ${domainName}`);
          dnsDeleted = true; // No record to delete = success
        }
      } else {
        console.log(`Zone not found for ${rootDomain}, skipping DNS cleanup`);
        dnsError = `Zone ${rootDomain} bulunamadı`;
      }
    } catch (error: any) {
      console.error('DNS record delete error:', error.response?.data || error.message);
      dnsError = error.response?.data?.errors?.[0]?.message || error.message || 'DNS kaydı silinemedi';
    }

    if (pagesDeleted) {
      res.json({ 
        success: true, 
        message: 'Domain deleted successfully',
        dnsDeleted,
        dnsError: dnsError || undefined
      });
    } else {
      res.status(500).json({ error: "Pages domain silinemedi", dnsDeleted, dnsError });
    }
  });

  app.get("/api/cloudflare/:accountId/d1", async (req, res) => {
    const { accountId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI
    if (!token || token === 'wrangler') {
      try {
        // Check cache first
        const cacheKey = `d1_${accountId}`;
        const cached = getCached(cacheKey);
        if (cached) {
          console.log('Returning cached D1 data');
          return res.json(cached);
        }

        const { stdout } = await wranglerExecAsync(`${WRANGLER} d1 list --json`, {
          encoding: 'utf8',
          timeout: 10000 // 10 second timeout
        });
        const databases = JSON.parse(stdout);
        
        setCache(cacheKey, databases || []);
        res.json(databases || []);
      } catch (error: any) {
        console.error('D1 list error:', error);
        res.json([]);
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).get(`/accounts/${accountId}/d1/database`);
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch D1 databases" });
    }
  });

  app.post("/api/cloudflare/:accountId/d1", async (req, res) => {
    const { accountId } = req.params;
    const { name } = req.body;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI
    if (!token || token === 'wrangler') {
      try {
        const { stdout } = await wranglerExecAsync(`${WRANGLER} d1 create ${name} --json`, {
          encoding: 'utf8'
        });
        const db = JSON.parse(stdout);
        res.json(db);
      } catch (error: any) {
        res.json({ uuid: 'temp-' + Date.now(), name: name, created_at: new Date().toISOString() });
      }
      return;
    }
    
    try {
      const response = await cfApi(token!).post(`/accounts/${accountId}/d1/database`, {
        name,
      });
      res.json(response.data.result);
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Failed to create D1 database" });
    }
  });

  // List R2 templates dynamically (HTTP öncelikli, wrangler CLI fallback)
  app.get("/api/r2/templates", async (req, res) => {
    const buildTemplateResponse = (manifest: any) => {
      const templateKey = manifest.versioned_key || manifest.download_key || 'templates/hukukai_template_latest.zip';
      const downloadUrl = manifest.download_url || (TEMPLATE_DOWNLOAD_BASE_URL ? `${TEMPLATE_DOWNLOAD_BASE_URL.replace(/\/$/, '')}/${templateKey}` : '');
      return [{
        id: manifest.template_id || 'otomasyonsite',
        name: manifest.template_name || 'HukukAI - Avukatlık & Hukuk Bürosu',
        key: templateKey,
        download_url: downloadUrl,
        version: manifest.latest_version,
        size: manifest.versions?.[0]?.size ? parseInt(manifest.versions[0].size) * 1024 : 246326,
        uploaded: manifest.published_at || new Date().toISOString(),
        description: `Sürüm ${manifest.latest_version}: ${manifest.changelog || 'En güncel versiyon'}`
      }];
    };

    // Yöntem 1: HTTP ile manifest çek (herhangi bir kullanıcı için çalışır)
    if (TEMPLATE_DOWNLOAD_BASE_URL) {
      try {
        const manifestUrl = `${TEMPLATE_DOWNLOAD_BASE_URL.replace(/\/$/, '')}/templates/hukukai_version_manifest.json`;
        console.log(`Fetching template manifest via HTTP: ${manifestUrl}`);
        const httpResp = await axios.get(manifestUrl, { timeout: 10000 });
        if (httpResp.data && httpResp.data.latest_version) {
          console.log(`[HTTP] Found template version: ${httpResp.data.latest_version}`);
          return res.json(buildTemplateResponse(httpResp.data));
        }
      } catch (httpErr: any) {
        console.warn('HTTP manifest fetch failed:', httpErr.message);
      }
    }

    // Yöntem 2: Wrangler CLI ile R2'den çek (sadece bucket sahibi için çalışır)
    try {
      const tempPath = path.join(process.cwd(), `version_manifest_${Date.now()}.json`);
      console.log('Fetching template manifest via wrangler CLI...');
      await wranglerExecAsync(`${WRANGLER} r2 object get cloudflare-pro-templates/templates/hukukai_version_manifest.json --remote --file="${tempPath}"`, {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 20000
      });

      let manifest: any = null;
      if (fs.existsSync(tempPath)) {
        manifest = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
        fs.unlinkSync(tempPath);
      }

      if (manifest && manifest.latest_version) {
        console.log(`[CLI] Found template version: ${manifest.latest_version}`);
        return res.json(buildTemplateResponse(manifest));
      }
    } catch (cliErr: any) {
      console.warn('Wrangler CLI manifest fetch failed:', cliErr.message);
    }

    // Yöntem 3: Fallback — varsayılan şablon bilgisi
    console.log('Using fallback template info');
    const fallbackKey = 'templates/hukukai_template_latest.zip';
    const fallbackUrl = TEMPLATE_DOWNLOAD_BASE_URL ? `${TEMPLATE_DOWNLOAD_BASE_URL.replace(/\/$/, '')}/${fallbackKey}` : '';
    res.json([{
      id: 'otomasyonsite',
      name: 'Avukat Sitesi Otomasyonu',
      key: fallbackKey,
      download_url: fallbackUrl,
      size: 0,
      uploaded: new Date().toISOString(),
      description: 'Avukat Sitesi Otomasyonu - Profesyonel hukuk bürosu web sitesi'
    }]);
  });

  // Helper function to get template descriptions
  function getTemplateDescription(templateName: string): string {
    const descriptions: Record<string, string> = {
      'otomasyonsite': 'Avukat Sitesi Otomasyonu - Profesyonel hukuk bürosu web sitesi, müvekkil yönetimi, randevu sistemi',
      'blog': 'Modern blog sitesi - Markdown desteği, SEO optimizasyonu',
      'portfolio': 'Kişisel portfolio sitesi - Proje galerisi, iletişim formu',
      'ecommerce': 'E-ticaret sitesi - Ürün yönetimi, sepet, ödeme entegrasyonu',
      'landing': 'Landing page şablonu - Yüksek dönüşüm odaklı tasarım'
    };
    return descriptions[templateName] || 'Cloudflare Pages şablonu';
  }

  // Delete Pages project
  app.delete("/api/cloudflare/:accountId/pages/:projectName", async (req, res) => {
    const { accountId, projectName } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Use wrangler CLI
    if (!token || token === 'wrangler') {
      try {
        await wranglerExecAsync(`${WRANGLER} pages project delete ${projectName} --yes`, {
          encoding: 'utf8',
          cwd: process.cwd(),
          timeout: 15000
        });
        
        // Clear cache
        cache.delete(`pages_${accountId}`);
        
        res.json({ success: true, message: 'Project deleted successfully' });
      } catch (error: any) {
        console.error('Pages delete error:', error);
        res.status(500).json({ error: error.message || "Failed to delete Pages project" });
      }
      return;
    }
    
    try {
      await cfApi(token!).delete(`/accounts/${accountId}/pages/projects/${projectName}`);
      res.json({ success: true, message: 'Project deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Failed to delete Pages project" });
    }
  });

  // Delete D1 database (accepts name or UUID)
  app.delete("/api/cloudflare/:accountId/d1/:databaseNameOrId", async (req, res) => {
    const { accountId, databaseNameOrId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];
    
    // Decode the database name (might contain special chars)
    const dbIdentifier = decodeURIComponent(databaseNameOrId);
    console.log(`Deleting D1 database: ${dbIdentifier}`);
    
    // Use wrangler CLI - accepts both name and UUID
    if (!token || token === 'wrangler') {
      try {
        const { stdout, stderr } = await wranglerExecAsync(`${WRANGLER} d1 delete "${dbIdentifier}" -y`, {
          encoding: 'utf8',
          cwd: process.cwd(),
          timeout: 30000
        });
        console.log('D1 delete stdout:', stdout);
        if (stderr) console.log('D1 delete stderr:', stderr);
        
        // Clear cache
        cache.delete(`d1_${accountId}`);
        
        res.json({ success: true, message: 'Database deleted successfully' });
      } catch (error: any) {
        console.error('D1 delete error:', error.message, error.stderr);
        res.status(500).json({ error: error.stderr || error.message || "Failed to delete D1 database" });
      }
      return;
    }
    
    try {
      // For API token, try to find UUID if name was provided
      await cfApi(token!).delete(`/accounts/${accountId}/d1/database/${dbIdentifier}`);
      res.json({ success: true, message: 'Database deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.response?.data?.errors?.[0]?.message || "Failed to delete D1 database" });
    }
  });

  // ——— D1 Admin Password Reset ———
  // Get admin info from D1 database
  app.get("/api/d1/admin-info", async (req, res) => {
    const dbName = req.query.db as string;
    if (!dbName) return res.status(400).json({ error: 'db parametresi gerekli' });

    try {
      const { stdout } = await wranglerExecAsync(
        `${WRANGLER} d1 execute ${dbName} --command="SELECT id, email, name FROM admins LIMIT 5" --json --remote`,
        { timeout: 20000 }
      );
      const parsed = JSON.parse(stdout);
      // wrangler d1 execute --json returns an array of result sets
      const results = parsed?.[0]?.results || parsed?.results || [];
      res.json({ success: true, admins: results });
    } catch (error: any) {
      console.error('D1 admin-info error:', error.message);
      res.status(500).json({ error: 'Veritabanından admin bilgisi alınamadı: ' + (error.stderr || error.message) });
    }
  });

  // Reset admin password in D1 database
  app.post("/api/d1/reset-password", async (req, res) => {
    const { dbName, adminId, newPassword } = req.body;
    if (!dbName || !adminId || !newPassword) {
      return res.status(400).json({ error: 'dbName, adminId ve newPassword gerekli' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır' });
    }

    try {
      // Hash the password using SHA-256 + salt (same format as admin panel)
      // Admin panel: SHA-256(saltHex + password), stored as saltHex:hashHex
      const salt = crypto.randomBytes(16);
      const saltHex = salt.toString('hex');
      const hash = crypto.createHash('sha256').update(saltHex + newPassword).digest('hex');
      const passwordHash = `${saltHex}:${hash}`;

      // Escape single quotes in hash for SQL
      const escapedHash = passwordHash.replace(/'/g, "''");

      const { stdout } = await wranglerExecAsync(
        `${WRANGLER} d1 execute ${dbName} --command="UPDATE admins SET password_hash = '${escapedHash}', updated_at = CURRENT_TIMESTAMP WHERE id = ${Number(adminId)}" --remote`,
        { timeout: 20000 }
      );

      console.log(`[D1] Password reset for admin ID ${adminId} in ${dbName}`);
      res.json({ success: true, message: 'Şifre başarıyla güncellendi' });
    } catch (error: any) {
      console.error('D1 reset-password error:', error.message);
      res.status(500).json({ error: 'Şifre güncellenemedi: ' + (error.stderr || error.message) });
    }
  });

  // Deploy template with SSE progress
  app.get("/api/deploy/template", async (req, res) => {
    const projectName = req.query.projectName as string;
    const templateKey = req.query.templateKey as string || 'templates/hukukai_template_latest.zip';
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = (step: number, message: string) => {
      res.write(`data: ${JSON.stringify({ step, message })}\n\n`);
    };

    const sendError = (error: string) => {
      res.write(`data: ${JSON.stringify({ error })}\n\n`);
      res.end();
    };

    const sendComplete = (url: string) => {
      res.write(`data: ${JSON.stringify({ complete: true, url })}\n\n`);
      res.end();
    };

    try {
      const tempDir = path.join(process.cwd(), 'temp-deploy');
      const zipPath = path.join(tempDir, 'template.zip');
      
      // Create temp directory
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      sendProgress(1, 'Şablon indiriliyor...');
      const httpUrl = (req.query.downloadUrl as string) || (TEMPLATE_DOWNLOAD_BASE_URL ? `${TEMPLATE_DOWNLOAD_BASE_URL.replace(/\/$/, '')}/${templateKey}` : '');
      
      if (httpUrl) {
        try {
          console.log(`[deploy] HTTP download: ${httpUrl}`);
          await downloadFileHTTPS(httpUrl, zipPath);
          console.log('[deploy] HTTP download successful');
        } catch (httpErr: any) {
          console.warn(`[deploy] HTTP download failed: ${httpErr.message}, trying wrangler CLI...`);
          await wranglerExecAsync(`${WRANGLER} r2 object get cloudflare-pro-templates/${templateKey} --remote --file="${zipPath}"`, {
            encoding: 'utf8',
            cwd: process.cwd()
          });
        }
      } else {
        console.log(`[deploy] Downloading via wrangler CLI: cloudflare-pro-templates/${templateKey}`);
        await wranglerExecAsync(`${WRANGLER} r2 object get cloudflare-pro-templates/${templateKey} --remote --file="${zipPath}"`, {
          encoding: 'utf8',
          cwd: process.cwd()
        });
      }
      
      sendProgress(2, 'Åablon çıkartılıyor...');
      const extractPath = path.join(tempDir, 'project');
      await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);
      
      sendProgress(3, 'Yapılandırma güncelleniyor...');
      const wranglerPath = path.join(extractPath, 'wrangler.toml');
      let wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');
      
      // Proje adı ve DB adı
      wranglerConfig = wranglerConfig.replace(/name = ".*"/, `name = "${projectName}"`);
      wranglerConfig = wranglerConfig.replace(/database_name = ".*"/, `database_name = "${projectName}-db"`);
      
      // JWT_SECRET: güvenli rastgele 64 karakter
      const jwtSecret = crypto.randomBytes(48).toString('base64url');
      wranglerConfig = wranglerConfig.replace(/JWT_SECRET = ".*"/, `JWT_SECRET = "${jwtSecret}"`);
      
      // CF_PROJECT_NAME: güncelleme sistemi için gerekli
      wranglerConfig = wranglerConfig.replace(/CF_PROJECT_NAME = ".*"/, `CF_PROJECT_NAME = "${projectName}"`);
      
      // Vectorize index adı: proje bazlı
      wranglerConfig = wranglerConfig.replace(/index_name = ".*"/, `index_name = "${projectName}-rag-index"`);
      
      fs.writeFileSync(wranglerPath, wranglerConfig);
      
      sendProgress(4, 'D1 veritabanı oluşturuluyor...');
      const { stdout: d1Output } = await wranglerExecAsync(`${WRANGLER} d1 create ${projectName}-db`, { 
        encoding: 'utf8',
        cwd: extractPath 
      });
      
      // Parse the output to get database_id
      const dbIdMatch = d1Output.match(/database_id = "([^"]+)"/);
      const dbId = dbIdMatch ? dbIdMatch[1] : '';
      
      if (!dbId) {
        throw new Error('Database ID could not be extracted');
      }
      
      wranglerConfig = fs.readFileSync(wranglerPath, 'utf8');
      wranglerConfig = wranglerConfig.replace(/database_id = ".*"/, `database_id = "${dbId}"`);
      fs.writeFileSync(wranglerPath, wranglerConfig);
      
      sendProgress(5, 'Veritabanı tabloları oluşturuluyor...');
      if (fs.existsSync(path.join(extractPath, 'schema.sql'))) {
        await wranglerExecAsync(`${WRANGLER} d1 execute ${projectName}-db --file=schema.sql --remote`, { 
          encoding: 'utf8',
          cwd: extractPath 
        });
      }
      // seed.sql varsa çalıştır (başlangıç verileri)
      if (fs.existsSync(path.join(extractPath, 'seed.sql'))) {
        await wranglerExecAsync(`${WRANGLER} d1 execute ${projectName}-db --file=seed.sql --remote`, { 
          encoding: 'utf8',
          cwd: extractPath 
        });
      }
      
      // Vectorize index oluştur
      sendProgress(6, 'Vectorize index oluşturuluyor...');
      const vectorizeIndexName = `${projectName}-rag-index`;
      try {
        await wranglerExecAsync(`${WRANGLER} vectorize create ${vectorizeIndexName} --dimensions=1024 --metric=cosine`, {
          encoding: 'utf8',
          cwd: extractPath
        });
      } catch (e: any) {
        if (!e.message?.includes('already exists') && !e.message?.includes('Index with name')) {
          console.warn('[deploy] Vectorize creation warning:', e.message);
        }
      }

      sendProgress(7, 'Cloudflare Pages\'e deploy ediliyor...');
      try {
        await wranglerExecAsync(`${WRANGLER} pages project create ${projectName} --production-branch=main`, { encoding: 'utf8', cwd: extractPath });
      } catch (e: any) {
        if (!e.message?.includes('already exists')) {
          console.warn('[deploy] Project creation warning:', e.message);
        }
      }
      await wranglerExecAsync(`${WRANGLER} pages deploy dist --project-name=${projectName}`, { 
        encoding: 'utf8',
        cwd: extractPath 
      });
      
      // Cleanup
      fs.rmSync(tempDir, { recursive: true, force: true });
      
      sendComplete(`https://${projectName}.pages.dev`);
      
    } catch (error: any) {
      console.error('Deployment error:', error.message);
      sendError(error.message);
    }
  });

  // ═══ OTOMATİK GÜNCELLEME API'leri ═══
  const MANIFEST_URL = 'https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest';
  const PKG_VERSION = (() => {
    try {
      // Packaged Electron'da package.json farklı konumda olabilir
      const possiblePaths = [
        path.join(__dirname, '..', 'package.json'),
        path.join(process.cwd(), 'package.json'),
        path.join(__dirname, 'package.json'),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf-8')).version || '0.0.0';
        }
      }
    } catch (_) {}
    return '0.0.0';
  })();
  console.log(`[update] Mevcut sürüm: v${PKG_VERSION}`);

  // Güncelleme kontrolü — manifest'ten en son sürümü çeker
  app.get('/api/app/check-update', async (_req, res) => {
    try {
      const response = await axios.get(MANIFEST_URL, { timeout: 10000 });
      const manifest = response.data;
      const latestVersion = manifest.latest_version || manifest.version || '0.0.0';
      const currentVersion = PKG_VERSION;

      // Basit semver karşılaştırma
      const isNewer = latestVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0;

      res.json({
        currentVersion,
        latestVersion,
        updateAvailable: isNewer,
        downloadUrl: manifest.download_url || null,
        checksum: manifest.checksum || null,
        changelog: manifest.changelog || '',
        publishedAt: manifest.published_at || null,
        size: manifest.size || null,
      });
    } catch (err: any) {
      console.error('[update] Manifest kontrol hatası:', err.message);
      res.status(500).json({ error: 'Güncelleme sunucusuna bağlanılamadı', currentVersion: PKG_VERSION });
    }
  });

  // Güncellemeyi indir ve hazırla
  app.post('/api/app/download-update', async (req, res) => {
    try {
      // Manifest'i tekrar çek
      const manifestRes = await axios.get(MANIFEST_URL, { timeout: 10000 });
      const manifest = manifestRes.data;
      const downloadUrl = manifest.download_url;
      const expectedChecksum = manifest.checksum;
      const latestVersion = manifest.latest_version;

      if (!downloadUrl) {
        return res.status(400).json({ error: 'İndirme URL bulunamadı' });
      }

      // İndirme dizini
      const updateDir = path.join(os.tmpdir(), 'cfoto-update');
      if (fs.existsSync(updateDir)) fs.rmSync(updateDir, { recursive: true, force: true });
      fs.mkdirSync(updateDir, { recursive: true });

      const zipPath = path.join(updateDir, 'update.zip');
      const extractDir = path.join(updateDir, 'extracted');

      // ZIP indir
      console.log(`[update] İndiriliyor: ${downloadUrl}`);
      const dlRes = await axios.get(downloadUrl, { responseType: 'stream', timeout: 300000 });
      const writer = createWriteStream(zipPath);
      await pipeline(dlRes.data, writer);

      // Checksum doğrula
      if (expectedChecksum) {
        const fileBuf = fs.readFileSync(zipPath);
        const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
        if (hash !== expectedChecksum) {
          fs.rmSync(updateDir, { recursive: true, force: true });
          return res.status(400).json({ error: 'Checksum doğrulama başarısız! İndirme bozuk olabilir.' });
        }
        console.log('[update] Checksum doğrulandı ✓');
      }

      // ZIP çıkart
      fs.mkdirSync(extractDir, { recursive: true });
      await execAsync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { timeout: 120000 });

      // Tek alt dizin varsa flatten et
      const items = fs.readdirSync(extractDir);
      if (items.length === 1) {
        const subDir = path.join(extractDir, items[0]);
        if (fs.statSync(subDir).isDirectory()) {
          const subItems = fs.readdirSync(subDir);
          for (const si of subItems) {
            fs.renameSync(path.join(subDir, si), path.join(extractDir, si));
          }
          fs.rmdirSync(subDir);
        }
      }

      const extractedItems = fs.readdirSync(extractDir);
      console.log(`[update] Çıkartıldı: ${extractedItems.length} dosya/klasör`);

      res.json({
        success: true,
        version: latestVersion,
        extractDir,
        fileCount: extractedItems.length,
      });
    } catch (err: any) {
      console.error('[update] İndirme hatası:', err.message);
      res.status(500).json({ error: 'Güncelleme indirilemedi: ' + err.message });
    }
  });

  // Güncellemeyi uygula — VBS + PowerShell ile sessizce (pencere açmadan) günceller
  app.post('/api/app/apply-update', async (req, res) => {
    try {
      const { extractDir } = req.body;
      if (!extractDir || !fs.existsSync(extractDir)) {
        return res.status(400).json({ error: 'Güncelleme dosyaları bulunamadı. Önce indirin.' });
      }

      // Kurulum dizini: exe'nin bulunduğu yer
      const installDir = path.dirname(process.execPath);
      const exeName = path.basename(process.execPath);
      const exeFullPath = path.join(installDir, exeName);
      const vbsPath = path.join(os.tmpdir(), 'cfoto-updater.vbs');
      const ps1Path = path.join(os.tmpdir(), 'cfoto-updater.ps1');

      // PowerShell script: sessiz güncelleme
      const ps1Content = `
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds 2
Stop-Process -Name '${path.parse(exeName).name}' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Copy-Item -Path '${extractDir}\\*' -Destination '${installDir}' -Recurse -Force
Start-Sleep -Seconds 1
Start-Process -FilePath '${exeFullPath}'
Remove-Item -Path '${ps1Path}' -Force -ErrorAction SilentlyContinue
Remove-Item -Path '${vbsPath}' -Force -ErrorAction SilentlyContinue
`;
      fs.writeFileSync(ps1Path, ps1Content, 'utf-8');

      // VBS wrapper: PowerShell'i tamamen gizli çalıştırır (hiçbir pencere açılmaz)
      const vbsContent = `Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${ps1Path}""", 0, False
`;
      fs.writeFileSync(vbsPath, vbsContent, 'utf-8');

      // VBS'i wscript ile başlat (tamamen sessiz, pencere yok)
      exec(`wscript.exe "${vbsPath}"`, { windowsHide: true } as any);

      res.json({ success: true, message: 'Güncelleme uygulanıyor, uygulama yeniden başlatılacak...' });

      // 1sn sonra uygulamayı kapat
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (err: any) {
      console.error('[update] Uygulama hatası:', err.message);
      res.status(500).json({ error: 'Güncelleme uygulanamadı: ' + err.message });
    }
  });

  // Vite middleware for development (dinamik import — production build'de yüklenmez)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production: dist/ klasörünü bul (packaged Electron'da process.cwd() güvenilir değil)
    const possibleDistPaths = [
      path.join(__dirname, '..', 'dist'),        // dist-server/../dist
      path.join(process.cwd(), 'dist'),           // normal çalışma
      path.join(__dirname, 'dist'),               // dist-server/dist
    ];
    let distPath = possibleDistPaths.find(p => fs.existsSync(path.join(p, 'index.html')));
    if (!distPath) {
      console.error('[server] dist/index.html bulunamadı! Denenen yollar:', possibleDistPaths);
      distPath = possibleDistPaths[0]; // fallback
    } else {
      console.log('[server] Static dosyalar servisi:', distPath);
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath!, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
  });
  // NOT: Port 8976 wrangler OAuth callback için ayrılmıştır, burada dinlenmez
}

startServer();


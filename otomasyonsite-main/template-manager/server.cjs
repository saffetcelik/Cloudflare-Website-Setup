#!/usr/bin/env node
const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Global hata yakalama - server crash'lerini önle
process.on('uncaughtException', (err) => {
  console.error('\x1b[31m  ❌ UNCAUGHT EXCEPTION:\x1b[0m', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (err) => {
  console.error('\x1b[31m  ❌ UNHANDLED REJECTION:\x1b[0m', err);
});

const app = express();
const PORT = 3456;
const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const DB_FILE = path.join(__dirname, 'templates-db.json');
const SECTORS_DIR = path.join(ROOT, 'sectors');
const R2_BUCKET = 'cloudflare-pro-templates';

// Sectors dizinini oluştur
if (!fs.existsSync(SECTORS_DIR)) fs.mkdirSync(SECTORS_DIR, { recursive: true });

app.use(express.json());
// React build çıktısını serve et (production)
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
app.use(express.static(CLIENT_DIST));
// Fallback: eski public klasörü (vanilla versiyon)
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPERS ───
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  }
  const defaultDB = { templates: [], deployments: [], activity_log: [] };
  saveDB(defaultDB);
  return defaultDB;
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function addLog(action, details) {
  const db = loadDB();
  db.activity_log.unshift({
    id: Date.now().toString(),
    action,
    details,
    timestamp: new Date().toISOString()
  });
  if (db.activity_log.length > 100) db.activity_log = db.activity_log.slice(0, 100);
  saveDB(db);
}

// ─── VERSION HELPERS ───
function bumpVersion(version, type = 'patch') {
  const parts = (version || '1.0.0').split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[0] = parts[0]; parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  return parts.join('.');
}

function getZipFileName(tpl) {
  // Sektörel isimlendirme: hukukai_template_v1.0.1.zip
  const sectorPrefix = tpl.sector || tpl.category || 'genel';
  return `${sectorPrefix}ai_template_v${tpl.version}.zip`;
}

function getR2Key(tpl) {
  // R2'deki dosya yolu: templates/hukukai_template_v1.0.1.zip
  return `templates/${getZipFileName(tpl)}`;
}

function getR2LatestKey(tpl) {
  // Her zaman güncel olan latest pointer
  const sectorPrefix = tpl.sector || tpl.category || 'genel';
  return `templates/${sectorPrefix}ai_template_latest.zip`;
}

function runWrangler(cmd, cwd) {
  try {
    const result = execSync(`npx wrangler ${cmd}`, {
      cwd: cwd || APP_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000,
      shell: true
    });
    return { success: true, output: result };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

// ─── API: Dashboard Stats ───
app.get('/api/stats', (req, res) => {
  const db = loadDB();
  res.json({
    totalTemplates: db.templates.length,
    r2Synced: db.templates.filter(t => t.r2_synced).length,
    totalDeployments: db.deployments.length,
    lastActivity: db.activity_log[0] || null
  });
});

// ─── API: List Templates ───
app.get('/api/templates', (req, res) => {
  const db = loadDB();
  res.json(db.templates);
});

// ─── API: Get Single Template ───
app.get('/api/templates/:id', (req, res) => {
  const db = loadDB();
  const t = db.templates.find(t => t.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Template bulunamadı' });
  res.json(t);
});

// ─── API: Register/Create Template Entry ───
app.post('/api/templates', (req, res) => {
  const { id, name, description, category, sector, features, schema_variant } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id ve name zorunlu' });

  const db = loadDB();
  if (db.templates.find(t => t.id === id)) {
    return res.status(409).json({ error: 'Bu ID zaten mevcut' });
  }

  const template = {
    id,
    name,
    description: description || '',
    category: category || 'general',
    sector: sector || 'general',
    features: features || [],
    schema_variant: schema_variant || 'default',
    version: '1.0.0',
    r2_synced: false,
    r2_last_upload: null,
    local_zip_exists: false,
    local_zip_path: '',
    local_zip_size: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    build_status: 'pending',
    notes: ''
  };

  db.templates.push(template);
  saveDB(db);
  addLog('template_created', `Yeni template: ${name} (${id})`);
  res.json(template);
});

// ─── API: Update Template ───
app.put('/api/templates/:id', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });

  const allowed = ['name', 'description', 'category', 'sector', 'features', 'version', 'notes', 'schema_variant'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) db.templates[idx][key] = req.body[key];
  }
  db.templates[idx].updated_at = new Date().toISOString();
  saveDB(db);
  addLog('template_updated', `Template güncellendi: ${db.templates[idx].name}`);
  res.json(db.templates[idx]);
});

// ─── API: Delete Template ───
app.delete('/api/templates/:id', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });
  const removed = db.templates.splice(idx, 1)[0];
  saveDB(db);
  addLog('template_deleted', `Template silindi: ${removed.name}`);
  res.json({ success: true });
});

// ─── API: Build Template ───
app.post('/api/templates/:id/build', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });

  const tpl = db.templates[idx];
  const steps = [];
  const bumpType = req.body.bump || 'patch'; // patch | minor | major
  const changelog = req.body.changelog || '';

  try {
    console.log('  🔨 BUILD STARTED:', tpl.id);

    // Version bump
    const oldVersion = tpl.version || '1.0.0';
    const newVersion = bumpVersion(oldVersion, bumpType);
    tpl.version = newVersion;
    steps.push(`Versiyon: v${oldVersion} → v${newVersion} (${bumpType})`);
    console.log(`  📦 Version: v${oldVersion} → v${newVersion}`);

    // Sektör workspace'i var mı kontrol et
    const sectorWorkspace = path.join(SECTORS_DIR, tpl.sector || tpl.id, 'app');
    const buildDir = fs.existsSync(sectorWorkspace) ? sectorWorkspace : APP_DIR;
    const buildSource = buildDir === APP_DIR ? 'MASTER (app/)' : `SEKTÖR (sectors/${tpl.sector || tpl.id}/app/)`;
    steps.push(`Kaynak: ${buildSource}`);
    console.log(`  📂 Build dir: ${buildDir}`);

    // Step 1: npm install
    steps.push('npm install kontrol ediliyor...');
    if (!fs.existsSync(path.join(buildDir, 'node_modules'))) {
      console.log('  ⏳ npm install...');
      execSync('npm install', { cwd: buildDir, stdio: 'pipe', timeout: 120000, shell: true });
      steps.push('npm install tamamlandı');
    } else {
      steps.push('node_modules mevcut');
    }
    console.log('  ✅ npm install OK');

    // Step 2: Build
    steps.push('Build başlatılıyor...');
    console.log('  ⏳ npm run build...');
    execSync('npm run build', { cwd: buildDir, stdio: 'pipe', timeout: 120000, shell: true, maxBuffer: 10 * 1024 * 1024 });
    steps.push('Build tamamlandı');
    console.log('  ✅ Build OK');

    // Step 2b: Functions'ı tek _worker.js dosyası olarak derle
    // Direct Upload API sadece TEK DOSYA _worker.js'i tanır (dizin formatını tanımaz)
    steps.push('Functions derleniyor (_worker.js)...');
    console.log('  ⏳ wrangler pages functions build...');
    const workerBundleDir = path.join(buildDir, 'dist', '_worker_bundle');
    execSync(`npx wrangler pages functions build --outdir "${workerBundleDir}"`, { cwd: buildDir, stdio: 'pipe', timeout: 60000, shell: true });
    // _worker_bundle/index.js → dist/_worker.js (tek dosya)
    const bundledWorker = path.join(workerBundleDir, 'index.js');
    const workerDest = path.join(buildDir, 'dist', '_worker.js');
    if (fs.existsSync(bundledWorker)) {
      fs.copyFileSync(bundledWorker, workerDest);
      fs.rmSync(workerBundleDir, { recursive: true, force: true });
      steps.push('Functions derlendi (tek dosya _worker.js)');
      console.log('  ✅ Functions compiled to single _worker.js file');
    } else {
      throw new Error('Functions derleme başarısız: index.js bulunamadı');
    }

    // Step 3: Template export dir
    console.log('  ⏳ Creating export dir...');
    const exportDir = path.join(ROOT, 'template-export');
    try {
      if (fs.existsSync(exportDir)) fs.rmSync(exportDir, { recursive: true, force: true });
    } catch (e) { console.log('  ⚠️ rmSync warning:', e.message); }
    fs.mkdirSync(exportDir, { recursive: true });
    fs.mkdirSync(path.join(exportDir, 'dist'), { recursive: true });
    console.log('  ✅ Export dir ready');

    // Step 4: Copy files using shell commands (more reliable than fs.cpSync)
    console.log('  ⏳ Copying files...');
    const distSrc = path.join(buildDir, 'dist');
    const distDest = path.join(exportDir, 'dist');
    execSync(`xcopy "${distSrc}" "${distDest}" /E /I /Y /Q`, { stdio: 'pipe', shell: true, timeout: 30000 });
    console.log('  ✅ dist/ copied');

    const filesToCopy = [
      { src: 'wrangler.toml', optional: false },
      { src: 'schema.sql', optional: false },
      { src: 'seed.sql', optional: true },
    ];
    for (const f of filesToCopy) {
      const srcPath = path.join(buildDir, f.src);
      if (!fs.existsSync(srcPath)) {
        if (!f.optional) throw new Error(`Gerekli dosya bulunamadı: ${f.src}`);
        continue;
      }
      fs.copyFileSync(srcPath, path.join(exportDir, f.src));
      console.log(`  ✅ ${f.src} copied`);
    }
    steps.push('Dosyalar kopyalandı');

    // Step 5: Inject version info into build
    console.log('  ⏳ Injecting version...');
    const versionInfo = {
      version: newVersion,
      template_id: tpl.id,
      template_name: tpl.name,
      sector: tpl.sector,
      build_date: new Date().toISOString(),
      zip_name: getZipFileName(tpl),
      changelog: changelog
    };
    fs.writeFileSync(path.join(exportDir, 'dist', 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf-8');
    steps.push(`Versiyon bilgisi enjekte edildi: v${newVersion}`);
    console.log('  ✅ Version injected');

    // Step 6: Clean config
    console.log('  ⏳ Cleaning config...');
    const wranglerPath = path.join(exportDir, 'wrangler.toml');
    let wc = fs.readFileSync(wranglerPath, 'utf-8');
    wc = wc
      .replace(/name\s*=\s*"[^"]*"/, 'name = "TEMPLATE_NAME"')
      .replace(/database_name\s*=\s*"[^"]*"/, 'database_name = "TEMPLATE_DB"')
      .replace(/database_id\s*=\s*"[^"]*"/, 'database_id = ""')
      .replace(/JWT_SECRET\s*=\s*"[^"]*"/, 'JWT_SECRET = "CHANGE_ME_ON_SETUP"')
      .replace(/index_name\s*=\s*"[^"]*"/, 'index_name = "TEMPLATE_INDEX"')
      .replace(/CF_PROJECT_NAME\s*=\s*"[^"]*"/, 'CF_PROJECT_NAME = ""')
      .replace(/TEMPLATE_SECTOR\s*=\s*"[^"]*"/, `TEMPLATE_SECTOR = "${tpl.sector || 'hukuk'}"`);
    fs.writeFileSync(wranglerPath, wc, 'utf-8');
    steps.push('Konfigürasyon temizlendi');
    console.log('  ✅ Config cleaned');

    // Step 6b: _worker.js doğrulama (güncelleme güvenliği)
    const workerFileInExport = path.join(exportDir, 'dist', '_worker.js');
    if (!fs.existsSync(workerFileInExport)) {
      throw new Error('KRİTİK: dist/_worker.js bulunamadı! Functions derlenmemiş. Bu ZIP ile güncelleme yapılırsa site çöker.');
    }
    const workerSize = fs.statSync(workerFileInExport).size;
    if (workerSize < 1000) {
      throw new Error(`KRİTİK: dist/_worker.js çok küçük (${workerSize} byte). Derleme hatalı olabilir.`);
    }
    steps.push(`_worker.js doğrulandı (${(workerSize/1024).toFixed(1)} KB)`);
    console.log(`  ✅ _worker.js validated (${(workerSize/1024).toFixed(1)} KB)`);

    // Step 7: Create versioned zip
    console.log('  ⏳ Creating zip...');
    const zipFileName = getZipFileName(tpl);
    const zipPath = path.join(ROOT, zipFileName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(exportDir, false);

    const zipPromise = new Promise((resolve, reject) => {
      output.on('close', () => {
        const sizeKB = (archive.pointer() / 1024).toFixed(2);
        try { fs.rmSync(exportDir, { recursive: true, force: true }); } catch(e) {}
        resolve(sizeKB);
      });
      archive.on('error', reject);
    });

    archive.finalize();
    console.log('  ⏳ Archiving...');

    zipPromise.then(sizeKB => {
      console.log(`  ✅ ZIP DONE: ${zipFileName} (${sizeKB} KB)`);
      tpl.local_zip_exists = true;
      tpl.local_zip_path = zipPath;
      tpl.local_zip_size = `${sizeKB} KB`;
      tpl.local_zip_name = zipFileName;
      tpl.build_status = 'built';
      tpl.build_date = new Date().toISOString();
      tpl.updated_at = new Date().toISOString();
      tpl.changelog = changelog;
      if (!tpl.version_history) tpl.version_history = [];
      tpl.version_history.push({
        version: newVersion,
        date: new Date().toISOString(),
        zip_name: zipFileName,
        size: `${sizeKB} KB`,
        changelog: changelog
      });
      saveDB(db);
      addLog('template_built', `Template build edildi: ${tpl.name} v${newVersion} → ${zipFileName} (${sizeKB} KB)`);
      steps.push(`Zip oluşturuldu: ${zipFileName} (${sizeKB} KB)`);
      res.json({ success: true, steps, size: `${sizeKB} KB`, version: newVersion, zip_name: zipFileName });
    }).catch(err => {
      console.error('  ❌ ZIP ERROR:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message, steps });
    });

  } catch (err) {
    console.error('  ❌ BUILD ERROR:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message, steps });
  }
});

// ─── ZIP Doğrulama Helper ───
function validateZipContents(zipFilePath) {
  const errors = [];
  const tempValidateDir = path.join(ROOT, '_zip_validate_' + Date.now());
  try {
    fs.mkdirSync(tempValidateDir, { recursive: true });
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${tempValidateDir}' -Force"`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const items = fs.readdirSync(tempValidateDir);
    if (!fs.existsSync(path.join(tempValidateDir, 'wrangler.toml'))) errors.push('wrangler.toml eksik');
    if (!fs.existsSync(path.join(tempValidateDir, 'schema.sql'))) errors.push('schema.sql eksik');
    if (!fs.existsSync(path.join(tempValidateDir, 'dist'))) errors.push('dist/ klasörü eksik');
    else if (!fs.existsSync(path.join(tempValidateDir, 'dist', '_worker.js'))) errors.push('dist/_worker.js eksik');
    return { valid: errors.length === 0, errors, items };
  } catch (e) {
    return { valid: false, errors: ['ZIP çıkarılamadı: ' + e.message], items: [] };
  } finally {
    try { fs.rmSync(tempValidateDir, { recursive: true, force: true }); } catch(e) {}
  }
}

// ─── API: Upload to R2 ───
app.post('/api/templates/:id/upload-r2', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });

  const tpl = db.templates[idx];
  const channel = req.body?.channel || 'stable'; // 'dev' veya 'stable'

  // Versiyonlu zip dosya adını bul
  const zipFileName = tpl.local_zip_name || getZipFileName(tpl);
  const zipPath = path.join(ROOT, zipFileName);

  // Eski format fallback
  const legacyZipPath = path.join(ROOT, `${tpl.id}.zip`);
  const actualZipPath = fs.existsSync(zipPath) ? zipPath : (fs.existsSync(legacyZipPath) ? legacyZipPath : null);

  if (!actualZipPath) {
    return res.status(400).json({ error: `Önce template build edin (zip bulunamadı: ${zipFileName})` });
  }

  const localZipSize = fs.statSync(actualZipPath).size;
  console.log(`\n📦 R2 Upload başlıyor: ${zipFileName} (${localZipSize} bytes)`);

  // ─── PRE-UPLOAD: ZIP içerik doğrulaması ───
  console.log('  ⏳ ZIP içerik doğrulaması...');
  const validation = validateZipContents(actualZipPath);
  if (!validation.valid) {
    console.error(`  ❌ ZIP DOĞRULAMA BAŞARISIZ: ${validation.errors.join(', ')}`);
    console.error(`  📁 ZIP içeriği: ${validation.items.join(', ')}`);
    return res.status(400).json({
      error: `ZIP doğrulama başarısız: ${validation.errors.join(', ')}. ZIP içeriği: [${validation.items.join(', ')}]. Lütfen yeniden build edin.`
    });
  }
  console.log(`  ✅ ZIP doğrulandı: ${validation.items.join(', ')}`);

  const r2Key = getR2Key(tpl);
  const r2LatestKey = getR2LatestKey(tpl);

  // ─── 1. Versiyonlu dosyayı yükle ───
  console.log(`  ⏳ Versiyonlu yükleme: ${r2Key}`);
  const result = runWrangler(
    `r2 object put ${R2_BUCKET}/${r2Key} --file="${actualZipPath}" --remote`,
    APP_DIR
  );
  if (!result.success) {
    return res.status(500).json({ error: `Versiyonlu dosya yüklenemedi: ${result.error}` });
  }
  console.log(`  ✅ Versiyonlu yüklendi: ${r2Key}`);

  // ─── 2. Latest pointer yükle ───
  console.log(`  ⏳ Latest pointer yükleme: ${r2LatestKey}`);
  const latestResult = runWrangler(
    `r2 object put ${R2_BUCKET}/${r2LatestKey} --file="${actualZipPath}" --remote`,
    APP_DIR
  );
  if (!latestResult.success) {
    console.error(`  ❌ Latest pointer yüklenemedi: ${latestResult.error}`);
    return res.status(500).json({ error: `Versiyonlu dosya yüklendi ama latest pointer başarısız: ${latestResult.error}` });
  }
  console.log(`  ✅ Latest pointer yüklendi: ${r2LatestKey}`);

  // ─── 3. POST-UPLOAD: R2 doğrulama - latest.zip'i indirip boyut kontrolü ───
  console.log('  ⏳ R2 doğrulama (latest.zip boyut kontrolü)...');
  const verifyPath = path.join(ROOT, '_r2_verify_' + Date.now() + '.zip');
  try {
    const verifyResult = runWrangler(
      `r2 object get ${R2_BUCKET}/${r2LatestKey} --remote --file="${verifyPath}"`,
      APP_DIR
    );
    if (verifyResult.success && fs.existsSync(verifyPath)) {
      const r2Size = fs.statSync(verifyPath).size;
      if (r2Size !== localZipSize) {
        console.error(`  ❌ R2 BOYUT UYUMSUZLUGU! Lokal: ${localZipSize}, R2: ${r2Size}`);
        // Tekrar dene
        console.log('  🔄 Latest pointer tekrar yükleniyor...');
        const retryResult = runWrangler(
          `r2 object put ${R2_BUCKET}/${r2LatestKey} --file="${actualZipPath}" --remote`,
          APP_DIR
        );
        if (!retryResult.success) {
          return res.status(500).json({ error: `Latest pointer doğrulama başarısız ve tekrar yükleme de başarısız: ${retryResult.error}` });
        }
        console.log('  ✅ Latest pointer tekrar yüklendi');
      } else {
        console.log(`  ✅ R2 doğrulama OK: ${r2Size} bytes (eşleşiyor)`);
      }
    } else {
      console.warn('  ⚠️ R2 doğrulama indirme başarısız, devam ediliyor...');
    }
  } catch(e) {
    console.warn('  ⚠️ R2 doğrulama hatası:', e.message);
  } finally {
    try { fs.unlinkSync(verifyPath); } catch(e) {}
  }

  // ─── 4. Eski format uyumluluğu ───
  runWrangler(
    `r2 object put ${R2_BUCKET}/${tpl.id}.zip --file="${actualZipPath}" --remote`,
    APP_DIR
  );

  // ─── 5. version-manifest.json oluştur ve yükle ───
  const manifest = {
    latest_version: tpl.version,
    template_id: tpl.id,
    template_name: tpl.name,
    sector: tpl.sector,
    download_key: r2LatestKey,
    versioned_key: r2Key,
    zip_name: zipFileName,
    published_at: new Date().toISOString(),
    changelog: tpl.changelog || `v${tpl.version} - ${new Date().toLocaleDateString('tr-TR')} tarihli güncelleme`,
    versions: (tpl.version_history || []).slice(-3).reverse().map(v => ({
      version: v.version,
      date: v.date,
      zip_name: v.zip_name,
      size: v.size,
      changelog: v.changelog || ''
    }))
  };
  const manifestPath = path.join(ROOT, '_version_manifest_tmp.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  const sectorPrefix = (tpl.sector || 'genel');
  const manifestKey = channel === 'dev'
    ? `templates/${sectorPrefix}ai_version_manifest_dev.json`
    : `templates/${sectorPrefix}ai_version_manifest.json`;
  const manifestResult = runWrangler(`r2 object put ${R2_BUCKET}/${manifestKey} --file="${manifestPath}" --remote`, APP_DIR);
  try { fs.unlinkSync(manifestPath); } catch(e) {}
  if (manifestResult.success) {
    console.log(`  ✅ Manifest yüklendi (${channel}): ${manifestKey}`);
  } else {
    console.error(`  ❌ Manifest yüklenemedi: ${manifestResult.error}`);
  }

  // ─── 6. Eski sürümleri temizle (son 3 sürüm sakla) ───
  const MAX_VERSIONS = 3;
  const deletedVersions = [];
  if (tpl.version_history && tpl.version_history.length > MAX_VERSIONS) {
    const toDelete = tpl.version_history.slice(0, tpl.version_history.length - MAX_VERSIONS);
    for (const old of toDelete) {
      const oldKey = `templates/${(tpl.sector || 'genel')}ai_template_v${old.version}.zip`;
      const delResult = runWrangler(`r2 object delete ${R2_BUCKET}/${oldKey} --remote`, APP_DIR);
      if (delResult.success) {
        deletedVersions.push(`v${old.version}`);
        console.log(`  🗑️ Eski sürüm silindi: ${oldKey}`);
      }
    }
    // version_history'den de sil
    tpl.version_history = tpl.version_history.slice(-MAX_VERSIONS);
  }

  tpl.r2_synced = true;
  tpl.r2_last_upload = new Date().toISOString();
  tpl.r2_version = tpl.version;
  tpl.r2_zip_name = zipFileName;
  tpl.r2_key = r2Key;
  tpl.updated_at = new Date().toISOString();
  saveDB(db);

  const uploadedFiles = [r2Key, r2LatestKey, manifestKey];

  addLog('r2_upload', `R2'ye yüklendi (${channel}): ${zipFileName} (v${tpl.version}) → ${uploadedFiles.join(', ')}${deletedVersions.length ? ` | Silinen: ${deletedVersions.join(', ')}` : ''}`);
  res.json({
    success: true,
    message: `R2'ye yüklendi (${channel}): ${zipFileName}`,
    channel,
    version: tpl.version,
    r2_key: r2Key,
    r2_latest_key: r2LatestKey,
    manifest_key: manifestKey,
    uploaded_files: uploadedFiles,
    deleted_versions: deletedVersions
  });
});

// ─── API: Cleanup local ZIP ───
app.post('/api/templates/:id/cleanup', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });

  const tpl = db.templates[idx];
  const cleaned = [];

  // Versiyonlu zip
  const zipFileName = tpl.local_zip_name || getZipFileName(tpl);
  const zipPath = path.join(ROOT, zipFileName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
    cleaned.push(zipFileName);
  }

  // Legacy zip
  const legacyPath = path.join(ROOT, `${tpl.id}.zip`);
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
    cleaned.push(`${tpl.id}.zip`);
  }

  // template-export klasörü
  const exportDir = path.join(ROOT, 'template-export');
  if (fs.existsSync(exportDir)) {
    fs.rmSync(exportDir, { recursive: true, force: true });
    cleaned.push('template-export/');
  }

  console.log(`  🧹 Temizlendi: ${cleaned.join(', ') || 'temizlenecek dosya yok'}`);
  res.json({ success: true, cleaned });
});

// ─── API: Download from R2 ───
app.post('/api/templates/:id/download-r2', (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template bulunamadı' });

  const tpl = db.templates[idx];
  const zipPath = path.join(ROOT, `${tpl.id}.zip`);

  const result = runWrangler(
    `r2 object get ${R2_BUCKET}/${tpl.id}.zip --remote --file="${zipPath}"`,
    APP_DIR
  );

  if (result.success) {
    const stats = fs.statSync(zipPath);
    tpl.local_zip_exists = true;
    tpl.local_zip_path = zipPath;
    tpl.local_zip_size = `${(stats.size / 1024).toFixed(2)} KB`;
    tpl.updated_at = new Date().toISOString();
    saveDB(db);
    addLog('r2_download', `R2'den indirildi: ${tpl.id}.zip`);
    res.json({ success: true, size: tpl.local_zip_size });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ─── API: List R2 Objects (GERÇEK R2 bucket'ından) ───
app.get('/api/r2/list', async (req, res) => {
  try {
    // Wrangler R2 API ile gerçek bucket listesini al
    // wrangler r2 object list komutu yok, bu yüzden S3 API kullanıyoruz
    const tempFile = path.join(ROOT, `_r2_list_${Date.now()}.json`);
    
    // Yöntem: Her bilinen key için head kontrolü yap
    // Önce manifest'ten versiyonları oku
    const manifestFile = path.join(ROOT, `_r2_manifest_${Date.now()}.json`);
    const objects = [];
    
    // 1. Tüm sektörlerin manifest dosyalarını kontrol et
    const sectors = ['hukuk', 'egitim', 'genel'];
    
    for (const sector of sectors) {
      const manifestKey = `templates/${sector}ai_version_manifest.json`;
      try {
        const mResult = runWrangler(`r2 object get cloudflare-pro-templates/${manifestKey} --remote --file="${manifestFile}"`, ROOT);
        if (mResult.success && fs.existsSync(manifestFile)) {
          const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
          
          // Manifest dosyasının kendisini ekle
          objects.push({
            key: manifestKey,
            size: fs.statSync(manifestFile).size,
            type: 'manifest',
            version: manifest.latest_version,
            template: manifest.template_name || sector,
            sector: sector
          });
          
          // Manifest'teki her versiyon ZIP'ini kontrol et
          if (manifest.versions && Array.isArray(manifest.versions)) {
            for (const ver of manifest.versions) {
              const zipKey = `templates/${sector}ai_template_v${ver.version}.zip`;
              objects.push({
                key: zipKey,
                size: ver.size || '-',
                last_modified: ver.date,
                version: ver.version,
                type: ver.version === manifest.latest_version ? 'versioned' : 'archive',
                template: manifest.template_name || sector,
                sector: sector,
                includes_worker: ver.includes_worker || false
              });
            }
          }
          
          // Latest pointer
          if (manifest.download_key) {
            objects.push({
              key: manifest.download_key,
              size: manifest.versions?.[0]?.size || '-',
              last_modified: manifest.published_at,
              version: manifest.latest_version,
              type: 'latest',
              template: manifest.template_name || sector,
              sector: sector
            });
          }
          
          try { fs.unlinkSync(manifestFile); } catch(e) {}
        }
      } catch (e) {
        // Bu sektörün manifest'i yok, devam et
      }
    }
    
    // 2. Legacy dosyaları kontrol et (local DB'den bilinen key'ler)
    const db = loadDB();
    for (const tpl of db.templates) {
      const legacyKey = tpl.id + '.zip';
      // Eğer zaten objects listesinde yoksa ve r2_synced ise ekle
      if (tpl.r2_synced && !objects.find(o => o.key === legacyKey)) {
        objects.push({
          key: legacyKey,
          size: tpl.local_zip_size || '-',
          last_modified: tpl.r2_last_upload,
          version: tpl.r2_version || tpl.version,
          type: 'legacy',
          template: tpl.name,
          sector: tpl.sector
        });
      }
    }
    
    // Temizlik
    try { fs.unlinkSync(manifestFile); } catch(e) {}
    try { fs.unlinkSync(tempFile); } catch(e) {}
    
    res.json(objects);
  } catch (error) {
    console.error('R2 list error:', error.message);
    res.status(500).json({ error: 'R2 listelenemedi: ' + error.message });
  }
});

// ─── API: Delete R2 Object ───
app.delete('/api/r2/object', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key gerekli' });
  
  // Güvenlik: manifest dosyası silinmesin (tehlikeli)
  if (key.endsWith('_version_manifest.json')) {
    return res.status(403).json({ error: 'Manifest dosyaları silinemez. Bu dosya güncelleme sistemi için kritiktir.' });
  }
  
  try {
    const result = runWrangler(`r2 object delete cloudflare-pro-templates/${key} --remote`, ROOT);
    if (result.success) {
      addLog('r2_delete', `R2 dosyası silindi: ${key}`);
      res.json({ success: true, message: `${key} silindi` });
    } else {
      res.status(500).json({ error: result.error || 'Silme başarısız' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── API: Deployments ───
app.get('/api/deployments', (req, res) => {
  const db = loadDB();
  res.json(db.deployments);
});

app.post('/api/deployments', (req, res) => {
  const { site_name, template_id } = req.body;
  if (!site_name || !template_id) return res.status(400).json({ error: 'site_name ve template_id zorunlu' });

  const db = loadDB();
  const deployment = {
    id: Date.now().toString(),
    site_name,
    template_id,
    url: `https://${site_name}.pages.dev`,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  db.deployments.push(deployment);
  saveDB(db);
  addLog('deployment_started', `Deploy başlatıldı: ${site_name}`);
  res.json(deployment);
});

// ─── API: Activity Log ───
app.get('/api/activity', (req, res) => {
  const db = loadDB();
  res.json(db.activity_log.slice(0, 50));
});

// ─── API: Template Configs (sector-specific) ───
app.get('/api/template-configs', (req, res) => {
  const configDir = path.join(__dirname, 'configs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configs = fs.readdirSync(configDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(configDir, f), 'utf-8'));
      return { file: f, ...data };
    });
  res.json(configs);
});

// ─── API: Save template config ───
app.post('/api/template-configs', (req, res) => {
  const configDir = path.join(__dirname, 'configs');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  const { id, config } = req.body;
  fs.writeFileSync(path.join(configDir, `${id}.json`), JSON.stringify(config, null, 2), 'utf-8');
  addLog('config_saved', `Config kaydedildi: ${id}`);
  res.json({ success: true });
});

// ─── API: Sync check (local vs R2) ───
app.get('/api/templates/:id/sync-status', (req, res) => {
  const db = loadDB();
  const tpl = db.templates.find(t => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template bulunamadı' });

  const zipPath = path.join(ROOT, `${tpl.id}.zip`);
  const localExists = fs.existsSync(zipPath);
  let localSize = null;
  let localModified = null;

  if (localExists) {
    const stats = fs.statSync(zipPath);
    localSize = `${(stats.size / 1024).toFixed(2)} KB`;
    localModified = stats.mtime.toISOString();
  }

  res.json({
    id: tpl.id,
    localExists,
    localSize,
    localModified,
    r2Synced: tpl.r2_synced,
    r2LastUpload: tpl.r2_last_upload,
    needsSync: localExists && (!tpl.r2_synced || (localModified && tpl.r2_last_upload && new Date(localModified) > new Date(tpl.r2_last_upload)))
  });
});

// ─── API: Sectors (workspace management) ───

// List all sectors
app.get('/api/sectors', (req, res) => {
  if (!fs.existsSync(SECTORS_DIR)) return res.json([]);
  const sectors = fs.readdirSync(SECTORS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const sectorPath = path.join(SECTORS_DIR, d.name);
      const configPath = path.join(sectorPath, 'config.json');
      const hasWorkspace = fs.existsSync(path.join(sectorPath, 'app'));
      const hasConfig = fs.existsSync(configPath);
      let config = {};
      if (hasConfig) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
      }
      return {
        id: d.name,
        name: config.name || d.name,
        description: config.description || '',
        hasWorkspace,
        hasConfig,
        path: sectorPath,
        config
      };
    });
  res.json(sectors);
});

// Create sector workspace (copy app/ → sectors/[id]/app/)
app.post('/api/sectors/:id/create-workspace', (req, res) => {
  const sectorId = req.params.id;
  const sectorDir = path.join(SECTORS_DIR, sectorId);
  const workspaceDir = path.join(sectorDir, 'app');

  if (fs.existsSync(workspaceDir)) {
    return res.status(409).json({ error: 'Bu sektör için workspace zaten mevcut' });
  }

  try {
    // Sektör dizinini oluştur
    fs.mkdirSync(sectorDir, { recursive: true });

    // app/'ı kopyala (node_modules, .wrangler, dist hariç)
    const excludeDirs = ['node_modules', '.wrangler', 'dist', 'dist-bundle', 'downloaded-template', '.kiro'];
    const excludeFiles = ['package-lock.json', 'downloaded-template.zip', 'otomasyonsite-template.zip'];

    function copyRecursive(src, dest) {
      if (!fs.existsSync(src)) return;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        const dirName = path.basename(src);
        if (excludeDirs.includes(dirName)) return;
        fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
          copyRecursive(path.join(src, item), path.join(dest, item));
        }
      } else {
        const fileName = path.basename(src);
        if (excludeFiles.includes(fileName)) return;
        fs.copyFileSync(src, dest);
      }
    }

    copyRecursive(APP_DIR, workspaceDir);

    // Sektöre özel schema varsa uygula
    const schemaDir = path.join(__dirname, 'schemas');
    const sectorSchema = path.join(schemaDir, `${sectorId}-schema.sql`);
    if (fs.existsSync(sectorSchema)) {
      fs.copyFileSync(sectorSchema, path.join(workspaceDir, 'schema.sql'));
    }

    // Sektöre özel seed varsa uygula
    const sectorSeed = path.join(schemaDir, `${sectorId}-seed.sql`);
    if (fs.existsSync(sectorSeed)) {
      fs.copyFileSync(sectorSeed, path.join(workspaceDir, 'seed.sql'));
    }

    // Config oluştur (yoksa)
    const configPath = path.join(sectorDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      // template-manager/configs/ altında hazır config var mı?
      const preConfig = path.join(__dirname, 'configs', `${sectorId}-template.json`);
      if (fs.existsSync(preConfig)) {
        fs.copyFileSync(preConfig, configPath);
      } else {
        fs.writeFileSync(configPath, JSON.stringify({
          id: sectorId,
          name: sectorId,
          description: '',
          sector: sectorId,
          version: '1.0.0'
        }, null, 2), 'utf-8');
      }
    }

    addLog('workspace_created', `Sektör workspace oluşturuldu: ${sectorId} (app/ kopyalandı)`);
    res.json({ success: true, message: `Workspace oluşturuldu: sectors/${sectorId}/app/`, path: workspaceDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete sector workspace
app.delete('/api/sectors/:id/workspace', (req, res) => {
  const sectorDir = path.join(SECTORS_DIR, req.params.id);
  const workspaceDir = path.join(sectorDir, 'app');
  if (!fs.existsSync(workspaceDir)) {
    return res.status(404).json({ error: 'Workspace bulunamadı' });
  }
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  addLog('workspace_deleted', `Sektör workspace silindi: ${req.params.id}`);
  res.json({ success: true });
});

// ─── UPDATE SERVICE (Worker proxy) ───
const UPDATE_SERVICE_URL = 'https://template-update-service.saffetcelik.com.tr';
const SERVICE_AUTH_KEY = 'mYiBax2fOIKN8lECWHM60w7v49TUj3Rn';

async function fetchWorker(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'X-Service-Auth': SERVICE_AUTH_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${UPDATE_SERVICE_URL}${endpoint}`, opts);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Worker JSON döndürmedi (${res.status}): ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Worker hatası (${res.status})`);
  return data;
}

// Worker health check
app.get('/api/update-service/health', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/health');
    res.json(data);
  } catch (e) {
    res.json({ success: false, status: 'unreachable', error: e.message });
  }
});

// Worker stats
app.get('/api/update-service/stats', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/stats');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker logs
app.get('/api/update-service/logs', async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const type = req.query.type || '';
    const data = await fetchWorker(`/admin/logs?limit=${limit}&type=${type}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker sites
app.get('/api/update-service/sites', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/sites');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker manifest
app.get('/api/update-service/manifest', async (req, res) => {
  try {
    const data = await fetchWorker('/manifest');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker version info
app.get('/api/update-service/version', async (req, res) => {
  try {
    const data = await fetchWorker('/version');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker templates (tüm template'leri listele)
app.get('/api/update-service/templates', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/templates');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Clear logs
app.delete('/api/update-service/logs', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/logs', 'DELETE');
    addLog('update_service', 'Worker logları temizlendi');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Reset stats
app.delete('/api/update-service/stats', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/stats', 'DELETE');
    addLog('update_service', 'Worker istatistikleri sıfırlandı');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Worker config (rate limits, maintenance mode etc.)
app.get('/api/update-service/config', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/config');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

app.put('/api/update-service/config', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/config', 'PUT', req.body);
    addLog('update_service', 'Worker ayarları güncellendi');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Rate limit reset
app.post('/api/update-service/rate-limit/reset', async (req, res) => {
  try {
    const data = await fetchWorker('/admin/rate-limit/reset', 'POST');
    addLog('update_service', 'Rate limit sayaçları sıfırlandı');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Dev → Stable promote
app.post('/api/update-service/promote/:sector', async (req, res) => {
  try {
    const data = await fetchWorker(`/admin/promote/${req.params.sector}`, 'POST');
    addLog('update_service', `Dev → Stable yükseltildi: ${req.params.sector} v${data.version || '?'}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Dev manifest silme
app.delete('/api/update-service/dev-manifest/:sector', async (req, res) => {
  try {
    const data = await fetchWorker(`/admin/dev-manifest/${req.params.sector}`, 'DELETE');
    addLog('update_service', `Dev manifest silindi: ${req.params.sector}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// ═══════════════════════════════════════════
// SUPPORT TICKET PROXY ENDPOINTS
// ═══════════════════════════════════════════

// Tüm destek taleplerini listele (admin)
app.get('/api/update-service/support/tickets', async (req, res) => {
  try {
    const status = req.query.status || '';
    const data = await fetchWorker(`/admin/support/tickets${status ? `?status=${status}` : ''}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Tek talep detayı (admin)
app.get('/api/update-service/support/tickets/:id', async (req, res) => {
  try {
    const data = await fetchWorker(`/admin/support/tickets/${req.params.id}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Talebe yanıt ver (admin)
app.post('/api/update-service/support/tickets/:id/reply', async (req, res) => {
  try {
    const data = await fetchWorker(`/admin/support/tickets/${req.params.id}/reply`, 'POST', req.body);
    addLog('support', `Destek talebi yanıtlandı: ${req.params.id}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// Talep durumunu güncelle (admin)
app.put('/api/update-service/support/tickets/:id/status', async (req, res) => {
  try {
    const data = await fetchWorker(`/admin/support/tickets/${req.params.id}/status`, 'PUT', req.body);
    addLog('support', `Destek talebi durumu güncellendi: ${req.params.id} → ${req.body.status}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Worker bağlantı hatası: ${e.message}` });
  }
});

// ═══════════════════════════════════════════
// DEV TEST SİTESİ DEPLOY ENDPOINTS
// ═══════════════════════════════════════════

const DEV_TEST_CONFIG_FILE = path.join(__dirname, 'dev-test-config.json');

function loadDevTestConfig() {
  try {
    if (fs.existsSync(DEV_TEST_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(DEV_TEST_CONFIG_FILE, 'utf-8'));
    }
  } catch(e) {}
  return {};
}

function saveDevTestConfig(cfg) {
  fs.writeFileSync(DEV_TEST_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function runCmd(cmd, cwd, timeout = 120000) {
  try {
    const result = execSync(cmd, {
      cwd: cwd || APP_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout,
      shell: true
    });
    return { success: true, output: result || '' };
  } catch (err) {
    return { success: false, error: err.stderr || err.message, output: err.stdout || '' };
  }
}

// Dev test sitesi durumunu getir
app.get('/api/dev-test/status', (req, res) => {
  const cfg = loadDevTestConfig();
  // wrangler auth kontrolü — kısa timeout ile, UI'ı bloke etmemeli
  let authenticated = false;
  try {
    const whoami = runCmd('npx wrangler whoami', APP_DIR, 5000);
    authenticated = !!(whoami.success && whoami.output && whoami.output.includes('Account'));
  } catch(e) {
    // Auth kontrolü başarısız, devam et
    console.log('[dev-test] wrangler whoami timeout/hata, authenticated=false');
  }

  res.json({
    configured: !!cfg.project_name,
    authenticated,
    ...cfg
  });
});

// Dev test sitesi kur/güncelle (tek endpoint, adım adım çalışır)
app.post('/api/dev-test/deploy', async (req, res) => {
  const projectName = req.body.project_name || 'dev-test-hukuk';
  const dbName = `${projectName}-db`;
  const steps = [];
  let cfg = loadDevTestConfig();
  const WRANGLER_TOML = path.join(APP_DIR, 'wrangler.toml');
  let originalToml = '';

  try {
    // ─── 1. Wrangler Auth Kontrolü ───
    steps.push({ step: 'auth', status: 'running' });
    const whoami = runCmd('npx wrangler whoami', APP_DIR, 15000);
    if (!whoami.success || !whoami.output || !whoami.output.includes('Account')) {
      return res.status(400).json({
        error: 'Cloudflare hesabına bağlı değilsiniz. Terminal\'de "npx wrangler login" çalıştırın.',
        steps
      });
    }

    // Account ID parse
    let accountId = cfg.account_id || '';
    const accountLines = whoami.output.split('\n');
    for (const line of accountLines) {
      const match = line.match(/[│|]\s*(.+?)\s*[│|]\s*([0-9a-f]{32})\s*[│|]/);
      if (match) {
        accountId = match[2].trim();
        break;
      }
    }
    process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
    steps[0] = { step: 'auth', status: 'done', message: `CF hesabı bağlı (${accountId.slice(0,8)}...)` };

    // ─── 2. D1 Database ───
    steps.push({ step: 'database', status: 'running' });
    let dbId = cfg.db_id || '';

    if (!dbId) {
      // Mevcut DB'leri kontrol et
      const listResult = runCmd('npx wrangler d1 list', APP_DIR, 30000);
      if (listResult.success && listResult.output && listResult.output.includes(dbName)) {
        const lines = listResult.output.split('\n');
        for (const line of lines) {
          if (line.includes(dbName)) {
            const uuidMatch = line.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            if (uuidMatch) { dbId = uuidMatch[1]; break; }
          }
        }
      }

      if (!dbId) {
        // D1 oluştur
        const createResult = runCmd(`npx wrangler d1 create ${dbName}`, APP_DIR, 30000);
        if (createResult.success && createResult.output) {
          const idMatch = createResult.output.match(/database_id\s*=\s*"([^"]+)"/) ||
                          createResult.output.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (idMatch) dbId = idMatch[1];
        }
        if (!dbId) {
          return res.status(500).json({ error: `D1 database oluşturulamadı: ${dbName}`, steps });
        }
        steps[1] = { step: 'database', status: 'done', message: `D1 oluşturuldu: ${dbName} (${dbId.slice(0,8)}...)` };
      } else {
        steps[1] = { step: 'database', status: 'done', message: `Mevcut D1 kullanılıyor: ${dbName}` };
      }
    } else {
      steps[1] = { step: 'database', status: 'done', message: `Kayıtlı D1: ${dbName} (${dbId.slice(0,8)}...)` };
    }

    // ─── 3. wrangler.toml Backup & Modify ───
    steps.push({ step: 'config', status: 'running' });
    originalToml = fs.readFileSync(WRANGLER_TOML, 'utf-8');

    let testToml = originalToml;
    testToml = testToml.replace(/^name\s*=\s*"[^"]+"/m, `name = "${projectName}"`);
    testToml = testToml.replace(/database_name\s*=\s*"[^"]*"/m, `database_name = "${dbName}"`);
    testToml = testToml.replace(/database_id\s*=\s*"[^"]*"/m, `database_id = "${dbId}"`);
    testToml = testToml.replace(/CF_PROJECT_NAME\s*=\s*"[^"]*"/, `CF_PROJECT_NAME = "${projectName}"`);

    // JWT Secret oluştur
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let jwtSecret = '';
    for (let i = 0; i < 64; i++) jwtSecret += chars.charAt(Math.floor(Math.random() * chars.length));
    testToml = testToml.replace(/JWT_SECRET\s*=\s*"[^"]*"/, `JWT_SECRET = "${jwtSecret}"`);

    // account_id varsa kaldır (Pages uyumsuzluğu)
    testToml = testToml.replace(/^account_id\s*=\s*"[^"]*"\n?/m, '');

    // Vectorize index oluştur (start.cjs ile aynı mantık — 1024 dim, cosine)
    const indexName = `${projectName}-index`;
    const vecListResult = runCmd('npx wrangler vectorize list', APP_DIR, 30000);
    let vecIndexExists = false;
    if (vecListResult.success && vecListResult.output && vecListResult.output.includes(indexName)) {
      vecIndexExists = true;
    }
    if (!vecIndexExists) {
      const vecCreateResult = runCmd(`npx wrangler vectorize create ${indexName} --dimensions=1024 --metric=cosine`, APP_DIR, 30000);
      if (!vecCreateResult.success) {
        console.log(`[dev-test] Vectorize index oluşturulamadı: ${vecCreateResult.error?.slice(0, 200)}`);
      }
    }
    // wrangler.toml'daki index_name'i dev test projesine göre güncelle
    testToml = testToml.replace(/index_name\s*=\s*"[^"]*"/, `index_name = "${indexName}"`);

    fs.writeFileSync(WRANGLER_TOML, testToml, 'utf-8');
    steps[2] = { step: 'config', status: 'done', message: `wrangler.toml düzenlendi → ${projectName}` };

    // ─── 4. Build ───
    steps.push({ step: 'build', status: 'running' });
    const buildResult = runCmd('npm run build', APP_DIR, 180000);
    if (!buildResult.success) {
      // Restore toml
      fs.writeFileSync(WRANGLER_TOML, originalToml, 'utf-8');
      return res.status(500).json({ error: `Build başarısız: ${buildResult.error?.slice(0, 300)}`, steps });
    }

    // version.json oluştur — gerçek sürümü template DB'den al
    const db = loadDB();
    const mainTpl = db.templates.find(t => t.sector === 'hukuk') || db.templates[0];
    const realVersion = mainTpl?.version || mainTpl?.r2_version || '1.0.0';
    const versionJson = JSON.stringify({
      version: realVersion,
      template_id: mainTpl?.id || 'dev-test',
      sector: mainTpl?.sector || 'hukuk',
      build_date: new Date().toISOString(),
      installed_by: 'template-manager-dev-test',
      dev_mode: true
    }, null, 2);
    fs.writeFileSync(path.join(APP_DIR, 'dist', 'version.json'), versionJson, 'utf-8');
    steps[3] = { step: 'build', status: 'done', message: 'Build tamamlandı' };

    // ─── 5. Deploy ───
    steps.push({ step: 'deploy', status: 'running' });
    let deployResult = runCmd(`npx wrangler pages deploy dist --project-name=${projectName}`, APP_DIR, 120000);

    if (!deployResult.success) {
      // Proje oluştur ve tekrar dene
      runCmd(`npx wrangler pages project create ${projectName} --production-branch=main`, APP_DIR, 30000);
      deployResult = runCmd(`npx wrangler pages deploy dist --project-name=${projectName}`, APP_DIR, 120000);
    }

    if (!deployResult.success) {
      fs.writeFileSync(WRANGLER_TOML, originalToml, 'utf-8');
      return res.status(500).json({ error: `Deploy başarısız: ${deployResult.error?.slice(0, 300)}`, steps });
    }

    // Deploy URL'yi parse et
    let deployUrl = `https://${projectName}.pages.dev`;
    const urlMatch = (deployResult.output || '').match(/(https:\/\/[^\s]+\.pages\.dev)/);
    if (urlMatch) deployUrl = urlMatch[1];

    steps[4] = { step: 'deploy', status: 'done', message: `Deploy OK → ${deployUrl}` };

    // ─── 6. Schema Migration ───
    steps.push({ step: 'migrate', status: 'running' });
    const schemaFile = path.join(APP_DIR, 'schema.sql');
    if (fs.existsSync(schemaFile)) {
      const migResult = runCmd(`npx wrangler d1 execute ${dbName} --remote --file=schema.sql`, APP_DIR, 60000);
      if (migResult.success) {
        steps[5] = { step: 'migrate', status: 'done', message: 'Schema migration tamamlandı' };
      } else {
        steps[5] = { step: 'migrate', status: 'warning', message: 'Migration sorunu (tablolar zaten mevcut olabilir)' };
      }
    } else {
      steps[5] = { step: 'migrate', status: 'skipped', message: 'schema.sql bulunamadı' };
    }

    // ─── 7. Restore wrangler.toml ───
    fs.writeFileSync(WRANGLER_TOML, originalToml, 'utf-8');

    // Config kaydet
    cfg = {
      project_name: projectName,
      db_name: dbName,
      db_id: dbId,
      account_id: accountId,
      deploy_url: deployUrl,
      admin_url: `${deployUrl}/admin/system?dev_mode=1`,
      deployed_version: realVersion,
      last_deploy: new Date().toISOString(),
      deploy_count: (cfg.deploy_count || 0) + 1
    };
    saveDevTestConfig(cfg);

    addLog('dev_test', `Dev test sitesi deploy edildi: ${projectName} v${realVersion} → ${deployUrl}`);

    res.json({
      success: true,
      message: `Dev test sitesi v${realVersion} deploy edildi!`,
      deploy_url: deployUrl,
      admin_url: `${deployUrl}/admin/system?dev_mode=1`,
      project_name: projectName,
      db_name: dbName,
      version: realVersion,
      steps
    });

  } catch (e) {
    // Hata durumunda toml'u restore et
    if (originalToml) {
      try { fs.writeFileSync(WRANGLER_TOML, originalToml, 'utf-8'); } catch(ex) {}
    }
    res.status(500).json({ error: `Deploy hatası: ${e.message}`, steps });
  }
});

// Dev test config sıfırla
app.delete('/api/dev-test/config', (req, res) => {
  saveDevTestConfig({});
  res.json({ success: true, message: 'Dev test config sıfırlandı' });
});

// ─── START ───
app.listen(PORT, () => {
  console.log(`
\x1b[36m\x1b[1m
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   🎛️  TEMPLATE MANAGER - Web Arayüzü                    ║
  ║                                                          ║
  ║   http://localhost:${PORT}                                 ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
\x1b[0m`);
  console.log(`\x1b[32m  ✅ Server başlatıldı: http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33m  Durdurmak için: Ctrl+C\x1b[0m\n`);

  // Auto-detect existing templates
  const db = loadDB();
  if (db.templates.length === 0) {
    // Auto-register the existing template with proper sectoral naming
    const existingZip = path.join(APP_DIR, 'otomasyonsite-template.zip');
    const rootZip = path.join(ROOT, 'otomasyonsite-template.zip');
    if (fs.existsSync(existingZip) || fs.existsSync(rootZip)) {
      db.templates.push({
        id: 'hukukai-template',
        name: 'HukukAI - Avukatlık & Hukuk Bürosu',
        description: 'Avukat/Hukuk bürosu için tam özellikli web sitesi. Admin paneli, blog, emsal karar, AI chatbot, SEO optimizasyonu.',
        category: 'law',
        sector: 'hukuk',
        features: ['Admin Paneli', 'Blog', 'Avukat Yönetimi', 'Emsal Karar', 'İletişim Formu', 'AI Chatbot', 'SEO', 'JWT Auth'],
        schema_variant: 'default',
        version: '1.0.0',
        r2_synced: true,
        r2_last_upload: new Date().toISOString(),
        r2_version: '1.0.0',
        r2_zip_name: 'hukukai_template_v1.0.0.zip',
        r2_key: 'templates/hukukai_template_v1.0.0.zip',
        local_zip_exists: true,
        local_zip_path: fs.existsSync(rootZip) ? rootZip : existingZip,
        local_zip_name: 'hukukai_template_v1.0.0.zip',
        local_zip_size: '240.55 KB',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        build_status: 'built',
        build_date: new Date().toISOString(),
        version_history: [{
          version: '1.0.0',
          date: new Date().toISOString(),
          zip_name: 'hukukai_template_v1.0.0.zip',
          size: '240.55 KB'
        }],
        notes: 'İlk sürüm - R2\'de mevcut (otomasyonsite-template.zip olarak)'
      });
      saveDB(db);
      console.log(`\x1b[32m  ✅ Mevcut template kayıt edildi: hukukai-template v1.0.0\x1b[0m`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// CLOUDFLARE PRO OTOMASYON GÜNCELLEME YÖNETİMİ
// Template güncellemelerinden TAMAMEN BAĞIMSIZ ayrı sistem.
// Güvenlik: SHA-256 checksum doğrulaması zorunludur.
// R2 bucket: cloudflare-pro-templates/cloudflareprootomasyon/
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const OTOSETUP_R2_PREFIX = 'cloudflareprootomasyon';
const OTOSETUP_MANIFEST_KEY = `${OTOSETUP_R2_PREFIX}/version_manifest.json`;

function runCmdAsync(cmd, cwd, timeout = 60000) {
  const { execSync: execSyncLocal } = require('child_process');
  try {
    const result = execSyncLocal(cmd, {
      cwd: cwd || __dirname,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout,
      shell: true
    });
    return { success: true, output: result || '' };
  } catch (err) {
    return { success: false, error: err.stderr || err.message, output: err.stdout || '' };
  }
}

// Gerçek async exec — büyük dosyalar (ZIP, R2 upload) için event loop'u bloke etmez
function runCmdPromise(cmd, cwd, timeout = 600000) {
  return new Promise((resolve) => {
    const { exec: execLocal } = require('child_process');
    const proc = execLocal(cmd, {
      cwd: cwd || __dirname,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout,
      shell: true
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr || err.message, output: stdout || '' });
      } else {
        resolve({ success: true, output: stdout || '' });
      }
    });
  });
}

// SHA-256 stream ile hesapla (200MB+ dosyalar için memory-safe)
function checksumFileAsync(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// CloudflareProOtomasyon mevcut yerel sürümünü oku
function getLocalOtoSetupVersion() {
  const pkgPath = path.join(__dirname, '..', '..', 'otosetupweb', 'package.json');
  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    }
  } catch(e) {}
  return null;
}

// R2'den otosetupweb manifest'ini çek
app.get('/api/otosetupweb/version-info', async (req, res) => {
  const tmpFile = path.join(__dirname, `_otosetup_manifest_${Date.now()}.json`);
  try {
    const result = runCmdAsync(
      `npx wrangler r2 object get ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --remote --file="${tmpFile}"`,
      __dirname, 20000
    );
    let manifest = null;
    if (fs.existsSync(tmpFile)) {
      manifest = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
      fs.unlinkSync(tmpFile);
    }
    if (!manifest) return res.status(404).json({ error: 'OtoSetupWeb manifest R2\'de bulunamadı' });

    const localVersion = getLocalOtoSetupVersion();
    const latestVersion = manifest.latest_version || manifest.version;
    res.json({
      localVersion,
      latestVersion,
      updateAvailable: localVersion ? localVersion !== latestVersion : false,
      changelog: manifest.changelog || '',
      publishedAt: manifest.published_at,
      downloadKey: `${OTOSETUP_R2_PREFIX}/${manifest.download_key || `otosetupweb_v${latestVersion}.zip`}`,
      checksum: manifest.checksum || null
    });
  } catch(e) {
    if (fs.existsSync(tmpFile)) try { fs.unlinkSync(tmpFile); } catch(_) {}
    res.status(500).json({ error: `Manifest alınamadı: ${e.message}` });
  }
});

// OtoSetupWeb güncelleme paketini indir, doğrula ve uygula
app.post('/api/otosetupweb/update', async (req, res) => {
  const { downloadKey, expectedChecksum, targetVersion } = req.body;
  if (!downloadKey || !expectedChecksum) {
    return res.status(400).json({ error: 'downloadKey ve expectedChecksum zorunludur' });
  }

  // Güvenlik: sadece cloudflareprootomasyon/ veya otosetupweb/ prefix'iyle başlayan key'ler kabul et
  if (!downloadKey.startsWith(`${OTOSETUP_R2_PREFIX}/`) && !downloadKey.startsWith('otosetupweb/')) {
    return res.status(403).json({ error: 'Geçersiz güncelleme paketi kaynağı' });
  }

  const otosetupDir = path.join(__dirname, '..', '..', 'otosetupweb');
  if (!fs.existsSync(otosetupDir)) {
    return res.status(404).json({ error: `OtoSetupWeb dizini bulunamadı: ${otosetupDir}` });
  }

  const zipPath = path.join(__dirname, `_otosetup_update_${Date.now()}.zip`);
  const extractPath = path.join(__dirname, `_otosetup_extract_${Date.now()}`);
  const steps = [];

  try {
    // 1. Wrangler auth kontrolü
    steps.push('Wrangler auth kontrol ediliyor...');
    const whoami = runCmdAsync('npx wrangler whoami', __dirname, 15000);
    if (!whoami.success || !whoami.output?.includes('Account')) {
      return res.status(400).json({ error: 'Wrangler bağlı değil. Template Manager\'ı açmadan önce "npx wrangler login" çalıştırın.', steps });
    }

    // 2. R2'den güncelleme paketini indir
    steps.push(`R2'den indiriliyor: ${downloadKey}`);
    const downloadResult = runCmdAsync(
      `npx wrangler r2 object get ${R2_BUCKET}/${downloadKey} --remote --file="${zipPath}"`,
      __dirname, 60000
    );
    if (!downloadResult.success || !fs.existsSync(zipPath)) {
      throw new Error(`Paket indirilemedi: ${downloadResult.error || 'dosya oluşmadı'}`);
    }

    // 3. SHA-256 checksum doğrulaması (GÜVENLİK KRİTİK)
    steps.push('SHA-256 checksum doğrulanıyor...');
    const fileBuffer = fs.readFileSync(zipPath);
    const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
      fs.unlinkSync(zipPath);
      return res.status(400).json({
        error: 'Checksum doğrulama BAŞARISIZ — paket bozuk veya değiştirilmiş olabilir',
        expected: expectedChecksum,
        actual: actualChecksum,
        steps
      });
    }
    steps.push(`✅ Checksum doğrulandı: ${actualChecksum.slice(0, 16)}...`);

    // 4. ZIP'i geçici dizine çıkart
    steps.push('Paket açılıyor...');
    fs.mkdirSync(extractPath, { recursive: true });
    const extractResult = runCmdAsync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`,
      __dirname, 30000
    );
    if (!extractResult.success) {
      throw new Error(`Zip açılamadı: ${extractResult.error}`);
    }

    // 5. Güncelleme paketinin yapısını doğrula (package.json içermeli)
    steps.push('Paket yapısı doğrulanıyor...');
    const extractedItems = fs.readdirSync(extractPath);
    // Tek alt klasör varsa onun içine in
    let sourceDir = extractPath;
    if (extractedItems.length === 1 && fs.statSync(path.join(extractPath, extractedItems[0])).isDirectory()) {
      sourceDir = path.join(extractPath, extractedItems[0]);
    }
    if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
      throw new Error('Güncelleme paketi geçersiz: package.json bulunamadı');
    }
    const newPkg = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf-8'));
    if (!newPkg.version) throw new Error('Güncelleme paketi geçersiz: version alanı yok');
    steps.push(`Paket geçerli: v${newPkg.version}`);

    // 6. Mevcut yapıyı yedekle (sadece kaynak dosyalar, node_modules hariç)
    steps.push('Mevcut sürüm yedekleniyor...');
    const backupDir = path.join(__dirname, `_otosetup_backup_${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    // Sadece kritik klasörleri yedekle
    const backupItems = ['src', 'electron', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'];
    for (const item of backupItems) {
      const src = path.join(otosetupDir, item);
      if (fs.existsSync(src)) {
        runCmdAsync(`xcopy "${src}" "${path.join(backupDir, item)}" /E /I /Y /Q`, __dirname, 10000);
      }
    }

    // 7. Yeni dosyaları kopyala (node_modules ve .env hariç)
    steps.push('Yeni dosyalar uygulanıyor...');
    const excludeItems = ['node_modules', '.wrangler', 'dist', '.env', '.env.local'];
    const allItems = fs.readdirSync(sourceDir);
    for (const item of allItems) {
      if (excludeItems.includes(item)) continue;
      const src = path.join(sourceDir, item);
      const dest = path.join(otosetupDir, item);
      if (fs.statSync(src).isDirectory()) {
        runCmdAsync(`xcopy "${src}" "${dest}" /E /I /Y /Q`, __dirname, 15000);
      } else {
        fs.copyFileSync(src, dest);
      }
    }

    // 8. Temizlik
    fs.unlinkSync(zipPath);
    fs.rmSync(extractPath, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });

    steps.push(`✅ OtoSetupWeb v${newPkg.version} başarıyla güncellendi`);
    addLog('cfpro_update', `CloudflareProOtomasyon v${newPkg.version} güncellendi`);

    res.json({ success: true, newVersion: newPkg.version, steps });
  } catch (e) {
    // Temizlik
    if (fs.existsSync(zipPath)) try { fs.unlinkSync(zipPath); } catch(_) {}
    if (fs.existsSync(extractPath)) try { fs.rmSync(extractPath, { recursive: true, force: true }); } catch(_) {}
    steps.push(`❌ Hata: ${e.message}`);
    res.status(500).json({ error: e.message, steps });
  }
});

// OtoSetupWeb güncel yerel sürüm bilgisi
app.get('/api/otosetupweb/local-version', (req, res) => {
  const version = getLocalOtoSetupVersion();
  if (!version) return res.status(404).json({ error: 'OtoSetupWeb bulunamadı veya package.json okunamadı' });
  res.json({ version });
});

// ─── R2 Dosya Listeleme (manifest + probe yöntemi) ───
app.get('/api/otosetupweb/r2-files', async (req, res) => {
  const WORKER_BASE = 'https://template-update-service.saffetcelik.com.tr';
  try {
    const files = [];

    // 1. Manifest'i kontrol et
    const tmpManifest = path.join(__dirname, `_otosetup_r2chk_${Date.now()}.json`);
    const mResult = runCmdAsync(
      `npx wrangler r2 object get ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --remote --file="${tmpManifest}"`,
      __dirname, 15000
    );
    let manifest = null;
    if (fs.existsSync(tmpManifest)) {
      const stat = fs.statSync(tmpManifest);
      try { manifest = JSON.parse(fs.readFileSync(tmpManifest, 'utf-8')); } catch(_) {}
      files.push({
        key: OTOSETUP_MANIFEST_KEY,
        size: stat.size,
        sizeMB: parseFloat((stat.size / (1024*1024)).toFixed(4)),
        uploaded: stat.mtime.toISOString(),
        exists: true,
        type: 'manifest'
      });
      try { fs.unlinkSync(tmpManifest); } catch(_) {}
    }

    // 2. Manifest'teki download_key ZIP'i kontrol et
    if (manifest && manifest.download_key) {
      const zipKey = `cloudflareprootomasyon/${manifest.download_key}`;
      const tmpZip = path.join(__dirname, `_otosetup_r2zip_${Date.now()}.zip`);
      const zResult = runCmdAsync(
        `npx wrangler r2 object get ${R2_BUCKET}/${zipKey} --remote --file="${tmpZip}"`,
        __dirname, 30000
      );
      if (fs.existsSync(tmpZip)) {
        const stat = fs.statSync(tmpZip);
        const exists = stat.size > 100; // empty/error files are tiny
        files.push({
          key: zipKey,
          size: exists ? stat.size : 0,
          sizeMB: exists ? parseFloat((stat.size / (1024*1024)).toFixed(2)) : 0,
          uploaded: exists ? stat.mtime.toISOString() : null,
          exists,
          type: 'zip'
        });
        try { fs.unlinkSync(tmpZip); } catch(_) {}
      } else {
        files.push({ key: zipKey, size: 0, sizeMB: 0, uploaded: null, exists: false, type: 'zip' });
      }
    }

    res.json({
      success: true,
      bucket: R2_BUCKET,
      prefix: 'cloudflareprootomasyon/',
      files,
      totalFiles: files.filter(f => f.exists).length,
      totalSizeMB: parseFloat(files.reduce((sum, o) => sum + (o.sizeMB || 0), 0).toFixed(2))
    });
  } catch(e) {
    res.status(500).json({ error: `R2 listeleme hatası: ${e.message}` });
  }
});

// ─── Worker Endpoint Sağlık Kontrolü ───
app.get('/api/otosetupweb/worker-status', async (req, res) => {
  const WORKER_BASE = 'https://template-update-service.saffetcelik.com.tr';
  const results = {};
  try {
    // Health check
    const healthRes = await fetch(`${WORKER_BASE}/health`);
    results.health = { status: healthRes.status, ok: healthRes.ok };
    if (healthRes.ok) results.healthData = await healthRes.json();

    // Manifest endpoint
    const manifestRes = await fetch(`${WORKER_BASE}/cloudflareprootomasyon/manifest`);
    results.manifest = { status: manifestRes.status, ok: manifestRes.ok };
    if (manifestRes.ok) results.manifestData = await manifestRes.json();

    // Download endpoint (HEAD test - var olmayan dosya ile 404 beklenir)
    const downloadRes = await fetch(`${WORKER_BASE}/cloudflareprootomasyon/download/test_probe.zip`);
    results.download = { status: downloadRes.status, ok: downloadRes.status === 404 }; // 404 = endpoint çalışıyor

    res.json({
      success: true,
      workerUrl: WORKER_BASE,
      endpoints: results,
      allOk: results.health?.ok && results.manifest?.ok && results.download?.ok
    });
  } catch(e) {
    res.json({
      success: false,
      workerUrl: WORKER_BASE,
      error: e.message,
      endpoints: results,
      allOk: false
    });
  }
});

// ─── Installer Exe Durumu ───
app.get('/api/otosetupweb/installer-status', (req, res) => {
  const installerPath = path.join(__dirname, '..', '..', 'otosetupweb', 'installer', 'output', 'CloudflareProOtomasyon-Setup.exe');
  const issPath = path.join(__dirname, '..', '..', 'otosetupweb', 'installer', 'setup.iss');
  const result = {
    installerExists: fs.existsSync(installerPath),
    issExists: fs.existsSync(issPath),
    installerPath: installerPath,
    issPath: issPath
  };
  if (result.installerExists) {
    const stat = fs.statSync(installerPath);
    result.installerSizeKB = parseFloat((stat.size / 1024).toFixed(1));
    result.installerModified = stat.mtime.toISOString();
    // SHA-256
    const hash = crypto.createHash('sha256').update(fs.readFileSync(installerPath)).digest('hex');
    result.installerChecksum = hash;
  }
  // ISS'teki ManifestURL'yi oku
  if (result.issExists) {
    const issContent = fs.readFileSync(issPath, 'utf-8');
    const m = issContent.match(/#define\s+ManifestURL\s+"([^"]+)"/);
    result.manifestUrl = m ? m[1] : null;
  }
  res.json(result);
});

// ─── Manifest Güncelle ve R2'ye Yükle ───
app.post('/api/otosetupweb/update-manifest', async (req, res) => {
  const { latest_version, download_key, checksum, changelog, exe_name } = req.body;
  if (!latest_version) return res.status(400).json({ error: 'latest_version zorunludur' });

  const manifest = {
    latest_version,
    download_key: download_key || `cloudflareprootomasyon_v${latest_version}.zip`,
    download_url: `https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/download/${download_key || `cloudflareprootomasyon_v${latest_version}.zip`}`,
    exe_name: exe_name || 'CloudflareProOtomasyon.exe',
    checksum: checksum || '',
    changelog: changelog || '',
    published_at: new Date().toISOString(),
    file_size_mb: 0
  };

  const tmpFile = path.join(__dirname, `_otosetup_manifest_upload_${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(manifest, null, 2), 'utf-8');
    const result = runCmdAsync(
      `npx wrangler r2 object put ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --file="${tmpFile}" --remote --content-type="application/json"`,
      __dirname, 20000
    );
    fs.unlinkSync(tmpFile);
    if (!result.success) {
      return res.status(500).json({ error: `R2 yükleme başarısız: ${result.error}` });
    }
    res.json({ success: true, manifest, message: 'Manifest R2\'ye yüklendi' });
  } catch(e) {
    if (fs.existsSync(tmpFile)) try { fs.unlinkSync(tmpFile); } catch(_) {}
    res.status(500).json({ error: `Manifest yükleme hatası: ${e.message}` });
  }
});

// ─── R2'den Dosya Sil ───
app.delete('/api/otosetupweb/r2-file', async (req, res) => {
  const { key } = req.body;
  if (!key || (!key.startsWith('cloudflareprootomasyon/') && !key.startsWith('otosetupweb/'))) {
    return res.status(400).json({ error: 'Geçersiz key — sadece cloudflareprootomasyon/ altındaki dosyalar silinebilir' });
  }
  try {
    const result = runCmdAsync(
      `npx wrangler r2 object delete ${R2_BUCKET}/${key} --remote`,
      __dirname, 15000
    );
    if (!result.success) {
      return res.status(500).json({ error: `Silme başarısız: ${result.error}` });
    }
    res.json({ success: true, message: `Silindi: ${key}` });
  } catch(e) {
    res.status(500).json({ error: `Silme hatası: ${e.message}` });
  }
});

// ─── Tam Durum Özeti (Dashboard) ───
app.get('/api/otosetupweb/dashboard', async (req, res) => {
  try {
    const localVersion = getLocalOtoSetupVersion();
    const installerPath = path.join(__dirname, '..', '..', 'otosetupweb', 'installer', 'output', 'CloudflareProOtomasyon-Setup.exe');
    const installerExists = fs.existsSync(installerPath);

    // R2 manifest çek
    const tmpFile = path.join(__dirname, `_otosetup_dash_${Date.now()}.json`);
    let manifest = null;
    const mResult = runCmdAsync(
      `npx wrangler r2 object get ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --remote --file="${tmpFile}"`,
      __dirname, 15000
    );
    if (fs.existsSync(tmpFile)) {
      try { manifest = JSON.parse(fs.readFileSync(tmpFile, 'utf-8')); } catch(_) {}
      try { fs.unlinkSync(tmpFile); } catch(_) {}
    }

    // R2 dosya listesi (manifest + bilinen dosyaları probe et)
    let r2Files = [];
    // Manifest dosyasını ekle
    if (manifest) {
      r2Files.push({ key: OTOSETUP_MANIFEST_KEY, size: 0, sizeMB: 0, uploaded: manifest.published_at || null, exists: true, type: 'manifest' });
      // Manifest'teki ZIP'i wrangler ile probe et (Worker HEAD 401 döner)
      if (manifest.download_key) {
        const zipKey = `cloudflareprootomasyon/${manifest.download_key}`;
        const probeTmp = path.join(__dirname, `_probe_${Date.now()}.tmp`);
        try {
          // Sadece dosyanın varlığını kontrol et (ilk 1 byte yeterli)
          const probeResult = runCmdAsync(
            `npx wrangler r2 object get ${R2_BUCKET}/${zipKey} --remote --file="${probeTmp}"`,
            __dirname, 15000
          );
          const zipExists = probeResult.success && fs.existsSync(probeTmp);
          let zipSizeMB = 0;
          if (zipExists) {
            zipSizeMB = parseFloat((fs.statSync(probeTmp).size / (1024*1024)).toFixed(2));
          }
          try { if (fs.existsSync(probeTmp)) fs.unlinkSync(probeTmp); } catch(_) {}
          r2Files.push({
            key: zipKey,
            size: zipExists ? Math.round(zipSizeMB * 1024 * 1024) : 0,
            sizeMB: zipSizeMB,
            uploaded: manifest.published_at || null,
            exists: zipExists,
            type: 'zip'
          });
        } catch(_) {
          try { if (fs.existsSync(probeTmp)) fs.unlinkSync(probeTmp); } catch(__) {}
          r2Files.push({ key: zipKey, size: 0, sizeMB: 0, uploaded: null, exists: false, type: 'zip' });
        }
      }
    }

    // Worker durumu
    let workerOk = false;
    try {
      const wr = await fetch('https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest', { signal: AbortSignal.timeout(8000) });
      workerOk = wr.ok;
    } catch(_) {}

    res.json({
      success: true,
      localVersion,
      manifest,
      r2Files,
      r2FileCount: r2Files.length,
      r2TotalSizeMB: parseFloat(r2Files.reduce((s, f) => s + (f.sizeMB || 0), 0).toFixed(2)),
      installerExists,
      installerSizeKB: installerExists ? parseFloat((fs.statSync(installerPath).size / 1024).toFixed(1)) : null,
      installerModified: installerExists ? fs.statSync(installerPath).mtime.toISOString() : null,
      workerOk,
      workerUrl: 'https://template-update-service.saffetcelik.com.tr'
    });
  } catch(e) {
    res.status(500).json({ error: `Dashboard hatası: ${e.message}` });
  }
});

// ═══════════════════════════════════════════════════════════════
// OTOSETUPWeb RELEASE OTOMASYON (Tek tık ile yayınlama)
// Build → ZIP → Checksum → R2 Upload → Manifest → Installer Rebuild
// ═══════════════════════════════════════════════════════════════

const OTOSETUP_ROOT = path.join(__dirname, '..', '..', 'otosetupweb');
const OTOSETUP_DIST_ELECTRON = path.join(OTOSETUP_ROOT, 'dist-electron');
const OTOSETUP_EXE_NAME = 'Cloudflare Site Kurulum Otomasyonu.exe';
const OTOSETUP_WIN_UNPACKED = path.join(OTOSETUP_DIST_ELECTRON, 'win-unpacked');
const OTOSETUP_WORKER_BASE = 'https://template-update-service.saffetcelik.com.tr';

// Release durumunu takip eden global state
let releaseState = { running: false, steps: [], error: null, startedAt: null };

// ─── Electron Build (Adım 1) ───
app.post('/api/otosetupweb/release/build', async (req, res) => {
  if (releaseState.running) return res.status(409).json({ error: 'Başka bir işlem devam ediyor' });
  releaseState = { running: true, steps: ['Electron build başlatılıyor...'], error: null, startedAt: new Date().toISOString() };
  try {
    const result = runCmdAsync('npm run build:electron', OTOSETUP_ROOT, 300000);
    if (!result.success) {
      releaseState.error = result.error || 'Electron build başarısız';
      releaseState.steps.push('❌ Build başarısız: ' + (result.error || '').substring(0, 200));
      releaseState.running = false;
      return res.status(500).json({ error: releaseState.error, steps: releaseState.steps });
    }
    releaseState.steps.push('✅ Electron build tamamlandı');
    // win-unpacked dizinini doğrula (Electron runtime + uygulama)
    if (!fs.existsSync(OTOSETUP_WIN_UNPACKED)) {
      releaseState.error = 'win-unpacked dizini bulunamadı! electron-builder başarısız olmuş olabilir.';
      releaseState.steps.push('❌ ' + releaseState.error);
      releaseState.running = false;
      return res.status(500).json({ error: releaseState.error, steps: releaseState.steps });
    }
    const exePath = path.join(OTOSETUP_WIN_UNPACKED, OTOSETUP_EXE_NAME);
    if (!fs.existsSync(exePath)) {
      releaseState.error = `${OTOSETUP_EXE_NAME} win-unpacked içinde bulunamadı!`;
      releaseState.steps.push('❌ ' + releaseState.error);
      releaseState.running = false;
      return res.status(500).json({ error: releaseState.error, steps: releaseState.steps });
    }
    const exeSize = parseFloat((fs.statSync(exePath).size / (1024*1024)).toFixed(2));
    // win-unpacked toplam boyut
    const unpackedItems = fs.readdirSync(OTOSETUP_WIN_UNPACKED);
    releaseState.steps.push(`✅ win-unpacked hazır: ${OTOSETUP_EXE_NAME} (${exeSize} MB), ${unpackedItems.length} dosya/klasör`);
    releaseState.running = false;
    res.json({ success: true, exePath, exeSize, unpackedDir: OTOSETUP_WIN_UNPACKED, itemCount: unpackedItems.length, steps: releaseState.steps });
  } catch(e) {
    releaseState.error = e.message;
    releaseState.steps.push('❌ Hata: ' + e.message);
    releaseState.running = false;
    res.status(500).json({ error: e.message, steps: releaseState.steps });
  }
});

// ─── ZIP + Checksum + R2 Upload + Manifest Güncelle (Adım 2 — tek endpoint) ───
app.post('/api/otosetupweb/release/publish', async (req, res) => {
  if (releaseState.running) return res.status(409).json({ error: 'Başka bir işlem devam ediyor' });
  const { version, changelog } = req.body;
  if (!version) return res.status(400).json({ error: 'version zorunlu' });

  releaseState = { running: true, steps: [], error: null, startedAt: new Date().toISOString() };
  const steps = releaseState.steps;
  const zipName = `cloudflareprootomasyon_v${version}.zip`;
  const zipPath = path.join(__dirname, `_otosetup_release_${version}.zip`);

  try {
    // 1. win-unpacked dizinini doğrula (Electron runtime + uygulama)
    steps.push('win-unpacked dizini kontrol ediliyor...');
    if (!fs.existsSync(OTOSETUP_WIN_UNPACKED)) {
      throw new Error('win-unpacked dizini bulunamadı! Önce Electron build yapın.');
    }
    const exePath = path.join(OTOSETUP_WIN_UNPACKED, OTOSETUP_EXE_NAME);
    if (!fs.existsSync(exePath)) {
      throw new Error(`${OTOSETUP_EXE_NAME} win-unpacked içinde bulunamadı! Önce Electron build yapın.`);
    }
    const exeSize = fs.statSync(exePath).size;
    const unpackedItems = fs.readdirSync(OTOSETUP_WIN_UNPACKED);
    steps.push(`✅ win-unpacked hazır: ${OTOSETUP_EXE_NAME} (${(exeSize/(1024*1024)).toFixed(1)} MB), ${unpackedItems.length} dosya/klasör`);

    // 2. ZIP paketle — win-unpacked dizininin TAMAMINI paketle (Electron runtime dahil)
    steps.push('ZIP paketi oluşturuluyor (tüm Electron runtime dahil)...');
    // Icon dosyasını win-unpacked'e kopyala (kısayol ikonu için)
    const iconSrc = path.join(OTOSETUP_ROOT, 'installer', 'cloudflare-pages.ico');
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(OTOSETUP_WIN_UNPACKED, 'cloudflare-pages.ico'));
      steps.push('✅ Icon dosyası eklendi');
    }

    const zipResult = await runCmdPromise(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OTOSETUP_WIN_UNPACKED}\\*' -DestinationPath '${zipPath}' -Force"`,
      __dirname, 600000
    );
    if (!zipResult.success || !fs.existsSync(zipPath)) {
      throw new Error('ZIP oluşturulamadı: ' + (zipResult.error || ''));
    }
    const zipSize = fs.statSync(zipPath).size;
    const zipSizeMB = parseFloat((zipSize / (1024*1024)).toFixed(2));
    steps.push(`✅ ZIP: ${zipName} (${zipSizeMB} MB)`);

    // 3. SHA-256 checksum (stream — memory-safe)
    steps.push('SHA-256 hesaplanıyor...');
    const checksum = await checksumFileAsync(zipPath);
    steps.push(`✅ SHA-256: ${checksum.substring(0, 16)}...`);

    // 4. R2'ye ZIP yükle (async — 5dk timeout)
    steps.push(`R2'ye yükleniyor: ${R2_BUCKET}/${OTOSETUP_R2_PREFIX}/${zipName}`);
    const uploadResult = await runCmdPromise(
      `npx wrangler r2 object put ${R2_BUCKET}/${OTOSETUP_R2_PREFIX}/${zipName} --file="${zipPath}" --remote --content-type=application/zip`,
      __dirname, 300000
    );
    if (!uploadResult.success) {
      throw new Error('R2 ZIP yükleme başarısız: ' + (uploadResult.error || ''));
    }
    steps.push(`✅ ZIP R2'ye yüklendi`);

    // 5. Manifest oluştur ve R2'ye yükle
    steps.push('Manifest güncelleniyor...');
    const manifest = {
      latest_version: version,
      download_key: zipName,
      download_url: `${OTOSETUP_WORKER_BASE}/cloudflareprootomasyon/download/${zipName}`,
      exe_name: OTOSETUP_EXE_NAME,
      checksum: checksum,
      changelog: changelog || '',
      published_at: new Date().toISOString(),
      file_size_mb: zipSizeMB
    };
    const manifestTmp = path.join(__dirname, `_otosetup_manifest_${Date.now()}.json`);
    fs.writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2), 'utf-8');

    const manifestUpload = await runCmdPromise(
      `npx wrangler r2 object put ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --file="${manifestTmp}" --remote --content-type=application/json`,
      __dirname, 60000
    );
    try { fs.unlinkSync(manifestTmp); } catch(_) {}
    if (!manifestUpload.success) {
      throw new Error('Manifest R2 yükleme başarısız: ' + (manifestUpload.error || ''));
    }
    steps.push(`✅ Manifest R2'ye yüklendi`);

    // 6. package.json versiyonunu güncelle
    const pkgPath = path.join(OTOSETUP_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
      steps.push(`✅ package.json → v${version}`);
    }

    // 7. Temizlik
    try { fs.unlinkSync(zipPath); } catch(_) {}

    steps.push(`🎉 v${version} başarıyla yayınlandı!`);
    releaseState.running = false;
    addLog('cfpro_release', `CloudflareProOtomasyon v${version} yayınlandı (${zipSizeMB} MB, SHA: ${checksum.substring(0,16)}...)`);
    res.json({ success: true, version, checksum, zipSizeMB, manifest, steps });
  } catch(e) {
    releaseState.error = e.message;
    steps.push('❌ ' + e.message);
    releaseState.running = false;
    // Temizlik
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch(_) {}
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── Installer Rebuild ───
app.post('/api/otosetupweb/release/rebuild-installer', (req, res) => {
  const steps = [];
  try {
    steps.push('Inno Setup derleniyor...');
    const issPath = path.join(OTOSETUP_ROOT, 'installer', 'setup.iss');
    if (!fs.existsSync(issPath)) {
      return res.status(404).json({ error: 'setup.iss bulunamadı', steps });
    }
    // ISCC yollarını dene
    const isccPaths = [
      'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
      'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe')
    ];
    let isccPath = isccPaths.find(p => fs.existsSync(p));
    if (!isccPath) {
      return res.status(404).json({ error: 'Inno Setup (ISCC.exe) bulunamadı. Lütfen kurun.', steps });
    }
    steps.push(`ISCC: ${isccPath}`);
    const result = runCmdAsync(`"${isccPath}" "${issPath}"`, path.join(OTOSETUP_ROOT, 'installer'), 60000);
    if (!result.success) {
      steps.push('❌ Derleme başarısız: ' + (result.error || '').substring(0, 200));
      return res.status(500).json({ error: 'Installer derleme başarısız', steps, detail: result.error });
    }
    const outputExe = path.join(OTOSETUP_ROOT, 'installer', 'output', 'CloudflareProOtomasyon-Setup.exe');
    if (fs.existsSync(outputExe)) {
      const size = parseFloat((fs.statSync(outputExe).size / 1024).toFixed(1));
      steps.push(`✅ Setup.exe derlendi (${size} KB)`);
    }
    res.json({ success: true, steps });
  } catch(e) {
    steps.push('❌ ' + e.message);
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── Tek Tıkla Tam Yayınlama (Build → ZIP/R2/Manifest → Installer → Git/GitHub Release) ───
app.post('/api/otosetupweb/release/full-release', async (req, res) => {
  if (releaseState.running) return res.status(409).json({ error: 'Başka bir işlem devam ediyor' });
  const { version, changelog } = req.body;
  if (!version) return res.status(400).json({ error: 'version zorunlu' });

  releaseState = { running: true, steps: [], error: null, startedAt: new Date().toISOString() };
  const steps = releaseState.steps;

  try {
    // ═══ ADIM 1/4: Electron Build ═══
    steps.push('━━━ ADIM 1/4: Electron Build ━━━');
    steps.push('Build başlatılıyor... (2-5 dk sürebilir)');

    // Önce package.json versiyonunu güncelle
    const pkgPath = path.join(OTOSETUP_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
      steps.push(`✅ package.json → v${version}`);
    }

    const buildResult = await runCmdPromise('npm run build:electron', OTOSETUP_ROOT, 600000);
    if (!buildResult.success) {
      throw new Error('Electron build başarısız: ' + (buildResult.error || '').substring(0, 300));
    }
    steps.push('✅ Electron build tamamlandı');

    // win-unpacked dizinini doğrula (Electron runtime + uygulama)
    if (!fs.existsSync(OTOSETUP_WIN_UNPACKED)) {
      throw new Error('win-unpacked dizini bulunamadı! electron-builder başarısız olmuş olabilir.');
    }
    const exePath = path.join(OTOSETUP_WIN_UNPACKED, OTOSETUP_EXE_NAME);
    if (!fs.existsSync(exePath)) {
      throw new Error(`${OTOSETUP_EXE_NAME} win-unpacked içinde bulunamadı!`);
    }
    const exeSize = fs.statSync(exePath).size;
    const unpackedItems = fs.readdirSync(OTOSETUP_WIN_UNPACKED);
    steps.push(`✅ win-unpacked hazır: ${OTOSETUP_EXE_NAME} (${(exeSize/(1024*1024)).toFixed(1)} MB), ${unpackedItems.length} dosya/klasör`);

    // ═══ ADIM 2/4: ZIP + R2 + Manifest (ASYNC — event loop bloke olmaz) ═══
    steps.push('');
    steps.push('━━━ ADIM 2/4: ZIP + R2 Upload + Manifest ━━━');
    const zipName = `cloudflareprootomasyon_v${version}.zip`;
    const zipPath = path.join(__dirname, `_otosetup_release_${version}.zip`);

    // ZIP paketle — win-unpacked dizininin TAMAMINI paketle (Electron runtime dahil)
    steps.push('ZIP paketi oluşturuluyor (tüm Electron runtime dahil)...');
    // Icon dosyasını win-unpacked'e kopyala (kısayol ikonu için)
    const iconSrc = path.join(OTOSETUP_ROOT, 'installer', 'cloudflare-pages.ico');
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(OTOSETUP_WIN_UNPACKED, 'cloudflare-pages.ico'));
      steps.push('✅ Icon dosyası eklendi');
    }

    // runCmdPromise: gerçek async exec — 10dk timeout, event loop bloke olmaz
    const zipResult = await runCmdPromise(
      `powershell -NoProfile -Command "Compress-Archive -Path '${OTOSETUP_WIN_UNPACKED}\\*' -DestinationPath '${zipPath}' -Force"`,
      __dirname, 600000
    );
    if (!zipResult.success || !fs.existsSync(zipPath)) {
      throw new Error('ZIP oluşturulamadı: ' + (zipResult.error || ''));
    }
    const zipSize = fs.statSync(zipPath).size;
    const zipSizeMB = parseFloat((zipSize / (1024*1024)).toFixed(2));
    steps.push(`✅ ZIP: ${zipName} (${zipSizeMB} MB)`);

    // SHA-256 (stream — memory-safe, 200MB+ dosya için readFileSync kullanma)
    steps.push('SHA-256 hesaplanıyor...');
    const checksum = await checksumFileAsync(zipPath);
    steps.push(`✅ SHA-256: ${checksum.substring(0, 16)}...`);

    // R2 Upload (async — 5dk timeout)
    steps.push(`R2'ye yükleniyor...`);
    const uploadResult = await runCmdPromise(
      `npx wrangler r2 object put ${R2_BUCKET}/${OTOSETUP_R2_PREFIX}/${zipName} --file="${zipPath}" --remote --content-type=application/zip`,
      __dirname, 300000
    );
    if (!uploadResult.success) {
      throw new Error('R2 ZIP yükleme başarısız: ' + (uploadResult.error || ''));
    }
    steps.push(`✅ ZIP R2'ye yüklendi`);

    // Manifest
    steps.push('Manifest güncelleniyor...');
    const manifest = {
      latest_version: version,
      download_key: zipName,
      download_url: `${OTOSETUP_WORKER_BASE}/cloudflareprootomasyon/download/${zipName}`,
      exe_name: OTOSETUP_EXE_NAME,
      checksum: checksum,
      changelog: changelog || '',
      published_at: new Date().toISOString(),
      file_size_mb: zipSizeMB
    };
    const manifestTmp = path.join(__dirname, `_otosetup_manifest_${Date.now()}.json`);
    fs.writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2), 'utf-8');
    const manifestUpload = await runCmdPromise(
      `npx wrangler r2 object put ${R2_BUCKET}/${OTOSETUP_MANIFEST_KEY} --file="${manifestTmp}" --remote --content-type=application/json`,
      __dirname, 60000
    );
    try { fs.unlinkSync(manifestTmp); } catch(_) {}
    if (!manifestUpload.success) {
      throw new Error('Manifest R2 yükleme başarısız: ' + (manifestUpload.error || ''));
    }
    steps.push(`✅ Manifest R2'ye yüklendi`);

    // ZIP temizlik
    try { fs.unlinkSync(zipPath); } catch(_) {}

    // ═══ ADIM 3/4: Installer Derle ═══
    steps.push('');
    steps.push('━━━ ADIM 3/4: Installer Derleme ━━━');
    const issPath = path.join(OTOSETUP_ROOT, 'installer', 'setup.iss');
    let installerExePath = null;
    if (fs.existsSync(issPath)) {
      // setup.iss içindeki #define AppVersion "x.x.x" satırını güncel versiyonla güncelle
      let issContent = fs.readFileSync(issPath, 'utf-8');
      const issVersionRegex = /(#define\s+AppVersion\s+)"[^"]*"/;
      if (issVersionRegex.test(issContent)) {
        issContent = issContent.replace(issVersionRegex, `$1"${version}"`);
        fs.writeFileSync(issPath, issContent, 'utf-8');
        steps.push(`✅ setup.iss → AppVersion "${version}"`);
      }

      const isccPaths = [
        'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
        'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe')
      ];
      const isccPath = isccPaths.find(p => fs.existsSync(p));
      if (isccPath) {
        steps.push(`ISCC: ${isccPath}`);
        const installerResult = await runCmdPromise(`"${isccPath}" "${issPath}"`, path.join(OTOSETUP_ROOT, 'installer'), 120000);
        const outputExe = path.join(OTOSETUP_ROOT, 'installer', 'output', 'CloudflareProOtomasyon-Setup.exe');
        if (installerResult.success && fs.existsSync(outputExe)) {
          const size = parseFloat((fs.statSync(outputExe).size / 1024).toFixed(1));
          steps.push(`✅ Setup.exe derlendi (${size} KB)`);
          installerExePath = outputExe;
        } else {
          steps.push('⚠️ Installer derleme başarısız: ' + (installerResult.error || '').substring(0, 200));
        }
      } else {
        steps.push('⚠️ Inno Setup (ISCC.exe) bulunamadı — installer atlandı');
      }
    } else {
      steps.push('⚠️ setup.iss bulunamadı — installer atlandı');
    }

    // ═══ ADIM 4/4: Git Commit + Tag + Push + GitHub Release ═══
    steps.push('');
    steps.push('━━━ ADIM 4/4: Git + GitHub Release ━━━');
    const tag = `v${version}`;
    const commitMsg = `v${version} - ${changelog || 'Release'}`;

    // Git add + commit + tag + push
    steps.push('Git commit & tag oluşturuluyor...');
    await runCmdPromise(`git add -A && git commit -m "${commitMsg}" --allow-empty`, OTOSETUP_ROOT, 30000);
    await runCmdPromise(`git tag -f ${tag}`, OTOSETUP_ROOT, 10000);
    const pushResult = await runCmdPromise(`git push origin main --tags --force`, OTOSETUP_ROOT, 60000);
    if (!pushResult.success) {
      steps.push('⚠️ Git push başarısız: ' + (pushResult.error || '').substring(0, 200));
    } else {
      steps.push(`✅ Git: commit + tag ${tag} + push`);
    }

    // GitHub Release oluştur (gh CLI — Actions kullanmaz, doğrudan API)
    steps.push('GitHub Release oluşturuluyor...');
    const releaseNotes = (changelog || `v${version} release`).replace(/"/g, '\\"');
    const ghCreateResult = await runCmdPromise(
      `gh release create ${tag} --title "${tag}" --notes "${releaseNotes}" --force-with-lease 2>&1 || gh release create ${tag} --title "${tag}" --notes "${releaseNotes}" 2>&1`,
      OTOSETUP_ROOT, 30000
    );
    if (ghCreateResult.success || (ghCreateResult.output || '').includes('release/tag/')) {
      steps.push(`✅ GitHub Release: ${tag}`);
    } else {
      // Release zaten varsa güncelle
      await runCmdPromise(`gh release delete ${tag} --yes 2>&1`, OTOSETUP_ROOT, 15000);
      const retryResult = await runCmdPromise(
        `gh release create ${tag} --title "${tag}" --notes "${releaseNotes}"`,
        OTOSETUP_ROOT, 30000
      );
      if (retryResult.success) {
        steps.push(`✅ GitHub Release: ${tag} (yeniden oluşturuldu)`);
      } else {
        steps.push('⚠️ GitHub Release oluşturulamadı: ' + (retryResult.error || '').substring(0, 200));
      }
    }

    // Setup.exe'yi GitHub Release'e yükle
    if (installerExePath && fs.existsSync(installerExePath)) {
      steps.push('Setup.exe GitHub Release\'e yükleniyor...');
      const uploadGhResult = await runCmdPromise(
        `gh release upload ${tag} "${installerExePath}" --clobber`,
        OTOSETUP_ROOT, 120000
      );
      if (uploadGhResult.success) {
        steps.push(`✅ Setup.exe GitHub Release'e yüklendi`);
      } else {
        steps.push('⚠️ Setup.exe yükleme başarısız: ' + (uploadGhResult.error || '').substring(0, 200));
      }
    }

    steps.push('');
    steps.push(`🎉 v${version} başarıyla yayınlandı!`);
    releaseState.running = false;
    addLog('cfpro_release', `CloudflareProOtomasyon v${version} tam yayınlama (${zipSizeMB} MB, SHA: ${checksum.substring(0,16)}...)`);
    res.json({ success: true, version, checksum, zipSizeMB, manifest, steps });
  } catch(e) {
    releaseState.error = e.message;
    steps.push('❌ ' + e.message);
    releaseState.running = false;
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── Release durumu ───
app.get('/api/otosetupweb/release/status', (req, res) => {
  res.json(releaseState);
});

// ─── Hızlı versiyon bump (package.json) ───
app.post('/api/otosetupweb/bump-version', (req, res) => {
  const { type } = req.body; // patch, minor, major
  const pkgPath = path.join(OTOSETUP_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) return res.status(404).json({ error: 'package.json bulunamadı' });
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const parts = (pkg.version || '1.0.0').split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  const newVersion = parts.join('.');
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  res.json({ success: true, oldVersion: (pkg.version || '1.0.0'), newVersion });
});

// ─── Rate Limit Yönetim Proxy (Worker admin endpoint'lerine proxy) ───
const WORKER_ADMIN_BASE = 'https://template-update-service.saffetcelik.com.tr';

function getWorkerAuthKey() {
  // Mevcut tanımlı SERVICE_AUTH_KEY sabitini kullan (satır 972)
  return SERVICE_AUTH_KEY;
}

app.get('/api/otosetupweb/ratelimit/config', async (req, res) => {
  try {
    const authKey = getWorkerAuthKey();
    const r = await fetch(`${WORKER_ADMIN_BASE}/admin/cfpro/download-config`, {
      headers: { 'X-Service-Auth': authKey }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/otosetupweb/ratelimit/config', async (req, res) => {
  try {
    const authKey = getWorkerAuthKey();
    const r = await fetch(`${WORKER_ADMIN_BASE}/admin/cfpro/download-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Service-Auth': authKey },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/otosetupweb/ratelimit/blocked-ips', async (req, res) => {
  try {
    const authKey = getWorkerAuthKey();
    const r = await fetch(`${WORKER_ADMIN_BASE}/admin/cfpro/blocked-ips`, {
      headers: { 'X-Service-Auth': authKey }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/otosetupweb/ratelimit/blocked-ips', async (req, res) => {
  try {
    const authKey = getWorkerAuthKey();
    const r = await fetch(`${WORKER_ADMIN_BASE}/admin/cfpro/blocked-ips`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Service-Auth': authKey },
      body: JSON.stringify(req.body || {})
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── SPA Fallback (TÜM API route'larından SONRA olmalı) ───
app.get('*', (req, res) => {
  const reactIndex = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

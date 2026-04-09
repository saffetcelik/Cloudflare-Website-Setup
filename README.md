# ☁️ Cloudflare Site Kurulum Otomasyonu

<div align="center">

**Açık kaynak, tam kapsamlı fullstack template kurma ve dağıtım sistemi.**

Cloudflare Pages, D1, R2 ve Workers üzerinde çalışan hazır şablonları tek tıkla deploy edin.

[![Release](https://img.shields.io/github/v/release/saffetcelik/Cloudflare-Website-Setup?style=for-the-badge&logo=github&color=blue)](https://github.com/saffetcelik/Cloudflare-Website-Setup/releases/latest)
[![License](https://img.shields.io/github/license/saffetcelik/Cloudflare-Website-Setup?style=for-the-badge)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/saffetcelik/Cloudflare-Website-Setup/total?style=for-the-badge&logo=windows&color=green)](https://github.com/saffetcelik/Cloudflare-Website-Setup/releases/latest)

</div>

---

## 📥 İndirme

> **[⬇️ Son Sürümü İndir (Windows)](https://github.com/saffetcelik/Cloudflare-Website-Setup/releases/latest)**

`CloudflareProOtomasyon-Setup.exe` dosyasını indirip çalıştırmanız yeterli. Kurulum sihirbazı gerisini halleder.

### Gereksinimler

- Windows 10/11 (64-bit)
- İnternet bağlantısı
- Cloudflare hesabı

---

## ✨ Özellikler

- ⚡ **Wrangler OAuth** ile tek tıkla Cloudflare kimlik doğrulama
- 📦 **R2'den şablon indirme** ve otomatik yapılandırma
- 🗄️ **D1 veritabanı** oluşturma ve schema yükleme
- 🚀 **Cloudflare Pages'e** otomatik deployment
- 🌐 **Custom domain** ekleme ve DNS yönetimi
- 🖥️ **Electron masaüstü uygulaması** (Windows)
- 🔄 **Otomatik güncelleme** sistemi

---

## 🛠️ Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| **Frontend** | React 19, TypeScript, Vite 6, TailwindCSS 4, Motion |
| **Backend** | Express.js, Node.js |
| **Desktop** | Electron, Inno Setup |
| **Cloudflare** | Pages, D1, R2, Workers, Wrangler CLI |

---

## 🧑‍💻 Geliştirici Kurulumu

Projeyi yerel ortamınızda geliştirmek için:

```bash
# Repoyu klonla
git clone https://github.com/saffetcelik/Cloudflare-Website-Setup.git
cd Cloudflare-Website-Setup

# Bağımlılıkları yükle
npm install

# Cloudflare'a giriş yap
npx wrangler login

# Ortam değişkenlerini yapılandır
cp .env.example .env
# .env dosyasını düzenleyin

# Geliştirme sunucusunu başlat
npm run dev
```

### Mevcut Scriptler

| Script | Açıklama |
|--------|----------|
| `npm run dev` | Geliştirme sunucusu (Express + Vite) |
| `npm run dev:electron` | Electron ile geliştirme |
| `npm run build` | Frontend build |
| `npm run build:electron` | Tam Electron build (frontend + server + electron) |

---

## 📁 Proje Yapısı

```
├── src/                  # React frontend kaynak kodu
│   ├── App.tsx           # Ana uygulama bileşeni
│   └── index.css         # Stil dosyası
├── electron/             # Electron ana süreç
│   └── main.ts           # Electron main process
├── server.ts             # Express.js backend
├── installer/            # Inno Setup installer dosyaları
│   ├── setup.iss         # Inno Setup script
│   └── cloudflare-pages.ico  # Uygulama ikonu
├── .github/workflows/    # CI/CD
│   └── release.yml       # Otomatik release workflow
└── package.json
```

---

## 🚀 Release Oluşturma

Yeni bir release otomatik olarak oluşturulur. Yapmanız gereken tek şey bir versiyon tag'i push etmek:

```bash
# Versiyon tag'i oluştur ve push et
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions otomatik olarak:
1. ✅ Projeyi build eder
2. ✅ Inno Setup ile installer oluşturur
3. ✅ GitHub Release oluşturur ve EXE'yi ekler

---

## 📄 Lisans

Bu proje [MIT](LICENSE) lisansı ile lisanslanmıştır.

---

<div align="center">

**Geliştirici:** [Saffet Çelik](https://saffetcelik.com.tr)

</div>

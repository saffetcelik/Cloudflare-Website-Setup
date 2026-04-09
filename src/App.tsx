import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Cloud,
  Database,
  Plus,
  ShieldCheck,
  ExternalLink,
  Loader2,
  AlertCircle,
  Layout,
  Server,
  Key,
  ChevronRight,
  LogOut,
  CheckCircle2,
  ArrowRight,
  Zap,
  Copy,
  Info,
  Terminal,
  Monitor,
  Globe,
  Activity,
  Cpu,
  Link,
  Minus,
  Square,
  X,
  Shield,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Heart,
  Github,
  MessageCircle,
  Mail,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const AUTH_DOMAIN = import.meta.env.VITE_AUTH_SERVICE_DOMAIN || 'saffetcelik.com.tr';

// --- Electron Detection ---
const isElectron = typeof window !== 'undefined' && window.process && (window.process as any).type === 'renderer';
const ipcRenderer = isElectron ? (window as any).require('electron').ipcRenderer : null;

// --- Types ---
interface Account {
  id: string;
  name: string;
}

interface PagesProject {
  id: string;
  name: string;
  subdomain: string;
  customDomains?: Array<{
    name: string;
    status: 'active' | 'pending' | 'initializing' | 'pending_migration' | 'pending_deletion' | 'failed';
  }>;
  created_on: string;
}

interface D1Database {
  uuid: string;
  name: string;
  created_at: string;
}

interface Zone {
  id: string;
  name: string;
  status: string;
}

// --- Components ---

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <div className={`bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-lg shadow-black/10 ${className}`} {...props}>
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = ""
}: {
  children: React.ReactNode,
  onClick?: () => void,
  variant?: 'primary' | 'secondary' | 'outline' | 'danger',
  disabled?: boolean,
  loading?: boolean,
  className?: string
}) => {
  const baseStyles = "px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20",
    secondary: "bg-[#2a2d36] hover:bg-[#333640] text-[#e2e8f0]",
    outline: "border border-[#2a2a2a] hover:bg-[#2a2d36] text-[#e2e8f0]",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

function UpdateCard() {
  const [updateState, setUpdateState] = useState<{
    checking: boolean;
    downloading: boolean;
    applying: boolean;
    updateAvailable: boolean | null;
    currentVersion: string;
    latestVersion: string;
    changelog: string;
    publishedAt: string | null;
    extractDir: string | null;
    error: string | null;
  }>({
    checking: false, downloading: false, applying: false,
    updateAvailable: null, currentVersion: __APP_VERSION__,
    latestVersion: '', changelog: '', publishedAt: null,
    extractDir: null, error: null,
  });

  const checkForUpdate = async () => {
    setUpdateState(s => ({ ...s, checking: true, error: null }));
    try {
      const res = await fetch('/api/app/check-update');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kontrol başarısız');
      setUpdateState(s => ({
        ...s, checking: false,
        currentVersion: data.currentVersion || s.currentVersion,
        latestVersion: data.latestVersion,
        updateAvailable: data.updateAvailable,
        changelog: data.changelog || '',
        publishedAt: data.publishedAt || null,
      }));
    } catch (err: any) {
      setUpdateState(s => ({ ...s, checking: false, error: err.message }));
    }
  };

  const downloadUpdate = async () => {
    setUpdateState(s => ({ ...s, downloading: true, error: null }));
    try {
      const res = await fetch('/api/app/download-update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İndirme başarısız');
      setUpdateState(s => ({ ...s, downloading: false, extractDir: data.extractDir }));
    } catch (err: any) {
      setUpdateState(s => ({ ...s, downloading: false, error: err.message }));
    }
  };

  const applyUpdate = async () => {
    if (!updateState.extractDir) return;
    setUpdateState(s => ({ ...s, applying: true, error: null }));
    try {
      const res = await fetch('/api/app/apply-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractDir: updateState.extractDir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Uygulama başarısız');
    } catch (err: any) {
      setUpdateState(s => ({ ...s, applying: false, error: err.message }));
    }
  };

  useEffect(() => { checkForUpdate(); }, []);

  const s = updateState;

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sürüm & Güncelleme</p>
        <button onClick={checkForUpdate} disabled={s.checking} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${s.checking ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Mevcut sürüm */}
      <div className="flex items-center gap-4 p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-xl font-bold font-mono text-white">v{s.currentVersion}</p>
          <p className="text-xs text-emerald-400/80 mt-0.5">Yüklü sürüm</p>
        </div>
      </div>

      {/* Güncelleme durumu */}
      {s.checking && (
        <div className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <p className="text-xs text-blue-300">Güncelleme kontrol ediliyor...</p>
        </div>
      )}

      {s.updateAvailable === false && !s.checking && (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-emerald-300">En güncel sürümü kullanıyorsunuz</p>
        </div>
      )}

      {s.updateAvailable === true && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <Download className="w-4 h-4 text-amber-400" />
            <div className="flex-1">
              <p className="text-xs text-amber-300 font-medium">Yeni sürüm mevcut: <span className="font-mono font-bold">v{s.latestVersion}</span></p>
              {s.publishedAt && <p className="text-[10px] text-gray-500 mt-0.5">{new Date(s.publishedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
            </div>
          </div>

          {s.changelog && (
            <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
              <p className="text-[10px] text-gray-500 font-bold uppercase mb-1.5">Değişiklikler</p>
              <p className="text-xs text-gray-300">{s.changelog}</p>
            </div>
          )}

          {!s.extractDir ? (
            <button
              onClick={downloadUpdate}
              disabled={s.downloading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-xl text-xs font-medium text-amber-300 transition-all disabled:opacity-50"
            >
              {s.downloading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> İndiriliyor...</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Güncellemeyi İndir</>
              )}
            </button>
          ) : (
            <button
              onClick={applyUpdate}
              disabled={s.applying}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-xs font-bold text-black transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {s.applying ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uygulanıyor...</>
              ) : (
                <><Zap className="w-3.5 h-3.5" /> Güncellemeyi Uygula & Yeniden Başlat</>
              )}
            </button>
          )}
        </div>
      )}

      {s.error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{s.error}</p>
        </div>
      )}

      <div className="space-y-2 text-xs text-gray-500">
        <p className="font-semibold text-gray-400">Bu sürümde:</p>
        <ul className="space-y-1.5 pl-2">
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> Cloudflare Pages otomatik kurulum</li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> D1 veritabanı oluşturma ve yönetim</li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> R2 şablon depolama ve dağıtım</li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> Admin paneli D1 şifre sıfırlama</li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> Domain yönetimi ve DNS otomasyonu</li>
          <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">✓</span> Otomatik güncelleme desteği</li>
        </ul>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const handleConnectAccount = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/start-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bağlantı kurulamadı');

      if ((window as any).electron?.ipcRenderer) {
        (window as any).electron.ipcRenderer.send('open-external', data.authUrl);
      } else {
        window.open(data.authUrl, '_blank');
      }

      setWaitingForAuth(true);
      setIsLoading(false);

      let attempts = 0;
      pollingRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setWaitingForAuth(false);
          setError('Bağlantı süresi doldu. Tekrar deneyin.');
          return;
        }
        try {
          const statusRes = await fetch('/api/auth/status');
          const statusData = await statusRes.json();
          if (statusData.authenticated) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setWaitingForAuth(false);

            // Bring window to front on successful authentication
            if (ipcRenderer) {
              ipcRenderer.send('bring-to-front');
            }

            onLogin(statusData.user);
          }
        } catch (e) { }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Arka plan efektleri */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Windows Tarzı Pencere Kontrolleri (Sağ Üst) */}
      <div className="absolute top-0 right-0 flex items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button onClick={() => ipcRenderer?.send('window-minimize')} className="p-3 text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={() => ipcRenderer?.send('window-maximize')} className="p-3 text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors">
          <Square className="w-4 h-4" />
        </button>
        <button onClick={() => ipcRenderer?.send('window-close')} className="p-3 text-[#94a3b8] hover:text-white hover:bg-red-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className="w-full max-w-md z-10" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="bg-[#111]/80 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/50 p-10">
          <div className="text-center mb-8">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl blur-xl opacity-40 animate-pulse" />
              <div className="relative w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                <ShieldCheck className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200 mb-3 tracking-tight">Cloudflare Otomasyon</h1>
            <p className="text-[#94a3b8] text-sm">{AUTH_DOMAIN} hesabınızla güvenle giriş yapın</p>
          </div>

          {waitingForAuth ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6 space-y-6">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-white font-medium text-lg">Tarayıcınızda onay bekleniyor...</p>
                <p className="text-[#64748b] text-sm mt-2">Açılan pencerede hesabınızı bağlayıp onay verin.</p>
              </div>
              <button
                onClick={() => { if (pollingRef.current) clearInterval(pollingRef.current); setWaitingForAuth(false); }}
                className="text-sm font-medium text-[#64748b] hover:text-white bg-white/5 hover:bg-white/10 px-6 py-2.5 rounded-full transition-all"
              >
                İptal Et
              </button>
            </motion.div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-2.5 p-4 bg-white/5 hover:bg-white/10 transition-colors rounded-2xl border border-white/5">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#94a3b8] text-center">Güvenli</p>
                </div>
                <div className="flex flex-col items-center gap-2.5 p-4 bg-white/5 hover:bg-white/10 transition-colors rounded-2xl border border-white/5">
                  <Globe className="w-6 h-6 text-blue-400" />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#94a3b8] text-center">Otomatik</p>
                </div>
                <div className="flex flex-col items-center gap-2.5 p-4 bg-white/5 hover:bg-white/10 transition-colors rounded-2xl border border-white/5">
                  <Zap className="w-6 h-6 text-amber-400" />
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#94a3b8] text-center">Hızlı</p>
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-200">{error}</p>
                </motion.div>
              )}

              <button
                onClick={handleConnectAccount}
                disabled={isLoading}
                className="group relative w-full h-14 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-[0_0_40px_rgba(52,211,153,0.3)] hover:shadow-[0_0_60px_rgba(52,211,153,0.5)]"
              >
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                <div className="relative flex items-center justify-center gap-3">
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Hazırlanıyor...</>
                  ) : (
                    <><Link className="w-5 h-5" /> Hesabı Bağla</>
                  )}
                </div>
              </button>

              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[11px] text-[#64748b]">{AUTH_DOMAIN} ile uçtan uca şifreli bağlantı</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) setAuthUser(data.user);
      })
      .catch(() => { })
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthUser(null);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden" style={{ WebkitAppRegion: 'drag' } as any}>
        {/* Arka plan efektleri */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[500px] h-[500px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none animate-pulse" />
          <div className="absolute w-[300px] h-[300px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-3xl blur-xl opacity-40 animate-pulse" />
            <div className="relative w-full h-full bg-[#0a0a0a] border border-white/10 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
              <Loader2 className="w-10 h-10 text-emerald-400 animate-spin drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-tight mb-2">Başlatılıyor</h2>
          <p className="text-[#94a3b8] text-sm animate-pulse font-medium">Bileşenler ve yetkiler kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen onLogin={(user) => setAuthUser(user)} />;
  }

  return <AppContent user={authUser} onLogout={handleLogout} />;
}

function AppContent({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [token, setToken] = useState<string>(localStorage.getItem('cf_token') || '');
  const [isVerified, setIsVerified] = useState(false);
  const [appInitializing, setAppInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [waitingForWrangler, setWaitingForWrangler] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [pages, setPages] = useState<PagesProject[]>([]);
  const [d1Databases, setD1Databases] = useState<D1Database[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesInitialized, setResourcesInitialized] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'pages' | 'd1' | 'domains' | 'deploy' | 'about'>('overview');
  const [inputToken, setInputToken] = useState('');
  const [deployProjectName, setDeployProjectName] = useState('');
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [domainModalData, setDomainModalData] = useState<{ open: boolean, projectName: string }>({ open: false, projectName: '' });
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [newDomainData, setNewDomainData] = useState<{ domain: string, projectName: string }>({ domain: '', projectName: '' });
  const [templates, setTemplates] = useState<Array<{ id: string, name: string, key: string, download_url?: string, size: number, description: string }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [lastDeployedSite, setLastDeployedSite] = useState<{ name: string, url: string, timestamp: number, database?: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{ show: boolean, title: string, message: string, onConfirm: () => void, type: 'danger' | 'warning' | 'info' }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => { },
    type: 'info'
  });
  const [dnsFixing, setDnsFixing] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState<{ show: boolean, message: string }>({ show: false, message: '' });
  const [deployProgress, setDeployProgress] = useState<{ show: boolean, step: number, message: string, error?: string }>({
    show: false,
    step: 0,
    message: ''
  });
  const [authStatus, setAuthStatus] = useState<{
    wrangler: { authenticated: boolean, email: string | null, scopes: string[] },
    apiToken: { configured: boolean, hasDnsPermission: boolean },
    canAddDomainWithDns: boolean
  } | null>(null);
  const [dnsTokenInput, setDnsTokenInput] = useState('');
  const canStartDeployment = Boolean(authStatus?.wrangler.authenticated);
  const [cancelCountdown, setCancelCountdown] = useState(0);
  const [wranglerApproved, setWranglerApproved] = useState(false);

  // Güncelleme bildirimi state
  const [updateNotification, setUpdateNotification] = useState<{
    show: boolean;
    latestVersion: string;
    changelog: string;
    downloading: boolean;
    extractDir: string | null;
    applying: boolean;
    error: string | null;
  }>({ show: false, latestVersion: '', changelog: '', downloading: false, extractDir: null, applying: false, error: null });

  // Password reset modal state
  const [passwordResetModal, setPasswordResetModal] = useState<{
    open: boolean;
    loading: boolean;
    admins: Array<{ id: number; email: string; name: string }>;
    selectedAdmin: number | null;
    newPassword: string;
    showPassword: boolean;
    result: { success: boolean; message: string } | null;
  }>({
    open: false, loading: false, admins: [], selectedAdmin: null,
    newPassword: '', showPassword: false, result: null
  });

  // Electron'dan gelen wrangler-login-approved sinyalini dinle
  useEffect(() => {
    if (!ipcRenderer) return;
    const handler = () => {
      console.log('Wrangler login approved signal received');
      setWranglerApproved(true);
    };
    ipcRenderer.on('wrangler-login-approved', handler);
    return () => {
      ipcRenderer.removeListener('wrangler-login-approved', handler);
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (waitingForWrangler) {
      setCancelCountdown(10);
      interval = setInterval(() => {
        setCancelCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCancelCountdown(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [waitingForWrangler]);

  // ——— Password Reset Functions ———
  const openPasswordReset = async () => {
    if (!lastDeployedSite?.database) return;
    setPasswordResetModal(prev => ({ ...prev, open: true, loading: true, result: null, newPassword: '', admins: [], selectedAdmin: null }));
    try {
      const res = await fetch(`/api/d1/admin-info?db=${encodeURIComponent(lastDeployedSite.database)}`);
      const data = await res.json();
      if (data.success && data.admins?.length > 0) {
        setPasswordResetModal(prev => ({
          ...prev, loading: false, admins: data.admins, selectedAdmin: data.admins[0].id
        }));
      } else {
        setPasswordResetModal(prev => ({
          ...prev, loading: false, result: { success: false, message: data.error || 'Admin bulunamadı' }
        }));
      }
    } catch (err: any) {
      setPasswordResetModal(prev => ({
        ...prev, loading: false, result: { success: false, message: 'Bağlantı hatası: ' + err.message }
      }));
    }
  };

  const handlePasswordReset = async () => {
    if (!lastDeployedSite?.database || !passwordResetModal.selectedAdmin || !passwordResetModal.newPassword) return;
    setPasswordResetModal(prev => ({ ...prev, loading: true, result: null }));
    try {
      const res = await fetch('/api/d1/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dbName: lastDeployedSite.database,
          adminId: passwordResetModal.selectedAdmin,
          newPassword: passwordResetModal.newPassword
        })
      });
      const data = await res.json();
      setPasswordResetModal(prev => ({
        ...prev, loading: false,
        result: { success: data.success || false, message: data.message || data.error || 'Bilinmeyen hata' }
      }));
    } catch (err: any) {
      setPasswordResetModal(prev => ({
        ...prev, loading: false, result: { success: false, message: 'Bağlantı hatası: ' + err.message }
      }));
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
    const bytes = new Uint8Array(14);
    crypto.getRandomValues(bytes);
    const pwd = Array.from(bytes).map(b => chars[b % chars.length]).join('');
    setPasswordResetModal(prev => ({ ...prev, newPassword: pwd, showPassword: true }));
  };

  const handleWranglerLogin = async (): Promise<void> => {
    if (!ipcRenderer) {
      setError('Bu özellik sadece Electron uygulamasında çalışır');
      return;
    }

    setLoading(true);
    setWaitingForWrangler(true);
    setWranglerApproved(false);
    setError(null);

    try {
      await ipcRenderer.invoke('wrangler-login');

      // Bring window to front after wrangler login
      setWaitingForWrangler(false);
      setWranglerApproved(false);
      ipcRenderer.send('bring-to-front');

      const res = await fetch('/api/cloudflare/verify-wrangler', {
        method: 'POST'
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Wrangler doğrulaması tamamlanamadı');
      }

      setToken('wrangler');
      setIsVerified(true);
      localStorage.setItem('cf_token', 'wrangler');

      const accountsRes = await fetch('/api/cloudflare/accounts', {
        headers: { 'Authorization': 'Bearer wrangler' }
      });
      const accountsData = await accountsRes.json();
      const nextAccounts = Array.isArray(accountsData) ? accountsData : [];

      setAccounts(nextAccounts);
      if (nextAccounts.length > 0) {
        setSelectedAccount(nextAccounts[0].id);
      }

      await fetchAuthStatus();
      setActiveTab('overview');
      setShowSuccessToast({ show: true, message: 'Wrangler Bağlantısı başarıyla tamamlandı.' });
      setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
    } catch (err: any) {
      setError(err?.message || 'Wrangler Bağlantısı kurulamadı');
    } finally {
      setWaitingForWrangler(false);
      setLoading(false);
    }
  };

  const fetchAuthStatus = async () => {
    try {
      const res = await fetch('/api/cloudflare/auth-status');
      const data = await res.json();
      setAuthStatus(data);
    } catch (err) {
      console.error('Auth status fetch failed:', err);
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      // Load last deployed site from localStorage
      const savedSite = localStorage.getItem('lastDeployedSite');
      if (savedSite) {
        setLastDeployedSite(JSON.parse(savedSite));
      }

      // Önce auth-status'u kontrol et (hafif çağrı - wrangler yoksa hızlıca null döner)
      try {
        const authRes = await fetch('/api/cloudflare/auth-status');
        const authData = await authRes.json();
        setAuthStatus(authData);

        // Sadece wrangler bağlıysa tam doğrulama yap
        if (authData?.wrangler?.authenticated) {
          try {
            const res = await fetch('/api/cloudflare/verify-wrangler', {
              method: 'POST'
            });
            const data = await res.json();

            if (data.success) {
              setToken('wrangler');
              setIsVerified(true);
              localStorage.setItem('cf_token', 'wrangler');

              // Fetch accounts
              const accountsRes = await fetch('/api/cloudflare/accounts', {
                headers: { 'Authorization': 'Bearer wrangler' }
              });
              const accountsData = await accountsRes.json();
              const nextAccounts = Array.isArray(accountsData) ? accountsData : [];
              setAccounts(nextAccounts);
              if (nextAccounts.length > 0) setSelectedAccount(nextAccounts[0].id);
            }
          } catch (err) {
            console.log('Wrangler verification failed');
          }
        } else {
          // Wrangler bağlı değil - "Hesabı Bağla" ekranı gösterilecek
          console.log('Wrangler not configured - showing connect screen');
        }
      } catch (err) {
        console.error('Auth status fetch failed:', err);
      } finally {
        setAppInitializing(false);
      }
    };

    initializeApp();
  }, []);

  // Uygulama yüklendikten 3sn sonra güncelleme kontrolü
  useEffect(() => {
    if (appInitializing) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/app/check-update');
        const data = await res.json();
        if (data.updateAvailable) {
          setUpdateNotification(s => ({
            ...s,
            show: true,
            latestVersion: data.latestVersion,
            changelog: data.changelog || '',
          }));
        }
      } catch (_) {}
    }, 3000);
    return () => clearTimeout(timer);
  }, [appInitializing]);

  useEffect(() => {
    if (isVerified && selectedAccount) {
      fetchResources();
      fetchTemplates();
    }
  }, [selectedAccount, isVerified]);

  // Poll pending domains every 15 seconds
  useEffect(() => {
    if (!isVerified || !selectedAccount) return;

    const hasPendingDomains = pages.some(p =>
      p.customDomains?.some(d => d.status !== 'active' && d.status !== 'failed')
    );
    if (!hasPendingDomains) return;

    const interval = setInterval(async () => {
      try {
        const updatedPages = await Promise.all(
          pages.map(async (project) => {
            const hasPending = project.customDomains?.some(
              d => d.status !== 'active' && d.status !== 'failed'
            );
            if (!hasPending) return project;

            const res = await fetch(`/api/cloudflare/${selectedAccount}/pages/${project.name}/domains`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const domainsData = await res.json();
            if (!Array.isArray(domainsData)) return project;

            const customDomains = domainsData
              .filter((d: any) => !d.name.includes('.pages.dev'))
              .map((d: any) => ({ name: d.name, status: d.status || 'pending' }));

            return { ...project, customDomains: customDomains.length > 0 ? customDomains : undefined };
          })
        );
        setPages(updatedPages);
      } catch (err) {
        // silent fail
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [pages, isVerified, selectedAccount, token]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/r2/templates');
      const data = await res.json();
      setTemplates(data);
      if (data.length > 0) {
        setSelectedTemplate(data[0].key);
      }
    } catch (err) {
      console.error('Templates fetch failed:', err);
    }
  };

  const verifyToken = async (tokenToVerify: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cloudflare/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToVerify })
      });
      const data = await res.json();
      if (data.success) {
        setIsVerified(true);
        localStorage.setItem('cf_token', tokenToVerify);
        fetchAccounts(tokenToVerify);
      } else {
        setError(data.error || 'Geçersiz token');
      }
    } catch (err) {
      setError('Bağlantı hatası oluştu');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async (authToken: string) => {
    try {
      const res = await fetch('/api/cloudflare/accounts', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const data = await res.json();
      setAccounts(data);
      if (data.length > 0) setSelectedAccount(data[0].id);
    } catch (err) {
      setError('Hesaplar alınamadı');
    }
  };

  const fetchResources = async () => {
    if (!selectedAccount) return;
    setResourcesLoading(true);
    setLoading(true);
    try {
      const [pagesRes, d1Res, zonesRes] = await Promise.all([
        fetch(`/api/cloudflare/${selectedAccount}/pages`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/cloudflare/${selectedAccount}/d1`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/cloudflare/${selectedAccount}/zones`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      const pagesRaw = await pagesRes.json();
      const d1Raw = await d1Res.json();
      const zonesRaw = await zonesRes.json();
      const pagesData = Array.isArray(pagesRaw) ? pagesRaw : [];
      const d1Data = Array.isArray(d1Raw) ? d1Raw : [];
      const zonesData = Array.isArray(zonesRaw) ? zonesRaw : [];

      // Fetch domain details for each project
      const pagesWithDomains = await Promise.all(
        pagesData.map(async (project: PagesProject) => {
          try {
            const domainsRes = await fetch(`/api/cloudflare/${selectedAccount}/pages/${project.name}/domains`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const domainsData = await domainsRes.json();

            // Filter out .pages.dev domains and map to our format
            const customDomains = domainsData
              .filter((d: any) => !d.name.includes('.pages.dev'))
              .map((d: any) => ({
                name: d.name,
                status: d.status || 'pending'
              }));

            return {
              ...project,
              customDomains: customDomains.length > 0 ? customDomains : undefined
            };
          } catch (err) {
            return project;
          }
        })
      );

      setPages(pagesWithDomains);
      setD1Databases(d1Data);
      setZones(zonesData);

      // Auto-detect last deployed site if not in localStorage
      if (!lastDeployedSite && pagesWithDomains.length > 0) {
        // Get the most recently created project
        const sortedPages = [...pagesWithDomains].sort((a, b) =>
          new Date(b.created_on).getTime() - new Date(a.created_on).getTime()
        );
        const latestProject = sortedPages[0];

        // Find matching database
        const matchingDb = d1Data.find((db: any) =>
          db.name.includes(latestProject.name) || latestProject.name.includes(db.name.replace('-db', ''))
        );

        const siteInfo = {
          name: latestProject.name,
          url: `https://${latestProject.subdomain}`,
          timestamp: new Date(latestProject.created_on).getTime(),
          database: matchingDb?.name
        };

        setLastDeployedSite(siteInfo);
        localStorage.setItem('lastDeployedSite', JSON.stringify(siteInfo));
      }
    } catch (err) {
      setError('Kaynaklar yüklenemedi');
    } finally {
      setResourcesLoading(false);
      setResourcesInitialized(true);
      setLoading(false);
    }
  };

  const addCustomDomainDirect = async () => {
    if (!newDomainData.domain || !newDomainData.projectName || !selectedAccount) return;
    setActionLoading('add-domain');
    try {
      const res = await fetch(`/api/cloudflare/${selectedAccount}/pages/${newDomainData.projectName}/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain: newDomainData.domain })
      });
      const data = await res.json();
      if (data.error) {
        if (data.needsZone) {
          setShowSuccessToast({ show: true, message: `⚠️  ${data.rootDomain} domain'i Cloudflare'de yok. Önce Cloudflare'e ekleyin.` });
        } else {
          setShowSuccessToast({ show: true, message: 'Hata: ' + data.error });
        }
        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 5000);
      } else {
        let message = `✅ Domain başarıyla eklendi! ${newDomainData.domain} artık ${newDomainData.projectName} projesine Bağlı.`;

        if (data.dnsConfigured) {
          message += `\n\n🔧 DNS otomatik yapılandırıldı: ${data.cnameRecord?.name} → ${data.cnameRecord?.content}`;
        } else {
          if (data.dnsError) {
            message += `\n\n⚠️ DNS yapılandırma hatası: ${data.dnsError}`;
          }
          if (data.dnsManualUrl) {
            message += `\n\n🔗 Daha fazla işlem için DNS sayfasına yönlendiriliyorsunuz...`;
            // Open DNS page in browser
            setTimeout(() => {
              if (ipcRenderer) {
                ipcRenderer.send('open-external', data.dnsManualUrl);
              } else {
                window.open(data.dnsManualUrl, '_blank');
              }
            }, 1000);
          }
        }

        setShowSuccessToast({ show: true, message });
        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 8000);
        setShowAddDomainModal(false);
        setNewDomainData({ domain: '', projectName: '' });

        // Refresh resources to show new domain with status
        await fetchResources();
      }
    } catch (err: any) {
      setShowSuccessToast({ show: true, message: 'Domain eklenirken hata oluştu: ' + err.message });
      setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const addCustomDomain = async () => {
    if (!domainModalData.projectName || !selectedDomain || !selectedAccount) return;
    setActionLoading('domain');
    try {
      const res = await fetch(`/api/cloudflare/${selectedAccount}/pages/${domainModalData.projectName}/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain: selectedDomain })
      });
      const data = await res.json();
      if (data.error) {
        if (data.needsZone) {
          setShowSuccessToast({ show: true, message: `⚠️  ${data.rootDomain} domain'i Cloudflare'de yok. Önce Cloudflare'e ekleyin.` });
        } else {
          setShowSuccessToast({ show: true, message: 'Hata: ' + data.error });
        }
        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 5000);
      } else {
        let message = `✅ Domain başarıyla eklendi! ${selectedDomain} artık ${domainModalData.projectName} projesine Bağlı.`;

        if (data.dnsConfigured) {
          message += `\n\n🔧 DNS otomatik yapılandırıldı: ${data.cnameRecord?.name} → ${data.cnameRecord?.content}`;
        } else {
          if (data.dnsError) {
            message += `\n\n⚠️ DNS yapılandırma hatası: ${data.dnsError}`;
          }
          if (data.dnsManualUrl) {
            message += `\n\n🔗 Daha fazla işlem için DNS sayfasına yönlendiriliyorsunuz...`;
            // Open DNS page in browser
            setTimeout(() => {
              if (ipcRenderer) {
                ipcRenderer.send('open-external', data.dnsManualUrl);
              } else {
                window.open(data.dnsManualUrl, '_blank');
              }
            }, 1000);
          }
        }

        setShowSuccessToast({ show: true, message });
        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 8000);
        setDomainModalData({ open: false, projectName: '' });
        setSelectedDomain('');

        // Refresh resources to show new domain with status
        await fetchResources();
      }
    } catch (err: any) {
      setShowSuccessToast({ show: true, message: 'Domain eklenirken hata oluştu: ' + err.message });
      setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const resetAllState = () => {
    // Clear all localStorage
    localStorage.removeItem('cf_token');
    localStorage.removeItem('lastDeployedSite');

    // Reset auth state
    setToken('');
    setIsVerified(false);
    setAccounts([]);
    setSelectedAccount(null);
    setAuthStatus(null);

    // Reset all resource data
    setPages([]);
    setD1Databases([]);
    setZones([]);
    setTemplates([]);
    setSelectedTemplate('');
    setLastDeployedSite(null);
    setResourcesInitialized(false);

    // Reset UI state
    setActiveTab('overview');
    setError(null);
    setDeployProjectName('');
    setDnsTokenInput('');
    setInputToken('');
  };

  const logout = async () => {
    try {
      await fetch('/api/cloudflare/wrangler-logout', { method: 'DELETE' });
    } catch { }
    resetAllState();
    onLogout();
  };

  // The "Professional Automation Script" that user can run in Cloudflare Console
  const automationScript = `(async () => {
  const accountId = window.location.pathname.split('/')[1];
  if (!accountId || accountId.length !== 32) return alert("Hata: Lütfen Cloudflare Dashboard ana sayfasındayken bu scripti çalıştırın.");
  
  const tokenName = "Cloudflare Pro Otomasyon (" + new Date().toLocaleDateString() + ")";
  console.log("%cOtomasyon Başlatılıyor...", "color: #f38020; font-size: 16px; font-weight: bold;");

  try {
    const response = await fetch(\`/api/v4/accounts/\${accountId}/tokens\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tokenName,
        policies: [{
          effect: "allow",
          resources: { [\`com.cloudflare.api.account.\${accountId}\`]: "*" },
          permission_groups: [
            { id: "f7f0ed34830045f38a68874391306328" }, // D1 Edit
            { id: "88267168dd0b40e3a6630559d4773487" }, // Workers Scripts Edit
            { id: "e12f9954487044d2858636839288f960" }, // Pages Edit
            { id: "c31030998906477f879680f6c0d90398" }, // Zone DNS Edit
            { id: "480f4f6954474879b7a2f9954487044d" }, // Account Settings Read
            { id: "82e64a6754474879b7a2f9954487044d" }  // Zone Read
          ]
        }]
      })
    });
    
    const data = await response.json();
    if (data.success) {
      const token = data.result.value;
      console.log("%cBAŞARILI! Token'ınız:", "color: #22c55e; font-weight: bold;");
      console.log("%c" + token, "background: #1e293b; color: #22c55e; padding: 10px; border-radius: 5px; font-family: monospace;");
      prompt("Token başarıyla oluşturuldu! Lütfen kopyalayın:", token);
    } else {
      alert("Hata: " + JSON.stringify(data.errors));
    }
  } catch (e) {
    alert("Bir hata oluştu. Cloudflare'e giriş yaptığınızdan emin olun.");
  }
})();`;

  const copyScript = () => {
    navigator.clipboard.writeText(automationScript);
    alert("Script kopyalandı! Şimdi Cloudflare sayfasında konsola yapıştırın.");
  };

  if (appInitializing) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[500px] h-[500px] bg-emerald-500/10 blur-[150px] rounded-full pointer-events-none animate-pulse" />
        </div>
        {isElectron && (
          <div className="absolute top-0 left-0 right-0 h-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between pl-4 pr-0 z-50" style={{ WebkitAppRegion: 'drag' } as any}>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded overflow-hidden relative flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 opacity-80" />
                <Cloud className="w-3 h-3 text-white relative z-10" />
              </div>
              <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200 tracking-wider">CLOUDFLARE OTOMASYON</span>
            </div>
            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-minimize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-maximize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Square className="w-3.5 h-3.5" /></button>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-close')} className="w-12 h-full hover:bg-red-500/80 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-20 h-20 mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl blur-xl opacity-40 animate-pulse" />
            <div className="relative w-full h-full bg-[#0a0a0a] border border-white/10 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-9 h-9 text-emerald-400 animate-spin" />
            </div>
          </div>
          <p className="text-sm text-[#94a3b8] animate-pulse">Oturum kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="h-screen bg-[#050505] text-white font-sans flex flex-col overflow-hidden selection:bg-emerald-500/30 relative">
        {/* Premium Arka Plan Efektleri */}
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/5 blur-[130px] rounded-full pointer-events-none" />

        {/* Windows Title Bar */}
        {isElectron && (
          <div className="h-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between pl-4 pr-0 shrink-0 z-50 relative" style={{ WebkitAppRegion: 'drag' } as any}>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded overflow-hidden relative flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 opacity-80" />
                <Cloud className="w-3 h-3 text-white relative z-10" />
              </div>
              <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200 tracking-wider">CLOUDFLARE OTOMASYON</span>
            </div>
            <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-minimize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-maximize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Square className="w-3.5 h-3.5" /></button>
              <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-close')} className="w-12 h-full hover:bg-red-500 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors group"><X className="w-4 h-4 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" /></button>
            </div>
          </div>
        )}

        {/* Loading Overlay for Wrangler Login */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-[#0d0d0d]/95 backdrop-blur-xl z-50 flex items-center justify-center"
              style={{ marginTop: isElectron ? '40px' : '0' }}
            >
              <div className="text-center space-y-8 relative">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] ${waitingForWrangler && !wranglerApproved ? 'bg-blue-500/15' : 'bg-emerald-500/15'} blur-[100px] rounded-full pointer-events-none animate-pulse`} />

                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="relative w-24 h-24 mx-auto"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${waitingForWrangler && !wranglerApproved ? 'from-blue-400 to-blue-600' : 'from-emerald-400 to-emerald-600'} rounded-3xl blur-xl opacity-50 animate-pulse`} />
                  <div className="relative w-full h-full bg-[#111] border border-white/10 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                    {waitingForWrangler && !wranglerApproved ? (
                      <Globe className="w-10 h-10 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse" />
                    ) : (
                      <Cloud className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)] animate-pulse" />
                    )}
                  </div>
                </motion.div>

                {waitingForWrangler ? (
                  wranglerApproved ? (
                    <div className="space-y-5 relative z-10 max-w-md mx-auto">
                      <div className="w-16 h-16 mx-auto bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                      </div>
                      <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-tight">Cloudflare Bağlantısı Onaylandı</h3>
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                        <p className="text-sm text-emerald-200 font-semibold">Hesap bilgileriniz ve Cloudflare verileriniz yükleniyor...</p>
                        <p className="text-xs text-emerald-300/60 mt-2">Bu işlem birkaç saniye sürebilir, lütfen bekleyiniz.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 relative z-10 max-w-md mx-auto">
                      <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">Tarayıcınızda Onay Bekleniyor</h3>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 space-y-3">
                        <p className="text-sm text-blue-200 font-semibold">Varsayılan tarayıcınızda açılan Cloudflare sayfasında:</p>
                        <div className="flex items-center gap-3 bg-blue-500/10 rounded-xl p-3">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0"><span className="text-blue-400 font-bold text-sm">1</span></div>
                          <p className="text-sm text-white/90 text-left"><strong>"Allow Wrangler access to your Cloudflare account?"</strong> mesajını göreceksiniz</p>
                        </div>
                        <div className="flex items-center gap-3 bg-blue-500/10 rounded-xl p-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0"><span className="text-emerald-400 font-bold text-sm">2</span></div>
                          <p className="text-sm text-white/90 text-left"><strong className="text-emerald-400">"Allow"</strong> butonuna basarak erişime izin verin</p>
                        </div>
                      </div>
                      <p className="text-xs text-blue-300 font-medium animate-pulse">(Tarayıcının açılması 5-10 saniye sürebilir, bekleyiniz...)</p>
                      <p className="text-xs text-[#64748b]">Onay verdikten sonra bu ekran otomatik olarak kapanacaktır...</p>
                      <button
                        disabled={cancelCountdown > 0}
                        onClick={() => { setWaitingForWrangler(false); setLoading(false); }}
                        className={`text-sm font-medium px-6 py-2.5 rounded-full transition-all mt-2 ${cancelCountdown > 0 ? 'text-[#475569] bg-white/5 cursor-not-allowed opacity-50' : 'text-[#64748b] hover:text-white bg-white/5 hover:bg-white/10'}`}
                      >
                        İptal Et {cancelCountdown > 0 ? `(${cancelCountdown}s)` : ''}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-2 relative z-10">
                    <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300 tracking-tight">Lütfen Bekleyin</h3>
                    <p className="text-sm text-[#94a3b8] font-medium animate-pulse">Bulut kaynaklarınız ve yetkileriniz doğrulanıyor...</p>
                  </div>
                )}

                <div className="w-64 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mx-auto border border-white/5 relative z-10 shadow-inner">
                  <motion.div
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className={`h-full w-1/2 bg-gradient-to-r from-transparent ${waitingForWrangler && !wranglerApproved ? 'via-blue-400' : 'via-emerald-400'} to-transparent`}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cloudflare Yetkisi Gerekli Full Screen */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-2xl"
          >
            <Card className="p-10 bg-[#111]/80 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden rounded-[2rem]">
              <div className="absolute top-[-250px] right-[-250px] w-[500px] h-[500px] bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute bottom-[-250px] left-[-250px] w-[500px] h-[500px] bg-gradient-to-tr from-emerald-500/20 to-transparent rounded-full blur-[120px] pointer-events-none" />

              <div className="relative z-10 w-full max-w-lg mx-auto py-6">
                <div className="relative w-24 h-24 mx-auto mb-8">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-emerald-400 rounded-3xl blur-xl opacity-40 animate-pulse" />
                  <div className="relative w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                    <Cloud className="w-12 h-12 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                  </div>
                </div>

                <h3 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300 tracking-tight mb-5">
                  Cloudflare Yetkisi Gerekli
                </h3>

                <p className="text-[#94a3b8] text-lg mb-4 leading-relaxed">
                  Web sitenizi kurmak ve yönetmek için Cloudflare hesabınızı bağlamanız gerekmektedir.
                </p>
                <p className="text-[#64748b] text-sm mb-10 leading-relaxed max-w-md mx-auto">
                  Pages, Workers, D1 ve DNS işlemleri için gerekli olan yetkileri almak üzere Cloudflare hesabınızı bağlayın. Tek seferlik bu işlemle tüm site kurulum ve yönetim süreçlerini otomatize edebilirsiniz.
                </p>

                <button
                  onClick={handleWranglerLogin}
                  disabled={loading}
                  className="group/btn relative inline-flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white font-extrabold text-lg transition-all disabled:opacity-50 overflow-hidden shadow-[0_0_40px_rgba(59,130,246,0.4)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)] hover:-translate-y-1 border border-white/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[100%] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Cloud className="w-6 h-6 drop-shadow-md" />}
                  Cloudflare Hesabını Bağla
                </button>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm font-bold text-red-400 leading-tight">{error}</p>
                  </motion.div>
                )}

                <div className="mt-10 pt-6 border-t border-white/5">
                  <button
                    onClick={onLogout}
                    className="inline-flex items-center gap-2 text-sm text-[#64748b] hover:text-red-400 transition-colors font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    Oturumu Kapat
                  </button>
                  <p className="text-[10px] text-[#475569] mt-2">{AUTH_DOMAIN} hesabından çıkış yaparsınız</p>
                </div>
              </div>
            </Card>

            <div className="flex items-center justify-center gap-4 mt-6 text-[10px] text-[#475569]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                <span>Güvenli Bağlantı</span>
              </div>
              <span>·</span>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                <span>Yerel İşlem</span>
              </div>
              <span>·</span>
              <span>{AUTH_DOMAIN}</span>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050505] text-white font-sans flex flex-col overflow-hidden selection:bg-emerald-500/30 relative">
      {/* Premium Arka Plan Efektleri */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-500/5 blur-[130px] rounded-full pointer-events-none" />

      {/* Windows Uyumlu Özel Premium Title Bar */}
      {isElectron && (
        <div className="h-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between pl-4 pr-0 shrink-0 z-50 relative" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded overflow-hidden relative flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-blue-500 opacity-80" />
              <Cloud className="w-3 h-3 text-white relative z-10" />
            </div>
            <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200 tracking-wider">CLOUDFLARE OTOMASYON</span>
          </div>
          <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={() => (window as any).require('electron').ipcRenderer.send('window-minimize')}
              className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => (window as any).require('electron').ipcRenderer.send('window-maximize')}
              className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => (window as any).require('electron').ipcRenderer.send('window-close')}
              className="w-12 h-full hover:bg-red-500 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors group"
            >
              <X className="w-4 h-4 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Premium Sidebar */}
        <aside className="w-20 lg:w-64 border-r border-white/5 bg-[#111]/40 backdrop-blur-xl flex flex-col shrink-0 transition-all duration-300 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none opacity-50" />

          <div className="p-5 mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-700 p-[1px] rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                <div className="w-full h-full bg-[#111] rounded-xl flex items-center justify-center">
                  <Cloud className="text-emerald-400 w-5 h-5 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                </div>
              </div>
              <div className="hidden lg:block overflow-hidden">
                <h1 className="font-bold text-sm tracking-tight text-white/90 truncate">Kontrol Paneli</h1>
                <p className="text-[10px] text-emerald-500/80 font-medium tracking-wider uppercase">{AUTH_DOMAIN}</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1 relative z-10">
            <SidebarItem
              icon={<Activity className="w-5 h-5" />}
              label="Genel Bakış"
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            />
            <SidebarItem
              icon={<Zap className="w-5 h-5" />}
              label="Site Kurulum"
              active={activeTab === 'deploy'}
              onClick={() => setActiveTab('deploy')}
            />
            <SidebarItem
              icon={<Globe className="w-5 h-5" />}
              label="Pages Projeleri"
              active={activeTab === 'pages'}
              onClick={() => setActiveTab('pages')}
            />
            <SidebarItem
              icon={<Link className="w-5 h-5" />}
              label="Domain Yönetimi"
              active={activeTab === 'domains'}
              onClick={() => setActiveTab('domains')}
            />
            <SidebarItem
              icon={<Database className="w-5 h-5" />}
              label="D1 Veritabanları"
              active={activeTab === 'd1'}
              onClick={() => setActiveTab('d1')}
            />
            <SidebarItem
              icon={<Info className="w-5 h-5" />}
              label="Hakkında"
              active={activeTab === 'about'}
              onClick={() => setActiveTab('about')}
            />
          </nav>

          <div className="px-4 pb-2 relative z-10">
            <div className="flex items-center justify-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="text-[10px] font-mono font-bold text-emerald-400">v{__APP_VERSION__}</span>
            </div>
          </div>
          <div className="p-4 border-t border-white/5 relative z-10">
            <div className="flex items-center gap-3 px-2 py-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all cursor-pointer group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shrink-0 shadow-inner group-hover:border-emerald-500/50 transition-colors">
                <span className="text-sm font-bold text-emerald-400 drop-shadow-md">{user?.displayName?.charAt(0)?.toUpperCase() || accounts[0]?.name?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
              <div className="hidden lg:block flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-white/90 truncate group-hover:text-white transition-colors">{accounts[0]?.name || user?.displayName || 'Cloudflare Bağlanmadı'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${authStatus?.wrangler?.authenticated ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'}`} />
                  <p className={`text-[10px] uppercase tracking-wider font-semibold truncate ${authStatus?.wrangler?.authenticated ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>{authStatus?.wrangler?.authenticated ? 'Aktif' : 'Kurulum Bekleniyor'}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="hidden lg:flex p-2 rounded-xl text-gray-500 hover:text-white hover:bg-red-500/80 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-all"
                title="Çıkış"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0d0d0d]">
          {/* Top Bar - Desktop Style */}
          <header className="h-14 border-b border-[#2a2a2a]/60 bg-[#0d0d0d] px-8 flex items-center justify-between shrink-0 z-10">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-200">
                {activeTab === 'overview' ? 'Genel Bakış' :
                  activeTab === 'pages' ? 'Pages Projeleri' :
                    activeTab === 'd1' ? 'D1 Veritabanları' :
                      activeTab === 'domains' ? 'Domain Yönetimi' :
                        activeTab === 'deploy' ? 'Site Kurulumu' :
                          activeTab === 'about' ? 'Hakkında' : activeTab}
              </h2>
              <span className="text-xs text-gray-600">/</span>
              <span className="text-xs text-gray-500">Cloudflare</span>
            </div>

            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 text-[10px] font-medium px-3 py-1.5 rounded-md border ${authStatus?.wrangler.authenticated ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-200 bg-amber-500/10 border-amber-500/20'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${authStatus?.wrangler.authenticated ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {authStatus?.wrangler.authenticated ? 'Wrangler Bağlı' : 'Kurulum bekleniyor'}
              </div>
            </div>
          </header>

          {/* Scrollable Content */}
          <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {/* Full Screen Loading Overlay */}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-[#0d0d0d]/95 backdrop-blur-xl z-50 flex items-center justify-center"
                  style={{ marginTop: isElectron ? '32px' : '0' }}
                >
                  <div className="text-center space-y-8 relative">
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] ${waitingForWrangler && !wranglerApproved ? 'bg-blue-500/15' : 'bg-emerald-500/15'} blur-[100px] rounded-full pointer-events-none animate-pulse`} />

                    {/* Animated Logo */}
                    <motion.div
                      animate={{
                        scale: [1, 1.05, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="relative w-24 h-24 mx-auto"
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${waitingForWrangler && !wranglerApproved ? 'from-blue-400 to-blue-600' : 'from-emerald-400 to-emerald-600'} rounded-3xl blur-xl opacity-50 animate-pulse`} />
                      <div className="relative w-full h-full bg-[#111] border border-white/10 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                        {waitingForWrangler && !wranglerApproved ? (
                          <Globe className="w-10 h-10 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse" />
                        ) : (
                          <Cloud className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)] animate-pulse" />
                        )}
                      </div>
                    </motion.div>

                    {/* Loading Text - Different states: waiting for browser approval / approved & loading / general loading */}
                    {waitingForWrangler ? (
                      wranglerApproved ? (
                        /* Onay alındı - veriler yükleniyor ekranı */
                        <div className="space-y-5 relative z-10 max-w-md mx-auto">
                          <div className="w-16 h-16 mx-auto bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                          </div>
                          <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-tight">
                            Cloudflare Bağlantısı Onaylandı
                          </h3>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                            <p className="text-sm text-emerald-200 font-semibold">
                              Hesap bilgileriniz ve Cloudflare verileriniz yükleniyor...
                            </p>
                            <p className="text-xs text-emerald-300/60 mt-2">
                              Bu işlem birkaç saniye sürebilir, lütfen bekleyiniz.
                            </p>
                          </div>
                        </div>
                      ) : (
                        /* Tarayıcıda onay bekleniyor ekranı */
                        <div className="space-y-4 relative z-10 max-w-md mx-auto">
                          <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
                            Tarayıcınızda Onay Bekleniyor
                          </h3>
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 space-y-3">
                            <p className="text-sm text-blue-200 font-semibold">
                              Varsayılan tarayıcınızda açılan Cloudflare sayfasında:
                            </p>
                            <div className="flex items-center gap-3 bg-blue-500/10 rounded-xl p-3">
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-400 font-bold text-sm">1</span>
                              </div>
                              <p className="text-sm text-white/90 text-left">
                                <strong>"Allow Wrangler access to your Cloudflare account?"</strong> mesajını göreceksiniz
                              </p>
                            </div>
                            <div className="flex items-center gap-3 bg-blue-500/10 rounded-xl p-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-emerald-400 font-bold text-sm">2</span>
                              </div>
                              <p className="text-sm text-white/90 text-left">
                                <strong className="text-emerald-400">"Allow"</strong> butonuna basarak erişime izin verin
                              </p>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-blue-300 font-medium animate-pulse">
                              (Tarayıcının açılması yetki token'ının üretilmesine bağlı olarak 5-10 saniye sürebilir, bekleyiniz...)
                            </p>
                            <p className="text-xs text-[#64748b]">
                              Onay verdikten sonra bu ekran otomatik olarak kapanacaktır...
                            </p>
                          </div>
                          <button
                            disabled={cancelCountdown > 0}
                            onClick={() => {
                              setWaitingForWrangler(false);
                              setLoading(false);
                            }}
                            className={`text-sm font-medium px-6 py-2.5 rounded-full transition-all mt-2 ${cancelCountdown > 0
                              ? 'text-[#475569] bg-white/5 cursor-not-allowed opacity-50'
                              : 'text-[#64748b] hover:text-white bg-white/5 hover:bg-white/10'
                              }`}
                          >
                            İptal Et {cancelCountdown > 0 ? `(${cancelCountdown}s)` : ''}
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="space-y-2 relative z-10">
                        <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300 tracking-tight">
                          Lütfen Bekleyin
                        </h3>
                        <p className="text-sm text-[#94a3b8] font-medium animate-pulse">
                          Bulut kaynaklarınız ve yetkileriniz doğrulanıyor...
                        </p>
                      </div>
                    )}

                    {/* Premium Progress Bar */}
                    <div className="w-64 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden mx-auto border border-white/5 relative z-10 shadow-inner">
                      <motion.div
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className={`h-full w-1/2 bg-gradient-to-r from-transparent ${waitingForWrangler && !wranglerApproved ? 'via-blue-400' : 'via-emerald-400'} to-transparent shadow-[0_0_10px_${waitingForWrangler && !wranglerApproved ? 'rgba(59,130,246,0.8)' : 'rgba(52,211,153,0.8)'}]`}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-w-6xl mx-auto">
              <AnimatePresence mode="wait">
                {activeTab === 'overview' && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-8"
                  >
                    {/* Dynamic Auth & Setup Cards */}
                    <div className="space-y-8">
                      {/* Compact Auth Success or Big Connect Card */}
                      {authStatus?.wrangler?.authenticated ? (
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-6 py-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_30px_rgba(52,211,153,0.15)] backdrop-blur-xl transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex flex-shrink-0 items-center justify-center border border-emerald-500/30">
                              <CheckCircle2 className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                            </div>
                            <div>
                              <p className="text-sm font-bold tracking-wider text-emerald-400 uppercase">CloudFlare Bağlantısı Doğrulandı</p>
                              <p className="text-lg font-bold text-white mt-0.5">{authStatus.wrangler.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 w-full md:w-auto">
                            <div className="hidden lg:flex gap-3 pr-6 border-r border-emerald-500/20">
                              {['Pages', 'D1', 'DNS', 'Workers'].map(perm => (
                                <span key={perm} className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-300 shadow-inner">
                                  {perm}
                                </span>
                              ))}
                            </div>
                            <button
                              onClick={() => {
                                setShowConfirmDialog({
                                  show: true,
                                  title: 'Wrangler Bağlantısını Kes',
                                  message: 'Wrangler yetkisi kaldırılacak. Tekrar giriş yapmanız gerekecek. Devam etmek istiyor musunuz?',
                                  type: 'danger',
                                  onConfirm: async () => {
                                    try {
                                      await fetch('/api/cloudflare/wrangler-logout', { method: 'DELETE' });
                                      resetAllState();
                                      setShowSuccessToast({ show: true, message: 'Bağlantı kesildi' });
                                      setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
                                    } catch (e) { }
                                    setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' });
                                  }
                                });
                              }}
                              className="ml-auto md:ml-0 px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] hover:text-white text-xs font-bold transition-all"
                            >
                              Bağlantıyı Kes
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Card className="p-10 bg-[#111]/80 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center justify-center text-center relative overflow-hidden rounded-[2rem]">
                          <div className="absolute top-[-250px] right-[-250px] w-[500px] h-[500px] bg-gradient-to-br from-blue-500/20 to-emerald-500/20 rounded-full blur-[120px] pointer-events-none" />
                          <div className="absolute bottom-[-250px] left-[-250px] w-[500px] h-[500px] bg-gradient-to-tr from-emerald-500/20 to-transparent rounded-full blur-[120px] pointer-events-none" />

                          <div className="relative z-10 w-full max-w-2xl mx-auto py-8">
                            <div className="relative w-24 h-24 mx-auto mb-8">
                              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-emerald-400 rounded-3xl blur-xl opacity-40 animate-pulse" />
                              <div className="relative w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] border border-white/10 rounded-3xl flex items-center justify-center shadow-inner overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-50" />
                                <Cloud className="w-12 h-12 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                              </div>
                            </div>

                            <h3 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300 tracking-tight mb-5">
                              Cloudflare Yetkisi Gerekli
                            </h3>

                            <p className="text-[#94a3b8] text-lg mb-10 leading-relaxed max-w-lg mx-auto">
                              Pages, Workers, D1 ve DNS işlemleri için gerekli olan yetkileri almak üzere Cloudflare hesabınızı bağlayın. Tek seferlik bu işlemle tüm kurulumları otomatize edebilirsiniz.
                            </p>

                            <button
                              onClick={handleWranglerLogin}
                              disabled={loading}
                              className="group/btn relative inline-flex items-center justify-center gap-3 w-full sm:w-auto px-10 py-5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white font-extrabold text-lg transition-all disabled:opacity-50 overflow-hidden shadow-[0_0_40px_rgba(59,130,246,0.4)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)] hover:-translate-y-1 border border-white/20"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[100%] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Cloud className="w-6 h-6 drop-shadow-md" />}
                              Hesabı Bağla ve Devam Et
                            </button>
                          </div>
                        </Card>
                      )}

                      {/* Setup Ready Big Card - Visible mostly when authenticated and no deployed site exists */}
                      {authStatus?.wrangler?.authenticated && !lastDeployedSite && (
                        <Card className="p-8 bg-[#111]/40 backdrop-blur-xl border border-white/5 shadow-2xl shadow-black/50 overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />
                          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-[80px] pointer-events-none" />

                          <div className="flex flex-col items-center justify-center text-center relative z-10 py-10">
                            <div className="w-24 h-24 bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 rounded-full flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                              <Zap className="w-12 h-12 text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                            </div>
                            <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 tracking-tight mb-4">Her Şey Hazır!</h3>
                            <p className="text-[#94a3b8] max-w-lg mb-8 leading-relaxed text-lg">Wrangler bağlantısı başarıyla tamamlandı. Artık sadece bir şablon seçerek yeni sitenizin kurulumunu saniyeler içinde başlatabilirsiniz.</p>

                            <button
                              onClick={() => setActiveTab('deploy')}
                              disabled={!canStartDeployment}
                              className="group/btn relative inline-flex items-center gap-3 px-10 py-5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xl transition-all disabled:opacity-50 overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:shadow-[0_0_50px_rgba(245,158,11,0.6)] hover:-translate-y-1"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[100%] group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                              <Zap className="w-6 h-6 drop-shadow-md" />
                              Kuruluma Geç
                            </button>
                          </div>
                        </Card>
                      )}
                    </div>

                    {/* Last Deployed Site Card */}
                    {authStatus?.wrangler?.authenticated && (
                      lastDeployedSite ? (
                        <Card className="p-8 bg-[#111]/40 backdrop-blur-xl border border-white/5 shadow-2xl shadow-black/50 overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none" />
                          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
                          <div className="relative z-10">
                            <div className="flex items-start justify-between mb-8">
                              <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                                  <CheckCircle2 className="w-7 h-7 text-green-400 drop-shadow-[0_0_5px_rgba(34,197,94,0.8)]" />
                                </div>
                                <div>
                                  <h3 className="text-xl font-bold text-white tracking-tight">Son Kurulan Site</h3>
                                  <p className="text-sm text-green-400/80 font-medium mt-1">
                                    {new Date(lastDeployedSite.timestamp).toLocaleString('tr-TR')}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setShowConfirmDialog({
                                    show: true,
                                    title: 'Bilgiyi Sil',
                                    message: 'Son kurulan site bilgisini silmek istediğinizden emin misiniz?',
                                    type: 'warning',
                                    onConfirm: () => {
                                      setLastDeployedSite(null);
                                      localStorage.removeItem('lastDeployedSite');
                                      setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' });
                                    }
                                  });
                                }}
                                className="p-3 bg-red-500/10 hover:bg-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-red-500/20 hover:border-transparent rounded-xl text-red-400 hover:text-white transition-all group"
                              >
                                <AlertCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-black/30 p-6 rounded-3xl border border-white/5 mb-8">
                              <div className="space-y-3">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest pl-1">Proje Adı</p>
                                <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl">
                                  <p className="text-lg font-bold text-white">{lastDeployedSite.name}</p>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest pl-1">Site URL</p>
                                <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl flex items-center">
                                  <button
                                    onClick={() => {
                                      if (ipcRenderer) {
                                        ipcRenderer.send('open-external', lastDeployedSite.url);
                                      } else {
                                        window.open(lastDeployedSite.url, '_blank');
                                      }
                                    }}
                                    className="group/link text-lg font-mono text-green-400 hover:text-green-300 transition-colors flex items-center gap-3 w-full"
                                  >
                                    {lastDeployedSite.url.replace('https://', '')}
                                    <ExternalLink className="w-4 h-4 ml-auto opacity-50 group-hover/link:opacity-100 group-hover/link:translate-x-1 group-hover/link:-translate-y-1 transition-all" />
                                  </button>
                                </div>
                              </div>
                              {lastDeployedSite.database && (
                                <div className="space-y-3 md:col-span-2">
                                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest pl-1">Bağlı Veritabanı</p>
                                  <div className="px-4 py-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl flex items-center gap-3">
                                    <Database className="w-4 h-4 text-blue-400" />
                                    <p className="text-sm font-mono text-gray-300">{lastDeployedSite.database}</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Quick Links for Law Firm Site */}
                            <div className="mb-6 p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                              <p className="text-xs text-gray-500 font-bold uppercase mb-3">Hızlı Erişim</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <button
                                  onClick={() => {
                                    const adminUrl = `${lastDeployedSite.url}/admin`;
                                    if (ipcRenderer) {
                                      ipcRenderer.send('open-external', adminUrl);
                                    } else {
                                      window.open(adminUrl, '_blank');
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-500 text-xs font-bold transition-all border border-blue-500/20 hover:border-blue-500/40"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Admin Panel
                                </button>
                                <button
                                  onClick={() => {
                                    const setupUrl = `${lastDeployedSite.url}/admin/setup`;
                                    if (ipcRenderer) {
                                      ipcRenderer.send('open-external', setupUrl);
                                    } else {
                                      window.open(setupUrl, '_blank');
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-500 text-xs font-bold transition-all border border-emerald-500/20 hover:border-emerald-500/40"
                                >
                                  <Server className="w-4 h-4" />
                                  İlk Kurulum
                                </button>
                                <button
                                  onClick={() => {
                                    const contactUrl = `${lastDeployedSite.url}/iletisim`;
                                    if (ipcRenderer) {
                                      ipcRenderer.send('open-external', contactUrl);
                                    } else {
                                      window.open(contactUrl, '_blank');
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg text-emerald-500 text-xs font-bold transition-all border border-emerald-500/20 hover:border-emerald-500/40"
                                >
                                  <Globe className="w-4 h-4" />
                                  İletişim Sayfası
                                </button>
                                {lastDeployedSite.database && (
                                  <button
                                    onClick={openPasswordReset}
                                    className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg text-amber-500 text-xs font-bold transition-all border border-amber-500/20 hover:border-amber-500/40"
                                  >
                                    <Lock className="w-4 h-4" />
                                    Şifre Sıfırla
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Custom Domains for this project */}
                            {(() => {
                              const project = pages.find(p => p.name === lastDeployedSite.name);
                              if (project?.customDomains && project.customDomains.length > 0) {
                                return (
                                  <div className="mb-6 p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-3">Özel Domainler</p>
                                    <div className="flex flex-wrap gap-2">
                                      {project.customDomains.map((domain, idx) => (
                                        <div
                                          key={idx}
                                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${domain.status === 'active'
                                            ? 'bg-green-500/10 border-green-500/20'
                                            : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                              ? 'bg-yellow-500/10 border-yellow-500/20'
                                              : 'bg-red-500/10 border-red-500/20'
                                            }`}
                                        >
                                          {domain.status === 'active' ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                          ) : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration' ? (
                                            <Loader2 className="w-3.5 h-3.5 text-yellow-500 animate-spin" />
                                          ) : (
                                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                          )}
                                          <span className={`text-xs font-bold ${domain.status === 'active'
                                            ? 'text-green-500'
                                            : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                              ? 'text-yellow-500'
                                              : 'text-red-500'
                                            }`}>
                                            {domain.name}
                                          </span>
                                          {(domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration') && (
                                            <span className="text-[9px] text-yellow-600 ml-1">
                                              ({domain.status === 'initializing' ? 'Başlatılıyor' :
                                                domain.status === 'pending_migration' ? 'Taşınıyor' : 'Doğrulanıyor'})
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => {
                                  setNewDomainData({ domain: '', projectName: lastDeployedSite.name });
                                  setShowAddDomainModal(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-emerald-500 text-sm font-bold transition-all border border-emerald-500/20 hover:border-emerald-500/40"
                              >
                                <Link className="w-4 h-4" />
                                Özel Domain Ekle
                              </button>
                              <button
                                onClick={() => {
                                  if (ipcRenderer) {
                                    ipcRenderer.send('open-external', lastDeployedSite.url);
                                  } else {
                                    window.open(lastDeployedSite.url, '_blank');
                                  }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 rounded-xl text-green-500 text-sm font-bold transition-all border border-green-500/20 hover:border-green-500/40"
                              >
                                <ExternalLink className="w-4 h-4" />
                                Siteyi Ziyaret Et
                              </button>
                              {ipcRenderer && (
                                <button
                                  onClick={() => {
                                    if (ipcRenderer) {
                                      ipcRenderer.send('open-external', lastDeployedSite.url);
                                    }
                                    setShowConfirmDialog({
                                      show: true,
                                      title: 'DNS Ayar Bilgilendirmesi',
                                      message: "Açılan web siteniz ('dev' uzantısından kaynaklı) DNS hatası veriyorsa, bilgisayarınızın ağ ayarlarından DNS sunucunuzu Cloudflare DNS (1.1.1.1 ve 1.0.0.1) olarak değiştirmeniz gerekebilir.\n\nBu işlemi manuel yapmak sitenizin güvenli ve sorunsuz açılmasını sağlayacaktır.",
                                      type: 'info',
                                      onConfirm: () => {
                                        setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' });
                                      }
                                    });
                                  }}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-500 text-sm font-bold transition-all border border-amber-500/20 hover:border-amber-500/40"
                                >
                                  <Shield className="w-4 h-4" />
                                  Site Açılmıyor mu? DNS Sorunu
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  setShowConfirmDialog({
                                    show: true,
                                    title: 'Projeyi Sil',
                                    message: `${lastDeployedSite.name} projesini ve ${lastDeployedSite.database} veritabanını silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!`,
                                    type: 'danger',
                                    onConfirm: async () => {
                                      setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' });
                                      setActionLoading('delete-project');
                                      try {
                                        // Step 1: Delete all custom domains + DNS records first
                                        const project = pages.find(p => p.name === lastDeployedSite.name);
                                        let dnsCleanupOk = true;
                                        if (project?.customDomains && project.customDomains.length > 0) {
                                          for (const domain of project.customDomains) {
                                            try {
                                              const domainRes = await fetch(`/api/cloudflare/${selectedAccount}/pages/${lastDeployedSite.name}/domains/${domain.name}`, {
                                                method: 'DELETE',
                                                headers: { 'Authorization': `Bearer ${token}` }
                                              });
                                              const domainResult = await domainRes.json();
                                              console.log(`Domain ${domain.name} silindi:`, domainResult);
                                              if (domainResult.dnsError) {
                                                console.warn(`DNS kaydı silinemedi: ${domainResult.dnsError}`);
                                                dnsCleanupOk = false;
                                              }
                                            } catch (domainErr) {
                                              console.warn(`Failed to delete domain ${domain.name}:`, domainErr);
                                              dnsCleanupOk = false;
                                            }
                                          }
                                          // Wait a bit for domain deletions to propagate
                                          await new Promise(resolve => setTimeout(resolve, 2000));
                                        }

                                        // Step 2: Delete Pages project
                                        const pagesRes = await fetch(`/api/cloudflare/${selectedAccount}/pages/${lastDeployedSite.name}`, {
                                          method: 'DELETE',
                                          headers: { 'Authorization': `Bearer ${token}` }
                                        });

                                        if (!pagesRes.ok) {
                                          const errorData = await pagesRes.json();
                                          throw new Error(errorData.error || 'Pages projesi silinemedi');
                                        }

                                        // Step 3: Delete D1 database if exists
                                        let dbDeleted = false;
                                        if (lastDeployedSite.database) {
                                          const dbName = lastDeployedSite.database;
                                          try {
                                            // Send database name directly - wrangler d1 delete requires name, not UUID
                                            const dbRes = await fetch(`/api/cloudflare/${selectedAccount}/d1/${encodeURIComponent(dbName)}`, {
                                              method: 'DELETE',
                                              headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            if (dbRes.ok) {
                                              dbDeleted = true;
                                              console.log(`D1 veritabanı silindi: ${dbName}`);
                                            } else {
                                              const errText = await dbRes.text();
                                              console.warn('D1 veritabanı silinemedi:', errText);
                                            }
                                          } catch (dbErr) {
                                            console.warn('D1 silme hatası:', dbErr);
                                          }
                                        }

                                        // Build result message
                                        let resultMsg = '✅ Proje silindi';
                                        if (lastDeployedSite.database) {
                                          resultMsg += dbDeleted ? ', veritabanı silindi' : ', veritabanı silinemedi';
                                        }
                                        if (project?.customDomains && project.customDomains.length > 0) {
                                          resultMsg += dnsCleanupOk ? ', DNS kayıtları temizlendi' : ', DNS kayıtları temizlenemedi';
                                        }

                                        setShowSuccessToast({ show: true, message: resultMsg });
                                        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 5000);

                                        // Clear last deployed site
                                        setLastDeployedSite(null);
                                        localStorage.removeItem('lastDeployedSite');

                                        // Refresh resources
                                        await fetchResources();
                                      } catch (err: any) {
                                        setShowSuccessToast({ show: true, message: 'Silme işlemi başarısız: ' + err.message });
                                        setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
                                      } finally {
                                        setActionLoading(null);
                                      }
                                    }
                                  });
                                }}
                                disabled={actionLoading === 'delete-project'}
                                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-red-500 text-sm font-bold transition-all border border-red-500/20 hover:border-red-500/40 disabled:opacity-50"
                              >
                                {actionLoading === 'delete-project' ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Siliniyor...
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-4 h-4" />
                                    Projeyi Sil
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </Card>
                      ) : (
                        <Card className="p-8 bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
                          <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto">
                              <Info className="w-8 h-8 text-blue-500" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-gray-200">Henüz Site Kurulmadı</h3>
                              <p className="text-sm text-gray-400">
                                İlk sitenizi kurmak için "Site Kur" sekmesine gidin ve bir şablon seçin
                              </p>
                            </div>
                            <Button onClick={() => setActiveTab('overview')} variant="secondary">
                              <Zap className="w-4 h-4" />
                              İlk Siteyi Kur
                            </Button>
                          </div>
                        </Card>
                      )
                    )}

                    {/* Bento Grid Stats */}
                    {authStatus?.wrangler?.authenticated && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard
                          icon={<Globe className="w-5 h-5 text-blue-500" />}
                          label="Pages Projeleri"
                          value={pages.length}
                          color="blue"
                        />
                        <StatCard
                          icon={<Database className="w-5 h-5 text-emerald-500" />}
                          label="D1 Databases"
                          value={d1Databases.length}
                          color="purple"
                        />
                        <StatCard
                          icon={<Link className="w-5 h-5 text-green-500" />}
                          label="Özel Domainler"
                          value={pages.reduce((acc, p) => acc + (p.customDomains?.length || 0), 0)}
                          color="green"
                        />
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'pages' && (
                  <motion.div
                    key="pages"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-6 relative"
                  >
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 relative z-10">
                      <div>
                        <h2 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300">Pages Yönetimi</h2>
                        <p className="text-sm text-gray-500 mt-1">Cloudflare Pages projelerinizi profesyonelce yönetin</p>
                      </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-1">Mevcut Projeler ({resourcesLoading && !resourcesInitialized ? '...' : pages.length})</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {resourcesLoading && pages.length === 0 && (
                          <Card className="p-8 bg-[#1a1a1a] border-[#2a2a2a]">
                            <div className="flex items-center gap-3 text-gray-400">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <div>
                                <p className="text-sm font-bold">Pages projeleri yükleniyor...</p>
                                <p className="text-xs text-gray-500 mt-1">Cloudflare API'den güncel liste alınıyor.</p>
                              </div>
                            </div>
                          </Card>
                        )}

                        {!resourcesLoading && resourcesInitialized && pages.length === 0 && (
                          <Card className="p-8 bg-[#1a1a1a] border-[#2a2a2a]">
                            <div className="text-center space-y-3">
                              <p className="text-sm font-bold text-gray-300">Henüz proje listesi alınamadı</p>
                              <p className="text-xs text-gray-500">Cloudflare'den veri gelmesi birkaç saniye sürebilir.</p>
                              <button
                                onClick={fetchResources}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-emerald-500 text-xs font-bold transition-all border border-emerald-500/20"
                              >
                                <Loader2 className="w-4 h-4" />
                                Tekrar Dene
                              </button>
                            </div>
                          </Card>
                        )}

                        {pages.map((project, index) => (
                          <Card key={project.name || index} className="relative p-6 transition-all group bg-[#111]/80 backdrop-blur-xl border border-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(52,211,153,0.15)] rounded-2xl overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-14 h-14 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-xl flex items-center justify-center border border-white/10 shadow-inner group-hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
                                    <Globe className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-lg text-gray-100 tracking-tight">{project.name}</h4>
                                    <p className="text-[11px] text-[#94a3b8] font-mono mt-0.5">{project.subdomain}</p>
                                    {project.customDomains && project.customDomains.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        {project.customDomains.map((domain, idx) => (
                                          <div
                                            key={idx}
                                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${domain.status === 'active'
                                              ? 'bg-green-500/10 border-green-500/20'
                                              : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                                ? 'bg-yellow-500/10 border-yellow-500/20'
                                                : 'bg-red-500/10 border-red-500/20'
                                              }`}
                                          >
                                            {domain.status === 'active' ? (
                                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                                            ) : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration' ? (
                                              <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
                                            ) : (
                                              <AlertCircle className="w-3 h-3 text-red-500" />
                                            )}
                                            <span className={`text-[10px] font-bold ${domain.status === 'active'
                                              ? 'text-green-500'
                                              : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                                ? 'text-yellow-500'
                                                : 'text-red-500'
                                              }`}>
                                              {domain.name}
                                            </span>
                                            {(domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration') && (
                                              <span className="text-[8px] text-yellow-600 ml-1">
                                                {domain.status === 'initializing' ? 'Başlatılıyor' :
                                                  domain.status === 'pending_migration' ? 'Taşınıyor' : 'Doğrulanıyor'}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <a
                                  href={`https://${project.customDomains && project.customDomains.length > 0 && project.customDomains[0].status === 'active' ? project.customDomains[0].name : project.subdomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2.5 bg-[#1a1a1a] hover:bg-emerald-500/10 rounded-xl text-gray-500 hover:text-emerald-500 transition-all border border-[#2a2a2a]"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>

                              <div className="pt-3 border-t border-white/10">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDomainModalData({ open: true, projectName: project.name });
                                  }}
                                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-transparent hover:from-purple-500/20 rounded-xl transition-all border border-purple-500/20 hover:border-purple-500/40 group/btn shadow-[0_0_10px_rgba(168,85,247,0.1)] hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center shadow-inner">
                                      <Link className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div className="text-left">
                                      <p className="text-sm font-bold text-gray-200 group-hover/btn:text-white transition-colors">
                                        {project.customDomains && project.customDomains.length > 0 ? 'Başka Domain Ekle' : 'Özel Domain Ekle'}
                                      </p>
                                      <p className="text-[10px] text-gray-400">Cloudflare'de kayıtlı domaininizi bağlayın</p>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-purple-400 group-hover/btn:translate-x-1 transition-transform" />
                                </button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'd1' && (
                  <motion.div
                    key="d1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8 relative"
                  >
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-500/10 blur-[100px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 relative z-10">
                      <div>
                        <h2 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300">D1 Veritabanları</h2>
                        <p className="text-sm text-gray-500 mt-1">Gelişmiş SQL veritabanlarınızı görüntüleyin</p>
                      </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-1">Mevcut veritabanları ({d1Databases.length})</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {d1Databases.map(db => (
                          <Card key={db.uuid} className="relative p-5 transition-all group bg-[#111]/80 backdrop-blur-xl border border-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_30px_rgba(52,211,153,0.15)] rounded-2xl overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-xl flex items-center justify-center border border-white/10 shadow-inner group-hover:shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all">
                                  <Database className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                                </div>
                                <div>
                                  <h4 className="font-extrabold text-lg text-gray-100 tracking-tight">{db.name}</h4>
                                  <p className="text-xs text-[#94a3b8] font-mono mt-0.5">{db.uuid}</p>
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'domains' && (
                  <motion.div
                    key="domains"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8 relative"
                  >
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between mb-6 relative z-10">
                      <div>
                        <h2 className="text-2xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-300">Domain Yönetimi</h2>
                        <p className="text-sm text-gray-500 mt-1">Özel alan adlarınızı bağlayın ve yapılandırın</p>
                      </div>
                      <Button
                        onClick={() => setShowAddDomainModal(true)}
                        className="flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Domain Ekle
                      </Button>
                    </div>

                    {/* Info Card */}
                    <Card className="relative p-6 transition-all group bg-[#111]/80 backdrop-blur-xl border border-blue-500/20 shadow-inner z-10 overflow-hidden rounded-2xl">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent pointer-events-none" />
                      <div className="relative flex items-start gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-transparent rounded-xl flex items-center justify-center shrink-0 border border-blue-500/30">
                          <Info className="w-7 h-7 text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-2 text-gray-100">Özel Domain Nasıl Eklenir?</h3>
                          <div className="space-y-2 text-sm text-[#94a3b8]">
                            <p>1. Domaininiz Cloudflare'de kayıtlı olmalı (Nameserver'lar yönlendirilmiş)</p>
                            <p>2. "Domain Ekle" butonuna tıklayın, ilgili projeyi seçin</p>
                            <p>3. Cloudflare Pages paneline yönlendirileceksiniz, "Custom domains" sekmesinden domaininizi ekleyin</p>
                            <p className="text-xs text-amber-400/70 mt-1">DNS yapılandırması güvenlik nedeniyle doğrudan Cloudflare panelinden yapılmaktadır.</p>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Cloudflare'deki Tüm Domainler */}
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-1">
                        Cloudflare Domainler ({zones.length})
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                        {zones.map((zone) => {
                          // Bu domain hangi Projeye Bağla?
                          const connectedProject = pages.find(p =>
                            p.customDomains?.some(d => d.name === zone.name)
                          );
                          const domainInfo = connectedProject?.customDomains?.find(d => d.name === zone.name);

                          return (
                            <Card key={zone.id} className="relative p-6 transition-all group bg-[#111]/80 backdrop-blur-xl border border-white/10 hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] rounded-2xl overflow-hidden z-10">
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center border shadow-inner transition-all group-hover:scale-105 ${zone.status === 'active'
                                    ? 'bg-gradient-to-br from-blue-500/20 to-[#0a0a0a] border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                    : 'bg-gradient-to-br from-gray-500/10 to-[#0a0a0a] border-gray-500/20 text-gray-500'
                                    }`}>
                                    <Globe className="w-7 h-7" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                      <h4 className="font-extrabold text-xl text-gray-100 tracking-tight">{zone.name}</h4>
                                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${zone.status === 'active'
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                                        : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                                        }`}>
                                        {zone.status === 'active' ? 'CLOUDFLARE AKTİF' : zone.status.toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {connectedProject ? (
                                        <>
                                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                                          <p className="text-xs text-gray-500">
                                            Bağlı Proje: <span className="font-mono text-green-400">{connectedProject.name}</span>
                                          </p>
                                          {domainInfo && (
                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ml-2 ${domainInfo.status === 'active'
                                              ? 'bg-green-500/10 text-green-500'
                                              : domainInfo.status === 'pending' || domainInfo.status === 'initializing' || domainInfo.status === 'pending_migration'
                                                ? 'bg-yellow-500/10 text-yellow-500'
                                                : 'bg-red-500/10 text-red-500'
                                              }`}>
                                              {domainInfo.status === 'active' ? '✓ Yayında' :
                                                domainInfo.status === 'initializing' ? '⏳ Başlatılıyor' :
                                                  domainInfo.status === 'pending_migration' ? '⏳ Taşınıyor' :
                                                    domainInfo.status === 'pending' ? '⏳ Doğrulanıyor' : '⚠ Hata'}
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <AlertCircle className="w-3 h-3 text-gray-600" />
                                          <p className="text-xs text-gray-600">Henüz bir projeye Bağlanmamış</p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {connectedProject && domainInfo?.status === 'active' ? (
                                    <a
                                      href={`https://${zone.name}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2.5 bg-[#1a1a1a] hover:bg-green-500/10 rounded-xl text-gray-500 hover:text-green-500 transition-all border border-[#2a2a2a]"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setNewDomainData({ domain: zone.name, projectName: '' });
                                        setShowAddDomainModal(true);
                                      }}
                                      className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl text-blue-500 text-xs font-bold transition-all border border-blue-500/20 hover:border-blue-500/40"
                                    >
                                      Projeye Bağla
                                    </button>
                                  )}
                                </div>
                              </div>
                            </Card>
                          );
                        })}

                        {zones.length === 0 && (
                          <Card className="p-12 bg-[#1a1a1a] border-[#2a2a2a]">
                            <div className="text-center space-y-4">
                              <div className="w-16 h-16 bg-gray-500/10 rounded-xl flex items-center justify-center mx-auto">
                                <Globe className="w-8 h-8 text-gray-600" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold mb-2 text-gray-400">Cloudflare'de Domain Bulunamadı</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                  Önce Cloudflare Dashboard'dan domain eklemeniz gerekiyor
                                </p>
                                <a
                                  href="https://dash.cloudflare.com"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-emerald-500 text-sm font-bold transition-all border border-emerald-500/20"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  Cloudflare'e Git
                                </a>
                              </div>
                            </div>
                          </Card>
                        )}
                      </div>
                    </div>

                    {/* Projelere Bağlı Domainler */}
                    {pages.reduce((acc, p) => acc + (p.customDomains?.length || 0), 0) > 0 && (
                      <div className="space-y-4 pt-8 border-t border-[#2a2a2a]">
                        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-1">
                          Projelere Bağlı Domainler ({pages.reduce((acc, p) => acc + (p.customDomains?.length || 0), 0)})
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {pages.map((project) =>
                            project.customDomains && project.customDomains.length > 0 ? (
                              project.customDomains.map((domain, idx) => (
                                <Card key={`${project.name}-${idx}`} className="p-6 hover:border-emerald-500/30 transition-all group bg-[#1a1a1a]">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1">
                                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${domain.status === 'active'
                                        ? 'bg-green-500/10 border-green-500/20 text-green-500'
                                        : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                          ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                                          : 'bg-red-500/10 border-red-500/20 text-red-500'
                                        }`}>
                                        {domain.status === 'active' ? (
                                          <CheckCircle2 className="w-6 h-6" />
                                        ) : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration' ? (
                                          <Loader2 className="w-6 h-6 animate-spin" />
                                        ) : (
                                          <AlertCircle className="w-6 h-6" />
                                        )}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                          <h4 className="font-bold text-lg text-gray-200">{domain.name}</h4>
                                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${domain.status === 'active'
                                            ? 'bg-green-500/10 text-green-500'
                                            : domain.status === 'pending' || domain.status === 'initializing' || domain.status === 'pending_migration'
                                              ? 'bg-yellow-500/10 text-yellow-500'
                                              : 'bg-red-500/10 text-red-500'
                                            }`}>
                                            {domain.status === 'active' ? 'AKTİF' :
                                              domain.status === 'initializing' ? 'BAŞLATILIYOR' :
                                                domain.status === 'pending_migration' ? 'TAŞINIYOR' :
                                                  domain.status === 'pending' ? 'DOĞRULANIYOR' : 'HATA'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Globe className="w-3 h-3 text-gray-600" />
                                          <p className="text-xs text-gray-500">
                                            Bağlı Proje: <span className="font-mono text-gray-400">{project.name}</span>
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {domain.status === 'active' && (
                                        <a
                                          href={`https://${domain.name}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-2.5 bg-[#1a1a1a] hover:bg-green-500/10 rounded-xl text-gray-500 hover:text-green-500 transition-all border border-[#2a2a2a]"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </a>
                                      )}
                                      <button
                                        onClick={() => {
                                          setShowConfirmDialog({
                                            show: true,
                                            title: 'Domain Sil',
                                            message: `${domain.name} domain'ini silmek istediğinizden emin misiniz?`,
                                            type: 'danger',
                                            onConfirm: () => {
                                              setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' });
                                              setShowSuccessToast({ show: true, message: 'Domain silme özelliği yakında eklenecek' });
                                              setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
                                            }
                                          });
                                        }}
                                        className="p-2.5 bg-[#1a1a1a] hover:bg-red-500/10 rounded-xl text-gray-500 hover:text-red-500 transition-all border border-[#2a2a2a]"
                                      >
                                        <AlertCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </Card>
                              ))
                            ) : null
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'deploy' && (
                  <motion.div
                    key="deploy"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col relative"
                  >
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

                    <div className="mb-8 relative z-10">
                      <h2 className="text-3xl font-light tracking-tight text-white mb-2">Site Kurulumu</h2>
                      <p className="text-sm text-[#94a3b8] max-w-2xl leading-relaxed">
                        Modern, hızlı ve güvenli web sitenizi saniyeler içinde yayına alın. İhtiyacınıza uygun şablonu seçin ve gerisini otomasyona bırakın.
                      </p>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8 relative z-10 pb-8">
                      {/* Sol Taraf: Şablon Listesi */}
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-medium text-white/70">Şablon Koleksiyonu</h3>
                          <span className="text-[10px] font-medium uppercase tracking-widest text-emerald-400 bg-emerald-400/10 py-1.5 px-3 rounded-full border border-emerald-400/20">
                            {templates.length} Şablon
                          </span>
                        </div>

                        {templates.length === 0 ? (
                          <div className="p-12 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center bg-[#111]/30">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500/50 mb-4" />
                            <p className="text-sm text-[#94a3b8]">Şablon havuzu yükleniyor...</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {templates.map((template) => {
                              const isSelected = selectedTemplate === template.key;
                              return (
                                <div
                                  key={template.id}
                                  onClick={() => setSelectedTemplate(template.key)}
                                  className={`group cursor-pointer rounded-2xl p-5 transition-all duration-300 border ${isSelected
                                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_30px_rgba(52,211,153,0.15)] ring-1 ring-emerald-500/20'
                                      : 'bg-[#111]/60 border-white/5 hover:border-white/10 hover:bg-[#1a1a1a]'
                                    }`}
                                >
                                  <div className="flex justify-between items-start mb-5">
                                    <div className={`p-3 rounded-xl transition-colors ${isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-[#64748b] group-hover:text-white group-hover:bg-white/10'}`}>
                                      <Layout className="w-5 h-5" />
                                    </div>
                                    {isSelected ? (
                                      <div className="bg-emerald-500 text-black text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                                        <CheckCircle2 className="w-3 h-3" /> Seçili
                                      </div>
                                    ) : null}
                                  </div>
                                  <h4 className={`text-base font-semibold mb-2 transition-colors tracking-tight ${isSelected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
                                    {template.name}
                                  </h4>
                                  <p className="text-sm text-[#64748b] line-clamp-2 leading-relaxed">
                                    {template.description}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Sağ Taraf: Kurulum Detayları */}
                      <div className="w-full lg:w-[400px] shrink-0">
                        <div className="sticky top-0 space-y-6">

                          {selectedTemplate ? (
                            <div className="bg-[#111]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-7 shadow-2xl relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                <Layout className="w-32 h-32" />
                              </div>

                              <div className="relative z-10 mb-8">
                                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-3">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" /> Seçili Şablon Özeti
                                </div>
                                <h4 className="text-2xl font-bold text-white mb-3 tracking-tight">
                                  {templates.find(t => t.key === selectedTemplate)?.name}
                                </h4>
                                <p className="text-sm text-[#94a3b8] leading-relaxed">
                                  {templates.find(t => t.key === selectedTemplate)?.description}
                                </p>
                              </div>

                              <div className="relative z-10 space-y-4 mb-8 bg-[#0a0a0a]/50 p-5 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  </div>
                                  <span className="text-sm text-gray-300 font-medium tracking-wide">Cloudflare Pages Barındırma</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  </div>
                                  <span className="text-sm text-gray-300 font-medium tracking-wide">D1 Serverless SQL</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  </div>
                                  <span className="text-sm text-gray-300 font-medium tracking-wide">Otomatik Dağıtım Mekanizması</span>
                                </div>
                              </div>

                              <button
                                onClick={() => setShowDeployModal(true)}
                                className="w-full relative group overflow-hidden rounded-2xl bg-white text-black font-bold text-base py-4 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.25)]"
                              >
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                  <Zap className="w-5 h-5" />
                                  Kuruluma Başla
                                </span>
                              </button>
                            </div>
                          ) : (
                            <div className="h-[350px] bg-[#111]/40 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center p-8 text-[#64748b]">
                              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                <Layout className="w-8 h-8 opacity-40" />
                              </div>
                              <p className="text-sm font-medium text-gray-400 mb-1">Şablon Seçilmedi</p>
                              <p className="text-xs">Detayları görmek için sol taraftan bir şablon seçin</p>
                            </div>
                          )}

                          {/* Minimalist Kurulum Adımları */}
                          <div className="bg-transparent border border-white/5 rounded-3xl p-6">
                            <h4 className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-6 border-b border-white/5 pb-3">Bulut Otomasyonu Süreci</h4>
                            <div className="relative pl-2">
                              <div className="absolute left-[13px] top-3 bottom-4 w-px bg-white/10" />
                              <div className="space-y-6">
                                <div className="relative flex items-start gap-4">
                                  <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 mt-1 z-10 shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-gray-300">Proje Hazırlığı</p>
                                    <p className="text-xs text-[#64748b] mt-0.5">Depolama ve D1 veritabanı kurulumu</p>
                                  </div>
                                </div>
                                <div className="relative flex items-start gap-4">
                                  <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20 mt-1 z-10 shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-gray-300">Dağıtım Süreci</p>
                                    <p className="text-xs text-[#64748b] mt-0.5">Kaynak kodların CF tarafına aktarımı</p>
                                  </div>
                                </div>
                                <div className="relative flex items-start gap-4">
                                  <div className="w-3 h-3 rounded-full bg-white/10 border border-white/20 mt-1 z-10 shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-gray-300">Canlı Yayına Alma</p>
                                    <p className="text-xs text-[#64748b] mt-0.5">Anında global ağ üzerinden erişim</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'about' && (
                  <motion.div
                    key="about"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6 pb-8"
                  >
                    {/* Hero Card */}
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-[#111] to-blue-500/5 p-8">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />
                      <div className="relative z-10 flex items-start gap-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-700 p-[1px] rounded-2xl flex items-center justify-center shrink-0 shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                          <div className="w-full h-full bg-[#0d0d0d] rounded-2xl flex items-center justify-center">
                            <Cloud className="text-emerald-400 w-9 h-9" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl font-bold text-white">Cloudflare Site Kurulum Otomasyonu</h2>
                            <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-mono font-bold">v{__APP_VERSION__}</span>
                          </div>
                          <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                            Tamamen Cloudflare ekosistemi (Workers, R2, D1) üzerinde koşan, sunucusuz (serverless) mimariye sahip,
                            yüksek performanslı ve <span className="text-emerald-400 font-medium">açık kaynaklı</span> bir site kurulum aracıdır.
                            Teknolojiyi herkes için erişilebilir kılmayı ve modern sistem mimarilerini standardize etmeyi hedeflemektedir.
                          </p>
                          <div className="flex items-center gap-3 mt-4">
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                              <Heart className="w-3 h-3 text-red-400" /> Ücretsiz
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                              <Shield className="w-3 h-3 text-blue-400" /> Açık Kaynak
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                              <Zap className="w-3 h-3 text-amber-400" /> Serverless
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* İletişim */}
                      <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">İletişim &amp; Takip</p>
                        <div className="space-y-3">
                          <a
                            href="https://saffetcelik.com.tr"
                            onClick={(e) => { e.preventDefault(); ipcRenderer ? ipcRenderer.send('open-external', 'https://saffetcelik.com.tr') : window.open('https://saffetcelik.com.tr', '_blank'); }}
                            className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 rounded-xl transition-all group cursor-pointer"
                          >
                            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                              <Globe className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors">saffetcelik.com.tr</p>
                              <p className="text-[10px] text-gray-600">Resmi Website</p>
                            </div>
                          </a>
                          <a
                            href="https://github.com/saffetcelik"
                            onClick={(e) => { e.preventDefault(); ipcRenderer ? ipcRenderer.send('open-external', 'https://github.com/saffetcelik') : window.open('https://github.com/saffetcelik', '_blank'); }}
                            className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl transition-all group cursor-pointer"
                          >
                            <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center">
                              <Github className="w-4 h-4 text-gray-300" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">github.com/saffetcelik</p>
                              <p className="text-[10px] text-gray-600">Kaynak Kod</p>
                            </div>
                          </a>
                          <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl">
                            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                              <MessageCircle className="w-4 h-4 text-green-400" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">0534 796 56 82</p>
                              <p className="text-[10px] text-gray-600">WhatsApp</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl">
                            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                              <Mail className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">iletisim@saffetcelik.com.tr</p>
                              <p className="text-[10px] text-gray-600">E-posta</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Güncelleme */}
                      <UpdateCard />
                    </div>

                    {/* Teknoloji Stack */}
                    <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-6">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-4">Kullanılan Teknolojiler</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { name: 'Cloudflare Workers', desc: 'Serverless backend', color: 'orange' },
                          { name: 'Cloudflare Pages', desc: 'Statik site hosting', color: 'blue' },
                          { name: 'Cloudflare D1', desc: 'SQLite veritabanı', color: 'green' },
                          { name: 'Cloudflare R2', desc: 'Nesne depolama', color: 'purple' },
                          { name: 'Electron', desc: 'Desktop uygulama', color: 'cyan' },
                          { name: 'React + Vite', desc: 'Kullanıcı arayüzü', color: 'blue' },
                          { name: 'TypeScript', desc: 'Tip güvenliği', color: 'indigo' },
                          { name: 'Wrangler CLI', desc: 'CF yönetim aracı', color: 'orange' },
                        ].map((tech) => (
                          <div key={tech.name} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                            <p className="text-xs font-semibold text-white">{tech.name}</p>
                            <p className="text-[10px] text-gray-600 mt-0.5">{tech.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Alt Bilgi */}
                    <div className="text-center py-4">
                      <p className="text-xs text-gray-600 flex items-center justify-center gap-1.5">
                        Geliştirici: <span className="text-gray-500 font-medium">Saffet Çelik</span>
                        <Heart className="w-3 h-3 text-red-500/60" />
                        <span className="text-gray-600">saffetcelik.com.tr/otomasyon</span>
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {/* Deploy Modal */}
      <AnimatePresence>
        {showDeployModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeployModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 shadow-2xl"
            >
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Site Kurulumu</h3>
                  <p className="text-xs text-gray-500">Otomasyon siteniz için bir proje adı belirleyin</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">Proje Adı</label>
                    <input
                      type="text"
                      placeholder="ornek: benim-otomasyon-sitem"
                      value={deployProjectName}
                      onChange={(e) => setDeployProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      className="w-full h-12 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 transition-all"
                      autoFocus
                    />
                    <p className="text-[10px] text-gray-600 ml-1">Sadece küçük harf, rakam ve tire kullanın</p>
                  </div>

                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                    <p className="text-xs text-gray-400 mb-2">Siteniz şu adreste yayınlanacak:</p>
                    <p className="text-sm font-mono text-emerald-500">
                      {deployProjectName || 'proje-adi'}.pages.dev
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeployModal(false);
                        setDeployProjectName('');
                      }}
                      className="flex-1 h-12 bg-[#1a1a1a] hover:bg-[#293548] text-gray-300 font-bold rounded-xl transition-all border border-[#2a2a2a]"
                    >
                      İptal
                    </button>
                    <button
                      onClick={async () => {
                        if (!deployProjectName || deployProjectName.length < 3) {
                          setShowSuccessToast({ show: true, message: 'Lütfen en az 3 karakter uzunluğunda bir proje adı girin!' });
                          setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
                          return;
                        }

                        if (!ipcRenderer) {
                          setShowSuccessToast({ show: true, message: 'Bu özellik sadece Electron uygulamasında çalışır' });
                          setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 3000);
                          return;
                        }

                        setShowDeployModal(false);
                        setDeployProgress({ show: true, step: 0, message: 'Başlatılıyor...' });

                        // Listen for progress updates
                        ipcRenderer.on('deploy-progress', (_event: any, data: any) => {
                          setDeployProgress({ show: true, step: data.step, message: data.message });
                        });

                        try {
                          const selectedTpl = templates.find(t => t.key === selectedTemplate);
                          const result = await ipcRenderer.invoke('deploy-site', {
                            projectName: deployProjectName,
                            templateKey: selectedTemplate,
                            downloadUrl: selectedTpl?.download_url || ''
                          });

                          setDeployProgress({ show: false, step: 0, message: '' });

                          // Save last deployed site
                          const siteInfo = {
                            name: deployProjectName,
                            url: result.url,
                            timestamp: Date.now(),
                            database: `${deployProjectName}-db`
                          };
                          setLastDeployedSite(siteInfo);
                          localStorage.setItem('lastDeployedSite', JSON.stringify(siteInfo));

                          // Switch to overview tab
                          setActiveTab('overview');

                          // Refresh resources
                          await fetchResources();

                          setDeployProjectName('');

                          // Cleanup listener
                          ipcRenderer.removeAllListeners('deploy-progress');
                        } catch (err: any) {
                          const errorMsg = typeof err === 'string' ? err : (err?.message || String(err));
                          setDeployProgress({ show: true, step: 0, message: '', error: errorMsg });
                          ipcRenderer.removeAllListeners('deploy-progress');
                        }
                      }}
                      disabled={!deployProjectName || deployProjectName.length < 3}
                      className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      Kur
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Modal */}
      <AnimatePresence>
        {deployProgress.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col"
          >
            {/* Pencere sürükleme alanı + kontroller (her zaman erişilebilir) */}
            {isElectron && (
              <div className="h-10 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between pl-4 pr-0 shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                  <span className="text-xs text-gray-400 font-medium">Site Kuruluyor...</span>
                </div>
                <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
                  <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-minimize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
                  <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-maximize')} className="w-12 h-full hover:bg-white/10 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><Square className="w-3.5 h-3.5" /></button>
                  <button onClick={() => (window as any).require('electron').ipcRenderer.send('window-close')} className="w-12 h-full hover:bg-red-500/80 flex items-center justify-center text-[#94a3b8] hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
              </div>
            )}

            <div className="flex-1 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-lg bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 shadow-2xl relative overflow-hidden"
              >
                {deployProgress.error ? (
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto">
                      <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Hata Oluştu</h3>
                      <p className="text-sm text-gray-400">{deployProgress.error}</p>
                    </div>
                    <button
                      onClick={() => setDeployProgress({ show: false, step: 0, message: '' })}
                      className="w-full h-12 bg-[#1a1a1a] hover:bg-[#293548] text-gray-300 font-bold rounded-xl transition-all"
                    >
                      Kapat
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Site Kuruluyor</h3>
                      <p className="text-xs text-gray-500">Pencereyi simge durumuna küçültebilir veya iptal edebilirsiniz</p>
                    </div>

                    <div className="space-y-3">
                      {[
                        'Şablon indiriliyor',
                        'Şablon çıkartılıyor',
                        'Yapılandırma güncelleniyor',
                        'D1 veritabanı oluşturuluyor',
                        'Veritabanı tabloları oluşturuluyor',
                        'Cloudflare Pages\'e deploy ediliyor'
                      ].map((step, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${deployProgress.step > index + 1 ? 'bg-green-500/20' :
                            deployProgress.step === index + 1 ? 'bg-emerald-500/20' :
                              'bg-[#1a1a1a]'
                            }`}>
                            {deployProgress.step > index + 1 ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : deployProgress.step === index + 1 ? (
                              <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                            ) : (
                              <span className="text-xs font-bold text-gray-600">{index + 1}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm ${deployProgress.step >= index + 1 ? 'text-gray-200 font-medium' : 'text-gray-600'
                              }`}>
                              {step}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-4">
                      <p className="text-xs text-gray-400">{deployProgress.message}</p>
                    </div>

                    <div className="w-full bg-[#111] rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-indigo-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${(deployProgress.step / 7) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (confirm('Kurulum iptal edilsin mi? Devam eden işlemler durdurulacak.')) {
                          ipcRenderer?.invoke('deploy-cancel').catch(() => {});
                          setDeployProgress({ show: false, step: 0, message: '' });
                          ipcRenderer?.removeAllListeners('deploy-progress');
                        }
                      }}
                      className="w-full h-10 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium rounded-xl transition-all border border-red-500/20"
                    >
                      Kurulumu İptal Et
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Domain Modal - Absolute Simplest */}
      {domainModalData.open && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0,0,0,0.9)',
          zIndex: 999999
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1e293b',
            border: '2px solid #3b82f6',
            borderRadius: '16px',
            padding: '30px',
            width: '90%',
            maxWidth: '480px'
          }}>
            <h2 style={{ color: 'white', marginBottom: '8px', fontSize: '20px', fontWeight: 'bold' }}>
              Özel Domain Ekle
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>
              <span style={{ color: '#f97316', fontWeight: 'bold' }}>{domainModalData.projectName}</span> projesine domain bağlama
            </p>

            <div style={{
              backgroundColor: '#0c1929',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ color: '#60a5fa', fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>ℹ</span>
                <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.7' }}>
                  Domain ekleme işlemi DNS kayıtlarının yapılandırılmasını gerektirdiğinden, bu işlem Cloudflare Pages panelinden yapılmalıdır.
                  Cloudflare, domain doğrulamasını ve DNS ayarlarını otomatik olarak yönetecektir.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  setDomainModalData({ open: false, projectName: '' });
                  setSelectedDomain('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Kapat
              </button>
              <button
                onClick={() => {
                  if (!domainModalData.projectName || !selectedAccount) return;
                  const url = `https://dash.cloudflare.com/${selectedAccount}/pages/view/${domainModalData.projectName}/domains`;
                  if (ipcRenderer) {
                    ipcRenderer.send('open-external', url);
                  } else {
                    window.open(url, '_blank');
                  }
                  setDomainModalData({ open: false, projectName: '' });
                  setSelectedDomain('');
                  setShowSuccessToast({ show: true, message: 'Cloudflare Pages paneli açıldı. "Custom domains" sekmesinden domaininizi ekleyebilirsiniz.' });
                  setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 6000);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#3b82f6',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                Cloudflare'de Aç ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Domain Modal - Cloudflare Pages'a Yönlendirme */}
      {showAddDomainModal && (
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0,0,0,0.9)',
          zIndex: 999999
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1e293b',
            border: '2px solid #3b82f6',
            borderRadius: '16px',
            padding: '30px',
            width: '90%',
            maxWidth: '520px'
          }}>
            <h2 style={{ color: 'white', marginBottom: '8px', fontSize: '22px', fontWeight: 'bold' }}>
              Özel Domain Bağlama
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px' }}>
              Özel domain işlemleri Cloudflare Pages panelinden yapılmaktadır
            </p>

            <div style={{
              backgroundColor: '#0c1929',
              backgroundImage: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#60a5fa', fontSize: '16px' }}>ℹ</span>
                </div>
                <div>
                  <p style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                    Neden Cloudflare panelinden eklenmeli?
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', lineHeight: '1.7' }}>
                    Özel domain ekleme işlemi DNS kayıtlarının yapılandırılmasını gerektirir. Bu işlem güvenlik nedeniyle doğrudan Cloudflare Pages panelinden yapılmalıdır. Cloudflare, domain doğrulamasını ve DNS ayarlarını otomatik olarak yönetecektir.
                  </p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(59, 130, 246, 0.15)', paddingTop: '16px' }}>
                <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Adımlar:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>1</span>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>Aşağıdan projenizi seçin</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>2</span>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>Cloudflare Pages paneline yönlendirileceksiniz</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '10px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>3</span>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>"Custom domains" sekmesinden domaininizi ekleyin</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>
                Proje Seçin:
              </p>
              <select
                value={newDomainData.projectName}
                onChange={(e) => setNewDomainData({ ...newDomainData, projectName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px'
                }}
              >
                <option value="">Proje seçin...</option>
                {pages.map(project => (
                  <option key={project.name} value={project.name}>
                    {project.name} ({project.subdomain})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => {
                  setShowAddDomainModal(false);
                  setNewDomainData({ domain: '', projectName: '' });
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Kapat
              </button>
              <button
                onClick={() => {
                  if (!newDomainData.projectName || !selectedAccount) return;
                  const url = `https://dash.cloudflare.com/${selectedAccount}/pages/view/${newDomainData.projectName}/domains`;
                  if (ipcRenderer) {
                    ipcRenderer.send('open-external', url);
                  } else {
                    window.open(url, '_blank');
                  }
                  setShowAddDomainModal(false);
                  setNewDomainData({ domain: '', projectName: '' });
                  setShowSuccessToast({ show: true, message: 'Cloudflare Pages paneli açıldı. "Custom domains" sekmesinden domaininizi ekleyebilirsiniz.' });
                  setTimeout(() => setShowSuccessToast({ show: false, message: '' }), 6000);
                }}
                disabled={!newDomainData.projectName}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: newDomainData.projectName ? '#3b82f6' : '#4a4b4e',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: newDomainData.projectName ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                Cloudflare'de Aç ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      <AnimatePresence>
        {passwordResetModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100000] flex items-center justify-center p-4"
            onClick={() => !passwordResetModal.loading && setPasswordResetModal(prev => ({ ...prev, open: false }))}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center">
                  <Lock className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Admin Şifresi Sıfırla</h3>
                  <p className="text-xs text-gray-500">{lastDeployedSite?.database}</p>
                </div>
                <button
                  onClick={() => !passwordResetModal.loading && setPasswordResetModal(prev => ({ ...prev, open: false }))}
                  className="ml-auto p-2 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {passwordResetModal.loading && !passwordResetModal.result ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-sm text-gray-400">D1 veritabanından admin bilgisi alınıyor...</p>
                </div>
              ) : passwordResetModal.result ? (
                <div className={`p-4 rounded-xl border ${passwordResetModal.result.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} mb-4`}>
                  <p className={`text-sm font-medium ${passwordResetModal.result.success ? 'text-green-400' : 'text-red-400'}`}>
                    {passwordResetModal.result.message}
                  </p>
                  {passwordResetModal.result.success && (
                    <p className="text-xs text-gray-500 mt-2">Admin panele giriş yapabilirsiniz.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Admin Seçimi */}
                  {passwordResetModal.admins.length > 1 && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Admin Hesabı</label>
                      <select
                        value={passwordResetModal.selectedAdmin || ''}
                        onChange={(e) => setPasswordResetModal(prev => ({ ...prev, selectedAdmin: Number(e.target.value) }))}
                        className="w-full h-11 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition-all"
                      >
                        {passwordResetModal.admins.map(a => (
                          <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Seçili Admin Bilgisi */}
                  {passwordResetModal.admins.length === 1 && (
                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <span className="text-amber-400 font-bold text-sm">
                          {passwordResetModal.admins[0]?.name?.charAt(0)?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{passwordResetModal.admins[0]?.name}</p>
                        <p className="text-xs text-gray-500">{passwordResetModal.admins[0]?.email}</p>
                      </div>
                    </div>
                  )}

                  {/* Yeni Şifre */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">Yeni Şifre</label>
                    <div className="relative">
                      <input
                        type={passwordResetModal.showPassword ? 'text' : 'password'}
                        placeholder="En az 6 karakter"
                        value={passwordResetModal.newPassword}
                        onChange={(e) => setPasswordResetModal(prev => ({ ...prev, newPassword: e.target.value }))}
                        className="w-full h-11 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 pr-20 text-sm text-gray-200 focus:outline-none focus:border-amber-500 transition-all font-mono"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <button
                          onClick={() => setPasswordResetModal(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-gray-300 transition-all"
                          title={passwordResetModal.showPassword ? 'Gizle' : 'Göster'}
                        >
                          {passwordResetModal.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={generateRandomPassword}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-amber-400 transition-all"
                          title="Güvenli şifre oluştur"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 pl-1">Sağdaki <RefreshCw className="w-3 h-3 inline" /> butonuyla güvenli şifre oluşturabilirsiniz</p>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setPasswordResetModal(prev => ({ ...prev, open: false }))}
                  disabled={passwordResetModal.loading}
                  className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl transition-all border border-white/10 disabled:opacity-50"
                >
                  {passwordResetModal.result?.success ? 'Kapat' : 'İptal'}
                </button>
                {!passwordResetModal.result?.success && !passwordResetModal.loading && passwordResetModal.admins.length > 0 && (
                  <button
                    onClick={handlePasswordReset}
                    disabled={!passwordResetModal.newPassword || passwordResetModal.newPassword.length < 6 || passwordResetModal.loading}
                    className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {passwordResetModal.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    Şifreyi Güncelle
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Dialog */}
      <AnimatePresence>
        {showConfirmDialog.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100000] flex items-center justify-center p-4"
            onClick={() => setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 shadow-2xl"
            >
              <div className="text-center space-y-6">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto ${showConfirmDialog.type === 'danger' ? 'bg-red-500/10' :
                  showConfirmDialog.type === 'warning' ? 'bg-yellow-500/10' :
                    'bg-blue-500/10'
                  }`}>
                  <AlertCircle className={`w-8 h-8 ${showConfirmDialog.type === 'danger' ? 'text-red-500' :
                    showConfirmDialog.type === 'warning' ? 'text-yellow-500' :
                      'text-blue-500'
                    }`} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-3">{showConfirmDialog.title}</h3>
                  <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">{showConfirmDialog.message}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmDialog({ show: false, title: '', message: '', onConfirm: () => { }, type: 'info' })}
                    className="flex-1 h-12 bg-[#1a1a1a] hover:bg-[#293548] text-gray-300 font-bold rounded-xl transition-all border border-[#2a2a2a]"
                  >
                    İptal
                  </button>
                  <button
                    onClick={showConfirmDialog.onConfirm}
                    className={`flex-1 h-12 font-bold rounded-xl transition-all ${showConfirmDialog.type === 'danger' ? 'bg-red-500 hover:bg-red-600 text-white' :
                      showConfirmDialog.type === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600 text-black' :
                        'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                  >
                    Onayla
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccessToast.show && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 right-8 z-[100000] max-w-md"
          >
            <div className="bg-[#1a1a1a] border border-green-500/30 rounded-lg p-4 shadow-2xl flex items-start gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-200 leading-relaxed">{showSuccessToast.message}</p>
              </div>
              <button
                onClick={() => setShowSuccessToast({ show: false, message: '' })}
                className="p-1 hover:bg-[#293548] rounded-lg text-gray-600 hover:text-gray-400 transition-all"
              >
                <AlertCircle className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Güncelleme Bildirimi */}
      <AnimatePresence>
        {updateNotification.show && (
          <motion.div
            initial={{ opacity: 0, x: 80, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 80, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-6 z-[100000] w-[360px]"
          >
            <div className="bg-[#111]/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Üst gradient bar */}
              <div className="h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500" />
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-white">Yeni Sürüm Mevcut</p>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono font-bold text-emerald-400">v{updateNotification.latestVersion}</span>
                    </div>
                    {updateNotification.changelog && (
                      <p className="text-xs text-gray-400 leading-relaxed mb-3 line-clamp-2">{updateNotification.changelog}</p>
                    )}
                    {updateNotification.error && (
                      <p className="text-xs text-red-400 mb-2">{updateNotification.error}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {!updateNotification.extractDir ? (
                        <button
                          onClick={async () => {
                            setUpdateNotification(s => ({ ...s, downloading: true, error: null }));
                            try {
                              const res = await fetch('/api/app/download-update', { method: 'POST' });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'İndirme başarısız');
                              setUpdateNotification(s => ({ ...s, downloading: false, extractDir: data.extractDir }));
                            } catch (err: any) {
                              setUpdateNotification(s => ({ ...s, downloading: false, error: err.message }));
                            }
                          }}
                          disabled={updateNotification.downloading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold text-black transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                        >
                          {updateNotification.downloading ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> İndiriliyor...</>
                          ) : (
                            <><Download className="w-3 h-3" /> Güncelle</>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            setUpdateNotification(s => ({ ...s, applying: true, error: null }));
                            try {
                              const res = await fetch('/api/app/apply-update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ extractDir: updateNotification.extractDir }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || 'Uygulama başarısız');
                            } catch (err: any) {
                              setUpdateNotification(s => ({ ...s, applying: false, error: err.message }));
                            }
                          }}
                          disabled={updateNotification.applying}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-bold text-black transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                        >
                          {updateNotification.applying ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Uygulanıyor...</>
                          ) : (
                            <><Zap className="w-3 h-3" /> Uygula & Yeniden Başlat</>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => setUpdateNotification(s => ({ ...s, show: false }))}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-lg transition-all"
                      >
                        Sonra
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setUpdateNotification(s => ({ ...s, show: false }))}
                    className="p-1 hover:bg-white/10 rounded-lg text-gray-600 hover:text-gray-300 transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helper Components for Desktop UI ---

const SidebarItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 group relative ${active
      ? 'bg-emerald-500/10 text-white font-semibold'
      : 'text-gray-400 hover:bg-[#1a1a1a]/60 hover:text-gray-200'
      }`}
  >
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-500 rounded-r-full" />}
    <div className={`${active ? 'text-emerald-400' : 'text-gray-500 group-hover:text-gray-300'} transition-colors`}>
      {icon}
    </div>
    <span className="hidden lg:block truncate">{label}</span>
  </button>
);

const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) => {
  const colors: Record<string, string> = {
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
    indigo: "border-l-indigo-500",
    green: "border-l-green-500"
  };

  return (
    <div className={`bg-[#1a1a1a]/80 border border-[#2a2a2a] rounded-xl p-5 border-l-[3px] ${colors[color]} hover:bg-[#1a1a1a] transition-colors`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1 font-medium">{label}</p>
          <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
        </div>
        <div className="p-2.5 bg-[#0d0d0d]/80 rounded-lg border border-[#2a2a2a]">
          {icon}
        </div>
      </div>
    </div>
  );
};

const QuickAction = ({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between p-3.5 bg-[#1a1a1a]/50 border border-[#2a2a2a] rounded-lg hover:bg-[#1a1a1a] transition-all group"
  >
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-[#0d0d0d] rounded-lg flex items-center justify-center text-gray-400 group-hover:text-emerald-400 transition-colors border border-[#2a2a2a]">
        {icon}
      </div>
      <span className="text-xs font-medium text-gray-300 group-hover:text-white">{label}</span>
    </div>
    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-all" />
  </button>
);





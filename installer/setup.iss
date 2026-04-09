; ═══════════════════════════════════════════════════════════════════════════
;  Cloudflare Site Kurulum Otomasyonu — Chrome-Style Modern Installer
;  Web Installer: R2'den en son sürümü indirir, SHA-256 doğrular, kurar.
;
;  Geliştirici  : Saffet Çelik — saffetcelik.com.tr
;  Derleme aracı: Inno Setup 6.x (https://jrsoftware.org/isinfo.php)
;  Derleme komutu: iscc.exe setup.iss   (veya build-installer.ps1)
;  Çıktı boyutu : ~600 KB (stub installer)
; ═══════════════════════════════════════════════════════════════════════════

; ── Sabitler ──────────────────────────────────────────────────────────────
#define AppName       "Cloudflare Site Kurulum Otomasyonu"
#define AppShortName  "CloudflareProOtomasyon"
#define AppVersion    "1.0.0"
#define AppPublisher  "Saffet Celik"
#define AppURL        "https://saffetcelik.com.tr"
#define AppExeName    "Cloudflare Site Kurulum Otomasyonu.exe"
#define AppIcon       "cloudflare-pages.ico"

; Manifest URL: bu URL JSON döner { download_url, checksum, latest_version }
#define ManifestURL  "https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest"

; ── Setup Yapılandırması ───────────────────────────────────────────────────
[Setup]
AppId={{C7D8E9F0-A1B2-C3D4-E5F6-789012345678}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL=https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest
AppUpdatesURL=https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest
DefaultDirName={localappdata}\{#AppShortName}

; Admin hakları gerektirmez — LocalAppData'ya kurar
PrivilegesRequired=lowest

; Setup ve Uninstall ikonları
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExeName}

; UI — Tüm standart sayfaları gizle (Chrome tarzı tek sayfa)
WizardStyle=modern
WizardSizePercent=100,100
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableReadyMemo=yes
DisableFinishedPage=yes
DisableWelcomePage=yes
ShowLanguageDialog=no

; Çıktı
OutputDir=output
OutputBaseFilename=CloudflareProOtomasyon-Setup
Compression=lzma2/ultra64
SolidCompression=yes
InternalCompressLevel=ultra64

; Kaldırma
UninstallDisplayName={#AppName}
CreateUninstallRegKey=yes

; 64-bit Windows
ArchitecturesInstallIn64BitMode=x64compatible

; ── Dil ───────────────────────────────────────────────────────────────────
[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

; ── Kısayollar ────────────────────────────────────────────────────────────
[Icons]
Name: "{userdesktop}\{#AppName}";    Filename: "{app}\{#AppExeName}"; \
      IconFilename: "{app}\cloudflare-pages.ico"; \
      WorkingDir: "{app}"; Comment: "Cloudflare site kurulum araci"
Name: "{userstartmenu}\{#AppName}";  Filename: "{app}\{#AppExeName}"; \
      IconFilename: "{app}\cloudflare-pages.ico"; \
      WorkingDir: "{app}"; Comment: "Cloudflare site kurulum araci"

; ── İkon dosyasını kurulum dizinine kopyala ───────────────────────────────
[Files]
Source: "{#AppIcon}"; DestDir: "{app}"; Flags: ignoreversion

; ── Kaldırma Temizliği ────────────────────────────────────────────────────
[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{userdesktop}\{#AppName}.lnk"
Type: files; Name: "{userstartmenu}\{#AppName}.lnk"

; ── Kayıt Defteri ─────────────────────────────────────────────────────────
[Registry]
Root: HKCU; Subkey: "Software\{#AppShortName}"; \
  ValueType: string; ValueName: "Version"; ValueData: ""
Root: HKCU; Subkey: "Software\{#AppShortName}"; \
  ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"
Root: HKCU; Subkey: "Software\{#AppShortName}"; \
  Flags: uninsdeletekey

; ═══════════════════════════════════════════════════════════════════════════
;  PASCAL SCRIPT — Chrome tarzı tek sayfalık modern installer
; ═══════════════════════════════════════════════════════════════════════════
[Code]

function GetSystemMetrics(nIndex: Integer): Integer;
  external 'GetSystemMetrics@user32.dll stdcall';

function PostMessage(hWnd: Integer; Msg: Integer; wParam: Integer; lParam: Integer): Boolean;
  external 'PostMessageA@user32.dll stdcall';

const
  BM_CLICK = $00F5;

var
  { Ana sayfa kontrolleri }
  InstallButton: TNewButton;
  StatusLabel: TNewStaticText;
  ProgressBar: TNewProgressBar;
  PercentLabel: TNewStaticText;
  AppNameLabel: TNewStaticText;
  VersionLabel: TNewStaticText;
  PublisherLabel: TNewStaticText;

  { İndirme sayfası (Inno Setup built-in) }
  DownloadPage: TDownloadWizardPage;

  { Manifest verileri }
  FetchedDownloadURL : String;
  FetchedChecksum    : String;
  FetchedVersion     : String;

  { Durum takibi }
  InstallStarted: Boolean;
  InstallSuccess: Boolean;

{ ── JSON string değer ayıklayıcı ──────────────────────────────────── }
function ExtractJsonStr(const JSON, Key: String): String;
var
  Search: String;
  P1, P2: Integer;
begin
  Result := '';
  Search := '"' + Key + '"';
  P1 := Pos(Search, JSON);
  if P1 = 0 then Exit;
  P1 := P1 + Length(Search);
  while (P1 <= Length(JSON)) and ((JSON[P1] = ':') or (JSON[P1] = ' ')) do
    Inc(P1);
  if (P1 <= Length(JSON)) and (JSON[P1] = '"') then Inc(P1);
  P2 := P1;
  while (P2 <= Length(JSON)) and (JSON[P2] <> '"') do Inc(P2);
  Result := Copy(JSON, P1, P2 - P1);
end;

{ ── Manifest çek ──────────────────────────────────────────────────── }
function FetchManifest: Boolean;
var
  Http: Variant;
  JSON: String;
begin
  Result := False;
  try
    Http := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    Http.Open('GET', '{#ManifestURL}', False);
    Http.SetRequestHeader('User-Agent', 'CloudflareProOtomasyon-Setup/{#AppVersion}');
    Http.SetTimeouts(5000, 15000, 30000, 30000);
    Http.Send('');
    if Http.Status = 200 then
    begin
      JSON               := Http.ResponseText;
      FetchedDownloadURL := ExtractJsonStr(JSON, 'download_url');
      FetchedChecksum    := ExtractJsonStr(JSON, 'checksum');
      FetchedVersion     := ExtractJsonStr(JSON, 'latest_version');
      Result := (FetchedDownloadURL <> '');
    end;
  except
    Result := False;
  end;
end;

{ ── ZIP çıkart ────────────────────────────────────────────────────── }
function ExtractZip(const ZipFile, DestDir: String): Boolean;
var
  Cmd: String;
  Code: Integer;
begin
  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command ' +
         '"Expand-Archive -LiteralPath ''' + ZipFile + ''' ' +
         '-DestinationPath ''' + DestDir + ''' -Force"';
  Exec('powershell.exe', Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code);
  Result := (Code = 0);

  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command ' +
         '"$sub = Get-ChildItem ''' + DestDir + ''' | Where-Object { $_.PSIsContainer }; ' +
         'if ($sub.Count -eq 1) { ' +
         'Get-ChildItem $sub[0].FullName | Move-Item -Destination ''' + DestDir + ''' -Force; ' +
         'Remove-Item $sub[0].FullName -Recurse -Force }"';
  Exec('powershell.exe', Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

{ ── Progress güncelle ─────────────────────────────────────────────── }
procedure UpdateProgress(Pct: Integer; const Msg: String);
begin
  ProgressBar.Position := Pct;
  StatusLabel.Caption := Msg;
  PercentLabel.Caption := IntToStr(Pct) + '%';
  WizardForm.Refresh;
end;

procedure CreateShortcut(const LinkPath, TargetPath, WorkingDir, IconPath: String);
var
  ScriptFile: String;
  ScriptContent: String;
  Code: Integer;
  ActualIconPath: String;
begin
  { Icon dosyasi yoksa EXE'nin kendi ikonunu kullan }
  if FileExists(IconPath) then
    ActualIconPath := IconPath
  else
    ActualIconPath := TargetPath;

  { Quoting sorunlarini onlemek icin gecici PS1 dosyasi olustur }
  ScriptFile := ExpandConstant('{tmp}\create-shortcut.ps1');
  ScriptContent := '$W = New-Object -ComObject WScript.Shell' + #13#10 +
    '$S = $W.CreateShortcut("' + LinkPath + '")' + #13#10 +
    '$S.TargetPath = "' + TargetPath + '"' + #13#10 +
    '$S.WorkingDirectory = "' + WorkingDir + '"' + #13#10 +
    '$S.IconLocation = "' + ActualIconPath + ',0"' + #13#10 +
    '$S.Save()';
  SaveStringToFile(ScriptFile, ScriptContent, False);
  Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptFile + '"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  DeleteFile(ScriptFile);
end;

{ ── İndirme progress callback ─────────────────────────────────────── }
function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
var
  Pct: Integer;
  DownloadedMB, TotalMB: Double;
  Msg: String;
begin
  Result := True; { True = devam et, False = iptal }
  if ProgressMax > 0 then
  begin
    Pct := 15 + (Progress * 55 div ProgressMax); { %15-%70 arasi indirme }
    DownloadedMB := Progress / (1024.0 * 1024.0);
    TotalMB := ProgressMax / (1024.0 * 1024.0);
    Msg := Format('Indiriliyor: %.1f / %.1f MB', [DownloadedMB, TotalMB]);
  end else begin
    Pct := 15;
    Msg := 'Indiriliyor...';
  end;
  ProgressBar.Position := Pct;
  PercentLabel.Caption := IntToStr(Pct) + '%';
  StatusLabel.Caption := Msg;
  WizardForm.Refresh;
end;

{ ── Kurulum mantığı (buton tıklamasında çağrılır) ─────────────────── }
procedure RunInstallation;
var
  ZipPath, InstallDir: String;
  ResultCode: Integer;
begin
  InstallStarted := True;
  InstallButton.Enabled := False;
  InstallButton.Caption := 'Kuruluyor...';
  ProgressBar.Visible := True;
  PercentLabel.Visible := True;

  { ADIM 1: Manifest }
  UpdateProgress(5, 'Sunucuya baglaniyor...');
  if not FetchManifest then
  begin
    StatusLabel.Caption := 'Sunucuya baglanilamadi! Internet baglantinizi kontrol edin.';
    StatusLabel.Font.Color := $0000FF;
    InstallButton.Caption := 'Tekrar Dene';
    InstallButton.Enabled := True;
    InstallStarted := False;
    Exit;
  end;

  { ADIM 2: İndir }
  UpdateProgress(15, 'Indiriliyor: v' + FetchedVersion + '...');

  DownloadPage.Clear;
  DownloadPage.Add(FetchedDownloadURL, 'CloudflareProOtomasyon.zip', FetchedChecksum);

  try
    DownloadPage.Download;
  except
    StatusLabel.Caption := 'Indirme basarisiz: ' + GetExceptionMessage;
    StatusLabel.Font.Color := $0000FF;
    InstallButton.Caption := 'Tekrar Dene';
    InstallButton.Enabled := True;
    InstallStarted := False;
    Exit;
  end;

  UpdateProgress(70, 'Dosyalar cikartiliyor...');

  { ADIM 3: ZIP aç }
  ZipPath    := ExpandConstant('{tmp}\CloudflareProOtomasyon.zip');
  InstallDir := ExpandConstant('{localappdata}\{#AppShortName}');

  if not DirExists(InstallDir) then
    CreateDir(InstallDir);

  if not ExtractZip(ZipPath, InstallDir) then
  begin
    StatusLabel.Caption := 'Dosyalar acilamadi. Lutfen tekrar deneyin.';
    StatusLabel.Font.Color := $0000FF;
    InstallButton.Caption := 'Tekrar Dene';
    InstallButton.Enabled := True;
    InstallStarted := False;
    DeleteFile(ZipPath);
    Exit;
  end;

  DeleteFile(ZipPath);

  UpdateProgress(90, 'Kurulum tamamlaniyor...');

  { Kayıt defteri }
  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'Version',     FetchedVersion);
  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'InstallPath', InstallDir);

  CreateShortcut(ExpandConstant('{userdesktop}\{#AppName}.lnk'), InstallDir + '\{#AppExeName}', InstallDir, InstallDir + '\{#AppIcon}');
  if not DirExists(ExpandConstant('{userstartmenu}')) then
    ForceDirectories(ExpandConstant('{userstartmenu}'));
  CreateShortcut(ExpandConstant('{userstartmenu}\{#AppName}.lnk'), InstallDir + '\{#AppExeName}', InstallDir, InstallDir + '\{#AppIcon}');

  UpdateProgress(100, 'Kurulum basariyla tamamlandi! Uygulama baslatiliyor...');
  StatusLabel.Font.Color := $007700;

  InstallSuccess := True;

  { Uygulamayı başlat }
  if FileExists(InstallDir + '\{#AppExeName}') then
    ShellExec('open', InstallDir + '\{#AppExeName}', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);

  { Inno Setup’ın kaldırma bilgilerini (unins000.exe + Program Ekle/Kaldır kaydı)
    oluşturabilmesi için wizard akışını tamamla }
  InstallButton.Caption := 'Tamamlaniyor...';
  InstallButton.Enabled := False;
  WizardForm.NextButton.Visible := True;
  PostMessage(WizardForm.NextButton.Handle, BM_CLICK, 0, 0);
end;

{ ── Buton tıklama olayı ───────────────────────────────────────────── }
procedure InstallButtonClick(Sender: TObject);
begin
  if InstallSuccess then
  begin
    { Wizard akışını ilerlet — Inno Setup kaldırma kaydını tamamlasın }
    WizardForm.NextButton.Visible := True;
    PostMessage(WizardForm.NextButton.Handle, BM_CLICK, 0, 0);
    Exit;
  end;
  RunInstallation;
end;

{ ── Sihirbaz başlatma — Chrome tarzı tek sayfa UI ─────────────────── }
procedure InitializeWizard;
var
  PageWidth, CenterX: Integer;
begin
  InstallStarted := False;
  InstallSuccess := False;

  { Pencere boyutunu küçült (Chrome installer boyutu) }
  WizardForm.ClientWidth := ScaleX(430);
  WizardForm.ClientHeight := ScaleY(340);
  WizardForm.Left := (GetSystemMetrics(0) - WizardForm.Width) div 2;
  WizardForm.Top := (GetSystemMetrics(1) - WizardForm.Height) div 2;

  { Standart panelleri gizle }
  WizardForm.OuterNotebook.Hide;
  WizardForm.InnerNotebook.Hide;
  WizardForm.Bevel.Hide;

  { Tüm standart butonları gizle }
  WizardForm.NextButton.Visible := False;
  WizardForm.BackButton.Visible := False;
  WizardForm.CancelButton.Visible := False;

  PageWidth := WizardForm.ClientWidth;
  CenterX := (PageWidth - ScaleX(280)) div 2;

  { ── Uygulama adı ── }
  AppNameLabel := TNewStaticText.Create(WizardForm);
  AppNameLabel.Parent := WizardForm;
  AppNameLabel.Caption := '{#AppName}';
  AppNameLabel.Font.Size := 14;
  AppNameLabel.Font.Style := [fsBold];
  AppNameLabel.Font.Color := $333333;
  AppNameLabel.AutoSize := True;
  AppNameLabel.Left := (PageWidth - AppNameLabel.Width) div 2;
  AppNameLabel.Top := ScaleY(50);
  { Ortalamayı düzelt }
  AppNameLabel.Left := (PageWidth div 2) - (ScaleX(200));

  { ── Versiyon ── }
  VersionLabel := TNewStaticText.Create(WizardForm);
  VersionLabel.Parent := WizardForm;
  VersionLabel.Caption := 'v{#AppVersion}';
  VersionLabel.Font.Size := 9;
  VersionLabel.Font.Color := $888888;
  VersionLabel.AutoSize := True;
  VersionLabel.Top := ScaleY(80);
  VersionLabel.Left := AppNameLabel.Left;

  { ── Yayıncı ── }
  PublisherLabel := TNewStaticText.Create(WizardForm);
  PublisherLabel.Parent := WizardForm;
  PublisherLabel.Caption := '{#AppPublisher} - saffetcelik.com.tr';
  PublisherLabel.Font.Size := 8;
  PublisherLabel.Font.Color := $AAAAAA;
  PublisherLabel.AutoSize := True;
  PublisherLabel.Top := ScaleY(100);
  PublisherLabel.Left := AppNameLabel.Left;

  { ── Kurulumu Başlat butonu ── }
  InstallButton := TNewButton.Create(WizardForm);
  InstallButton.Parent := WizardForm;
  InstallButton.Caption := 'Kurulumu Baslat';
  InstallButton.Width := ScaleX(280);
  InstallButton.Height := ScaleY(44);
  InstallButton.Left := (PageWidth - InstallButton.Width) div 2;
  InstallButton.Top := ScaleY(140);
  InstallButton.Font.Size := 11;
  InstallButton.Font.Style := [fsBold];
  InstallButton.OnClick := @InstallButtonClick;
  InstallButton.Default := True;

  { ── Progress bar ── }
  ProgressBar := TNewProgressBar.Create(WizardForm);
  ProgressBar.Parent := WizardForm;
  ProgressBar.Left := (PageWidth - ScaleX(340)) div 2;
  ProgressBar.Top := ScaleY(205);
  ProgressBar.Width := ScaleX(340);
  ProgressBar.Height := ScaleY(20);
  ProgressBar.Min := 0;
  ProgressBar.Max := 100;
  ProgressBar.Position := 0;
  ProgressBar.Visible := False;

  { ── Yüzde etiketi ── }
  PercentLabel := TNewStaticText.Create(WizardForm);
  PercentLabel.Parent := WizardForm;
  PercentLabel.Caption := '0%';
  PercentLabel.Font.Size := 9;
  PercentLabel.Font.Color := $555555;
  PercentLabel.Font.Style := [fsBold];
  PercentLabel.AutoSize := True;
  PercentLabel.Top := ScaleY(230);
  PercentLabel.Left := (PageWidth - ScaleX(30)) div 2;
  PercentLabel.Visible := False;

  { ── Durum mesajı ── }
  StatusLabel := TNewStaticText.Create(WizardForm);
  StatusLabel.Parent := WizardForm;
  StatusLabel.Caption := 'Kuruluma baslamak icin butona tiklayin.';
  StatusLabel.Font.Size := 9;
  StatusLabel.Font.Color := $666666;
  StatusLabel.AutoSize := False;
  StatusLabel.Width := ScaleX(380);
  StatusLabel.Height := ScaleY(40);
  StatusLabel.Left := (PageWidth - StatusLabel.Width) div 2;
  StatusLabel.Top := ScaleY(260);
  StatusLabel.Alignment := taCenter;
  StatusLabel.WordWrap := True;

  { İndirme sayfası (arka planda kullanılır, görünmez) }
  DownloadPage := CreateDownloadPage(
    'Indiriliyor',
    'Uygulama dosyalari sunucudan guvenli sekilde indiriliyor...',
    @OnDownloadProgress
  );
end;

{ ── Her sayfa değişiminde standart butonları gizle ────────────────── }
procedure CurPageChanged(CurPageID: Integer);
begin
  { Kurulum tamamlandıysa wizard'ın ilerlemesine izin ver }
  if not InstallSuccess then
  begin
    WizardForm.NextButton.Visible := False;
    WizardForm.BackButton.Visible := False;
    WizardForm.CancelButton.Visible := False;
  end;
end;

{ ── Sayfa değişimi kontrolü ───────────────────────────────────────── }
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  { Kurulum tamamlandıysa wizard'ın ilerlemesine izin ver }
  if not InstallSuccess then
  begin
    WizardForm.NextButton.Visible := False;
    WizardForm.BackButton.Visible := False;
    WizardForm.CancelButton.Visible := False;
  end;
end;

{ ── Kurulum adımı tamamlandı (registry zaten RunInstallation'da yazılıyor) ─ }
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if not InstallSuccess then
  begin
    WizardForm.NextButton.Visible := False;
    WizardForm.BackButton.Visible := False;
    WizardForm.CancelButton.Visible := False;
  end;
end;

{ ── Kapatma koruması — kurulum sırasında kapanmasın ───────────────── }
procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if InstallSuccess then
  begin
    { Kurulum tamamlandı, kapatmaya izin ver }
    Cancel := True;
    Confirm := False;
  end
  else if InstallStarted then
  begin
    { Kurulum devam ediyor, kapatmaya izin verme }
    Cancel := False;
    Confirm := False;
  end;
end;

{ ── Kaldırıcı başlamadan önce uygulamayı kapat ───────────────────── }
function InitializeUninstall: Boolean;
var
  Code: Integer;
begin
  Result := True;
  { Uygulamayı kapat }
  Exec('taskkill.exe', '/F /IM "{#AppExeName}"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  { Kısayolları temizle }
  DeleteFile(ExpandConstant('{userdesktop}\{#AppName}.lnk'));
  DeleteFile(ExpandConstant('{userstartmenu}\{#AppName}.lnk'));
end;

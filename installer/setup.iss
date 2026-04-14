#define AppName       "Cloudflare Site Kurulum Otomasyonu"
#define AppShortName  "CloudflareProOtomasyon"
#define AppVersion    "1.0.40"
#define AppPublisher  "Saffet Çelik"
#define AppURL        "https://saffetcelik.com.tr"
#define AppExeName    "Cloudflare Site Kurulum Otomasyonu.exe"
#define AppIcon       "cloudflare-pages.ico"
#define ManifestURL   "https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest"

[Setup]
AppId={{C7D8E9F0-A1B2-C3D4-E5F6-789012345678}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#ManifestURL}
AppUpdatesURL={#ManifestURL}
DefaultDirName={localappdata}\{#AppShortName}
PrivilegesRequired=lowest
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExeName}
WizardStyle=modern
WizardSizePercent=100,100
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableReadyMemo=yes
DisableFinishedPage=yes
DisableWelcomePage=yes
ShowLanguageDialog=no
OutputDir=output
OutputBaseFilename=CloudflareProOtomasyon-Setup
Compression=lzma2/ultra64
SolidCompression=yes
InternalCompressLevel=ultra64
UninstallDisplayName={#AppName}
CreateUninstallRegKey=yes
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Icons]
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\cloudflare-pages.ico"; WorkingDir: "{app}"
Name: "{userstartmenu}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\cloudflare-pages.ico"; WorkingDir: "{app}"

[Files]
Source: "{#AppIcon}"; DestDir: "{app}"; Flags: ignoreversion

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files; Name: "{userdesktop}\{#AppName}.lnk"
Type: files; Name: "{userstartmenu}\{#AppName}.lnk"

[Registry]
Root: HKCU; Subkey: "Software\{#AppShortName}"; ValueType: string; ValueName: "Version"; ValueData: ""
Root: HKCU; Subkey: "Software\{#AppShortName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"
Root: HKCU; Subkey: "Software\{#AppShortName}"; Flags: uninsdeletekey

[Code]
{ --- WINDOWS API MESAJ DONGUSU --- }
type
  TMsg = record
    hwnd: Integer;
    message: Cardinal;
    wParam: Integer;
    lParam: Integer;
    time: DWORD;
    pt_x: Integer;
    pt_y: Integer;
  end;

function PeekMessage(var lpMsg: TMsg; hWnd: Integer; wMsgFilterMin, wMsgFilterMax, wRemoveMsg: Cardinal): Boolean; external 'PeekMessageA@user32.dll stdcall';
function TranslateMessage(const lpMsg: TMsg): Boolean; external 'TranslateMessage@user32.dll stdcall';
function DispatchMessage(const lpMsg: TMsg): Integer; external 'DispatchMessageA@user32.dll stdcall';
function GetSystemMetrics(nIndex: Integer): Integer; external 'GetSystemMetrics@user32.dll stdcall';

var
  InstallButton: TNewButton;
  StatusLabel: TNewStaticText;
  PercentLabel: TNewStaticText;
  AppNameLabel: TNewStaticText;
  VersionLabel: TNewStaticText;
  PublisherLabel: TNewStaticText;
  
  AccentShape: TNewStaticText;
  ProgBg: TNewStaticText;
  ProgFill: TNewStaticText;

  DownloadPage: TDownloadWizardPage;
  FetchedDownloadURL : String;
  FetchedChecksum    : String;
  FetchedVersion     : String;
  InstallStarted: Boolean;
  InstallSuccess: Boolean;

procedure ProcessMessages;
var
  Msg: TMsg;
begin
  while PeekMessage(Msg, 0, 0, 0, 1) do
  begin
    TranslateMessage(Msg);
    DispatchMessage(Msg);
  end;
end;

procedure HideStandardButtons;
begin
  WizardForm.NextButton.Visible := False;
  WizardForm.BackButton.Visible := False;
  WizardForm.CancelButton.Visible := True;
  WizardForm.CancelButton.Left := -9999;
  WizardForm.CancelButton.Top := -9999;
end;

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

procedure UpdateProgress(Pct: Integer; const Msg: String);
begin
  if Pct < 0 then Pct := 0;
  if Pct > 100 then Pct := 100;

  ProgFill.Width := (Pct * ProgBg.Width) div 100;
  StatusLabel.Caption := Msg;
  PercentLabel.Caption := IntToStr(Pct) + '%';
  WizardForm.Refresh;
end;

function ExtractZipWithProgress(const ZipFile, DestDir: String): Boolean;
var
  ProgFile, ScriptFile, ScriptContent, Cmd, PctStr: String;
  PctStrAnsi: AnsiString;
  Code: Integer;
  Pct: Integer;
begin
  Result := False;
  ProgFile := ExpandConstant('{tmp}\prog.txt');
  ScriptFile := ExpandConstant('{tmp}\extract.ps1');
  
  ScriptContent := 
    '$zipPath = ''' + ZipFile + '''; ' + #13#10 +
    '$dest = ''' + DestDir + '''; ' + #13#10 +
    '$progFile = ''' + ProgFile + '''; ' + #13#10 +
    'try { ' + #13#10 +
    '  Add-Type -AssemblyName System.IO.Compression.FileSystem; ' + #13#10 +
    '  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath); ' + #13#10 +
    '  $total = $zip.Entries.Count; ' + #13#10 +
    '  $count = 0; $lastPct = -1; ' + #13#10 +
    '  foreach ($entry in $zip.Entries) { ' + #13#10 +
    '    $count++; ' + #13#10 +
    '    $pct = [math]::Floor(($count / $total) * 100); ' + #13#10 +
    '    if ($pct -ne $lastPct) { [IO.File]::WriteAllText($progFile, $pct.ToString()); $lastPct = $pct }; ' + #13#10 +
    '    $destPath = [IO.Path]::Combine($dest, $entry.FullName); ' + #13#10 +
    '    $dir = [IO.Path]::GetDirectoryName($destPath); ' + #13#10 +
    '    if (-not [IO.Directory]::Exists($dir)) { [IO.Directory]::CreateDirectory($dir) | Out-Null }; ' + #13#10 +
    '    if ($entry.Name -ne '''') { ' + #13#10 +
    '      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true); ' + #13#10 +
    '    } ' + #13#10 +
    '  }; ' + #13#10 +
    '  $zip.Dispose(); ' + #13#10 +
    '  [IO.File]::WriteAllText($progFile, ''DONE''); ' + #13#10 +
    '} catch { ' + #13#10 +
    '  [IO.File]::WriteAllText($progFile, ''ERROR''); ' + #13#10 +
    '}';

  SaveStringToFile(ScriptFile, ScriptContent, False);
  SaveStringToFile(ProgFile, '0', False);

  Cmd := '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ScriptFile + '"';
  
  if Exec('powershell.exe', Cmd, '', SW_HIDE, ewNoWait, Code) then
  begin
    while True do
    begin
      Sleep(50);
      ProcessMessages;
      
      if LoadStringFromFile(ProgFile, PctStrAnsi) then
      begin
        PctStr := Trim(String(PctStrAnsi));
        if PctStr = 'DONE' then
        begin
          Result := True;
          Break;
        end
        else if PctStr = 'ERROR' then
        begin
          Result := False;
          Break;
        end
        else
        begin
          Pct := StrToIntDef(PctStr, -1);
          if Pct >= 0 then
            UpdateProgress(70 + (Pct * 20 div 100), 'Dosyalar çıkartılıyor...');
        end;
      end;
    end;
  end;
  
  DeleteFile(ScriptFile);
  DeleteFile(ProgFile);
  
  if Result then
  begin
    Cmd := '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ' +
           '"$sub = Get-ChildItem ''' + DestDir + ''' | Where-Object { $_.PSIsContainer }; ' +
           'if ($sub.Count -eq 1) { ' +
           'Get-ChildItem $sub[0].FullName | Move-Item -Destination ''' + DestDir + ''' -Force; ' +
           'Remove-Item $sub[0].FullName -Recurse -Force }"';
    Exec('powershell.exe', Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code);
  end;
end;

procedure CreateShortcut(const LinkPath, TargetPath, WorkingDir, IconPath: String);
var
  ScriptFile: String;
  ScriptContent: String;
  Code: Integer;
  ActualIconPath: String;
begin
  if FileExists(IconPath) then ActualIconPath := IconPath else ActualIconPath := TargetPath;

  ScriptFile := ExpandConstant('{tmp}\create-shortcut.ps1');
  ScriptContent := '$W = New-Object -ComObject WScript.Shell' + #13#10 +
    '$S = $W.CreateShortcut("' + LinkPath + '")' + #13#10 +
    '$S.TargetPath = "' + TargetPath + '"' + #13#10 +
    '$S.WorkingDirectory = "' + WorkingDir + '"' + #13#10 +
    '$S.IconLocation = "' + ActualIconPath + ',0"' + #13#10 +
    '$S.Save()';
  SaveStringToFile(ScriptFile, ScriptContent, False);
  Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ScriptFile + '"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  DeleteFile(ScriptFile);
end;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
var
  Pct: Integer;
  DownloadedMB, TotalMB: Double;
  Msg: String;
begin
  Result := True;
  ProcessMessages;
  
  if ProgressMax > 0 then
  begin
    Pct := 15 + (Progress * 55 div ProgressMax);
    DownloadedMB := Progress / (1024.0 * 1024.0);
    TotalMB := ProgressMax / (1024.0 * 1024.0);
    Msg := Format('İndiriliyor: %.1f / %.1f MB', [DownloadedMB, TotalMB]);
  end else begin
    Pct := 15;
    Msg := 'İndiriliyor...';
  end;
  UpdateProgress(Pct, Msg);
end;

procedure RunInstallation;
var
  ZipPath, InstallDir: String;
  ResultCode: Integer;
begin
  InstallStarted := True;
  
  InstallButton.Visible := False;
  ProgBg.Visible := True;
  ProgFill.Visible := True;
  StatusLabel.Visible := True;
  PercentLabel.Visible := True;

  UpdateProgress(5, 'Sunucuya bağlanıyor...');
  if not FetchManifest then
  begin
    StatusLabel.Caption := 'Bağlantı hatası. Lütfen internetinizi kontrol edip tekrar açın.';
    StatusLabel.Font.Color := $000000FF; 
    InstallStarted := False;
    Exit;
  end;

  UpdateProgress(15, 'İndiriliyor: v' + FetchedVersion + '...');
  DownloadPage.Clear;
  DownloadPage.Add(FetchedDownloadURL, 'CloudflareProOtomasyon.zip', FetchedChecksum);

  try
    DownloadPage.Download;
  except
    StatusLabel.Caption := 'İndirme başarısız: ' + GetExceptionMessage;
    StatusLabel.Font.Color := $000000FF;
    InstallStarted := False;
    Exit;
  end;

  ZipPath    := ExpandConstant('{tmp}\CloudflareProOtomasyon.zip');
  InstallDir := ExpandConstant('{localappdata}\{#AppShortName}');

  if not DirExists(InstallDir) then CreateDir(InstallDir);

  UpdateProgress(70, 'Dosyalar çıkartılıyor...');
  if not ExtractZipWithProgress(ZipPath, InstallDir) then
  begin
    StatusLabel.Caption := 'Dosyalar açılamadı. Lütfen güvenlik duvarınızı kontrol edin.';
    StatusLabel.Font.Color := $000000FF;
    InstallStarted := False;
    DeleteFile(ZipPath);
    Exit;
  end;

  DeleteFile(ZipPath);
  UpdateProgress(90, 'Kısayollar oluşturuluyor...');

  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'Version', FetchedVersion);
  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'InstallPath', InstallDir);

  CreateShortcut(ExpandConstant('{userdesktop}\{#AppName}.lnk'), InstallDir + '\{#AppExeName}', InstallDir, InstallDir + '\{#AppIcon}');
  if not DirExists(ExpandConstant('{userstartmenu}')) then ForceDirectories(ExpandConstant('{userstartmenu}'));
  CreateShortcut(ExpandConstant('{userstartmenu}\{#AppName}.lnk'), InstallDir + '\{#AppExeName}', InstallDir, InstallDir + '\{#AppIcon}');

  UpdateProgress(100, 'Kurulum tamamlandı! Uygulama açılıyor...');
  StatusLabel.Font.Color := $0045A728; 
  InstallSuccess := True;
  InstallStarted := False;
  WizardForm.Refresh;

  if FileExists(InstallDir + '\{#AppExeName}') then
    ShellExec('open', InstallDir + '\{#AppExeName}', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);

  Sleep(1500);
  ProcessMessages;
  WizardForm.Close;
end;

procedure InstallButtonClick(Sender: TObject);
begin
  RunInstallation;
end;

procedure InitializeWizard;
var
  PageWidth: Integer;
begin
  InstallStarted := False;
  InstallSuccess := False;

  WizardForm.ClientWidth := ScaleX(480);
  WizardForm.ClientHeight := ScaleY(260);
  WizardForm.Left := (GetSystemMetrics(0) - WizardForm.Width) div 2;
  WizardForm.Top := (GetSystemMetrics(1) - WizardForm.Height) div 2;

  WizardForm.Color := clWhite;
  WizardForm.OuterNotebook.Hide;
  WizardForm.InnerNotebook.Hide;
  WizardForm.Bevel.Hide;
  HideStandardButtons;

  PageWidth := WizardForm.ClientWidth;

  AccentShape := TNewStaticText.Create(WizardForm);
  AccentShape.Parent := WizardForm;
  AccentShape.Left := 0;
  AccentShape.Top := 0;
  AccentShape.Width := PageWidth;
  AccentShape.Height := ScaleY(4);
  AccentShape.AutoSize := False;
  AccentShape.Caption := '';
  AccentShape.Color := $002080F3; 

  AppNameLabel := TNewStaticText.Create(WizardForm);
  AppNameLabel.Parent := WizardForm;
  AppNameLabel.Caption := '{#AppName}';
  AppNameLabel.Font.Size := 16;
  AppNameLabel.Font.Style := [fsBold];
  AppNameLabel.Font.Color := $00222222; 
  AppNameLabel.AutoSize := True;
  AppNameLabel.Left := (PageWidth div 2) - (ScaleX(190)); 
  AppNameLabel.Top := ScaleY(50);

  VersionLabel := TNewStaticText.Create(WizardForm);
  VersionLabel.Parent := WizardForm;
  VersionLabel.Caption := 'v{#AppVersion}';
  VersionLabel.Font.Size := 9;
  VersionLabel.Font.Color := $00888888;
  VersionLabel.AutoSize := True;
  VersionLabel.Left := AppNameLabel.Left;
  VersionLabel.Top := ScaleY(85);

  PublisherLabel := TNewStaticText.Create(WizardForm);
  PublisherLabel.Parent := WizardForm;
  PublisherLabel.Caption := '{#AppPublisher} - saffetcelik.com.tr';
  PublisherLabel.Font.Size := 8;
  PublisherLabel.Font.Color := $00AAAAAA;
  PublisherLabel.AutoSize := True;
  PublisherLabel.Left := AppNameLabel.Left;
  PublisherLabel.Top := ScaleY(105);

  ProgBg := TNewStaticText.Create(WizardForm);
  ProgBg.Parent := WizardForm;
  ProgBg.Left := ScaleX(40);
  ProgBg.Width := PageWidth - ScaleX(80);
  ProgBg.Top := ScaleY(180);
  ProgBg.Height := ScaleY(4); 
  ProgBg.AutoSize := False;
  ProgBg.Caption := '';
  ProgBg.Color := $00EEEEEE;
  ProgBg.Visible := False;

  ProgFill := TNewStaticText.Create(WizardForm);
  ProgFill.Parent := WizardForm;
  ProgFill.Left := ProgBg.Left;
  ProgFill.Width := 0;
  ProgFill.Top := ProgBg.Top;
  ProgFill.Height := ProgBg.Height;
  ProgFill.AutoSize := False;
  ProgFill.Caption := '';
  ProgFill.Color := $002080F3; 
  ProgFill.Visible := False;

  StatusLabel := TNewStaticText.Create(WizardForm);
  StatusLabel.Parent := WizardForm;
  StatusLabel.Caption := 'Başlatılıyor...';
  StatusLabel.Font.Size := 9;
  StatusLabel.Font.Color := $00666666;
  StatusLabel.AutoSize := False;
  StatusLabel.Width := ScaleX(300);
  StatusLabel.Height := ScaleY(20);
  StatusLabel.Left := ProgBg.Left;
  StatusLabel.Top := ProgBg.Top - ScaleY(22);
  StatusLabel.Alignment := taLeftJustify;
  StatusLabel.Visible := False;

  PercentLabel := TNewStaticText.Create(WizardForm);
  PercentLabel.Parent := WizardForm;
  PercentLabel.Caption := '0%';
  PercentLabel.Font.Size := 9;
  PercentLabel.Font.Style := [fsBold];
  PercentLabel.Font.Color := $002080F3; 
  PercentLabel.AutoSize := False;
  PercentLabel.Width := ScaleX(50);
  PercentLabel.Height := ScaleY(20);
  PercentLabel.Left := ProgBg.Left + ProgBg.Width - PercentLabel.Width;
  PercentLabel.Top := StatusLabel.Top;
  PercentLabel.Alignment := taRightJustify;
  PercentLabel.Visible := False;

  InstallButton := TNewButton.Create(WizardForm);
  InstallButton.Parent := WizardForm;
  InstallButton.Caption := 'Hemen Kur';
  InstallButton.Width := ScaleX(200);
  InstallButton.Height := ScaleY(40);
  InstallButton.Left := (PageWidth - InstallButton.Width) div 2;
  InstallButton.Top := ScaleY(160);
  InstallButton.Font.Size := 10;
  InstallButton.Font.Style := [fsBold];
  InstallButton.OnClick := @InstallButtonClick;
  InstallButton.Default := True;

  DownloadPage := CreateDownloadPage('','', @OnDownloadProgress);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  HideStandardButtons;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if InstallStarted and not InstallSuccess then
  begin
    Cancel := False;
    Confirm := False;
  end
  else
  begin
    Cancel := True;
    Confirm := False; 
  end;
end;

function InitializeUninstall: Boolean;
var
  Code: Integer;
begin
  Result := True;
  Exec('taskkill.exe', '/F /IM "{#AppExeName}"', '', SW_HIDE, ewWaitUntilTerminated, Code);
  DeleteFile(ExpandConstant('{userdesktop}\{#AppName}.lnk'));
  DeleteFile(ExpandConstant('{userstartmenu}\{#AppName}.lnk'));
end;
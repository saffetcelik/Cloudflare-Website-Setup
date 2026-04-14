#define AppName       "Cloudflare Site Kurulum Otomasyonu"
#define AppShortName  "CloudflareProOtomasyon"
#define AppVersion    "1.0.37"
#define AppPublisher  "Saffet Celik"
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
AppSupportURL=https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest
AppUpdatesURL=https://template-update-service.saffetcelik.com.tr/cloudflareprootomasyon/manifest
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
Name: "{userdesktop}\{#AppName}";   Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\cloudflare-pages.ico"; WorkingDir: "{app}"; Comment: "Cloudflare site kurulum araci"
Name: "{userstartmenu}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\cloudflare-pages.ico"; WorkingDir: "{app}"; Comment: "Cloudflare site kurulum araci"

[Files]
Source: "{#AppIcon}"; DestDir: "{app}"; Flags: ignoreversion

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: files;          Name: "{userdesktop}\{#AppName}.lnk"
Type: files;          Name: "{userstartmenu}\{#AppName}.lnk"

[Registry]
Root: HKCU; Subkey: "Software\{#AppShortName}"; ValueType: string; ValueName: "Version";     ValueData: ""
Root: HKCU; Subkey: "Software\{#AppShortName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"
Root: HKCU; Subkey: "Software\{#AppShortName}"; Flags: uninsdeletekey

[Code]

function GetSystemMetrics(nIndex: Integer): Integer;
  external 'GetSystemMetrics@user32.dll stdcall';

function PostMessage(hWnd: Integer; Msg: Integer; wParam: Integer; lParam: Integer): Boolean;
  external 'PostMessageA@user32.dll stdcall';

function GetWindowLong(hWnd: HWND; nIndex: Integer): LongInt;
  external 'GetWindowLongA@user32.dll stdcall';

function SetWindowLong(hWnd: HWND; nIndex: Integer; dwNewLong: LongInt): LongInt;
  external 'SetWindowLongA@user32.dll stdcall';

function SendMessage(hWnd: HWND; Msg: Cardinal; wParam, lParam: LongInt): LongInt;
  external 'SendMessageA@user32.dll stdcall';

const
  GWL_STYLE      = -16;
  PBS_MARQUEE    = $0008;
  PBM_SETMARQUEE = $400 + 10;

var
  InstallButton  : TNewButton;
  CloseButton    : TNewButton;
  StatusLabel    : TNewStaticText;
  ProgressBar    : TNewProgressBar;
  PercentLabel   : TNewStaticText;
  AppNameLabel   : TNewStaticText;
  VersionLabel   : TNewStaticText;
  PublisherLabel : TNewStaticText;
  DownloadPage   : TDownloadWizardPage;

  FetchedDownloadURL : String;
  FetchedChecksum    : String;
  FetchedVersion     : String;

  InstallStarted : Boolean;
  InstallSuccess : Boolean;

procedure SetMarquee(Enable: Boolean);
var
  Style: LongInt;
begin
  Style := GetWindowLong(ProgressBar.Handle, GWL_STYLE);
  if Enable then
  begin
    Style := Style or PBS_MARQUEE;
    SetWindowLong(ProgressBar.Handle, GWL_STYLE, Style);
    SendMessage(ProgressBar.Handle, PBM_SETMARQUEE, 1, 60);
  end else begin
    Style := Style and (not PBS_MARQUEE);
    SetWindowLong(ProgressBar.Handle, GWL_STYLE, Style);
    SendMessage(ProgressBar.Handle, PBM_SETMARQUEE, 0, 0);
  end;
end;

procedure WriteUninstallInfo(const InstallDir, Version: String);
var
  UninstKey: String;
begin
  UninstKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppShortName}';
  RegWriteStringValue(HKCU, UninstKey, 'DisplayName',     '{#AppName}');
  RegWriteStringValue(HKCU, UninstKey, 'DisplayVersion',  Version);
  RegWriteStringValue(HKCU, UninstKey, 'Publisher',       '{#AppPublisher}');
  RegWriteStringValue(HKCU, UninstKey, 'InstallLocation', InstallDir);
  RegWriteStringValue(HKCU, UninstKey, 'URLInfoAbout',    '{#AppURL}');
  RegWriteStringValue(HKCU, UninstKey, 'DisplayIcon',     InstallDir + '\{#AppExeName},0');
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
  while (P1 <= Length(JSON)) and ((JSON[P1] = ':') or (JSON[P1] = ' ')) do Inc(P1);
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

procedure UpdateProgress(Pct: Integer; const Msg: String);
begin
  ProgressBar.Position := Pct;
  StatusLabel.Caption  := Msg;
  PercentLabel.Caption := IntToStr(Pct) + '%';
  WizardForm.Refresh;
end;

procedure CreateShortcut(const LinkPath, TargetPath, WorkingDir, IconPath: String);
var
  ScriptFile, ScriptContent, ActualIconPath: String;
  Code: Integer;
begin
  if FileExists(IconPath) then
    ActualIconPath := IconPath
  else
    ActualIconPath := TargetPath;

  ScriptFile := ExpandConstant('{tmp}\create-shortcut.ps1');
  ScriptContent :=
    '$W = New-Object -ComObject WScript.Shell' + #13#10 +
    '$S = $W.CreateShortcut("' + LinkPath + '")' + #13#10 +
    '$S.TargetPath = "' + TargetPath + '"' + #13#10 +
    '$S.WorkingDirectory = "' + WorkingDir + '"' + #13#10 +
    '$S.IconLocation = "' + ActualIconPath + ',0"' + #13#10 +
    '$S.Save()';
  SaveStringToFile(ScriptFile, ScriptContent, False);
  Exec('powershell.exe', '-NoProfile -ExecutionPolicy Bypass -File "' + ScriptFile + '"',
    '', SW_HIDE, ewWaitUntilTerminated, Code);
  DeleteFile(ScriptFile);
end;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
var
  Pct: Integer;
  Msg: String;
begin
  Result := True;
  if ProgressMax > 0 then
  begin
    Pct := 15 + (Progress * 55 div ProgressMax);
    Msg := Format('Indiriliyor: %.1f / %.1f MB', [Progress / 1048576.0, ProgressMax / 1048576.0]);
  end else begin
    Pct := 15;
    Msg := 'Indiriliyor...';
  end;
  ProgressBar.Position := Pct;
  PercentLabel.Caption := IntToStr(Pct) + '%';
  StatusLabel.Caption  := Msg;
  WizardForm.Refresh;
end;

procedure SetErrorState(const Msg: String);
begin
  SetMarquee(False);
  ProgressBar.Position   := 0;
  PercentLabel.Caption   := '0%';
  StatusLabel.Caption    := Msg;
  StatusLabel.Font.Color := $0000CC;
  InstallButton.Caption  := 'Tekrar Dene';
  InstallButton.Enabled  := True;
  InstallStarted         := False;
  WizardForm.Refresh;
end;

procedure RunInstallation;
var
  ZipPath, InstallDir: String;
  ResultCode: Integer;
begin
  InstallStarted        := True;
  InstallButton.Enabled := False;
  InstallButton.Caption := 'Kuruluyor...';
  ProgressBar.Visible   := True;
  PercentLabel.Visible  := True;

  UpdateProgress(5, 'Sunucuya baglaniliyor...');
  if not FetchManifest then
  begin
    SetErrorState('Sunucuya baglanılamadı! İnternet baglantınızı kontrol edin.');
    Exit;
  end;

  UpdateProgress(15, 'Indiriliyor: v' + FetchedVersion + '...');
  DownloadPage.Clear;
  DownloadPage.Add(FetchedDownloadURL, 'CloudflareProOtomasyon.zip', FetchedChecksum);
  try
    DownloadPage.Download;
  except
    SetErrorState('Indirme basarisiz: ' + GetExceptionMessage);
    Exit;
  end;

  PercentLabel.Caption := '';
  StatusLabel.Caption  := 'Dosyalar cikartiliyor, lutfen bekleyin...';
  ProgressBar.Position := 70;
  SetMarquee(True);
  WizardForm.Refresh;

  ZipPath    := ExpandConstant('{tmp}\CloudflareProOtomasyon.zip');
  InstallDir := ExpandConstant('{localappdata}\{#AppShortName}');
  if not DirExists(InstallDir) then CreateDir(InstallDir);

  if not ExtractZip(ZipPath, InstallDir) then
  begin
    DeleteFile(ZipPath);
    SetMarquee(False);
    SetErrorState('Dosyalar acilamadi. Lutfen tekrar deneyin.');
    Exit;
  end;

  DeleteFile(ZipPath);
  SetMarquee(False);

  UpdateProgress(90, 'Kurulum tamamlaniyor...');
  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'Version',     FetchedVersion);
  RegWriteStringValue(HKCU, 'Software\{#AppShortName}', 'InstallPath', InstallDir);
  WriteUninstallInfo(InstallDir, FetchedVersion);

  CreateShortcut(
    ExpandConstant('{userdesktop}\{#AppName}.lnk'),
    InstallDir + '\{#AppExeName}', InstallDir,
    InstallDir + '\{#AppIcon}');

  if not DirExists(ExpandConstant('{userstartmenu}')) then
    ForceDirectories(ExpandConstant('{userstartmenu}'));

  CreateShortcut(
    ExpandConstant('{userstartmenu}\{#AppName}.lnk'),
    InstallDir + '\{#AppExeName}', InstallDir,
    InstallDir + '\{#AppIcon}');

  UpdateProgress(100, 'Kurulum basariyla tamamlandi!');
  StatusLabel.Font.Color := $006600;

  InstallSuccess := True;

  if FileExists(InstallDir + '\{#AppExeName}') then
    ShellExec('open', InstallDir + '\{#AppExeName}', '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);

  InstallButton.Visible := False;
  CloseButton.Visible   := True;
  WizardForm.Refresh;
end;

procedure CloseButtonClick(Sender: TObject);
begin
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

  WizardForm.ClientWidth  := ScaleX(430);
  WizardForm.ClientHeight := ScaleY(340);
  WizardForm.Left := (GetSystemMetrics(0) - WizardForm.Width) div 2;
  WizardForm.Top  := (GetSystemMetrics(1) - WizardForm.Height) div 2;

  WizardForm.OuterNotebook.Hide;
  WizardForm.InnerNotebook.Hide;
  WizardForm.Bevel.Hide;
  WizardForm.NextButton.Visible   := False;
  WizardForm.BackButton.Visible   := False;
  WizardForm.CancelButton.Visible := False;

  PageWidth := WizardForm.ClientWidth;

  AppNameLabel := TNewStaticText.Create(WizardForm);
  AppNameLabel.Parent     := WizardForm;
  AppNameLabel.Caption    := '{#AppName}';
  AppNameLabel.Font.Size  := 14;
  AppNameLabel.Font.Style := [fsBold];
  AppNameLabel.Font.Color := $333333;
  AppNameLabel.AutoSize   := True;
  AppNameLabel.Top        := ScaleY(50);
  AppNameLabel.Left       := (PageWidth div 2) - ScaleX(200);

  VersionLabel := TNewStaticText.Create(WizardForm);
  VersionLabel.Parent     := WizardForm;
  VersionLabel.Caption    := 'v{#AppVersion}';
  VersionLabel.Font.Size  := 9;
  VersionLabel.Font.Color := $888888;
  VersionLabel.AutoSize   := True;
  VersionLabel.Top        := ScaleY(80);
  VersionLabel.Left       := AppNameLabel.Left;

  PublisherLabel := TNewStaticText.Create(WizardForm);
  PublisherLabel.Parent     := WizardForm;
  PublisherLabel.Caption    := '{#AppPublisher} - saffetcelik.com.tr';
  PublisherLabel.Font.Size  := 8;
  PublisherLabel.Font.Color := $AAAAAA;
  PublisherLabel.AutoSize   := True;
  PublisherLabel.Top        := ScaleY(100);
  PublisherLabel.Left       := AppNameLabel.Left;

  InstallButton := TNewButton.Create(WizardForm);
  InstallButton.Parent     := WizardForm;
  InstallButton.Caption    := 'Kurulumu Baslat';
  InstallButton.Width      := ScaleX(280);
  InstallButton.Height     := ScaleY(44);
  InstallButton.Left       := (PageWidth - InstallButton.Width) div 2;
  InstallButton.Top        := ScaleY(140);
  InstallButton.Font.Size  := 11;
  InstallButton.Font.Style := [fsBold];
  InstallButton.OnClick    := @InstallButtonClick;
  InstallButton.Default    := True;

  CloseButton := TNewButton.Create(WizardForm);
  CloseButton.Parent    := WizardForm;
  CloseButton.Caption   := 'Kapat';
  CloseButton.Width     := ScaleX(120);
  CloseButton.Height    := ScaleY(36);
  CloseButton.Left      := (PageWidth - CloseButton.Width) div 2;
  CloseButton.Top       := ScaleY(148);
  CloseButton.Font.Size := 10;
  CloseButton.OnClick   := @CloseButtonClick;
  CloseButton.Visible   := False;

  ProgressBar := TNewProgressBar.Create(WizardForm);
  ProgressBar.Parent   := WizardForm;
  ProgressBar.Left     := (PageWidth - ScaleX(340)) div 2;
  ProgressBar.Top      := ScaleY(205);
  ProgressBar.Width    := ScaleX(340);
  ProgressBar.Height   := ScaleY(20);
  ProgressBar.Min      := 0;
  ProgressBar.Max      := 100;
  ProgressBar.Position := 0;
  ProgressBar.Visible  := False;

  PercentLabel := TNewStaticText.Create(WizardForm);
  PercentLabel.Parent     := WizardForm;
  PercentLabel.Caption    := '0%';
  PercentLabel.Font.Size  := 9;
  PercentLabel.Font.Color := $555555;
  PercentLabel.Font.Style := [fsBold];
  PercentLabel.AutoSize   := True;
  PercentLabel.Top        := ScaleY(230);
  PercentLabel.Left       := (PageWidth - ScaleX(30)) div 2;
  PercentLabel.Visible    := False;

  StatusLabel := TNewStaticText.Create(WizardForm);
  StatusLabel.Parent     := WizardForm;
  StatusLabel.Caption    := 'Kuruluma baslamak icin butona tiklayin.';
  StatusLabel.Font.Size  := 9;
  StatusLabel.Font.Color := $666666;
  StatusLabel.AutoSize   := False;
  StatusLabel.Width      := ScaleX(380);
  StatusLabel.Height     := ScaleY(40);
  StatusLabel.Left       := (PageWidth - StatusLabel.Width) div 2;
  StatusLabel.Top        := ScaleY(260);
  StatusLabel.Alignment  := taCenter;
  StatusLabel.WordWrap   := True;

  DownloadPage := CreateDownloadPage(
    'Indiriliyor',
    'Uygulama dosyalari sunucudan guvenli sekilde indiriliyor...',
    @OnDownloadProgress);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  WizardForm.NextButton.Visible   := False;
  WizardForm.BackButton.Visible   := False;
  WizardForm.CancelButton.Visible := False;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  WizardForm.NextButton.Visible   := False;
  WizardForm.BackButton.Visible   := False;
  WizardForm.CancelButton.Visible := False;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if InstallSuccess then
  begin
    Cancel  := True;
    Confirm := False;
  end
  else if InstallStarted then
  begin
    Cancel  := False;
    Confirm := False;
    MsgBox('Kurulum devam ediyor, lutfen bekleyin.', mbInformation, MB_OK);
  end
  else begin
    Cancel  := True;
    Confirm := True;
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

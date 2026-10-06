; Axe Code for Windows — per-user installer (Inno Setup 6).
;
; Built by scripts/package-windows.ps1, which passes the version, the package
; architecture, and the staged portable directory:
;   ISCC.exe /DAppVersion=0.2.97 /DArch=x86_64 /DPackageDir=<stage> /DOutputDir=<out> axecode.iss
;
; Installs into %LOCALAPPDATA%\Programs\Axe Code without elevation, like VS
; Code's user setup: the directory stays writable by its user, so the in-app
; updater (crates/update/src/windows.rs) can replace axecode.exe in place. The
; staged directory already carries axecode-update.json, which marks the install
; as update-managed. Re-running a newer installer upgrades in place; user data
; lives in %LOCALAPPDATA%\Axe Code and is never touched here.

#ifndef AppVersion
  #error AppVersion must be defined (/DAppVersion=x.y.z)
#endif
#ifndef Arch
  #error Arch must be defined (/DArch=x86_64 or /DArch=aarch64)
#endif
#ifndef PackageDir
  #error PackageDir must be defined (/DPackageDir=<staged package directory>)
#endif
#ifndef OutputDir
  #define OutputDir "."
#endif

#if Arch == "aarch64"
  #define ArchAllowed "arm64"
#else
  #define ArchAllowed "x64compatible"
#endif

[Setup]
; Never change AppId: it identifies the installation across upgrades, and
; crates/update/src/windows.rs refreshes DisplayVersion under this key after
; in-app updates.
AppId={{AD5DEC34-E254-467B-8F24-8127EBAF4DA6}
AppName=Axe Code
AppVersion={#AppVersion}
AppVerName=Axe Code {#AppVersion}
AppPublisher=Axe Code
AppPublisherURL=https://axeai.com
AppSupportURL=https://github.com/axecodesh/axecode/issues
AppUpdatesURL=https://github.com/amitbtcai/axecode/releases
VersionInfoVersion={#AppVersion}
PrivilegesRequired=lowest
DefaultDirName={autopf}\Axe Code
DisableProgramGroupPage=yes
DisableDirPage=auto
DisableReadyPage=yes
ArchitecturesAllowed={#ArchAllowed}
ArchitecturesInstallIn64BitMode={#ArchAllowed}
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=AxeCode-{#AppVersion}-windows-{#Arch}-setup
SetupIconFile=axecode.ico
UninstallDisplayIcon={app}\axecode.exe
UninstallDisplayName=Axe Code
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; A running Axe Code is closed through the Restart Manager before its files are
; replaced; the updated app starts again from the finish page.
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PackageDir}\axecode.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PackageDir}\axecode-update.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PackageDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PackageDir}\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PackageDir}\licenses\*"; DestDir: "{app}\licenses"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Axe Code"; Filename: "{app}\axecode.exe"
Name: "{autodesktop}\Axe Code"; Filename: "{app}\axecode.exe"; Tasks: desktopicon

[Registry]
; axecode:// conversation links — the scheme macOS registers in Info.plist and
; Linux in axecode.desktop.
Root: HKCU; Subkey: "Software\Classes\axecode"; ValueType: string; ValueName: ""; ValueData: "URL:Axe Code"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\axecode"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\axecode\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\axecode.exe"",0"
Root: HKCU; Subkey: "Software\Classes\axecode\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\axecode.exe"" ""%1"""

[Run]
Filename: "{app}\axecode.exe"; Description: "{cm:LaunchProgram,Axe Code}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Leftovers of in-app updates (crates/update/src/windows.rs).
Type: files; Name: "{app}\axecode.exe.old"
Type: files; Name: "{app}\.axecode-update-incoming.exe"
Type: filesandordirs; Name: "{app}\.axecode-update-*"

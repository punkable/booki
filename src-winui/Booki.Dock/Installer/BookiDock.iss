#define MyAppName "Booki Dock"
#ifndef MyAppVersion
#define MyAppVersion "0.51.0"
#endif
#define MyAppExeName "Booki.Dock.exe"

[Setup]
AppId={{C6160D70-17C5-4CB0-9D43-80DF4EF4770A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Punkable
AppPublisherURL=https://github.com/punkable/booki
AppSupportURL=https://github.com/punkable/booki/issues
AppUpdatesURL=https://github.com/punkable/booki/releases/latest
DefaultDirName={localappdata}\Programs\Booki Dock
DefaultGroupName=Booki Dock
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=Booki-Dock-WinUI3-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\Assets\AppIcon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no

[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Booki Dock"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{userdesktop}\Booki Dock"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos adicionales:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Booki Dock"; Flags: nowait postinstall skipifsilent

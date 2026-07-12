#define MyAppName "Booki Dock"
#define MyAppVersion "0.51.0"

[Setup]
AppId={{C6160D70-17C5-4CB0-9D43-80DF4EF4770A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Punkable
AppPublisherURL=https://github.com/punkable/booki
DefaultDirName={localappdata}\Booki Dock Installer
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename=Booki-Dock-WinUI3-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\Assets\AppIcon.ico
Uninstallable=no

[Files]
Source: "Booki-Punkable.cer"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "BookiDock.appinstaller"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Run]
Filename: "certutil.exe"; Parameters: "-user -addstore TrustedPeople ""{tmp}\Booki-Punkable.cer"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Add-AppxPackage -AppInstallerFile '{tmp}\BookiDock.appinstaller'"""; Flags: waituntilterminated

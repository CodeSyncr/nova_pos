#define MyAppName "NovaPOS"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "CodeSyncr"
#define MyAppURL "https://github.com/CodeSyncr/nova_pos"
#define MyAppExeName "NovaPOS.exe"
#define MyAppId "{{8F5A9A7A-4D3F-4D3B-9C1E-7F8A9B0C1D2E}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=NovaPOS-Setup
OutputDir=dist-installer
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

; Seamless Auto-Update & Overwrite configuration
UsePreviousAppDir=yes
CloseApplications=force
CloseApplicationsFilter=*.exe
RestartApplications=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist-singlefile\NovaPOS.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

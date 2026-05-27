#define AppName "Rapor Kurikulum Merdeka"
#define AppVersion "1.4.6"
#define StagePath "..\\dist\\windows\\stage\\Rapkumer"

[Setup]
AppId={{06E10F9F-0AD2-4F31-A64B-7C3B36F2D0D6}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher="Rapkumer"
AppPublisherURL="https://github.com/sira313/raporkumer"
AppContact="me@apoxi.cam"
; Install under the current user's Local AppData so admin privileges are not required
DefaultDirName={localappdata}\Rapkumer
DefaultGroupName=Rapkumer
DisableProgramGroupPage=yes
OutputDir=..\dist\windows
OutputBaseFilename=RapkumerSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Do not require administrator privileges when installing to per-user LocalAppData
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\rapkumer.ico
VersionInfoVersion={#AppVersion}
SetupIconFile={#StagePath}\rapkumer.ico
; Code signing configuration (commented out by default)
; Uncomment and configure these lines if you want Inno Setup to sign the installer
; SignTool=custom "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "Rapor Kurikulum Merdeka Installer" /f "installer\cert\codesign.pfx" /p "YOUR_PASSWORD" $f
; SignedUninstaller=yes

[Files]
Source:"{#StagePath}\\*"; DestDir:"{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source:"files\\start-rapkumer.mjs"; DestDir:"{app}"; Flags: ignoreversion

[Run]
Filename:"node"; Parameters:"""{app}\scripts\migrate-installed-db.mjs"""; WorkingDir:"{app}"; StatusMsg:"Menjalankan migrasi database (drizzle-kit) pada mesin ini..."; Flags: runhidden waituntilterminated

[Icons]
Name:"{autoprograms}\Rapkumer\Rapkumer"; Filename:"{sys}\cmd.exe"; Parameters:"/c ""node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\rapkumer.ico"
Name:"{autodesktop}\Rapkumer"; Filename:"{sys}\cmd.exe"; Parameters:"/c ""node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\rapkumer.ico"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
	EnvPath, DbPath, DbDir, S, SrcDb, LogDir, LogFile: string;
begin
	if CurStep = ssPostInstall then
	begin
		DbPath := ExpandConstant('{localappdata}\Rapkumer-data\database.sqlite3');
		DbDir := ExtractFileDir(DbPath);
		if not DirExists(DbDir) then
			ForceDirectories(DbDir);
			// If the user doesn't already have a DB in their user state, copy the packaged one
			SrcDb := ExpandConstant('{localappdata}\Rapkumer\data\database.sqlite3');
			if (not FileExists(DbPath)) and FileExists(SrcDb) then
			begin
				if not CopyFile(SrcDb, DbPath, False) then
					Log(Format('Failed to copy initial database from %s to %s', [SrcDb, DbPath]));
			end;

			// Ensure log directory and empty log file exist
			LogDir := ExpandConstant('{localappdata}\Rapkumer-data\logs');
			if not DirExists(LogDir) then
				ForceDirectories(LogDir);
			LogFile := LogDir + '\\rapkumer.log';
			if not FileExists(LogFile) then
				SaveStringToFile(LogFile, '', False);
		EnvPath := ExpandConstant('{app}\.env');
		S := 'DB_URL="file:' + DbPath + '"' + #13#10 + 'BODY_SIZE_LIMIT=5M' + #13#10 + 'photo="file:' + ExpandConstant('{localappdata}\Rapkumer-data\uploads') + '"';
		if SaveStringToFile(EnvPath, S, False) then
			Log(Format('Wrote .env to %s', [EnvPath]))
		else
			Log(Format('Failed to write .env to %s', [EnvPath]));
	end;
end;
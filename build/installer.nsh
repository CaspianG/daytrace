!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var DaytraceShortcutCheckbox
Var DaytraceCreateDesktopShortcut

LangString DaytraceShortcutTitle 1033 "Shortcuts"
LangString DaytraceShortcutTitle 1049 "Ярлыки"
LangString DaytraceShortcutDescription 1033 "Choose where Daytrace should be available."
LangString DaytraceShortcutDescription 1049 "Выберите, где будет доступен Daytrace."
LangString DaytraceShortcutCheckboxText 1033 "Create a shortcut on the Desktop"
LangString DaytraceShortcutCheckboxText 1049 "Создать ярлык на рабочем столе"
!macro customInit
  StrCpy $DaytraceCreateDesktopShortcut ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom DaytraceShortcutPageCreate DaytraceShortcutPageLeave
!macroend

Function DaytraceShortcutPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 16u "$(DaytraceShortcutTitle)"
  Pop $0
  ${NSD_CreateLabel} 0 20u 100% 24u "$(DaytraceShortcutDescription)"
  Pop $0
  ${NSD_CreateCheckbox} 0 54u 100% 18u "$(DaytraceShortcutCheckboxText)"
  Pop $DaytraceShortcutCheckbox
  ${NSD_SetState} $DaytraceShortcutCheckbox $DaytraceCreateDesktopShortcut
  nsDialogs::Show
FunctionEnd

Function DaytraceShortcutPageLeave
  ${NSD_GetState} $DaytraceShortcutCheckbox $DaytraceCreateDesktopShortcut
FunctionEnd

!macro customInstall
  ${If} $DaytraceCreateDesktopShortcut == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
!macroend

' Lance Isaac Achievement Manager sans fenêtre de console et ouvre le navigateur.
' Les messages du serveur sont ajoutés à data\server.log.
Option Explicit

Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

If Not fso.FileExists(root & "\web\dist\index.html") Then
  MsgBox "Interface non construite. Dans ce dossier, lance d'abord :" & vbCrLf & _
    "npm install" & vbCrLf & "npm run build", vbExclamation, "Isaac Achievement Manager"
  WScript.Quit 1
End If

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

shell.Run "cmd /c node server\index.ts --open >> data\server.log 2>&1", 0, False

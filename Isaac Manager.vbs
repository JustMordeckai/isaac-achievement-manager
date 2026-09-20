' Starts Isaac Achievement Manager with no console window and opens the browser.
' The server messages are appended to data\server.log.
Option Explicit

Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

If Not fso.FileExists(root & "\web\dist\index.html") Then
  MsgBox "Interface not built. In this folder, run first:" & vbCrLf & _
    "npm install" & vbCrLf & "npm run build", vbExclamation, "Isaac Achievement Manager"
  WScript.Quit 1
End If

If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

shell.Run "node server\index.ts --open --log", 0, False

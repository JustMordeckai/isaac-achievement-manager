' Starts Isaac Achievement Manager with no console window and opens the browser.
' It runs Isaac Manager.cmd, whose messages are appended to data\server.log.
Option Explicit

Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")

shell.Run "cmd /c call """ & root & "\Isaac Manager.cmd"" hidden 1>> """ & root & "\data\server.log"" 2>&1", 0, False

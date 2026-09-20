' Starts Isaac Achievement Manager with no console window and opens the browser.
' It runs Isaac Manager.cmd, which appends its messages to data\server.log.
Option Explicit

Dim shell, fso, root
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

shell.Run "cmd /c call """ & root & "\Isaac Manager.cmd"" hidden", 0, False

@echo off
rem sr entry for Windows (same as ./sr). Keep this file ASCII: cmd.exe reads it in the console code page.
node "%~dp0pipeline\cli\main.ts" %*

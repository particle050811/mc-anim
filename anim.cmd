@echo off
rem anim entry for Windows (same as ./anim). Keep this file ASCII: cmd.exe reads it in the console code page.
node "%~dp0pipeline\cli\main.ts" %*

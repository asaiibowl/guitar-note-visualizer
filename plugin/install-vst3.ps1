# Copies the built VST3 into the system VST3 folder (needs administrator rights).
# Usage: right-click > "Run with PowerShell", or from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File plugin\install-vst3.ps1
# To use a custom VST3 folder instead (no admin needed if it is writable):
#   powershell -ExecutionPolicy Bypass -File plugin\install-vst3.ps1 -Destination D:\VST3
param([string]$Destination = '')
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'build\rel\GuitarNoteVisualizer_artefacts\Release\VST3\Guitar Note Visualizer.vst3'
$dest = if ($Destination) { $Destination } else { Join-Path $env:CommonProgramFiles 'VST3' }

if (-not (Test-Path $src)) {
  Write-Error "Build output not found: $src`nBuild the plugin first (see plugin\README.md)."
}

$needsAdmin = -not $Destination
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($needsAdmin -and -not $admin) {
  # Re-run elevated (Windows shows a UAC prompt).
  Start-Process powershell -Verb RunAs -ArgumentList @('-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit
}

New-Item -ItemType Directory -Force $dest | Out-Null
$target = Join-Path $dest 'Guitar Note Visualizer.vst3'
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Copy-Item -Recurse $src $dest
Write-Host "Installed: $target"
Write-Host 'Ableton Live: Settings > Plug-Ins > turn on "Use VST3 Plug-in System Folders" and press Rescan.'
Read-Host 'Press Enter to close'

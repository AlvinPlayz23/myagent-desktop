Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$p = Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -eq 'myagent' -and $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $p) {
  $p = Get-Process electron -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if ($p) {
  [Win]::ShowWindow($p.MainWindowHandle, 3) | Out-Null   # SW_MAXIMIZE
  [Win]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 700
}
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save("$env:TEMP\myagent-shot.png")
Write-Output ("window=" + ($p.MainWindowTitle))

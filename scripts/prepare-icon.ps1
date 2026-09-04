# Готовит иконку приложения для electron-builder:
#   desktop/build/icon.png — PNG 256×256;
#   desktop/build/icon.ico — многослойный ICO (16/24/32/48/64/128/256,
#                            кадры со сжатием PNG — формат Vista+).
#
# Зачем: electron-builder на Windows берёт иконку exe/ярлыка и установщика
# ТОЛЬКО из .ico. Раньше скрипт умел лишь PNG, и NSIS падал с
# "cannot find specified resource build/icon.ico", если бинарник не попал
# в репозиторий. Теперь CI генерирует оба файла ПЕРЕД сборкой, а при полном
# отсутствии исходных картинок иконка рисуется программно (бренд: три
# «пузыря»-сообщения и буква Y на тёмном сквиркле).
param(
  [string]$Source = "",
  [string]$OutDir = "desktop/build"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$candidates = @()
if ($Source) { $candidates += $Source }
$candidates += @(
  "desktop/electron/assets/yawachat-icon-master.png",
  "desktop/electron/assets/yawachat-tray.png",
  "desktop/electron/assets/yawachat-tray.jpg",
  "desktop/build/icon.png",
  "public/game.jpg"
)

$sourcePath = $null
foreach ($c in $candidates) {
  if (Test-Path -LiteralPath $c) { $sourcePath = (Resolve-Path -LiteralPath $c).Path; break }
}

$outDir = (New-Item -ItemType Directory -Force -Path $OutDir).FullName

function New-SquareBitmap {
  param([System.Drawing.Image]$Img, [int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale = [Math]::Min($Size / $Img.Width, $Size / $Img.Height)
    $w = [Math]::Max(1, [int][Math]::Round($Img.Width * $scale))
    $h = [Math]::Max(1, [int][Math]::Round($Img.Height * $scale))
    $x = [int](($Size - $w) / 2)
    $y = [int](($Size - $h) / 2)
    $g.DrawImage($Img, $x, $y, $w, $h)
  }
  finally { $g.Dispose() }
  return $bmp
}

function Draw-FallbackIcon {
  param([int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    # тёмный сквиркл-подложка
    $r = [int]($Size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r, $r, 180, 90)
    $path.AddArc($Size - $r, 0, $r, $r, 270, 90)
    $path.AddArc($Size - $r, $Size - $r, $r, $r, 0, 90)
    $path.AddArc(0, $Size - $r, $r, $r, 90, 90)
    $path.CloseFigure()
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 11, 24))
    $g.FillPath($bgBrush, $path)
    # три «пузыря»-сообщения
    $b1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 139, 92, 246))
    $b2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 34, 211, 238))
    $b3 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 236, 72, 153))
    $g.FillEllipse($b1, [int]($Size * 0.20), [int]($Size * 0.18), [int]($Size * 0.42), [int]($Size * 0.42))
    $g.FillEllipse($b2, [int]($Size * 0.40), [int]($Size * 0.34), [int]($Size * 0.42), [int]($Size * 0.42))
    $g.FillEllipse($b3, [int]($Size * 0.24), [int]($Size * 0.50), [int]($Size * 0.38), [int]($Size * 0.38))
    # буква Y по центру
    $font = New-Object System.Drawing.Font("Segoe UI", [int]($Size * 0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString("Y", $font, [System.Drawing.Brushes]::White, $rect, $fmt)
    $font.Dispose(); $fmt.Dispose(); $path.Dispose()
    $bgBrush.Dispose(); $b1.Dispose(); $b2.Dispose(); $b3.Dispose()
  }
  finally { $g.Dispose() }
  return $bmp
}

function Get-FrameBitmap {
  param([System.Drawing.Image]$Img, [int]$Size)
  if ($Img) { return New-SquareBitmap -Img $Img -Size $Size }
  return Draw-FallbackIcon -Size $Size
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$src = $null
if ($sourcePath) {
  Write-Host "Icon source: $sourcePath"
  $src = [System.Drawing.Image]::FromFile($sourcePath)
}
else {
  Write-Host "Icon source not found — drawing brand icon programmatically"
}

# 1) PNG 256 (нужен electron-builder как запасной вариант и для трей-фолбэка)
$pngBmp = Get-FrameBitmap -Img $src -Size 256
$pngPath = Join-Path $outDir "icon.png"
$pngBmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBmp.Dispose()

# 2) Кадры ICO: PNG-байты каждого размера
$frames = New-Object System.Collections.ArrayList
foreach ($s in $sizes) {
  $bmp = Get-FrameBitmap -Img $src -Size $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [void]$frames.Add(@{ Size = $s; Bytes = $ms.ToArray() })
  $ms.Dispose()
  $bmp.Dispose()
}
if ($src) { $src.Dispose() }

# 3) Сборка ICO: ICONDIR + ICONDIRENTRY[] + кадры.
#    BinaryWriter пишет little-endian — как требует формат.
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0)                 # reserved
$bw.Write([uint16]1)                 # type: icon
$bw.Write([uint16]$frames.Count)     # count
$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
  $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }   # 0 == 256
  $bw.Write([byte]$dim)              # width
  $bw.Write([byte]$dim)              # height
  $bw.Write([byte]0)                 # color count
  $bw.Write([byte]0)                 # reserved
  $bw.Write([uint16]1)               # planes
  $bw.Write([uint16]32)              # bit count
  $bw.Write([uint32]$f.Bytes.Length) # bytes in resource
  $bw.Write([uint32]$offset)         # offset
  $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $bw.Write($f.Bytes) }
$bw.Flush()
$icoPath = Join-Path $outDir "icon.ico"
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()

Write-Host "Icon prepared: $icoPath (sizes: $($sizes -join ', ')) and $pngPath"

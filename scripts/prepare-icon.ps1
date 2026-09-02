# Создаёт настоящий PNG 256×256 для electron-builder (desktop/build/icon.png).
# Важно: генератор изображений может сохранить файл с расширением .png
# в JPEG-контейнере. Electron это читает, но Windows/electron-builder
# для ярлыка ожидает корректный PNG.
#
# Скрипт НЕ падает, если исходной картинки нет в репозитории (например,
# yawachat-tray.jpg не закоммичен): перебирает запасные источники, а если
# ничего не нашлось — рисует фирменную иконку программно.
param(
  [string]$Source = "desktop/electron/assets/yawachat-tray.jpg",
  [string]$Target = "desktop/build/icon.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$targetPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Target))
$targetDir = Split-Path -Parent $targetPath
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

# Порядок поиска исходника: явный параметр → уже существующий build/icon.png → картинка сайта.
$candidates = @(
  $Source,
  "desktop/electron/assets/yawachat-tray.png",
  "desktop/build/icon.png",
  "public/game.jpg"
)

$sourcePath = $null
foreach ($c in $candidates) {
  if (Test-Path -LiteralPath $c) {
    $sourcePath = (Resolve-Path -LiteralPath $c).Path
    break
  }
}

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($sourcePath) {
      Write-Host "Icon source: $sourcePath"
      $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
      try {
        # Вписываем по центру с сохранением пропорций (для не-квадратных исходников).
        $scale = [Math]::Min($size / $sourceImage.Width, $size / $sourceImage.Height)
        $w = [int][Math]::Round($sourceImage.Width * $scale)
        $h = [int][Math]::Round($sourceImage.Height * $scale)
        $x = [int](($size - $w) / 2)
        $y = [int](($size - $h) / 2)
        $graphics.DrawImage($sourceImage, $x, $y, $w, $h)
      }
      finally {
        $sourceImage.Dispose()
      }
    }
    else {
      # Фолбэк: фирменная иконка — скруглённый фиолетовый квадрат с буквой Y.
      Write-Host "Icon source not found — generating fallback icon"
      $violet = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)
      $bg = New-Object System.Drawing.SolidBrush($violet)
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      $r = 56
      $path.AddArc(0, 0, $r, $r, 180, 90)
      $path.AddArc($size - $r, 0, $r, $r, 270, 90)
      $path.AddArc($size - $r, $size - $r, $r, $r, 0, 90)
      $path.AddArc(0, $size - $r, $r, $r, 90, 90)
      $path.CloseFigure()
      $graphics.FillPath($bg, $path)

      $font = New-Object System.Drawing.Font("Segoe UI", 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $fmt = New-Object System.Drawing.StringFormat
      $fmt.Alignment = [System.Drawing.StringAlignment]::Center
      $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
      $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
      $graphics.DrawString("Y", $font, [System.Drawing.Brushes]::White, $rect, $fmt)

      $font.Dispose(); $fmt.Dispose(); $bg.Dispose(); $path.Dispose()
    }
  }
  finally {
    $graphics.Dispose()
  }

  # Если исходник — это сам целевой файл, сначала сохраняем во временный.
  $tmp = "$targetPath.tmp.png"
  $bitmap.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $bitmap.Dispose()
}
Move-Item -Force -LiteralPath $tmp -Destination $targetPath

Write-Host "Icon prepared: $targetPath"

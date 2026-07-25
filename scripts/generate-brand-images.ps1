param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\assets")
)

Add-Type -AssemblyName System.Drawing

function New-RoundedPath {
  param(
    [System.Drawing.RectangleF]$Rect,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedRectangle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [System.Drawing.RectangleF]$Rect,
    [float]$Radius
  )

  $path = New-RoundedPath -Rect $Rect -Radius $Radius
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-RoundedRectangle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Pen]$Pen,
    [System.Drawing.RectangleF]$Rect,
    [float]$Radius
  )

  $path = New-RoundedPath -Rect $Rect -Radius $Radius
  $Graphics.DrawPath($Pen, $path)
  $path.Dispose()
}

function New-Brush([string]$Hex) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Hex))
}

function New-BrandIcon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#10231b"))

  $accentBrush = New-Brush "#d7ff4f"
  $creamBrush = New-Brush "#fffaf0"
  $font = [System.Drawing.Font]::new("Arial", [float]($Size * 0.38), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.FillEllipse($accentBrush, [float]($Size * 0.72), [float]($Size * 0.13), [float]($Size * 0.14), [float]($Size * 0.14))
  $graphics.DrawString("OK", $font, $creamBrush, [System.Drawing.RectangleF]::new(0, 0, $Size, $Size), $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $accentBrush.Dispose()
  $creamBrush.Dispose()
  $font.Dispose()
  $format.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function New-ShareCard {
  param(
    [string]$Path
  )

  $bitmap = [System.Drawing.Bitmap]::new(1200, 630)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#101820"))

  $graphite = New-Brush "#101820"
  $panel = New-Brush "#1b2936"
  $cream = New-Brush "#f7f5ef"
  $muted = New-Brush "#aebbc7"
  $lime = New-Brush "#bdf24b"
  $cobalt = New-Brush "#3157ff"
  $green = New-Brush "#25d366"
  $white = New-Brush "#ffffff"

  $gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(12, 247, 245, 239), 1)
  for ($x = 0; $x -le 1200; $x += 44) { $graphics.DrawLine($gridPen, $x, 0, $x, 630) }
  for ($y = 0; $y -le 630; $y += 44) { $graphics.DrawLine($gridPen, 0, $y, 1200, $y) }
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42, 49, 87, 255)), 930, -160, 420, 420)

  Fill-RoundedRectangle $graphics $cream ([System.Drawing.RectangleF]::new(72, 66, 58, 58)) 17

  $fontBrand = [System.Drawing.Font]::new("Arial", 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontMeta = [System.Drawing.Font]::new("Arial", 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontOverline = [System.Drawing.Font]::new("Arial", 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontHero = [System.Drawing.Font]::new("Arial", 72, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontLead = [System.Drawing.Font]::new("Arial", 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $fontNumber = [System.Drawing.Font]::new("Arial", 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontSmall = [System.Drawing.Font]::new("Arial", 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontPanel = [System.Drawing.Font]::new("Arial", 14, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontMonogram = [System.Drawing.Font]::new("Arial", 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $monogramFormat = [System.Drawing.StringFormat]::new()
  $monogramFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $monogramFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

  $graphics.DrawString("OK", $fontMonogram, $graphite, [System.Drawing.RectangleF]::new(72, 66, 58, 58), $monogramFormat)
  $graphics.DrawString("OLEKSANDR KIRIS", $fontBrand, $cream, 148, 70)
  $graphics.DrawString("KIRIS JOBS / DIRECT RECRUITER CONTACT", $fontMeta, $muted, 148, 97)
  $graphics.DrawString("WORK ACROSS EUROPE", $fontOverline, $lime, 72, 218)
  $graphics.DrawString("Find work.", $fontHero, $cream, 66, 249)
  $graphics.DrawString("Know the terms.", $fontHero, $cream, 66, 323)
  $graphics.DrawString("Match locally. Review everything. Message directly.", $fontLead, $muted, 72, 422)

  Fill-RoundedRectangle $graphics $panel ([System.Drawing.RectangleF]::new(72, 500, 540, 72)) 22
  $graphics.DrawString("14", $fontNumber, $cream, 98, 511)
  $graphics.DrawString("VACANCIES", $fontSmall, $muted, 98, 540)
  $graphics.DrawString("11", $fontNumber, $cream, 236, 511)
  $graphics.DrawString("LANGUAGES", $fontSmall, $muted, 236, 540)
  $graphics.FillEllipse($green, 385, 527, 18, 18)
  $graphics.DrawString("WhatsApp direct", $fontBrand, $cream, 416, 521)

  $panelRect = [System.Drawing.RectangleF]::new(690, 130, 438, 390)
  Fill-RoundedRectangle $graphics $panel $panelRect 34
  $panelPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(36, 247, 245, 239), 1)
  Draw-RoundedRectangle $graphics $panelPen $panelRect 34
  Fill-RoundedRectangle $graphics $graphite ([System.Drawing.RectangleF]::new(718, 158, 382, 48)) 15
  $graphics.FillEllipse($lime, 735, 175, 14, 14)
  $graphics.DrawString("YOUR WORK ROUTE", $fontPanel, $cream, 760, 173)

  $routePen = [System.Drawing.Pen]::new($cobalt.Color, 5)
  $routePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $routePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawBezier($routePen, 766, 280, 840, 220, 914, 390, 972, 385)
  $graphics.DrawBezier($routePen, 972, 385, 1020, 380, 1040, 290, 1081, 290)

  foreach ($point in @(
    @{ X = 766; Y = 280; Label = "PL"; Color = $lime; Text = $graphite },
    @{ X = 972; Y = 385; Label = "HU"; Color = $cobalt; Text = $cream },
    @{ X = 1081; Y = 290; Label = "BE"; Color = $lime; Text = $graphite }
  )) {
    $graphics.FillEllipse($point.Color, $point.X - 20, $point.Y - 20, 40, 40)
    $labelFormat = [System.Drawing.StringFormat]::new()
    $labelFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $labelFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString($point.Label, $fontSmall, $point.Text, [System.Drawing.RectangleF]::new($point.X - 20, $point.Y - 20, 40, 40), $labelFormat)
    $labelFormat.Dispose()
  }

  Fill-RoundedRectangle $graphics $graphite ([System.Drawing.RectangleF]::new(718, 446, 382, 46)) 14
  $graphics.DrawString("MATCH", $fontSmall, $lime, 738, 462)
  $graphics.DrawString(">", $fontSmall, $muted, 822, 462)
  $graphics.DrawString("REVIEW", $fontSmall, $cream, 852, 462)
  $graphics.DrawString(">", $fontSmall, $muted, 946, 462)
  $graphics.DrawString("WHATSAPP", $fontSmall, $green, 978, 462)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  @($gridPen, $panelPen, $routePen, $fontBrand, $fontMeta, $fontOverline, $fontHero, $fontLead, $fontNumber, $fontSmall, $fontPanel, $fontMonogram, $monogramFormat, $graphite, $panel, $cream, $muted, $lime, $cobalt, $green, $white) |
    ForEach-Object { $_.Dispose() }
  $graphics.Dispose()
  $bitmap.Dispose()
}

$assetPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-BrandIcon -Size 192 -Path (Join-Path $assetPath "icon-192.png")
New-BrandIcon -Size 512 -Path (Join-Path $assetPath "icon-512.png")
New-ShareCard -Path (Join-Path $assetPath "share-card.png")

Write-Output "Generated icon-192.png, icon-512.png, and share-card.png"

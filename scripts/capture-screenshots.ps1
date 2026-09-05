Add-Type -AssemblyName System.Drawing

$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$targets = @(
  @{ html = 'D:\admin\tabvault\store-assets\preview-dashboard.html'; out = 'D:\admin\tabvault\store-assets\screenshot-1-dashboard-1280x800.png' },
  @{ html = 'D:\admin\tabvault\store-assets\preview-export.html'; out = 'D:\admin\tabvault\store-assets\screenshot-2-export-hub-1280x800.png' },
  @{ html = 'D:\admin\tabvault\store-assets\preview-drive.html'; out = 'D:\admin\tabvault\store-assets\screenshot-3-cloud-sync-1280x800.png' }
)

foreach ($t in $targets) {
  $tempRaw = "$($t.out).raw.png"
  $url = "file:///$($t.html -replace '\\', '/')"
  Start-Process -FilePath $chromePath -ArgumentList "--headless=new", "--screenshot=$tempRaw", "--window-size=1280,800", $url -Wait
  
  if (Test-Path $tempRaw) {
    $src = [System.Drawing.Image]::FromFile($tempRaw)
    $dest = New-Object System.Drawing.Bitmap 1280, 800, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, 1280, 800)
    $g.Dispose()
    $src.Dispose()

    if (Test-Path $t.out) { Remove-Item $t.out -Force }
    $dest.Save($t.out, [System.Drawing.Imaging.ImageFormat]::Png)
    $dest.Dispose()
    Remove-Item $tempRaw -Force
    Write-Output "Generated: $($t.out) (1280x800 24-bit PNG)"
  } else {
    Write-Error "Failed to capture $tempRaw"
  }
}

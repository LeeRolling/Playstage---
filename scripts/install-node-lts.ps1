# Download the official Node.js LTS MSI and install it quietly.
# Invoked by start.bat only after the user agrees. Does not install Ollama.
# Keep this file ASCII. start.bat stays ASCII so cmd.exe cannot split Chinese.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$result = 1

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
}

$arch = 'x86'
if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64') { $arch = 'x64' }
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }

$msi = Join-Path $env:TEMP 'playstage-node-lts.msi'

try {
  if (Test-Path $msi) { Remove-Item -Force $msi }

  $raw = Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/index.json'
  $index = $raw.Content | ConvertFrom-Json
  $hit = $null
  foreach ($item in $index) {
    if ($item.lts) { $hit = $item; break }
  }
  if (-not $hit) {
    $result = 2
    throw 'No Node.js LTS release was listed.'
  }

  $ver = [string]$hit.version
  $name = "node-$ver-$arch.msi"
  $url = "https://nodejs.org/dist/$ver/$name"
  Write-Host $url
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $msi
  if (-not (Test-Path $msi)) {
    $result = 5
    throw 'The installer download is missing.'
  }

  $sumsRaw = Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt"
  $want = $null
  foreach ($line in ($sumsRaw.Content -split "`n")) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Length -ge 2 -and $parts[1] -eq $name) {
      $want = $parts[0].ToLower()
      break
    }
  }
  if (-not $want) {
    $result = 3
    throw 'SHASUMS256.txt has no hash for the installer.'
  }
  $got = (Get-FileHash -Algorithm SHA256 -Path $msi).Hash.ToLower()
  if ($got -ne $want) {
    $result = 4
    throw 'Installer hash does not match.'
  }

  $proc = Start-Process -FilePath msiexec.exe -ArgumentList @('/i', $msi, '/qn', '/norestart') -Verb RunAs -Wait -PassThru
  $code = [int]$proc.ExitCode
  if ($code -eq 0 -or $code -eq 3010 -or $code -eq 1641) {
    $result = 0
  } else {
    $result = $code
    throw "msiexec exited with $code."
  }
} catch {
  Write-Host $_.Exception.Message
} finally {
  if (Test-Path $msi) { Remove-Item -Force $msi -ErrorAction SilentlyContinue }
}

exit $result

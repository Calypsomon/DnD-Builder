# Downloads a portable Node.js runtime into .\runtime (no installer, no admin rights).
# The download is verified against the official SHA-256 checksums from nodejs.org.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$version = 'v24.20.0'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'runtime'
$zipName = "node-$version-win-$arch.zip"
$base = "https://nodejs.org/dist/$version"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("dndbuilder-node-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match [Regex]::Escape($zipName) } | Select-Object -First 1
  if (-not $line) { throw "Checksum for $zipName not found" }
  $expected = ($line -split '\s+')[0].Trim().ToLower()

  $zip = Join-Path $tmp $zipName
  Invoke-WebRequest -UseBasicParsing "$base/$zipName" -OutFile $zip
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw "Checksum mismatch for $zipName" }

  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  Copy-Item (Join-Path $tmp "node-$version-win-$arch\node.exe") (Join-Path $runtime 'node.exe') -Force
  Write-Host "Portable Node.js $version installed to $runtime"
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

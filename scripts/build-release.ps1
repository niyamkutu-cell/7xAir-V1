<#
.SYNOPSIS
  Builds the complete 7xAir Windows 10/11 release on a Windows host with Node 20+, Rust/Tauri 2, and JDK 21.
  1) Builds compatible 7xAir Fabric client JARs (1.21.11 & 26.2) into internal launcher bundles + catalog.json
  2) Compiles the React/TypeScript frontend and Tauri 2 Windows NSIS EXE installer
  3) Computes SHA-256 checksums and packages the complete source ZIP
#>
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BundleDir = Join-Path $Root "apps\launcher\src-tauri\resources\client-bundles"
New-Item -ItemType Directory -Force -Path $BundleDir | Out-Null

Write-Host "==> [1/4] Building compatible Fabric client artifacts (1.21.11 & 26.2)..."
Push-Location (Join-Path $Root "client\7xair-fabric")
$CatalogBundles = @()
foreach ($target in @("1.21.11", "26.2")) {
    Write-Host "    Building Fabric target: MC $target"
    try {
        .\gradlew.bat clean build "-Pmc_target=$target"
        $jar = Get-ChildItem -Path "build\libs" -Filter "7xair-client-$target-*.jar" |
            Where-Object { $_.Name -notlike "*-sources.jar" } |
            Select-Object -First 1
        if ($jar) {
            $dest = Join-Path $BundleDir "7xair-client-$target.jar"
            Copy-Item -Force $jar.FullName $dest
            $sha = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
            $CatalogBundles += @{
                mcVersion = $target
                clientVersion = "0.1.0+mc$target"
                filename = "7xair-client-$target.jar"
                sha256 = $sha
            }
            Write-Host "    Staged $dest (SHA-256: $sha)"
        }
    } catch {
        Write-Warning "Skipping MC $target (official Mojang/Fabric artifacts may not be published yet): $_"
    }
}
Pop-Location

@{ bundles = $CatalogBundles } | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 (Join-Path $BundleDir "catalog.json")

Write-Host "==> [2/4] Building 7xAir Windows 10/11 NSIS EXE installer..."
Push-Location (Join-Path $Root "apps\launcher")
npm ci
npm run tauri:build
Pop-Location

$NsisDir = Join-Path $Root "apps\launcher\src-tauri\target\release\bundle\nsis"
$Exe = Get-ChildItem -Path $NsisDir -Filter "*.exe" | Select-Object -First 1
if (-not $Exe) {
    throw "Windows NSIS EXE installer was not produced in $NsisDir"
}
$ExeSha = (Get-FileHash -Algorithm SHA256 $Exe.FullName).Hash.ToLower()
$DistDir = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Copy-Item -Force $Exe.FullName (Join-Path $DistDir $Exe.Name)
"$ExeSha  $($Exe.Name)" | Out-File -Encoding ascii (Join-Path $DistDir "SHA256SUMS.txt")
Write-Host "    Built Windows EXE: dist\$($Exe.Name) (SHA-256: $ExeSha)"

Write-Host "==> [3/4] Packaging complete source ZIP..."
Push-Location $Root
python3 scripts/package-source-zip.py

Write-Host "==> [4/4] Running verification checks and tests..."
npm run check
npm test
Pop-Location

Write-Host "7xAir Windows release build complete!"

$ErrorActionPreference = "Stop"
$Targets = @("1.21.11", "26.2")
$BundleOut = if ($env:SEVENXAIR_BUNDLE_DIR) { $env:SEVENXAIR_BUNDLE_DIR } else { Join-Path $env:APPDATA "7xAir\client-bundles" }
New-Item -ItemType Directory -Force -Path $BundleOut | Out-Null

foreach ($target in $Targets) {
    Write-Host "==> Building 7xAir Fabric Client for Minecraft $target"
    .\gradlew.bat clean build "-Pmc_target=$target"
    $jar = Get-ChildItem -Path "build\libs" -Filter "7xair-client-$target-*.jar" | Where-Object { $_.Name -notlike "*-sources.jar" } | Select-Object -First 1
    if ($jar) {
        Copy-Item -Force $jar.FullName (Join-Path $BundleOut "7xair-client-$target.jar")
        Write-Host "Staged $(Join-Path $BundleOut "7xair-client-$target.jar")"
    }
}

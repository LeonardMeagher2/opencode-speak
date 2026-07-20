param(
    [switch]$Errors,
    [switch]$Follow,
    [switch]$Tail
)

$logPath = Join-Path $env:USERPROFILE ".local\share\opencode\log\opencode.log"
$outDir = Join-Path $env:USERPROFILE ".local\share\opencode\tool-output"
$null = New-Item -ItemType Directory -Force -Path $outDir

$filter = if ($Errors) { "opencode-speak|error|Error" } else { "opencode-speak" }

if ($Tail) {
    Get-Content -Path $logPath -Tail 10 | ForEach-Object { Write-Host $_ }
    return
}

if ($Follow) {
    Get-Content -Path $logPath -Wait | Select-String $filter
} else {
    $result = Select-String -Path $logPath -Pattern $filter
    $result | Out-Host
    $result | Out-File (Join-Path $outDir "opencode-speak-log.txt")
    Write-Host "`nSaved to: $outDir\opencode-speak-log.txt"
}

param(
    [string]$ConfigPath = "agents\ISMAgent\config.json",
    [switch]$VerboseLog = $false,
    [string]$Language = "",
    [double]$Delay = 0.5
)

# UTF-8 Output (for emoji/logs)
$env:PYTHONIOENCODING = "utf-8"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Write-Host "Ensuring Python dependencies are installed..." -ForegroundColor Cyan
pip install -r agents\ISMAgent\requirements.txt

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-Error "Config file not found: $ConfigPath"
    exit 1
}

# Build explicit argument list (each token separate!)
$argList = @(
    "-m", "agents.ISMAgent.Python.ism_agent",
    "--config", $ConfigPath
)

if ($VerboseLog) { $argList += "--verbose" }
if ($Language -ne "") { $argList += @("--language", $Language) }
if ($Delay -ne $null) {
    $argList += @("--delay", ($Delay.ToString([System.Globalization.CultureInfo]::InvariantCulture)))
}

Write-Host "Starting the ISM Agent..." -ForegroundColor Yellow

# Run python and wait; capture exit code
$proc = Start-Process -FilePath "python" -ArgumentList $argList -NoNewWindow -PassThru -Wait
$exit = $proc.ExitCode

if ($exit -ne 0) {
    Write-Error "Status: ISM Agent exited with code $exit."
    exit $exit
} else {
    Write-Host "Status: ISM Agent finished successfully." -ForegroundColor Green
}

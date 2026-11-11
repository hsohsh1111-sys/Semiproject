param()
$ErrorActionPreference = 'Stop'
$project = $PSScriptRoot
$logs = Join-Path $project '.tmp/dev-servers'
$owned = @()

function Test-ServiceReady($service) {
    try {
        $response = Invoke-WebRequest -Uri $service.Url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains($service.Marker)
    } catch { return $false }
}

function Test-PortBusy($port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $pending.AsyncWaitHandle.WaitOne(500)) { return $false }
        $client.EndConnect($pending)
        return $true
    } catch { return $false } finally { $client.Dispose() }
}

$services = @(
    @{ Name='Frontend'; Port=5173; Url='http://127.0.0.1:5173/'; Marker='@vite/client';
       Directory=(Join-Path $project 'frontend'); Executable='node.exe';
       Arguments=@('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') },
    @{ Name='Backend'; Port=8000; Url='http://127.0.0.1:8000/health'; Marker='onfit-api';
       Directory=(Join-Path $project 'backend'); Executable=(Join-Path $project 'backend/.venv/Scripts/python.exe');
       Arguments=@('-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000') },
    @{ Name='AI-fashion'; Port=5174; Url='http://127.0.0.1:5174/ai-fashion/'; Marker='@vite/client';
       Directory=(Join-Path $project 'ai-fashion'); Executable='node.exe';
       Arguments=@('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort') }
)

try {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    foreach ($service in $services) {
        if (Test-ServiceReady $service) {
            Write-Host "$($service.Name): already running (reusing)."
            continue
        }
        if (Test-PortBusy $service.Port) {
            throw "Port $($service.Port) is occupied but ONFIT is not responding. Check the existing process."
        }
        if ($service.Name -in @('Frontend','AI-fashion') -and -not (Test-Path -LiteralPath (Join-Path $service.Directory 'node_modules/vite/bin/vite.js'))) {
            throw "Packages are missing. Run npm.cmd ci inside $($service.Directory) first."
        }
        $executable = (Get-Command $service.Executable -ErrorAction Stop).Source
        $process = Start-Process -FilePath $executable -ArgumentList $service.Arguments -WorkingDirectory $service.Directory `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$($service.Name).out.log") `
            -RedirectStandardError (Join-Path $logs "$($service.Name).err.log")
        $owned += $process
        $ready = $false
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            if (Test-ServiceReady $service) { $ready=$true; break }
            $process.Refresh()
            if ($process.HasExited) { break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) { throw "$($service.Name) failed to start. See $logs" }
        Write-Host "$($service.Name): started."
    }
    Write-Host ''
    Write-Host '3D fitting: http://127.0.0.1:5173/#/fitting'
    Write-Host 'API docs:   http://127.0.0.1:8000/docs'
    Write-Host 'AI search:  http://127.0.0.1:5173/ai-fashion/'
    if ($owned.Count -gt 0) {
        Write-Host 'Keep this terminal open. Ctrl+C stops only servers started by this script.'
        while ($true) {
            foreach ($process in $owned) {
                $process.Refresh()
                if ($process.HasExited) { throw "A server stopped. See $logs" }
            }
            Start-Sleep -Milliseconds 500
        }
    }
} finally {
    foreach ($process in $owned) {
        $process.Refresh()
        if (-not $process.HasExited) {
            # Kill only the process trees owned by this launch, including reload workers.
            & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
        }
    }
}

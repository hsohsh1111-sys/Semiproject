param([switch]$Check)

$ErrorActionPreference = 'Stop'
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDir = (Resolve-Path (Join-Path $projectDir '..\backend')).Path
$runtimeDir = Join-Path ([IO.Path]::GetTempPath()) "onfit-mobile-test-$PID"
$activeFile = Join-Path ([IO.Path]::GetTempPath()) 'onfit-mobile-test-active.json'
$apiUrl = 'http://127.0.0.1:8000'
$script:jobHandle = [IntPtr]::Zero
$script:hasLock = $false
$exitCode = 0

# Windows closes this job with the manager, including when its window is closed.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class OnfitMobileJob {
    [StructLayout(LayoutKind.Sequential)]
    public struct BasicLimits {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct IoCounters {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct ExtendedLimits {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, int length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    public static IntPtr Create() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
        ExtendedLimits limits = new ExtendedLimits();
        limits.BasicLimitInformation.LimitFlags = 0x2000;
        if (!SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(typeof(ExtendedLimits)))) {
            int error = Marshal.GetLastWin32Error();
            CloseHandle(job);
            throw new Win32Exception(error, "SetInformationJobObject failed");
        }
        return job;
    }
    public static void Add(IntPtr job, Process process) {
        if (!AssignProcessToJobObject(job, process.Handle))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed");
    }
    public static void Close(IntPtr job) { if (job != IntPtr.Zero) CloseHandle(job); }
}
'@

function Test-PortBusy([int]$port) {
  foreach ($line in (& netstat -ano -p TCP)) {
    if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+\d+\s*$' -and [int]$Matches[1] -eq $port) {
      return $true
    }
  }
  return $false
}

function Test-Api {
  try {
    $health = Invoke-RestMethod "$apiUrl/health" -TimeoutSec 3
    $schema = Invoke-RestMethod "$apiUrl/openapi.json" -TimeoutSec 3
    return $health.status -eq 'ok' -and $health.service -eq 'onfit-api' -and
      $null -ne $schema.paths.'/api/circle-search/segment' -and
      $null -ne $schema.paths.'/api/circle-search/try-on'
  } catch { return $false }
}

function Test-Vite([int]$port, [string]$tunnelHost) {
  try {
    $headers = @{ Host = $tunnelHost }
    $page = Invoke-WebRequest "http://127.0.0.1:$port/ai-fashion/" -Headers $headers -UseBasicParsing -TimeoutSec 3
    $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -Headers $headers -TimeoutSec 3
    return $page.StatusCode -eq 200 -and $page.Content.Contains('id="root"') -and
      $health.status -eq 'ok' -and $health.service -eq 'onfit-api'
  } catch { return $false }
}

function Test-LocalVite {
  try {
    $page = Invoke-WebRequest 'http://127.0.0.1:5174/ai-fashion/' -UseBasicParsing -TimeoutSec 3
    return $page.StatusCode -eq 200 -and $page.Content.Contains('id="root"') -and
      $page.Content.Contains('ONFIT')
  } catch { return $false }
}

function Wait-For([scriptblock]$condition, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    if (& $condition) { return $true }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Get-CloudflaredPath {
  $command = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($path in @('C:\Program Files (x86)\cloudflared\cloudflared.exe',
    (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'))) {
    if (Test-Path -LiteralPath $path) { return $path }
  }
  throw 'cloudflared.exe is missing. Install Cloudflare Tunnel first.'
}

function Start-Owned([string]$filePath, [string[]]$arguments, [string]$workingDir, [string]$name) {
  $process = Start-Process -FilePath $filePath -ArgumentList $arguments -WorkingDirectory $workingDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir "$name.out.log") -RedirectStandardError (Join-Path $runtimeDir "$name.err.log") -PassThru
  try { [OnfitMobileJob]::Add($script:jobHandle, $process) } catch {
    if (-not $process.HasExited) { $process.Kill() }
    throw
  }
  return $process
}

function Wait-TunnelUrl($process) {
  $outLog = Join-Path $runtimeDir 'tunnel.out.log'
  $errLog = Join-Path $runtimeDir 'tunnel.err.log'
  $deadline = (Get-Date).AddSeconds(60)
  do {
    $logs = [string](Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue) +
      [string](Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue)
    $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
    if ($match.Success) { return $match.Value.ToLowerInvariant() }
    if ($process.HasExited) { throw "Cloudflare Tunnel exited. See $errLog" }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Cloudflare did not issue an HTTPS URL within 60 seconds. See $errLog"
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\ONFIT-Mobile-Test')
try {
  try { $script:hasLock = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $script:hasLock = $true }
  if (-not $script:hasLock) {
    Write-Host 'An ONFIT mobile test is already running in another window.'
    if (Test-Path -LiteralPath $activeFile) {
      $active = Get-Content -LiteralPath $activeFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($active.url -match '^https://[a-z0-9-]+\.trycloudflare\.com/ai-fashion/$') {
        Write-Host 'SMARTPHONE HTTPS URL:' -ForegroundColor Green
        Write-Host $active.url -ForegroundColor Green
      }
    }
  } else {
    $cloudflared = Get-CloudflaredPath
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $viteScript = Join-Path $projectDir 'node_modules\vite\bin\vite.js'
    $python = Join-Path $backendDir '.venv\Scripts\python.exe'
    if (-not $nodeCommand -or -not (Test-Path -LiteralPath $viteScript)) {
      throw 'Node.js or ai-fashion/node_modules is missing. Run npm.cmd install in ai-fashion.'
    }
    if (-not (Test-Path -LiteralPath $python)) { throw "Backend Python environment is missing: $python" }

    if (Test-PortBusy 8000) {
      if (-not (Test-Api)) { throw 'Port 8000 has an unhealthy or unrelated server. Nothing was stopped.' }
      Write-Host 'Reusing the existing ONFIT FastAPI server on port 8000.'
    } elseif ($Check) { Write-Host 'ONFIT FastAPI is not running on port 8000.' }
    if (Test-PortBusy 5174) {
      if (Test-LocalVite) {
        Write-Host 'Existing ONFIT Vite found on port 5174; it will remain untouched.'
      } else {
        Write-Host 'Port 5174 is used by another or unhealthy server; it will remain untouched.'
      }
    } else { Write-Host 'Port 5174 is available for the mobile test.' }

    if ($Check) {
      Write-Host 'Prerequisites checked. No server or tunnel was started.'
    } else {
      New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
      $script:jobHandle = [OnfitMobileJob]::Create()
      if (-not (Test-PortBusy 8000)) {
        Write-Host 'Starting ONFIT FastAPI on port 8000...'
        Start-Owned $python @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') $backendDir 'api' | Out-Null
        if (-not (Wait-For { Test-Api } 40)) { throw "FastAPI did not start. See $runtimeDir\api.err.log" }
      }

      $vitePort = 0
      foreach ($candidate in 5174..5184) {
        if (-not (Test-PortBusy $candidate)) { $vitePort = $candidate; break }
      }
      if (-not $vitePort) { throw 'No free Vite port was found from 5174 through 5184.' }
      Write-Host "Starting a dedicated mobile Vite server on port $vitePort..."
      $localViteUrl = "http://127.0.0.1:$vitePort"
      $tunnel = Start-Owned $cloudflared @('tunnel', '--url', $localViteUrl) $projectDir 'tunnel'
      $tunnelUrl = Wait-TunnelUrl $tunnel
      $tunnelHost = ([uri]$tunnelUrl).Host
      if ($tunnelHost -notmatch '^[a-z0-9-]+\.trycloudflare\.com$') { throw 'Tunnel returned an invalid hostname.' }

      $env:MOBILE_TEST_HOST = $tunnelHost
      $env:VITE_API_URL = '' # Force same-origin /api requests on the smartphone.
      Remove-Item Env:\__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS -ErrorAction SilentlyContinue
      Start-Owned $nodeCommand.Source @($viteScript, '--host', '127.0.0.1', '--port', "$vitePort", '--strictPort') $projectDir 'vite' | Out-Null
      if (-not (Wait-For { Test-Vite $vitePort $tunnelHost } 20)) {
        throw "Vite did not allow the exact tunnel host or its API proxy failed. See $runtimeDir\vite.err.log"
      }
      $mobileUrl = "$tunnelUrl/ai-fashion/"
      $publicReady = Wait-For {
        try {
          $page = Invoke-WebRequest $mobileUrl -UseBasicParsing -TimeoutSec 5
          $health = Invoke-RestMethod "$tunnelUrl/health" -TimeoutSec 5
          $page.StatusCode -eq 200 -and $page.Content.Contains('id="root"') -and
            $health.status -eq 'ok' -and $health.service -eq 'onfit-api'
        } catch { $false }
      } 40
      if (-not $publicReady) { throw "The HTTPS URL could not reach ONFIT and /health. See $runtimeDir\tunnel.err.log" }
      @{ url = $mobileUrl; port = $vitePort; managerPid = $PID } |
        ConvertTo-Json | Set-Content -LiteralPath $activeFile -Encoding UTF8
      Write-Host ''
      Write-Host '========================================================' -ForegroundColor Green
      Write-Host '  SMARTPHONE HTTPS URL:' -ForegroundColor Green
      Write-Host "  $mobileUrl" -ForegroundColor Green
      Write-Host '========================================================' -ForegroundColor Green
      Write-Host 'Open this URL in smartphone Chrome. Keep this window open.'
      Read-Host 'Press ENTER to stop only this tunnel and its started servers' | Out-Null
    }
  }
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  if ($script:jobHandle -ne [IntPtr]::Zero) { [OnfitMobileJob]::Close($script:jobHandle) }
  if ($script:hasLock) {
    Remove-Item -LiteralPath $activeFile -ErrorAction SilentlyContinue
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
exit $exitCode

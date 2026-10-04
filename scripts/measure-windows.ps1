# Read-only Booki/WebView2 process-tree sampling. Run against a running Windows build.
[CmdletBinding()]
param(
  [ValidateRange(5, 600)][int]$Seconds = 60,
  [int]$BookiProcessId = 0,
  [string]$OutputPath = "booki-performance.json"
)
$ErrorActionPreference = 'Stop'
if ($BookiProcessId -eq 0) {
  $instances = @(Get-Process -Name Booki -ErrorAction SilentlyContinue)
  if ($instances.Count -ne 1) { throw 'Run one Booki instance, or specify -BookiProcessId.' }
  $BookiProcessId = $instances[0].Id
}
$null = Get-Process -Id $BookiProcessId
$logicalProcessors = [Environment]::ProcessorCount
$previousCpu = @{}
$samples = [System.Collections.Generic.List[object]]::new()
$timer = [Diagnostics.Stopwatch]::StartNew()
$previousTime = 0.0
for ($sampleIndex = 0; $sampleIndex -le $Seconds; $sampleIndex++) {
  if ($sampleIndex -gt 0) { Start-Sleep -Seconds 1 }
  $null = Get-Process -Id $BookiProcessId
  $tree = @(Get-CimInstance Win32_Process -Filter "Name='Booki.exe' OR Name='msedgewebview2.exe'" | Select-Object ProcessId, ParentProcessId)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $null = $ids.Add($BookiProcessId)
  do {
    $changed = $false
    foreach ($entry in $tree) {
      if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $changed = $true }
    }
  } while ($changed)
  $deltaCpu = 0.0; $workingSet = 0L; $privateBytes = 0L; $handles = 0L
  $nextCpu = @{}
  foreach ($processId in $ids) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) { continue }
    $cpu = $process.TotalProcessorTime.TotalSeconds
    if ($previousCpu.ContainsKey($processId)) { $deltaCpu += [Math]::Max(0, $cpu - $previousCpu[$processId]) }
    $nextCpu[$processId] = $cpu
    $workingSet += $process.WorkingSet64; $privateBytes += $process.PrivateMemorySize64; $handles += $process.HandleCount
  }
  $elapsed = $timer.Elapsed.TotalSeconds
  if ($sampleIndex -gt 0) {
    $samples.Add([pscustomobject]@{
      elapsedSeconds = [Math]::Round($elapsed, 3)
      cpuPercentOfMachine = [Math]::Round(100 * $deltaCpu / (($elapsed - $previousTime) * $logicalProcessors), 3)
      aggregateWorkingSetMB = [Math]::Round($workingSet / 1MB, 2)
      privateCommittedMB = [Math]::Round($privateBytes / 1MB, 2)
      handles = $handles
      processCount = $nextCpu.Count
    })
  }
  $previousCpu = $nextCpu; $previousTime = $elapsed
}
[pscustomobject]@{
  recordedUtc = [DateTime]::UtcNow.ToString('o')
  logicalProcessors = $logicalProcessors
  note = 'Booki plus descendant WebView2 processes. Aggregate working sets may count shared pages more than once; private committed bytes are not resident memory. CPU is normalized to all logical processors. Sampling itself has overhead; compare the same machine and workload.'
  meanCpuPercentOfMachine = [Math]::Round(($samples | Measure-Object cpuPercentOfMachine -Average).Average, 3)
  peakCpuPercentOfMachine = ($samples | Measure-Object cpuPercentOfMachine -Maximum).Maximum
  samples = $samples
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Output "Saved $($samples.Count) samples to $OutputPath"

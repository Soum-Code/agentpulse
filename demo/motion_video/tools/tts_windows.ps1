# Speak each line of a JSON job list with a Windows built-in voice (offline, no download).
#
#   powershell -NoProfile -File tools/tts_windows.ps1 -Jobs jobs.json -Voice "Microsoft Heera"
#
# In short: jobs.json is [{ "text": "...", "out": "C:/.../001.wav", "rate": 0.95 }, ...].
# Uses the Windows.Media.SpeechSynthesis (OneCore) voices, which include en-IN Heera and Ravi.
param(
  [Parameter(Mandatory = $true)][string]$Jobs,
  [string]$Voice = "Microsoft Heera"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

# In short: PowerShell 5 cannot await WinRT calls, so turn each IAsyncOperation into a Task.
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait() | Out-Null
  return $t.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$pick = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $Voice }
if (-not $pick) { throw "voice not installed: $Voice" }
$synth.Voice = $pick
$lang = $pick.Language

foreach ($job in (Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json)) {
  $text = [System.Security.SecurityElement]::Escape($job.text)
  $rate = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.00}", [double]$job.rate)
  $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$lang'><prosody rate='$rate'>$text</prosody></speak>"
  $stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($job.out, $bytes)
  $reader.Dispose(); $stream.Dispose()
}

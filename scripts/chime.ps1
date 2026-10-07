Add-Type -AssemblyName PresentationCore

# Plays the chime with no window. Bluetooth headsets sleep when idle and need ~1s to
# wake once audio starts, which would swallow a 1s chime. Stream silence first to wake
# the link, wait the lead time, then play the chime. Exits 1 with a message on failure.
function New-SilentWav([int]$ms) {
  $rate = 44100
  $data = New-Object byte[] ([int]($rate * $ms / 1000) * 2)
  $stream = New-Object System.IO.MemoryStream
  $w = New-Object System.IO.BinaryWriter($stream)
  $w.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF')); $w.Write([int](36 + $data.Length))
  $w.Write([System.Text.Encoding]::ASCII.GetBytes('WAVEfmt ')); $w.Write([int]16)
  $w.Write([int16]1); $w.Write([int16]1); $w.Write([int]$rate); $w.Write([int]($rate * 2))
  $w.Write([int16]2); $w.Write([int16]16)
  $w.Write([System.Text.Encoding]::ASCII.GetBytes('data')); $w.Write([int]$data.Length); $w.Write($data)
  $w.Flush(); $stream.Position = 0
  return $stream
}

$lead = 0
[void][int]::TryParse($env:CHIME_LEAD_MS, [ref]$lead)
$silencePlayer = $null
if ($lead -gt 0) {
  $silencePlayer = New-Object System.Media.SoundPlayer((New-SilentWav ($lead + 2000)))
  $silencePlayer.Play()
  Start-Sleep -Milliseconds $lead
}

# MediaPlayer volume tops out at 1.0, so for a louder chime play several identical
# copies at the same instant: they add up (two copies is about twice the amplitude).
$copies = 1
[void][int]::TryParse($env:CHIME_COPIES, [ref]$copies)
$copies = [Math]::Min([Math]::Max($copies, 1), 4)

$volume = 1.0
[void][double]::TryParse($env:CHIME_VOLUME, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$volume)
$volume = [Math]::Min([Math]::Max($volume, 0.0), 1.0)

$players = @()
for ($i = 0; $i -lt $copies; $i++) {
  $p = New-Object System.Windows.Media.MediaPlayer
  $p.Volume = $volume
  $p.Open([Uri]$env:CHIME_SOUND)
  $players += $p
}
$deadline = (Get-Date).AddSeconds(5)
while ((Get-Date) -lt $deadline -and ($players | Where-Object { -not $_.NaturalDuration.HasTimeSpan })) {
  Start-Sleep -Milliseconds 50
}
if ($players | Where-Object { -not $_.NaturalDuration.HasTimeSpan }) {
  [Console]::Error.WriteLine("sound failed: could not open $env:CHIME_SOUND")
  exit 1
}
foreach ($p in $players) { $p.Play() }
Start-Sleep -Milliseconds ([int]$players[0].NaturalDuration.TimeSpan.TotalMilliseconds + 300)
foreach ($p in $players) { $p.Close() }
if ($silencePlayer) { $silencePlayer.Stop() }

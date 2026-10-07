Add-Type -AssemblyName PresentationCore, System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @"
using System.Windows.Forms;
public class ChimeForm : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000080; return cp; }
  }
}
"@
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([Uri]$env:CHIME_SOUND)
$player.Volume = 1.0
$player.Play()
$form = New-Object ChimeForm
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Size = New-Object System.Drawing.Size(360, 120)
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 27)
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Task complete'
$label.Dock = 'Fill'
$label.TextAlign = 'MiddleCenter'
$label.ForeColor = [System.Drawing.Color]::White
$label.Font = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)
$form.Add_Click({ $form.Close() })
$label.Add_Click({ $form.Close() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [int]$env:CHIME_POPUP_MS
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
$player.Close()

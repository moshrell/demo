# Не даёт компьютеру уснуть, пока идёт рендер (настройки Windows не меняет). Сам закрывается, когда появится fertig.txt.
$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$k = Add-Type -MemberDefinition $sig -Name Power -Namespace Wach -PassThru
$k::SetThreadExecutionState([uint32]"0x80000001") | Out-Null
while (-not (Test-Path (Join-Path $PSScriptRoot 'fertig.txt'))) { Start-Sleep -Seconds 30 }

<#
PowerShell test script to POST a sample payload to the Apps Script Web App.
Usage:
  Open PowerShell and run:
    ./tools/test_post.ps1
  Optionally pass the URL explicitly:
    ./tools/test_post.ps1 -Url "https://script.google.com/macros/s/XXXXX/exec"
#>
param(
  [string]$Url = "https://script.google.com/macros/s/AKfycbzqI10HExaNc6XPhPFWgJT6Z1MGosym8xTHTDDhgP4-BuJsJ6k2b5bl7O2QFNnuCHXJRA/exec",
  [string]$Token = 'Pasantias90'
)

try{
  $payload = @{
    items = @(
      @{ product = 'PAN'; code = 'ABC123'; quantity = 5 }
    )
    meta = @{ formId = 'tata-libertad'; fechaTxt = (Get-Date -Format 'yyyy-MM-dd'); horaTxt = '10:00'; sede = 'BC'; responsable = 'tester' }
    token = $Token
  }
  $json = $payload | ConvertTo-Json -Depth 6
  $target = $Url + '?debug=1'
  Write-Host "Posting to: $target" -ForegroundColor Cyan
  Write-Host "Payload:`n$json`n" -ForegroundColor Gray

  $resp = Invoke-RestMethod -Uri $target -Method Post -ContentType 'application/json' -Body $json -ErrorAction Stop
  Write-Host "Response (parsed):" -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 6 | Write-Host
} catch {
  Write-Host "Request failed:" -ForegroundColor Red
  Write-Host ($_.Exception.Message) -ForegroundColor Red
  if ($_.Exception.Response) {
    try{ $body = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd(); Write-Host "Response body:"; Write-Host $body } catch { }
  }
}

Write-Host "\nNotes:" -ForegroundColor Yellow
Write-Host " - Check Apps Script Executions/Logs after the request for 'doPost resolved' logs." -ForegroundColor Yellow
Write-Host " - If you get ok=false with an error, paste the full JSON response here and I will inspect it." -ForegroundColor Yellow

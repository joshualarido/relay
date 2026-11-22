# Runs the production Relay server on localhost:6768 for Tailscale Serve to proxy.
# Origin is overridden here so .env (local dev) stays untouched.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:BETTER_AUTH_URL = "https://msi.tailc9157e.ts.net"
$env:NODE_ENV = "production"
while ($true) {
  & "C:\Program Files\nodejs\node.exe" node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port 6768
  Start-Sleep -Seconds 5   # restart if it crashes
}

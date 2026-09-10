# Deploy helper for Cloudflare Worker + D1
# Run this in PowerShell (Windows). Interactive steps (wrangler login) require you to follow browser prompts.

Write-Host "=== Chiptronic TravelOps: Deploy helper ===" -ForegroundColor Cyan

# Check wrangler
try {
  $v = wrangler --version 2>&1
  Write-Host "Wrangler found: $v" -ForegroundColor Green
} catch {
  Write-Host "Wrangler not found. Install with: npm install -g wrangler" -ForegroundColor Red
  exit 1
}

Write-Host "
1) Ensure you're authenticated with Cloudflare (browser will open if needed)" -ForegroundColor Yellow
wrangler login

Write-Host "
2) Confirm account" -ForegroundColor Yellow
wrangler whoami

Write-Host "
3) (Optional) Run remote DB migrations if needed" -ForegroundColor Yellow
Write-Host "Running: npm run db:remote:all" -ForegroundColor Gray
npm run db:remote:all

Write-Host "
4) Deploy Worker and static assets" -ForegroundColor Yellow
Write-Host "Running: npm run deploy" -ForegroundColor Gray
npm run deploy

Write-Host "
5) Tail logs (press Ctrl+C to stop)" -ForegroundColor Yellow
wrangler tail --since 1m

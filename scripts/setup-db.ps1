Write-Host "🚀 Starting Phase 1 (V11 - DIAMOND MASTER) Setup..." -ForegroundColor Cyan

if (-not (Get-Command "supabase" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ไม่พบ Supabase CLI" -ForegroundColor Red
    exit 1
}

supabase start
Write-Host "🛠️ Resetting DB and Running V11 SQL Migrations..." -ForegroundColor Yellow
supabase db reset

npm install @supabase/supabase-js dotenv typescript ts-node --no-save

$seedPassword = Read-Host -Prompt "🔑 กรุณาตั้งรหัสผ่านสำหรับ SEED_USER_PASSWORD (ขั้นต่ำ 12 ตัวอักษร)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($seedPassword)
$seedPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

if ($seedPasswordPlain.Length -lt 12) {
  Write-Host "❌ Password ต้องยาวอย่างน้อย 12 ตัวอักษร" -ForegroundColor Red
  exit 1
}

$localStatus = supabase status --output json | ConvertFrom-Json
$apiUrl = $localStatus.API_URL
$serviceRole = $localStatus.SERVICE_ROLE_KEY

"SUPABASE_URL=$apiUrl`nSUPABASE_SERVICE_ROLE_KEY=$serviceRole`nSEED_USER_PASSWORD=$seedPasswordPlain`nALLOW_SEED=true" | Out-File -FilePath .env.local -Encoding utf8

if (-not (Test-Path .gitignore) -or -not (Select-String -Path .gitignore -Pattern "^\.env\.local$" -Quiet)) {
  Add-Content .gitignore "`n.env.local"
}

Write-Host "🌱 Running V11 Diamond Seed Script..." -ForegroundColor Yellow
npx ts-node scripts/seed.ts

Write-Host "✅ Phase 1 (V11) Setup Complete! Ready for Phase 2." -ForegroundColor Green
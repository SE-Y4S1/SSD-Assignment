@echo off
echo 🚀 Initializing MedSync Cloud-Native Healthcare Platform...

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)

if not exist .env (
    echo ⚠️  .env not found — copying .env.example to .env
    copy .env.example .env >nul
    REM Generate real values rather than leaving the placeholders from the template:
    REM they are published in this repository, and the services now refuse to start
    REM on them (V-A01).
    for /f "delims=" %%%%S in ('powershell -NoProfile -Command "[Convert]::ToBase64String((New-Object byte[] 48 | %%%%{ (New-Object Random).NextBytes($_); $_ }))"') do set "JWT_VALUE=%%%%S"
    for /f "delims=" %%%%S in ('powershell -NoProfile -Command "[Convert]::ToBase64String((New-Object byte[] 18 | %%%%{ (New-Object Random).NextBytes($_); $_ }))"') do set "ADMIN_VALUE=%%%%S"
    powershell -NoProfile -Command "(Get-Content .env) -replace '^JWT_SECRET=.*', 'JWT_SECRET=%%JWT_VALUE%%' -replace '^ADMIN_PASSWORD=.*', 'ADMIN_PASSWORD=%%ADMIN_VALUE%%' | Set-Content .env"
    echo 🔐 Generated a signing key and an admin password in .env.
    echo    Admin password: %%ADMIN_VALUE%%
)

echo 📦 Building images and starting services (waiting for healthchecks)...
docker compose up -d --build --wait
if %errorlevel% neq 0 (
    echo ⚠️  --wait failed or not supported; falling back to 45s grace period.
    docker compose up -d --build
    timeout /t 45 /nobreak >nul
)

echo --------------------------------------------------------
echo ✅ MedSync is now online!
echo --------------------------------------------------------
echo 🌐 Frontend:      http://localhost:3000
echo 🛡️ Auth:          http://localhost:5000
echo 👤 Patient:       http://localhost:3001
echo 👨‍⚕️ Doctor:        http://localhost:3002
echo 📅 Appointment:   http://localhost:3003
echo 💊 Telemedicine:  http://localhost:3004
echo 💳 Payment:       http://localhost:3005
echo 📨 Notification:  http://localhost:3006
echo 🤖 AI Symptom:    http://localhost:3007
echo --------------------------------------------------------
echo 🔑 Admin creds come from .env (ADMIN_EMAIL / ADMIN_PASSWORD)
echo 📊 Live logs: docker compose logs -f
pause

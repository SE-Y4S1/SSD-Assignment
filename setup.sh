#!/bin/bash

echo "🚀 Setting up MedSync Project..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose v2 is not available. Install a recent Docker Desktop / Compose plugin."
    exit 1
fi

if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    # Generate real values rather than leaving the placeholders from the template:
    # they are published in this repository, and the services now refuse to start on
    # them (V-A01).
    if command -v openssl > /dev/null 2>&1; then
        JWT_VALUE=$(openssl rand -base64 48 | tr -d '\n')
        ADMIN_VALUE=$(openssl rand -base64 18 | tr -d '\n')
    else
        JWT_VALUE=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
        ADMIN_VALUE=$(head -c 18 /dev/urandom | base64 | tr -d '\n')
    fi
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_VALUE}|" .env && rm -f .env.bak
    sed -i.bak "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_VALUE}|" .env && rm -f .env.bak
    echo "🔐 Generated a signing key and an admin password in .env."
    echo "   Admin password: ${ADMIN_VALUE}"
    echo "⚠️  Edit .env with real credentials before continuing:"
    echo "   - JWT_SECRET (openssl rand -base64 48)"
    echo "   - ADMIN_EMAIL / ADMIN_PASSWORD (required — admin login depends on this)"
    echo "   - GEMINI_API_KEY, STRIPE_*, AGORA_*, EMAIL_*, TWILIO_* as needed"
fi

echo "🏗️  Building and starting services (healthcheck-gated)..."
if ! docker compose up -d --build --wait; then
    docker compose up -d --build
    sleep 45
fi

echo "✅ Services should be running!"
echo
echo "🌐 Access URLs:"
echo "   Frontend:           http://localhost:3000"
echo "   Auth:               http://localhost:5000"
echo "   Patient:            http://localhost:3001"
echo "   Doctor:             http://localhost:3002"
echo "   Appointment:        http://localhost:3003"
echo "   Telemedicine:       http://localhost:3004"
echo "   Payment:            http://localhost:3005"
echo "   Notification:       http://localhost:3006"
echo "   AI Symptom Checker: http://localhost:3007"
echo
echo "📊 Logs:  docker compose logs -f [service-name]"
echo "🛑 Stop:  docker compose down"
echo
echo "🔐 Login at http://localhost:3000 — admin credentials come from .env"
echo "   (ADMIN_EMAIL / ADMIN_PASSWORD, seeded into the auth DB on first boot)"

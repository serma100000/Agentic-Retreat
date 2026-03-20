#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[setup]${NC} $1"; }
fail() { echo -e "${RED}[setup]${NC} $1"; exit 1; }

log "OpenPulse Development Setup"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
  fail "Node.js is not installed. Please install Node.js >= 22."
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  fail "Node.js >= 22 is required. Current version: $(node -v)"
fi
log "Node.js $(node -v) detected"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  warn "pnpm not found. Installing via corepack..."
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
fi
log "pnpm $(pnpm -v) detected"

# Check Docker
if ! command -v docker &> /dev/null; then
  fail "Docker is not installed. Please install Docker Desktop or Docker Engine."
fi
log "Docker $(docker --version | awk '{print $3}' | tr -d ',') detected"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
  fail "Docker Compose v2 is required. Please update Docker."
fi
log "Docker Compose detected"

# Install dependencies
log "Installing dependencies..."
pnpm install

# Copy environment files if they don't exist
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    log "Created .env from .env.example"
  else
    cat > .env << 'ENVEOF'
# OpenPulse Development Environment
NODE_ENV=development
DATABASE_URL=postgresql://openpulse:openpulse_dev@localhost:5432/openpulse
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:19092
SCHEMA_REGISTRY_URL=http://localhost:18081
SMTP_HOST=localhost
SMTP_PORT=1025
ENVEOF
    log "Created default .env file"
  fi
fi

# Start infrastructure
log "Starting infrastructure services..."
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d

log "Waiting for services to be healthy..."
sleep 10

# Build shared packages
log "Building shared packages..."
pnpm build

echo ""
log "${BOLD}Setup complete!${NC}"
echo ""
echo "  Available commands:"
echo "    pnpm dev        - Start development servers"
echo "    pnpm build      - Build all packages"
echo "    pnpm test       - Run tests"
echo "    pnpm lint       - Run linters"
echo "    make up         - Start Docker services"
echo "    make down       - Stop Docker services"
echo ""

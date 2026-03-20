.PHONY: up down reset-db seed build test lint dev setup clean typecheck format

# Docker compose files
COMPOSE := docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml

## up: Start all infrastructure services
up:
	$(COMPOSE) up -d
	@echo "Waiting for services to be healthy..."
	@$(COMPOSE) ps

## down: Stop all infrastructure services
down:
	$(COMPOSE) down

## reset-db: Stop postgres, remove volume, restart
reset-db:
	$(COMPOSE) stop postgres
	$(COMPOSE) rm -f postgres
	docker volume rm $$(docker volume ls -q | grep postgres-data) 2>/dev/null || true
	$(COMPOSE) up -d postgres
	@echo "Waiting for postgres to be ready..."
	@sleep 5
	pnpm db:migrate

## seed: Run database seed scripts
seed:
	pnpm db:seed

## build: Build all packages
build:
	pnpm build

## test: Run all tests
test:
	pnpm test

## lint: Run linting across all packages
lint:
	pnpm lint

## typecheck: Run type checking across all packages
typecheck:
	pnpm typecheck

## dev: Start development servers
dev: up
	pnpm dev

## setup: Full project setup
setup:
	./scripts/setup.sh

## clean: Remove all build artifacts and node_modules
clean:
	pnpm clean
	$(COMPOSE) down -v
	rm -rf node_modules .turbo

## format: Format all files with prettier
format:
	pnpm format

## help: Show this help message
help:
	@echo "OpenPulse Development Commands:"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

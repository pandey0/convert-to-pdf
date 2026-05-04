APP_ENV_FILE ?= .env
export APP_ENV_FILE

COMPOSE ?= docker compose
DEV_COMPOSE ?= docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: up down build logs restart ps dev dev-down dev-logs

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f

restart:
	$(COMPOSE) down && $(COMPOSE) up --build

ps:
	$(COMPOSE) ps

dev:
	$(DEV_COMPOSE) up --build

dev-down:
	$(DEV_COMPOSE) down

dev-logs:
	$(DEV_COMPOSE) logs -f

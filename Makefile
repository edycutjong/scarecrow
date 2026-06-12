.PHONY: help setup start typecheck ci test bench bench-assert verify readiness security-scan

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "Scarecrow — make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies and seed demo data
	npm install
	python3 scripts/seed.py

start: ## Run the dashboard + sentry loop (http://localhost:8080)
	npm run start

typecheck: ## Type-check with the TypeScript compiler
	npm run typecheck

ci: ## Run the full CI gate (lint + types + coverage)
	npm run ci

test: ## Run the unit test suite
	npm run test

bench: ## Benchmark the offline classification baseline
	python3 scripts/bench.py

bench-assert: ## Benchmark and fail if metrics regress
	python3 scripts/bench.py --assert

verify: ## Verify zero-cloud / offline execution
	python3 scripts/verify_offline.py

readiness: ## Check submission readiness
	python3 scripts/check_submission_readiness.py

security-scan: ## Scan for secrets and dependency vulnerabilities
	npx trufflehog filesystem . --only-verified 2>/dev/null || echo "Install trufflehog for secret scanning"
	npm audit --audit-level=high || true

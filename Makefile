SHELL := /bin/bash

.PHONY: help setup format lint tscheck typecheck unused test test-unit test-integration test-full test-parity test-upstream-live test-live check-parity check-live build package-check check dev-doctor dev-bootstrap strict-env-status strict-env-devenv strict-env-validate

help:
	@echo "pi-autoclanker Make Targets"
	@echo "  make setup"
	@echo "  make format"
	@echo "  make lint"
	@echo "  make tscheck"
	@echo "  make typecheck"
	@echo "  make unused"
	@echo "  make test"
	@echo "  make test-unit"
	@echo "  make test-integration"
	@echo "  make test-full"
	@echo "  make test-parity"
	@echo "  make test-upstream-live"
	@echo "  make test-live"
	@echo "  make check-parity"
	@echo "  make check-live"
	@echo "  make build"
	@echo "  make package-check"
	@echo "  make check"
	@echo "  make dev-doctor"
	@echo "  make strict-env-status"
	@echo "  make strict-env-validate"

setup:
	@./bin/dev setup

format:
	@./bin/dev format

lint:
	@./bin/dev lint

tscheck:
	@./bin/dev tscheck

typecheck:
	@./bin/dev typecheck

unused:
	@./bin/dev unused

test:
	@./bin/dev test

test-unit:
	@./bin/dev test-unit

test-integration:
	@./bin/dev test-integration

test-full:
	@./bin/dev test-full

test-parity:
	@./bin/dev test-parity

test-upstream-live:
	@./bin/dev test-upstream-live

test-live:
	@./bin/dev test-live

check-parity:
	@./bin/dev check-parity

check-live:
	@./bin/dev check-live

build:
	@./bin/dev build

package-check:
	@./bin/dev package-check

check:
	@./bin/dev check

dev-doctor:
	@./bin/dev doctor

dev-bootstrap:
	@./bin/dev bootstrap

strict-env-status:
	@./bin/dev strict-env status

strict-env-devenv:
	@./bin/dev strict-env devenv

strict-env-validate:
	@./bin/dev strict-env validate

.PHONY: help install dev run test lint docker clean

help:
	@echo "Comandos disponibles:"
	@echo "  make install   Instala dependencias de producción"
	@echo "  make dev       Instala dependencias de desarrollo"
	@echo "  make run       Arranca el servidor con recarga automática"
	@echo "  make test      Ejecuta los tests"
	@echo "  make docker    Construye y levanta con docker compose"
	@echo "  make clean     Elimina cachés y base de datos local"

install:
	pip install -r requirements.txt

dev:
	pip install -r requirements-dev.txt

run:
	uvicorn app.main:app --reload

test:
	pytest -q

docker:
	docker compose up --build

clean:
	rm -rf __pycache__ .pytest_cache app/__pycache__ app/**/__pycache__ tests/__pycache__
	rm -f padel.db

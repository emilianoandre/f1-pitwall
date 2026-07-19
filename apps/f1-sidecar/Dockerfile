# Build context is the repo root: docker build -f apps/f1-sidecar/Dockerfile .
FROM python:3.12-slim

WORKDIR /app/apps/f1-sidecar

COPY apps/f1-sidecar/pyproject.toml ./
COPY apps/f1-sidecar/src ./src

RUN pip install --no-cache-dir .

ENV PORT=8001
EXPOSE 8001

CMD ["python", "-m", "f1_sidecar.main"]

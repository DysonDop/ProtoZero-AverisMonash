# Single container: FastAPI serves the API and the built SPA.
# Targets Azure Container Apps on the smallest workload profile — this image
# has no GPU, no background workers and no local model weights, so 0.5 vCPU /
# 1 GiB is enough and scale-to-zero is safe between demo runs.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pipeline/ pipeline/
COPY parsers/ parsers/
COPY data_refs/ data_refs/
COPY eval/ eval/
COPY api/ api/
COPY sdoc-hackathon-bundle/ sdoc-hackathon-bundle/

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]

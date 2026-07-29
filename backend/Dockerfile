FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY . /app/

EXPOSE 8001

CMD ["sh", "-c", "python manage.py migrate && python import_chris_matrix.py data/Matrix\\ -\\ CHRIS.xlsx && gunicorn core.wsgi:application --bind 0.0.0.0:8001 --workers 3"]


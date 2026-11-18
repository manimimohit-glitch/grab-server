FROM python:3.11-slim

# Install ffmpeg (required for mp3/m4a/wav audio formats)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy requirements from grab-server subdirectory
COPY grab-server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app from grab-server subdirectory
COPY grab-server/app.py .

# Expose port
EXPOSE 10000

# Run the server
CMD ["uvicorn", "app:app", "--port", "10000", "--reload"]
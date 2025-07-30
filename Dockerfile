# Use an official Python runtime as a parent image
FROM python:3.9-slim-buster

# Set environment variables for Flask application
# FLASK_APP: Tells Flask where your main application file is.
# FLASK_RUN_HOST: Makes the Flask app accessible from outside the container.
# FLASK_RUN_PORT: Specifies the port Flask will listen on.
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000

# Set the working directory inside the container to /app
# All subsequent COPY and RUN commands will be relative to this directory.
WORKDIR /app

# Copy the requirements file first to leverage Docker's layer caching.
# If requirements.txt doesn't change, this layer won't be rebuilt.
# 'backend/requirements.txt' is the source path on your host.
# '.' is the destination path inside the container (which is /app).
COPY backend/requirements.txt .

# Install Python dependencies.
# '--no-cache-dir' reduces the image size by not storing pip's cache.
# '-r requirements.txt' tells pip to install packages listed in requirements.txt.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the main Flask application file.
# 'backend/app.py' is the source path on your host.
# '.' is the destination path inside the container (which is /app).
COPY backend/app.py .

# Copy the entire 'frontend' directory.
# This is crucial because your app.py serves static files and templates from 'frontend/'.
# 'frontend/' (source) refers to the folder relative to your Dockerfile.
# 'frontend/' (destination) creates a 'frontend' folder inside '/app'.
# This makes paths like '../frontend' in app.py resolve correctly to '/app/frontend'.
COPY frontend/ frontend/

# Expose port 5000 to indicate that the container listens on this port.
# This is for documentation and internal Docker networking; you still need to map ports when running.
EXPOSE 5000

# Define the command to run the Flask application when the container starts.
# This uses the default Flask development server.
CMD ["python", "app.py"]

# --- Alternative CMD for Production (Highly Recommended) ---
# For production, it's best to use a production-ready WSGI server like Gunicorn.
# If you choose this, make sure 'gunicorn' is added to your 'backend/requirements.txt'.
# CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
# (Assuming your Flask app instance is named 'app' in 'app.py'. If it's something else, adjust 'app:app' accordingly.)

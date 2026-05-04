# Use base image with Node.js
FROM node:20-bullseye

# Install dependencies for LibreOffice and Puppeteer (Chromium)
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libxfixes3 \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Generate Prisma Client for the container environment
RUN npx prisma generate

# Build the Next.js application
RUN npm run build

# Expose port
EXPOSE 3000

# Apply migrations and start the application
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]

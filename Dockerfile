# Use an official Node runtime as the base image
FROM node:20-alpine

# Install system dependencies
# - ffmpeg is required by yt-dlp for merging video and audio
# - python3 is required by yt-dlp
# - wget is needed to download the yt-dlp binary
RUN apk update && \
    apk add --no-cache ffmpeg python3 wget

# Download the latest yt-dlp binary and make it executable
RUN wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install project dependencies
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]

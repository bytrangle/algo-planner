#!/bin/bash
# Docker deployment script for Alibaba Cloud SAS

set -e

echo "=== Build and Deploy AlgoPlanner with Docker ==="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    exit 1
fi

# Read DASHSCOPE_API_KEY
if [ -z "$DASHSCOPE_API_KEY" ]; then
    if [ -f .env.local ]; then
        export DASHSCOPE_API_KEY=$(grep "^DASHSCOPE_API_KEY=" .env.local | cut -d'=' -f2)
    else
        echo "Error: DASHSCOPE_API_KEY not found"
        echo "Please set it as environment variable or in .env.local"
        exit 1
    fi
fi

echo "Building Docker image..."
docker build -t algo-planner:latest .

echo ""
echo "Image built successfully!"
echo ""
echo "To run locally:"
echo "  docker run -p 3000:3000 -e DASHSCOPE_API_KEY=$DASHSCOPE_API_KEY algo-planner"
echo ""
echo "To push to Alibaba Cloud Registry:"
echo "1. Login: docker login --username=YOUR_REGISTRY_USER --password=YOUR_PASSWORD registry.cn-hangzhou.aliyuncs.com"
echo "2. Tag: docker tag algo-planner:latest registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest"
echo "3. Push: docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest"
echo ""
echo "To deploy to ECS with Docker:"
echo "1. SSH to ECS: ssh root@YOUR_ECS_IP"
echo "2. Install Docker: curl -sSL get.docker.com | sh"
echo "3. Pull image: docker pull registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest"
echo "4. Run: docker run -d -p 3000:3000 -e DASHSCOPE_API_KEY=YOUR_KEY algo-planner"

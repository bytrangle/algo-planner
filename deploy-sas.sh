#!/bin/bash
# Deployment script for Alibaba Cloud Simple Application Server (SAS)
# This script creates a startup script to deploy the Next.js app

set -e

echo "=== AlgoPlanner SAS Deployment Script ==="
echo ""

# Check if next build exists
if [ ! -d "out" ]; then
    echo "Building Next.js app..."
    npm run build
fi

# Read DASHSCOPE_API_KEY from environment
if [ -z "$DASHSCOPE_API_KEY" ]; then
    echo "Error: DASHSCOPE_API_KEY not set in environment"
    echo "Please run: export DASHSCOPE_API_KEY=your-key-here"
    exit 1
fi

# Create config files
cat > .env.production << EOF
DASHSCOPE_API_KEY=$DASHSCOPE_API_KEY
NODE_ENV=production
EOF

echo "Environment configuration created in .env.production"

# Generate deployment readme
cat > DEPLOYMENT_README.md << 'DEPLOY_EOF'
# AlgoPlanner Deployment to Alibaba Cloud SAS

## Prerequisites
- Alibaba Cloud account
- Access to Simple Application Server (SAS)

## Deployment Steps

### Step 1: Create SAS Instance

1. Log in to Alibaba Cloud Console
2. Navigate to Simple Application Server
3. Click "Create Application Server"
4. Configure:
   - **Image**: Node.js 18 or later (Ubuntu based)
   - **Region**: Choose closest to your users
   - **Plan**: 2GB RAM / 1 vCPU (sufficient for this app)
   - **Password**: Set a secure password or use SSH key

### Step 2: Connect to Server

**Option A: Via SSH**
```bash
ssh root@YOUR_SERVER_IP
```

**Option B: Via Web Console**
- Click "Connect" in Alibaba Cloud Console
- Use the web terminal

### Step 3: Install Dependencies

```bash
# Update system
apt-get update && apt-get upgrade -y

# Install Node.js (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 4: Deploy Your App

```bash
# Create working directory
mkdir -p /opt/algo-planner
cd /opt/algo-planner

# Copy app files to server (from local machine)
# Option A: Using scp
scp -r /path/to/algo-planner/* root@YOUR_SERVER_IP:/opt/algo-planner/

# Option B: Using git (if you have repo on GitHub/GitLab)
git clone YOUR_GIT_REPO_URL .

# Install dependencies
npm ci
```

### Step 5: Configure Environment

```bash
# Create .env.production file
cat > .env.production << EOF
DASHSCOPE_API_KEY=your-actual-dashscope-key-here
NODE_ENV=production
EOF

# Or use environment variable directly
export DASHSCOPE_API_KEY=your-actual-dashscope-key-here
```

### Step 6: Build and Run

```bash
# Build the Next.js app
npm run build

# Start the server
npm start
```

The app will run on port 3000.

### Step 7: Configure Firewall

By default, SAS includes port 3000 open. If not:
1. Go to SAS instance in Alibaba Cloud Console
2. Click "Network" tab
3. Add inbound rule: Port 3000, TCP

### Step 8: Access Your App

- Open browser to: `http://YOUR_SERVER_IP:3000`
- Or bind a domain (see below)

### Optional: Bind a Custom Domain

1. **Register Domain** (if you don't have one)
   - Alibaba Cloud Domain registration
   - Or use any domain registrar

2. **Configure DNS**
   - Add A record: `@` → `YOUR_SERVER_IP`
   - Add A record: `www` → `YOUR_SERVER_IP`

3. **Configure SAS Domain**
   - In Alibaba Cloud Console → SAS
   - Click "Domains" tab
   - Add your domain
   - Enable SSL (auto-cert from Alibaba Cloud)

4. **Use Nginx as Reverse Proxy** (recommended)
   ```bash
   # Install Nginx
   apt-get install -y nginx

   # Configure
   cat > /etc/nginx/sites-available/algo-planner << EOF
   server {
       listen 80;
       server_name algo.yourdomain.com www.algo.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade \$http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host \$host;
           proxy_cache_bypass \$http_upgrade;
       }
   }
   EOF

   # Enable site
   ln -s /etc/nginx/sites-available/algo-planner /etc/nginx/sites-enabled/
   
   # Test and restart
   nginx -t
   systemctl restart nginx
   ```

### Step 9: Keep App Running (PM2)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start npm --name "algo-planner" -- start

# Set up auto-start on boot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs algo-planner
```

### Step 10: Verify Deployment

```bash
# Check if app is running
curl http://localhost:3000

# Should return HTML with AlgoPlanner content
```

## Monitoring

- **Logs**: `pm2 logs algo-planner`
- **Status**: `pm2 status`
- **Restart**: `pm2 restart algo-planner`

## Cost

- **Basic Plan**: ~¥100-200/month
- **Traffic**: Included in plan
- **Storage**: 40GB SSD included

## Troubleshooting

### App not accessible?
- Check SAS firewall: Ensure port 3000 is open
- Check Nginx: `systemctl status nginx`
- Check app: `pm2 logs algo-planner`

### Build errors?
- Clear cache: `rm -rf node_modules .next`
- Reinstall: `npm ci`

### DASHSCOPE_API_KEY errors?
- Verify env file exists: `cat .env.production`
- Check API key format: Should start with `sk-ws-`

EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Files created:"
echo "  - .env.production (contains your DASHSCOPE_API_KEY)"
echo "  - DEPLOYMENT_README.md (detailed deployment instructions)"
echo ""
echo "Next steps:"
echo "  1. Create SAS instance in Alibaba Cloud Console"
echo "  2. Connect to server via SSH"
echo "  3. Follow instructions in DEPLOYMENT_README.md"
echo ""
echo "To deploy, run:"
echo "  scp -r . root@YOUR_SERVER_IP:/opt/algo-planner/"

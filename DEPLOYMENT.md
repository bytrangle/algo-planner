<!-- For the maintainer's reference -->
# AlgoPlanner Deployment Guide

This guide covers deploying your Next.js app to Alibaba Cloud Simple Application Server (SAS) with your DASHSCOPE_API_KEY securely configured.

## Architecture

Your app uses:
- **Next.js 16** with App Router
- **Three-agent AI system**: Analyst, Designer, Optimizer
- **DASHSCOPE_API_KEY**: Your single key used by all users
- **LeetCode API**: Called directly from clients via CORS-enabled endpoint

> **Important**: Your API key stays on the server. Users only provide their LeetCode username and session cookie.

---

## Deployment Options

### Option 1: Alibaba Cloud SAS (Recommended)

 easiest option with minimal configuration.

#### Prerequisites
- Alibaba Cloud account
- ~¥100-200/month budget

#### Steps

1. **Create SAS Instance**
   ```bash
   # In Alibaba Cloud Console:
   # 1. Go to Simple Application Server
   # 2. Click "Create Application Server"
   # 3. Configure:
   #    - Image: Node.js 18+ (Ubuntu)
   #    - Region: Closest to your users
   #    - Plan: 2GB RAM / 1 vCPU
   #    - Password: Set secure password
   ```

2. **Connect to Server**
   ```bash
   # Via SSH
   ssh root@YOUR_SERVER_IP
   
   # OR via web console (click "Connect" in Alibaba Cloud)
   ```

3. **Install Dependencies**
   ```bash
   # Update system
   apt-get update && apt-get upgrade -y
   
   # Verify Node.js
   node --version  # Should be 18+
   npm --version
   ```

4. **Deploy Your App**
   ```bash
   # Create directory
   mkdir -p /opt/algo-planner
   cd /opt/algo-planner
   
   # Copy files (from local machine)
   scp -r . root@YOUR_SERVER_IP:/opt/algo-planner/
   
   # Or use git
   git clone YOUR_GIT_REPO_URL .
   
   # Install dependencies
   npm ci
   ```

5. **Configure Environment**
   ```bash
   # Create .env.production file
   cat > .env.production << EOF
   DASHSCOPE_API_KEY=sk-ws-H.ILMEIR.1SAz.MEUCIQCbrsbtjPgmt3NPiOlbz2_QSfSAubjhTRfJdwNG0vBmzQIgCk6Ea0B8tzADESywsGF8tV1j2NBNxb3r95x338kLhuA
   NODE_ENV=production
   EOF
   
   # Export for immediate use
   export DASHSCOPE_API_KEY=sk-ws-H.ILMEIR.1SAz.MEUCIQCbrsbtjPgmt3NPiOlbz2_QSfSAubjhTRfJdwNG0vBmzQIgCk6Ea0B8tzADESywsGF8tV1j2NBNxb3r95x338kLhuA
   ```

6. **Build and Run**
   ```bash
   # Build the app
   npm run build
   
   # Start server (port 3000)
   npm start
   ```

7. **Configure Firewall**
   - In Alibaba Cloud Console → SAS → Network
   - Ensure port 3000 is open for inbound TCP

8. **Access Your App**
   - Open: `http://YOUR_SERVER_IP:3000`
   - OR bind a custom domain

9. **Keep Running with PM2**
   ```bash
   # Install PM2
   npm install -g pm2
   
   # Start with PM2
   pm2 start npm --name "algo-planner" -- start
   
   # Auto-start on boot
   pm2 startup
   pm2 save
   
   # Monitor
   pm2 status
   pm2 logs algo-planner
   ```

---

### Option 2: Docker + ECS (More Control)

For production with container orchestration.

#### Steps

1. **Build Docker Image**
   ```bash
   # Ensure you're in project root
   docker build -t algo-planner:latest .
   ```

2. **Push to Alibaba Cloud Registry**
   ```bash
   # Login
   docker login --username=YOUR_REGISTRY_USER --password=YOUR_PASSWORD registry.cn-hangzhou.aliyuncs.com
   
   # Tag and push
   docker tag algo-planner:latest registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest
   docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest
   ```

3. **Deploy to ECS**
   ```bash
   # SSH to ECS
   ssh root@YOUR_ECS_IP
   
   # Install Docker
   curl -sSL get.docker.com | sh
   
   # Pull and run
   docker pull registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest
   
   docker run -d \
     -p 3000:3000 \
     -e DASHSCOPE_API_KEY=sk-ws-H.ILMEIR.1SAz.MEUCIQCbrsbtjPgmt3NPiOlbz2_QSfSAubjhTRfJdwNG0vBmzQIgCk6Ea0B8tzADESywsGF8tV1j2NBNxb3r95x338kLhuA \
     --name algo-planner \
     registry.cn-hangzhou.aliyuncs.com/your-namespace/algo-planner:latest
   ```

---

## Custom Domain Setup

### Step 1: Register Domain

- Alibaba Cloud Domain: https://dc.console.aliyun.com
- Or use any registrar (Namecheap, Cloudflare, etc.)

### Step 2: DNS Configuration

```
Type: A
Name: @
Value: YOUR_SERVER_IP
TTL: 600

Type: A
Name: www
Value: YOUR_SERVER_IP
TTL: 600
```

### Step 3: SAS Domain Settings

1. Alibaba Cloud Console → SAS → Your Instance
2. Click "Domains" tab
3. Add domain: `algo.yourdomain.com`
4. Enable Auto SSL Certificate

### Step 4: Nginx Reverse Proxy

```bash
# Install Nginx
apt-get install -y nginx

# Create config
cat > /etc/nginx/sites-available/algo-planner << 'EOF'
server {
    listen 80;
    server_name algo.yourdomain.com www.algo.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/algo-planner /etc/nginx/sites-enabled/

# Test and restart
nginx -t
systemctl restart nginx
```

---

## Security Checklist

- [ ] API key stored in `.env.production` (not committed to git)
- [ ] `.gitignore` includes `.env.production`
- [ ] SAS firewall only allows ports 80, 443, 3000
- [ ] SSL certificate enabled (auto from Alibaba Cloud)
- [ ] PM2 configured for auto-restart
- [ ] Regular backups of data

---

## Monitoring

```bash
# Check app status
pm2 status

# View logs
pm2 logs algo-planner

# Check disk space
df -h

# Check memory
free -m

# Check if port is open
netstat -tlnp | grep 3000
```

---

## Cost Breakdown

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| **SAS** | 2GB RAM / 1 vCPU | ¥100-200 |
| **Storage** | 40GB SSD | Included |
| **Bandwidth** | 1TB traffic | Included |
| **SSL Certificate** | Basic | Free |
| **Domain** | Custom domain | ¥50-100/year |

**Total: ~¥150-250/month**

---

## Troubleshooting

### App not accessible

```bash
# Check if app is running
pm2 status

# Check logs
pm2 logs algo-planner

# Check if port is open
netstat -tlnp | grep 3000

# Check firewall rules
ufw status
```

### DASHSCOPE_API_KEY error

```bash
# Verify env file
cat .env.production

# Check API key format
# Should start with: sk-ws-
```

### Build errors

```bash
# Clear cache
rm -rf node_modules .next

# Reinstall
npm ci
npm run build
```

---

## Quick Start Commands

```bash
# Login to server
ssh root@YOUR_SERVER_IP

# Navigate to app
cd /opt/algo-planner

# Check status
pm2 status algo-planner

# View logs
pm2 logs algo-planner

# Restart if needed
pm2 restart algo-planner
```

---

## Getting Help

- Alibaba Cloud SAS Docs: https://www.alibabacloud.com/help/en/simple-application-server
- Next.js Deployment: https://nextjs.org/docs/app/building-your-application/deploying
- DASHSCOPE API: https://help.aliyun.com/zh/dashscope/

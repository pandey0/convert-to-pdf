# AWS Deployment Guide: Convert-to-PDF Monolith (EC2)

This guide covers deploying your PDF conversion tool to an **AWS EC2 Instance** using Docker.

## 1. Launch an EC2 Instance
1.  **Region**: Select the region closest to your customers (e.g., `ap-south-1` for India).
2.  **Instance Type**: `t3.medium` is recommended (2 vCPUs, 4GB RAM). PDF conversion is CPU-intensive.
3.  **OS**: **Ubuntu 22.04 LTS (HVM)**.
4.  **Key Pair**: Create or use an existing `.pem` key for SSH access.
5.  **Security Group** (Firewall):
    - **Inbound Rule 1**: SSH (Port 22) from your IP.
    - **Inbound Rule 2**: HTTP (Port 80) from Anywhere.
    - **Inbound Rule 3**: HTTPS (Port 443) from Anywhere.

## 2. Monthly Cost Estimate (Approximate)
| Item | Monthly Cost | Notes |
| :--- | :--- | :--- |
| **t3.medium Instance** | ~$30.00 | $0.0416/hr (on-demand) |
| **NeonDB (Database)** | FREE | Using Neon's generous free tier |
| **Domain + DNS** | ~$1.50 | Route 53 ($0.50) + Domain (~$12/yr) |
| **TOTAL** | **~$31.50** | **Best for scalability and professional infra** |

## 3. Server Installation
Connect to your instance: `ssh -i your-key.pem ubuntu@your-ec2-ip`

### Install Docker
```bash
sudo apt update
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
```
*Logout and log back in for the group changes to take effect.*

## 3. Environment Setup
Create the `.env` file on your EC2 instance:

```bash
cd ~
mkdir pdf-app && cd pdf-app
nano .env
```

**Paste your production keys:**
```env
# Database (NeonDB)
DATABASE_URL="postgresql://user:password@endpoint/dbname?sslmode=require"

# Razorpay Production Keys
RAZORPAY_KEY_ID="rzp_live_xxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"

# Next.js Settings
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_live_xxxxxxxxxxxx"
NEXT_PUBLIC_SKIP_PAYMENT="false"
```

## 4. Deploy the Tool
Since you have a Dockerfile, the easiest way is to build it on the instance:

```bash
# Clone or upload your code to the instance
# Then build:
docker build -t pdf-converter .

# Run the container
docker run -d \
  --name pdf-app \
  --restart always \
  -p 3000:3000 \
  --env-file .env \
  pdf-converter
```

## 5. Domain & HTTPS (AWS Route 53 + Caddy)
1.  **Point Domain**: In Route 53, create an `A` record pointing to your EC2's **Elastic IP**.
2.  **SSL**: Install **Caddy** for automatic SSL.

```bash
# Install Caddy on Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy -y

# Configuration
sudo nano /etc/caddy/Caddyfile
```

**Caddyfile Content:**
```
your-domain.com {
    reverse_proxy localhost:3000
}
```

**Reload Caddy:**
```bash
sudo systemctl reload caddy
```

## 6. Pro Tip: Elastic IP
Always assign an **Elastic IP** to your EC2 instance. Otherwise, your IP will change if you stop and start the instance, breaking your DNS records.

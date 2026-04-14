# DigitalOcean Deployment Guide: Convert-to-PDF Monolith

This guide covers deploying your PDF conversion tool to a **DigitalOcean Droplet** for maximum performance and reliability.

## 1. Create a DigitalOcean Droplet
1.  **Image**: Choose **Ubuntu 22.04 LTS**.
2.  **Size**: Select the **Basic Plan** -> **Regular Intel with SSD** ($6/mo or $12/mo depending on your traffic).
3.  **Authentication**: Use **SSH Keys** (highly recommended for security).
4.  **Networking**: Enable **IPv6** and **Monitoring**.

## 2. Monthly Cost Estimate (Approximate)
| Item | Monthly Cost | Notes |
| :--- | :--- | :--- |
| **Droplet (2GB/1vCPU)** | ~$12.00 | Sufficient for low/medium traffic |
| **NeonDB (Database)** | FREE | Using Neon's generous free tier |
| **Domain** | ~$1.00 | Prorated annual cost (~$12/year) |
| **TOTAL** | **~$13.00** | **Best for simplicity and low cost** |

## 3. Server Configuration
Connect to your Droplet via SSH and run these commands:

### Install Docker (DigitalOcean Script)
```bash
sudo apt update
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install docker-ce -y
sudo systemctl status docker
```

## 3. DigitalOcean Firewall (Crucial)
1.  In your DigitalOcean dashboard, go to **Networking** -> **Firewalls**.
2.  Add a New Firewall ("convert-to-pdf-fw").
3.  **Inbound Rules**: 
    - **SSH** (Port 22, All IPv4/IPv6)
    - **HTTP** (Port 80, All IPv4/IPv6)
    - **HTTPS** (Port 443, All IPv4/IPv6)
4.  Apply this firewall to your Droplet.

## 4. Environment & App Setup
On your Droplet, clone your code and create the `.env` file:

```bash
# Clone your private repo
git clone <your-repo-url>
cd convert-to-pdf

# Create the environment file
nano .env
```

**Paste these values into `.env`:**
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

## 5. Build & Go Live
We recommend using Docker directly on the Droplet to avoid image registry costs:

```bash
# Build the image
docker build -t pdf-converter .

# Run the container
docker run -d \
  --name pdf-app \
  --restart always \
  -p 3000:3000 \
  --env-file .env \
  pdf-converter
```

## 6. Domain & SSL (HTTPS)
Use a reverse proxy to handle SSL. DigitalOcean supports **Caddy** which is the easiest:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configure Caddy
sudo nano /etc/caddy/Caddyfile
```

**Add this to your Caddyfile:**
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Restart Caddy:**
```bash
sudo systemctl restart caddy
```
*Caddy will automatically provision and renew your SSL certificates.*

## 7. Scaling
If traffic increases, you can **Resize** your Droplet in the DigitalOcean dashboard (e.g., to 4GB RAM) with just a restart.

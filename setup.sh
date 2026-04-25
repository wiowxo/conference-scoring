#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "================================================"
echo "  Conference Scoring — Automated Setup"
echo "================================================"
echo -e "${NC}"

# Must run as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root: sudo bash setup.sh${NC}"
    exit 1
fi

# Install basic dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get update -qq
apt-get install -y -qq curl git openssl snapd

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed.${NC}"
fi

# Add current sudo user to docker group so they can run docker without sudo
if [ -n "$SUDO_USER" ]; then
    usermod -aG docker "$SUDO_USER"
    echo -e "${GREEN}Added $SUDO_USER to docker group (re-login to apply).${NC}"
fi

# Install certbot via snap (much newer version than apt)
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot via snap...${NC}"
    snap install core
    snap refresh core
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
    echo -e "${GREEN}Certbot installed.${NC}"
fi

echo -e "${GREEN}Certbot version: $(certbot --version 2>&1)${NC}"

# Determine app directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
APP_DIR=$(pwd)
echo "Working directory: $APP_DIR"

# Collect configuration
echo ""
echo -e "${YELLOW}Please enter setup details:${NC}"
read -p "Domain name (e.g. rgsu-conf.ru): " DOMAIN
read -p "Email for SSL certificate: " EMAIL
echo -n "Database password (press Enter to auto-generate): "
read -s POSTGRES_PASSWORD
echo ""

if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    echo -e "${GREEN}Generated database password: $POSTGRES_PASSWORD${NC}"
    echo -e "${YELLOW}(Save this somewhere safe!)${NC}"
fi

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Save env file
cat > "$APP_DIR/.env.production" << EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF

echo -e "${GREEN}Settings saved to .env.production${NC}"

# Create required directories
mkdir -p "$APP_DIR/nginx/conf.d" "$APP_DIR/certbot/www" "$APP_DIR/certbot/conf" "$APP_DIR/certbot/work" "$APP_DIR/certbot/logs"

# Replace domain placeholder in nginx config
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/nginx/conf.d/default.conf" > "$APP_DIR/nginx/conf.d/active.conf"

# Stop any running containers
docker compose --env-file "$APP_DIR/.env.production" down 2>/dev/null || true

# Free port 80 if something is using it
fuser -k 80/tcp 2>/dev/null || true
sleep 2

# Get SSL certificate using standalone mode
echo ""
echo -e "${YELLOW}Obtaining SSL certificate for $DOMAIN...${NC}"
echo "(This should take about 30 seconds)"

certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domain "$DOMAIN" \
    --config-dir "$APP_DIR/certbot/conf" \
    --work-dir "$APP_DIR/certbot/work" \
    --logs-dir "$APP_DIR/certbot/logs"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to obtain SSL certificate.${NC}"
    echo "Check that:"
    echo "  1. Domain $DOMAIN points to this server IP"
    echo "  2. Port 80 is open (ufw allow 80)"
    exit 1
fi

echo -e "${GREEN}SSL certificate obtained successfully!${NC}"

# Build and start all containers
echo ""
echo -e "${YELLOW}Building and starting all services (3-5 minutes)...${NC}"
cd "$APP_DIR"
docker compose --env-file .env.production up -d --build

# Wait for services
echo "Waiting for services to start..."
sleep 20

# Check status
echo ""
docker compose ps

# Final check
if docker compose ps | grep -qE "unhealthy|Exit [^0]"; then
    echo -e "${RED}Some services failed to start. Check logs:${NC}"
    echo "  sudo docker compose logs app"
    echo "  sudo docker compose logs db"
else
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  Setup complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "App available at: ${GREEN}https://$DOMAIN${NC}"
    echo ""
    echo "Login: admin / admin"
    echo "(You will be asked to change password on first login)"
    echo ""
    echo -e "${YELLOW}Useful commands (run from $APP_DIR):${NC}"
    echo "  sudo docker compose logs -f app                                          — logs"
    echo "  sudo docker compose ps                                                   — status"
    echo "  sudo docker compose restart app                                          — restart"
    echo "  sudo docker compose down                                                 — stop"
    echo "  git pull && sudo docker compose --env-file .env.production up -d --build — update"
fi

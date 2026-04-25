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

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get update -qq
apt-get install -y -qq curl git tmux openssl

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Allow non-root user to run docker commands without sudo
if [ -n "$SUDO_USER" ]; then
    usermod -aG docker "$SUDO_USER"
    echo -e "${GREEN}Added $SUDO_USER to docker group (re-login to apply)${NC}"
fi

# Install certbot directly (not via docker) for reliability
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt-get install -y -qq certbot
fi

# Clone repo if not already cloned
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
    echo -e "${YELLOW}Cloning repository...${NC}"
    git clone https://github.com/wiowxo/conference-scoring.git /opt/conference-scoring
    cd /opt/conference-scoring
else
    cd "$SCRIPT_DIR"
fi

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
    echo "(Save this somewhere safe!)"
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
mkdir -p "$APP_DIR/nginx/conf.d" "$APP_DIR/certbot/www" "$APP_DIR/certbot/conf"

# Replace domain placeholder in nginx config
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/nginx/conf.d/default.conf" > "$APP_DIR/nginx/conf.d/active.conf"

# Remove init.conf so nginx only loads active.conf (prevents conflicting server blocks)
rm -f "$APP_DIR/nginx/conf.d/init.conf"

# Stop any running containers
docker compose --env-file "$APP_DIR/.env.production" down 2>/dev/null || true

# Make sure port 80 is free for standalone certbot
fuser -k 80/tcp 2>/dev/null || true
sleep 2

# Get SSL certificate using standalone mode (no nginx needed)
echo ""
echo -e "${YELLOW}Obtaining SSL certificate for $DOMAIN...${NC}"
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
    echo -e "${RED}Failed to obtain SSL certificate. Check that:${NC}"
    echo "1. Domain $DOMAIN points to this server's IP"
    echo "2. Port 80 is open in firewall"
    exit 1
fi

echo -e "${GREEN}SSL certificate obtained!${NC}"

# Build and start all containers
echo ""
echo -e "${YELLOW}Building and starting all services (this may take 3-5 minutes)...${NC}"
cd "$APP_DIR"
docker compose --env-file .env.production up -d --build

# Wait for services
echo "Waiting for services to start..."
sleep 20

# Check status
echo ""
docker compose ps

# Final check
if docker compose ps | grep -q "unhealthy\|Exit"; then
    echo -e "${RED}Some services failed to start. Check logs:${NC}"
    echo "docker compose logs app"
    echo "docker compose logs db"
else
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  Setup complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "App is available at: ${GREEN}https://$DOMAIN${NC}"
    echo ""
    echo "Login: admin / admin"
    echo "(You will be asked to change password on first login)"
    echo ""
    echo "Useful commands:"
    echo "  docker compose logs -f app     — view logs"
    echo "  docker compose ps              — check status"
    echo "  docker compose restart app     — restart app"
    echo "  docker compose down            — stop everything"
    echo "  git pull && docker compose --env-file .env.production up -d --build  — update"
fi

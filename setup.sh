#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "================================================"
echo "  Conference Scoring — Automated Setup"
echo "================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root: sudo bash setup.sh${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get update -qq
apt-get install -y -qq curl git openssl snapd

# Install Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if [ -n "$SUDO_USER" ]; then
    usermod -aG docker "$SUDO_USER"
    echo -e "${GREEN}Added $SUDO_USER to docker group.${NC}"
fi

# Install certbot via snap (apt version is too old)
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot via snap...${NC}"
    snap install core
    snap refresh core
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
fi

echo -e "${GREEN}Certbot: $(certbot --version 2>&1)${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
APP_DIR=$(pwd)
echo "App directory: $APP_DIR"

# Collect configuration
echo ""
echo -e "${YELLOW}Enter setup details:${NC}"
read -p "Domain name (e.g. rgsu-conf.ru): " DOMAIN
read -p "Email for SSL certificate: " EMAIL_RAW
EMAIL=$(echo "$EMAIL_RAW" | tr -cd '[:print:]' | sed 's/[^a-zA-Z0-9@._+-]//g')
echo "Using email: $EMAIL"
echo -n "Database password (Enter to auto-generate): "
read -s POSTGRES_PASSWORD
echo ""

if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    echo -e "${GREEN}Generated password: $POSTGRES_PASSWORD${NC}"
    echo -e "${YELLOW}Save this somewhere safe!${NC}"
fi

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

cat > "$APP_DIR/.env.production" << EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF

echo -e "${GREEN}Saved .env.production${NC}"

# Create directories
mkdir -p "$APP_DIR/nginx/conf.d" \
         "$APP_DIR/certbot/www" \
         "$APP_DIR/certbot/conf" \
         "$APP_DIR/certbot/work" \
         "$APP_DIR/certbot/logs"

# Stop any running containers and clean volumes
docker compose --env-file "$APP_DIR/.env.production" down --remove-orphans -v 2>/dev/null || true
docker network prune -f 2>/dev/null || true

# Free port 80
fuser -k 80/tcp 2>/dev/null || true
sleep 2

# Get SSL certificate
echo ""
echo -e "${YELLOW}Getting SSL certificate for $DOMAIN...${NC}"

certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domain "$DOMAIN" \
    --config-dir "$APP_DIR/certbot/conf" \
    --work-dir "$APP_DIR/certbot/work" \
    --logs-dir "$APP_DIR/certbot/logs"

echo -e "${GREEN}SSL certificate obtained!${NC}"

# Copy real cert files (Docker cannot follow symlinks outside mounted volume)
echo -e "${YELLOW}Copying certificate files...${NC}"
CERT_DIR="$APP_DIR/certbot/conf/live/$DOMAIN"
for f in fullchain.pem privkey.pem chain.pem cert.pem; do
    cp -L "$CERT_DIR/$f" "/tmp/$f"
    mv "/tmp/$f" "$CERT_DIR/$f"
done
echo -e "${GREEN}Certificates ready.${NC}"

# Setup nginx — replace domain placeholder, keep only active.conf
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$APP_DIR/nginx/conf.d/default.conf" > "$APP_DIR/nginx/conf.d/active.conf"
rm -f "$APP_DIR/nginx/conf.d/default.conf"
rm -f "$APP_DIR/nginx/conf.d/init.conf"
echo -e "${GREEN}Nginx configured.${NC}"

# Remove old postgres volume if exists (prevents password mismatch on reinstall)
echo -e "${YELLOW}Cleaning up old Docker volumes...${NC}"
docker volume rm conference-scoring_postgres_data 2>/dev/null || true

# Start DB first and reset to clean state
echo ""
echo -e "${YELLOW}Initializing database...${NC}"
docker compose --env-file "$APP_DIR/.env.production" up -d db
echo "Waiting for DB to be ready..."
sleep 15

docker compose --env-file "$APP_DIR/.env.production" exec -T db \
    psql -U postgres -d conference_scoring \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true

docker compose --env-file "$APP_DIR/.env.production" down
echo -e "${GREEN}Database reset to clean state.${NC}"

# Build and start everything
echo ""
echo -e "${YELLOW}Building and starting all services (3-5 min)...${NC}"
docker compose --env-file "$APP_DIR/.env.production" up -d --build --force-recreate

echo "Waiting for services to start..."
sleep 25

docker compose --env-file "$APP_DIR/.env.production" ps

# Check result
if docker compose --env-file "$APP_DIR/.env.production" ps | grep -qE "Restarting|unhealthy|Exit [^0]"; then
    echo ""
    echo -e "${RED}Some services failed to start. Check logs:${NC}"
    echo "  sudo docker compose --env-file .env.production logs app"
    echo "  sudo docker compose --env-file .env.production logs nginx"
    echo "  sudo docker compose --env-file .env.production logs db"
else
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}  Setup complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "  App: ${GREEN}https://$DOMAIN${NC}"
    echo "  Login: admin / admin"
    echo "  (Change password on first login)"
    echo ""
    echo -e "${YELLOW}Useful commands (from $APP_DIR):${NC}"
    echo "  sudo docker compose --env-file .env.production logs -f app   — logs"
    echo "  sudo docker compose --env-file .env.production ps            — status"
    echo "  sudo docker compose --env-file .env.production restart app   — restart"
    echo "  sudo docker compose --env-file .env.production down          — stop"
    echo ""
    echo -e "${YELLOW}Update app:${NC}"
    echo "  git pull && sudo docker compose --env-file .env.production up -d --build --force-recreate"
fi

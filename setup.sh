#!/bin/bash
set -e

echo "================================================"
echo "  Conference Scoring App — Setup"
echo "================================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo bash setup.sh"
    exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt update
    apt install -y curl
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed."
fi

# Collect configuration
echo "Enter setup details:"
echo ""
read -p "Domain name (e.g. rgsu-conf.ru): " DOMAIN
read -p "Email for SSL certificate: " EMAIL
read -s -p "Database password (leave blank to auto-generate): " POSTGRES_PASSWORD
echo ""

if [ -z "$POSTGRES_PASSWORD" ]; then
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
    echo "Generated database password: $POSTGRES_PASSWORD"
    echo "(Save this somewhere safe!)"
fi

JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Save env file
cat > .env.production << EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF

echo ""
echo "Settings saved to .env.production"

# Create required directories
mkdir -p nginx/conf.d certbot/www certbot/conf

# Use init config for initial SSL verification
cp nginx/conf.d/init.conf nginx/conf.d/active.conf

# Start nginx for certbot verification
echo ""
echo "Starting nginx for SSL verification..."
docker compose up -d nginx
echo "Waiting for nginx..."
sleep 8

# Get SSL certificate
echo ""
echo "Obtaining SSL certificate for $DOMAIN..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

echo "SSL certificate obtained!"

# Replace DOMAIN_PLACEHOLDER with actual domain in nginx config
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" nginx/conf.d/default.conf > nginx/conf.d/active.conf

# Stop nginx, then start everything
docker compose down

echo ""
echo "Building and starting all services (this may take 3-5 minutes)..."
docker compose --env-file .env.production up -d --build

echo ""
echo "Waiting for services to start..."
sleep 15

# Show status
docker compose ps

echo ""
echo "================================================"
echo "  Setup complete!"
echo "================================================"
echo ""
echo "App is available at: https://$DOMAIN"
echo ""
echo "Login: admin / admin"
echo "(You will be asked to change the password on first login)"
echo ""
echo "Useful commands:"
echo "  Logs:         docker compose logs -f app"
echo "  Status:       docker compose ps"
echo "  Restart:      docker compose restart app"
echo "  Stop:         docker compose down"
echo "  Update:       git pull && docker compose --env-file .env.production up -d --build"
echo ""
echo "Reset admin password:"
echo "  docker compose exec app node scripts/reset-password.js"
echo ""
echo "Wipe entire database:"
echo "  docker compose exec app sh scripts/reset-password.sh --wipe"

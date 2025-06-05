#!/bin/bash

# LLM Context MCP Server Setup Script
# This script sets up the database and environment for the MCP server

set -e

echo "🚀 Setting up LLM Context MCP Server"
echo "===================================="

# Check if PostgreSQL is installed and running
echo "📋 Checking PostgreSQL installation..."
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install it first."
    echo "   On Fedora: sudo dnf install postgresql postgresql-server"
    exit 1
fi

# Check if PostgreSQL service is running
if ! sudo systemctl is-active --quiet postgresql; then
    echo "⚠️  PostgreSQL service is not running. Attempting to start..."
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
fi

echo "✅ PostgreSQL is available"

# Get database configuration
echo ""
echo "📊 Database Configuration"
echo "========================"

read -p "Database name [llm_context_db]: " DB_NAME
DB_NAME=${DB_NAME:-llm_context_db}

read -p "Database user [jtaylor]: " DB_USER
DB_USER=${DB_USER:-jtaylor}

read -s -p "Database password: " DB_PASSWORD
echo ""

# Check if database exists, create if not
echo "🗄️  Setting up database..."
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "✅ Database '$DB_NAME' already exists"
else
    echo "📦 Creating database '$DB_NAME'..."
    sudo -u postgres createdb $DB_NAME
fi

# Check if user exists, create if not
if sudo -u postgres psql -t -c "\du" | cut -d \| -f 1 | grep -qw $DB_USER; then
    echo "✅ User '$DB_USER' already exists"
else
    echo "👤 Creating user '$DB_USER'..."
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
fi

# Grant privileges
echo "🔐 Granting privileges..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"

# Create .env file
echo "⚙️  Creating environment configuration..."
cp .env.example .env

# Update .env with user's settings
sed -i "s/DATABASE_NAME=.*/DATABASE_NAME=$DB_NAME/" .env
sed -i "s/DATABASE_USER=.*/DATABASE_USER=$DB_USER/" .env
sed -i "s/DATABASE_PASSWORD=.*/DATABASE_PASSWORD=$DB_PASSWORD/" .env

echo "✅ Environment file created: .env"

# Install dependencies
echo "📦 Installing Node.js dependencies..."
if command -v npm &> /dev/null; then
    npm install
elif command -v yarn &> /dev/null; then
    yarn install
else
    echo "❌ Neither npm nor yarn found. Please install Node.js and npm."
    exit 1
fi

# Build the project
echo "🔨 Building the project..."
npm run build

# Run database migrations
echo "🗄️  Running database migrations..."
npm run migrate

echo ""
echo "🎉 Setup completed successfully!"
echo "================================"
echo ""
echo "📋 Next steps:"
echo "1. Review and update the .env file with your specific configuration"
echo "2. Start the server with: npm start"
echo "3. For development, use: npm run dev"
echo ""
echo "📚 Available scripts:"
echo "   npm start       - Start the production server"
echo "   npm run dev     - Start development server with auto-reload"
echo "   npm run build   - Build the TypeScript project"
echo "   npm run migrate - Run database migrations"
echo "   npm test        - Run tests"
echo "   npm run lint    - Run ESLint"
echo ""
echo "🔧 Configuration file: .env"
echo "📊 Database: $DB_NAME (user: $DB_USER)"
echo "📁 Project directory: $(pwd)"
echo ""
echo "Happy coding! 🚀"


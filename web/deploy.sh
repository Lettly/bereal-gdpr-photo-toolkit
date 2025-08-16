#!/bin/bash

# BeReal GDPR Photo Toolkit - Web App Deployment Script
# This script helps deploy the web application to various hosting services

set -e

echo "🚀 BeReal GDPR Photo Toolkit - Web App Deployment"
echo "=================================================="

# Check if we're in the correct directory
if [ ! -f "index.html" ]; then
    echo "❌ Error: Please run this script from the web/ directory"
    exit 1
fi

# Function to deploy to different services
deploy_to_service() {
    case $1 in
        "netlify")
            echo "📦 Deploying to Netlify..."
            if command -v netlify &> /dev/null; then
                netlify deploy --prod --dir .
                echo "✅ Deployed to Netlify!"
            else
                echo "❌ Netlify CLI not found. Install with: npm install -g netlify-cli"
                echo "💡 Alternative: Drag and drop the web/ folder to https://app.netlify.com/drop"
            fi
            ;;
        "vercel")
            echo "📦 Deploying to Vercel..."
            if command -v vercel &> /dev/null; then
                vercel --prod
                echo "✅ Deployed to Vercel!"
            else
                echo "❌ Vercel CLI not found. Install with: npm install -g vercel"
                echo "💡 Alternative: Connect your repository at https://vercel.com"
            fi
            ;;
        "surge")
            echo "📦 Deploying to Surge.sh..."
            if command -v surge &> /dev/null; then
                surge . bereal-toolkit-$(date +%s).surge.sh
                echo "✅ Deployed to Surge.sh!"
            else
                echo "❌ Surge CLI not found. Install with: npm install -g surge"
            fi
            ;;
        "github-pages")
            echo "📦 Setting up for GitHub Pages..."
            echo "1. Push the web/ folder contents to your repository"
            echo "2. Go to Settings > Pages in your GitHub repository"
            echo "3. Select 'Deploy from a branch' and choose your branch"
            echo "4. Set folder to '/ (root)' or '/web' depending on your setup"
            echo "💡 Your site will be available at: https://username.github.io/repository-name"
            ;;
        "firebase")
            echo "📦 Deploying to Firebase Hosting..."
            if command -v firebase &> /dev/null; then
                # Create firebase.json if it doesn't exist
                if [ ! -f "firebase.json" ]; then
                    cat > firebase.json << EOF
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css|wasm)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
EOF
                fi
                firebase deploy
                echo "✅ Deployed to Firebase Hosting!"
            else
                echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
            fi
            ;;
        *)
            echo "❌ Unknown service: $1"
            echo "Available services: netlify, vercel, surge, github-pages, firebase"
            exit 1
            ;;
    esac
}

# Function to start local development server
start_local_server() {
    echo "🔧 Starting local development server..."
    
    # Try different methods to start a local server
    if command -v python3 &> /dev/null; then
        echo "Using Python 3 server on http://localhost:8000"
        python3 -m http.server 8000
    elif command -v python &> /dev/null; then
        echo "Using Python server on http://localhost:8000"
        python -m http.server 8000
    elif command -v php &> /dev/null; then
        echo "Using PHP server on http://localhost:8000"
        php -S localhost:8000
    elif command -v npx &> /dev/null; then
        echo "Using Node.js serve on http://localhost:3000"
        npx serve .
    else
        echo "❌ No suitable server found. Please install Python, PHP, or Node.js"
        exit 1
    fi
}

# Function to validate the web app
validate_app() {
    echo "🔍 Validating web application..."
    
    # Check required files
    required_files=("index.html" "styles.css" "app.js" "worker.js")
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            echo "✅ $file found"
        else
            echo "❌ $file missing"
            exit 1
        fi
    done
    
    # Check file sizes (basic validation)
    if [ $(wc -c < "index.html") -lt 1000 ]; then
        echo "⚠️  Warning: index.html seems too small"
    fi
    
    if [ $(wc -c < "app.js") -lt 5000 ]; then
        echo "⚠️  Warning: app.js seems too small"
    fi
    
    echo "✅ Basic validation passed"
}

# Function to optimize for production
optimize_for_production() {
    echo "⚡ Optimizing for production..."
    
    # Create optimized directory
    mkdir -p dist
    cp -r * dist/ 2>/dev/null || true
    
    # Basic minification (if tools are available)
    if command -v terser &> /dev/null; then
        echo "Minifying JavaScript..."
        terser dist/app.js -o dist/app.min.js
        sed -i 's/app\.js/app.min.js/g' dist/index.html
    fi
    
    if command -v csso &> /dev/null; then
        echo "Minifying CSS..."
        csso dist/styles.css --output dist/styles.min.css
        sed -i 's/styles\.css/styles.min.css/g' dist/index.html
    fi
    
    echo "✅ Optimization complete (check dist/ folder)"
}

# Main menu
if [ $# -eq 0 ]; then
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  validate              - Validate the web application"
    echo "  serve                 - Start local development server"
    echo "  optimize             - Optimize for production"
    echo "  deploy [service]     - Deploy to hosting service"
    echo ""
    echo "Deployment services:"
    echo "  netlify              - Deploy to Netlify"
    echo "  vercel               - Deploy to Vercel"
    echo "  surge                - Deploy to Surge.sh"
    echo "  github-pages         - Setup for GitHub Pages"
    echo "  firebase             - Deploy to Firebase Hosting"
    echo ""
    echo "Examples:"
    echo "  $0 serve"
    echo "  $0 deploy netlify"
    echo "  $0 validate"
    exit 0
fi

# Execute command
case $1 in
    "validate")
        validate_app
        ;;
    "serve")
        validate_app
        start_local_server
        ;;
    "optimize")
        validate_app
        optimize_for_production
        ;;
    "deploy")
        if [ -z "$2" ]; then
            echo "❌ Please specify a deployment service"
            echo "Available: netlify, vercel, surge, github-pages, firebase"
            exit 1
        fi
        validate_app
        deploy_to_service $2
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo "Run '$0' without arguments to see usage"
        exit 1
        ;;
esac

echo ""
echo "🎉 Done!"

#!/bin/bash

echo "🚀 Deploying Image Compressor to Netlify..."

# Create a zip file for manual upload
echo "📦 Creating deployment package..."
zip -r image-compressor.zip . -x ".git/*" "node_modules/*" "*.log" "deploy.sh"

echo "✅ Deployment package created: image-compressor.zip"
echo ""
echo "📋 Next Steps:"
echo "1. Go to https://app.netlify.com/drop"
echo "2. Drag and drop 'image-compressor.zip' onto the page"
echo "3. Your site will be live instantly!"
echo ""
echo "🎉 Your Image Compressor will be ready for AdSense!"

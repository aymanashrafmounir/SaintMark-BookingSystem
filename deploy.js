#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Deploying Saint Mark Booking System to Vercel...\n');

// Check if vercel CLI is installed
try {
  execSync('vercel --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Vercel CLI is not installed. Please install it first:');
  console.error('   npm install -g vercel');
  process.exit(1);
}

// Check if user is logged in
try {
  execSync('vercel whoami', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Please login to Vercel first:');
  console.error('   vercel login');
  process.exit(1);
}

// Install dependencies
console.log('📦 Installing dependencies...');
try {
  execSync('npm install', { stdio: 'inherit' });
  execSync('cd client && npm install', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to install dependencies');
  process.exit(1);
}

// Build client
console.log('🔨 Building client...');
try {
  execSync('cd client && npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to build client');
  process.exit(1);
}

// Deploy to Vercel
console.log('🚀 Deploying to Vercel...');
try {
  execSync('vercel --prod', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to deploy to Vercel');
  process.exit(1);
}

console.log('\n✅ Deployment completed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Set environment variables in Vercel dashboard:');
console.log('   - MONGODB_URI');
console.log('   - JWT_SECRET');
console.log('   - ADMIN_USERNAME');
console.log('   - ADMIN_PASSWORD');
console.log('2. Redeploy after setting environment variables:');
console.log('   vercel --prod');
console.log('\n📖 For more details, see VERCEL_SETUP.md');

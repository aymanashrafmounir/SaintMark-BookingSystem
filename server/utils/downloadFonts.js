/**
 * Script to download Roboto fonts for pdfmake
 * Run this script once to download fonts: node utils/downloadFonts.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const fontsDir = path.join(__dirname, 'fonts');
// Use raw.githubusercontent.com for reliable font downloads
const fonts = [
  {
    name: 'Roboto-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Regular.ttf'
  },
  {
    name: 'Roboto-Medium.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Medium.ttf'
  },
  {
    name: 'Roboto-Italic.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Italic.ttf'
  },
  {
    name: 'Roboto-MediumItalic.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-MediumItalic.ttf'
  }
];

// Create fonts directory if it doesn't exist
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filepath);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      reject(err);
    });
  });
}

async function downloadFonts() {
  console.log('Downloading Roboto fonts...');
  
  for (const font of fonts) {
    const filepath = path.join(fontsDir, font.name);
    
    if (fs.existsSync(filepath)) {
      console.log(`✓ ${font.name} already exists`);
      continue;
    }
    
    try {
      console.log(`Downloading ${font.name}...`);
      await downloadFile(font.url, filepath);
      console.log(`✓ ${font.name} downloaded successfully`);
    } catch (error) {
      console.error(`✗ Failed to download ${font.name}:`, error.message);
    }
  }
  
  console.log('\nFont download complete!');
}

if (require.main === module) {
  downloadFonts().catch(console.error);
}

module.exports = { downloadFonts };


// Test script to verify that no 1km buffer circle (turf.buffer) is created in navigation.js
const fs = require('fs');
const path = require('path');

const navFile = path.resolve(__dirname, '..', 'navigation.js');
const content = fs.readFileSync(navFile, 'utf-8');

if (content.includes('turf.buffer')) {
  console.error('❌ turf.buffer still present in navigation.js');
  process.exit(1);
} else {
  console.log('✅ No turf.buffer calls found – circle removal successful.');
  process.exit(0);
}

/**
 * Build Script for Client SDK
 * Properly concatenates source files into a single bundle
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const outputFile = path.join(distDir, 'tracker.js');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Files to concatenate IN ORDER
const sourceFiles = [
  'session-hasher.js',
  'command-dispatcher.js',
  'tracker.js'
];

console.log('[Build] Concatenating source files...');

let bundledCode = '';

sourceFiles.forEach(file => {
  const filePath = path.join(srcDir, file);
  
  if (!fs.existsSync(filePath)) {
    console.error(`[Build] ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`[Build] Adding: ${file}`);
  const content = fs.readFileSync(filePath, 'utf8');
  bundledCode += content + '\n\n';
});

// Write bundled file
fs.writeFileSync(outputFile, bundledCode, 'utf8');

console.log(`[Build] ✓ Build complete: ${outputFile}`);
console.log(`[Build] Size: ${(bundledCode.length / 1024).toFixed(2)} KB`);
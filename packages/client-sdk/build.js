/**
 * Build Script for Client SDK
 * Properly concatenates source files into a single bundle with validation
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const outputFile = path.join(distDir, 'tracker.js');

// Ensure dist directory exists and is clean
if (fs.existsSync(distDir)) {
  // Clean old build artifacts
  const files = fs.readdirSync(distDir);
  files.forEach(file => {
    fs.unlinkSync(path.join(distDir, file));
  });
  console.log('[Build] Cleaned dist directory');
} else {
  fs.mkdirSync(distDir, { recursive: true });
}

// Files to concatenate IN ORDER (dependency order matters!)
const sourceFiles = [
  'session-hasher.js',
  'command-dispatcher.js',
  'tracker.js'
];

console.log('[Build] Starting build process...');

// VALIDATION: Check all source files exist BEFORE starting
const missingFiles = [];
sourceFiles.forEach(file => {
  const filePath = path.join(srcDir, file);
  if (!fs.existsSync(filePath)) {
    missingFiles.push(filePath);
  }
});

if (missingFiles.length > 0) {
  console.error('[Build] ❌ ERROR: Missing source files:');
  missingFiles.forEach(file => console.error(`  - ${file}`));
  process.exit(1);
}

// Build bundle
let bundledCode = '';
let totalSize = 0;

sourceFiles.forEach(file => {
  const filePath = path.join(srcDir, file);
  
  console.log(`[Build] Adding: ${file}`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Validate JS syntax (basic check)
  try {
    // This will throw if there's a syntax error
    new Function(content);
  } catch (error) {
    console.error(`[Build] ❌ SYNTAX ERROR in ${file}:`);
    console.error(error.message);
    process.exit(1);
  }
  
  bundledCode += `// ========================================\n`;
  bundledCode += `// Source: ${file}\n`;
  bundledCode += `// ========================================\n\n`;
  bundledCode += content + '\n\n';
  totalSize += content.length;
});

// Write bundled file
try {
  fs.writeFileSync(outputFile, bundledCode, 'utf8');
  console.log(`[Build] ✅ Build complete: ${outputFile}`);
  console.log(`[Build] Total size: ${(totalSize / 1024).toFixed(2)} KB`);
  console.log(`[Build] Files bundled: ${sourceFiles.length}`);
} catch (error) {
  console.error('[Build] ❌ Failed to write output file:', error.message);
  process.exit(1);
}

// Verify output file is valid
if (!fs.existsSync(outputFile)) {
  console.error('[Build] ❌ Output file was not created');
  process.exit(1);
}

const outputContent = fs.readFileSync(outputFile, 'utf8');
if (outputContent.length === 0) {
  console.error('[Build] ❌ Output file is empty');
  process.exit(1);
}

console.log('[Build] ✅ Build validation passed');
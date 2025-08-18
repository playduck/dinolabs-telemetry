#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'apps', 'public');
const WATCH_PATHS = [
  path.join(PUBLIC_DIR, 'src'),
  path.join(PUBLIC_DIR, 'index.html'),
  path.join(PUBLIC_DIR, 'vite.config.js'),
  path.join(PUBLIC_DIR, 'package.json')
];

let buildTimeout;
let isBuilding = false;

function runBuild() {
  if (isBuilding) {
    console.log('⏳ Build already in progress, skipping...');
    return;
  }

  isBuilding = true;
  console.log('\n🔨 Building SolidJS frontend...');
  
  try {
    execSync('npm run build', { 
      cwd: PUBLIC_DIR, 
      stdio: 'inherit' 
    });
    console.log('✅ Frontend built successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
  } finally {
    isBuilding = false;
  }
}

function debouncedBuild() {
  clearTimeout(buildTimeout);
  buildTimeout = setTimeout(runBuild, 500); // 500ms debounce
}

function watchFiles() {
  console.log('👀 Watching for changes in:', WATCH_PATHS);
  
  WATCH_PATHS.forEach(watchPath => {
    if (fs.existsSync(watchPath)) {
      const isDirectory = fs.statSync(watchPath).isDirectory();
      
      fs.watch(watchPath, { recursive: isDirectory }, (_, filename) => {
        if (filename && (filename.endsWith('.js') || filename.endsWith('.jsx') || 
            filename.endsWith('.ts') || filename.endsWith('.tsx') || 
            filename.endsWith('.css') || filename.endsWith('.html') ||
            filename.endsWith('.json'))) {
          console.log(`📝 File changed: ${filename}`);
          debouncedBuild();
        }
      });
    }
  });
}

// Check for command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch') || args.includes('-w');

// Initial build
runBuild();

if (watchMode) {
  console.log('\n🔄 Watch mode enabled. Press Ctrl+C to stop.');
  watchFiles();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping file watcher...');
    process.exit(0);
  });
} else {
  console.log('\n💡 Tip: Use --watch or -w flag to enable automatic rebuilding on file changes.');
}
#!/usr/bin/env node

/**
 * Remove console.error/warn with debug tags that are temporary/verbose
 * Only removes lines that clearly contain debug tags
 */

const fs = require('fs');
const path = require('path');

const targetDir = process.argv[2] || 'src';
let filesProcessed = 0;
let logsRemoved = 0;
let filesModified = 0;

// Debug tags to remove (these are clearly temporary debugging aids)
// Only remove tags that end in "Debug", contain "Issue", or are clearly temporary
const DEBUG_TAGS = [
  'VisitShotDebug',
  'BasedOnDebug',
  'ThumbnailGenDebug',
  'ImageFlipDebug',
  'ReconnectionIssue',
  'PollingBreakageIssue',
  'VideoGenMissing',
  'SKELETON_DEBUG',
  'PhaseConfigDebug',
  'AddImagesDebug',
  'BackfillDebug',
  'TabResumeDebug',
  'TaskPollingDebug',
  'ShotImageDebug',
  'TimelineDragDebug',
  'BatchDropPositionIssue',
  'UI_LOADING_STATE',
  'DUPLICATE_PREVENTION',
  'MAPPING_ERROR',
  'FINAL_CONFLICTS',
  'TimelineDragFlow',
  'TimelineMoveFlow'
];

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
}

function removeDebugLogs(content, filePath) {
  let modified = false;
  let removedCount = 0;
  const lines = content.split('\n');
  const result = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if line contains console.error or console.warn with debug tag
    const hasConsoleLog = /console\.(error|warn)/.test(line);
    const hasDebugTag = DEBUG_TAGS.some(tag => line.includes(`[${tag}]`));
    
    if (hasConsoleLog && hasDebugTag) {
      // This is a debug log, remove it
      // Also check if previous line has "// USE console.error" comment
      if (i > 0 && /\/\/.*USE console\.(error|warn).*for.*fields so they show/i.test(result[result.length - 1])) {
        result.pop(); // Remove the comment too
      }
      
      // Skip this line
      modified = true;
      removedCount++;
      i++;
      continue;
    }
    
    result.push(line);
    i++;
  }
  
  return {
    content: result.join('\n'),
    modified,
    removedCount
  };
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = removeDebugLogs(content, filePath);
  
  if (result.modified) {
    fs.writeFileSync(filePath, result.content, 'utf8');
    filesModified++;
    logsRemoved += result.removedCount;
    console.log(`✅ ${filePath}: removed ${result.removedCount} debug log(s)`);
  }
  
  filesProcessed++;
}

function walkDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip node_modules, .git, etc.
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
      continue;
    }
    
    if (entry.isDirectory()) {
      walkDirectory(fullPath);
    } else if (entry.isFile() && shouldProcessFile(fullPath)) {
      processFile(fullPath);
    }
  }
}

console.log(`🔍 Scanning ${targetDir} for debug-tagged console statements...\n`);

try {
  const targetPath = path.resolve(targetDir);
  
  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Directory not found: ${targetPath}`);
    process.exit(1);
  }
  
  walkDirectory(targetPath);
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${filesProcessed}`);
  console.log(`   Files modified: ${filesModified}`);
  console.log(`   Debug logs removed: ${logsRemoved}`);
  console.log(`\n✨ Done!`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}


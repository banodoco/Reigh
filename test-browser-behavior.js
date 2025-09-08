// Test script to understand browser tab suspension behavior
console.log('Browser:', navigator.userAgent);
console.log('Initial WeakMap test...');

// Create WeakMap with references
const testWeakMap = new WeakMap();
const testObjects = [];

for (let i = 0; i < 5; i++) {
  const obj = { id: i, data: `test-${i}` };
  testObjects.push(obj);
  testWeakMap.set(obj, `value-${i}`);
}

console.log('WeakMap entries created:', testObjects.length);

// Check if entries exist
const checkWeakMap = () => {
  let existingEntries = 0;
  testObjects.forEach((obj, index) => {
    if (testWeakMap.has(obj)) {
      existingEntries++;
    } else {
      console.log(`Entry ${index} missing from WeakMap`);
    }
  });
  console.log(`WeakMap entries remaining: ${existingEntries}/${testObjects.length}`);
  return existingEntries;
};

// Initial check
console.log('Initial check:');
checkWeakMap();

// Set up periodic checks
let checkCount = 0;
const intervalId = setInterval(() => {
  checkCount++;
  console.log(`Check #${checkCount} (visibility: ${document.visibilityState}):`);
  const remaining = checkWeakMap();
  
  if (remaining === 0) {
    console.log('All WeakMap entries destroyed!');
    clearInterval(intervalId);
  }
  
  if (checkCount > 20) {
    console.log('Test complete - no WeakMap destruction detected');
    clearInterval(intervalId);
  }
}, 2000);

// Listen for visibility changes
document.addEventListener('visibilitychange', () => {
  console.log(`Visibility changed to: ${document.visibilityState}`);
  setTimeout(() => {
    console.log('Post-visibility change check:');
    checkWeakMap();
  }, 1000);
});

console.log('Test running... switch tabs to test browser behavior');

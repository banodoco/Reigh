// Simple test to verify timestamp hooks work
// Run this in browser console on a page with TasksPane

// Check if timestamp manager is active
console.log('=== TIMESTAMP DEBUG ===');

// Look for the timestamp manager in the global scope
// This won't work since it's not exported globally, but let's check what we can see

// Check for any TaskItem components and their update state
const taskItems = document.querySelectorAll('[data-task-id]'); // If we had this attribute
console.log('Task items found:', taskItems.length);

// Check for any timestamp text
const timestampElements = Array.from(document.querySelectorAll('*')).filter(el => 
  el.textContent && el.textContent.includes('ago') && el.textContent.includes('Created')
);
console.log('Timestamp elements found:', timestampElements.length);
timestampElements.forEach(el => console.log('Timestamp text:', el.textContent));

// Monitor for changes
let lastTimestamps = timestampElements.map(el => el.textContent);
console.log('Initial timestamps:', lastTimestamps);

setTimeout(() => {
  const newTimestamps = timestampElements.map(el => el.textContent);
  console.log('Timestamps after 5s:', newTimestamps);
  console.log('Changed?', JSON.stringify(lastTimestamps) !== JSON.stringify(newTimestamps));
}, 5000);

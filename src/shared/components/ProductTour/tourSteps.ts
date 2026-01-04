import { Step } from 'react-joyride';

// Color progression continuing from WelcomeBonusModal (which ends at step 8)
export const tourStepColors = [
  { bg: 'bg-cyan-100 dark:bg-cyan-900/20', icon: 'text-cyan-600 dark:text-cyan-400' },
  { bg: 'bg-rose-100 dark:bg-rose-900/20', icon: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400' },
  { bg: 'bg-amber-100 dark:bg-amber-900/20', icon: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-violet-100 dark:bg-violet-900/20', icon: 'text-violet-600 dark:text-violet-400' },
  { bg: 'bg-teal-100 dark:bg-teal-900/20', icon: 'text-teal-600 dark:text-teal-400' },
  { bg: 'bg-pink-100 dark:bg-pink-900/20', icon: 'text-pink-600 dark:text-pink-400' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/20', icon: 'text-indigo-600 dark:text-indigo-400' },
];

export const tourSteps: Step[] = [
  // Step 1: Point to the Getting Started shot
  {
    target: '[data-tour="shot-selector"]',
    content: 'This is your Getting Started shot. Shots organize your keyframes into video sequences.',
    title: 'Your First Shot',
    disableBeacon: true,
    placement: 'bottom',
  },
  // Step 2: Timeline explanation
  {
    target: '[data-tour="timeline"]',
    content: 'The timeline shows your keyframes in sequence. Drag images here to add them, or reorder to change the video flow.',
    title: 'The Timeline',
    placement: 'top',
  },
  // Step 3: Video gallery
  {
    target: '[data-tour="video-gallery"]',
    content: 'Generated videos appear here. Each video "travels" between your keyframes on the timeline.',
    title: 'Video Outputs',
    placement: 'bottom',
  },
  // Step 4: Open Generations pane
  {
    target: '[data-tour="generations-pane-tab"]',
    content: 'Your image gallery lives here. Click to see all your generations.',
    title: 'Generations Pane',
    spotlightClicks: true,
    placement: 'left',
  },
  // Step 5: Open Tasks pane
  {
    target: '[data-tour="tasks-pane-tab"]',
    content: 'Track your generation tasks here. See progress and manage your queue.',
    title: 'Tasks Pane',
    spotlightClicks: true,
    placement: 'left',
  },
  // Step 6: Tools pane
  {
    target: '[data-tour="tools-pane-tab"]',
    content: 'Different tools help you create images, videos, and more. Start with Image Generation to create your first keyframe!',
    title: 'Available Tools',
    spotlightClicks: true,
    placement: 'right',
  },
  // Step 7: Final message (centered)
  {
    target: 'body',
    content: "You're all set! Generate some images, add them to your timeline, then create a video to bring them to life. Have fun!",
    title: 'Ready to Create!',
    placement: 'center',
  },
];

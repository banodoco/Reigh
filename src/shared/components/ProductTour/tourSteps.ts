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
  { bg: 'bg-orange-100 dark:bg-orange-900/20', icon: 'text-orange-600 dark:text-orange-400' },
  { bg: 'bg-sky-100 dark:bg-sky-900/20', icon: 'text-sky-600 dark:text-sky-400' },
  { bg: 'bg-lime-100 dark:bg-lime-900/20', icon: 'text-lime-600 dark:text-lime-400' },
];

export const tourSteps: Step[] = [
  // Step 0: Lock button to open generations pane
  {
    target: '[data-tour="generations-lock"]',
    content: 'Click the lock to open and pin your gallery.',
    title: 'Open Your Gallery',
    disableBeacon: true,
    spotlightClicks: true,
    placement: 'top',
  },
  // Step 1: Gallery - show where images appear
  {
    target: '[data-tour="gallery-section"]',
    content: 'All your generated images will appear here in your gallery.',
    title: 'Your Image Gallery',
    placement: 'left',
    disableScrolling: true,
  },
  // Step 2: Sparkles button to open generation modal
  {
    target: '[data-tour="generations-sparkles"]',
    content: 'Click here to generate new images!',
    title: 'Generate Images',
    spotlightClicks: true,
    placement: 'top',
  },
  // Step 3: High-level instructions (centered, shown when modal is open)
  {
    target: 'body',
    content: 'Create images with AI, then arrange them on a timeline to generate videos that "travel" between your keyframes. Start by generating some images!',
    title: 'How It Works',
    placement: 'center',
  },
  // Step 4: Click into first shot
  {
    target: '[data-tour="first-shot"]',
    content: 'Click on this shot to open it and see the timeline, where you can arrange your keyframes.',
    title: 'Open Your First Shot',
    spotlightClicks: true,
    placement: 'bottom',
  },
  // Step 5: First video output
  {
    target: '[data-tour="first-video-output"]',
    content: 'Generated videos appear here. Each video "travels" between your keyframes.',
    title: 'Video Outputs',
    placement: 'right',
    disableScrolling: true,
  },
  // Step 6: Timeline explanation
  {
    target: '[data-tour="timeline"]',
    content: 'The timeline shows your keyframes in sequence. Drag images here to add them, or reorder to change the video flow.',
    title: 'The Timeline',
    placement: 'top',
  },
  // Step 7: Structure video
  {
    target: '[data-tour="structure-video"]',
    content: 'You can use a structure video to control the motion of your generated video.',
    title: 'Structure Video',
    placement: 'top',
  },
  // Step 8: Tasks pane
  {
    target: '[data-tour="tasks-pane-tab"]',
    content: 'Track your generation tasks here. See progress and manage your queue.',
    title: 'Tasks Pane',
    spotlightClicks: true,
    placement: 'top',
  },
  // Step 9: Tools pane
  {
    target: '[data-tour="tools-pane-tab"]',
    content: 'You can find more tools here to help you create images, videos, and more.',
    title: 'More Tools',
    placement: 'right',
  },
  // Step 10: Final message (centered)
  {
    target: 'body',
    content: "You're all set! Generate some images, add them to your timeline, then create a video to bring them to life. Have fun!",
    title: 'Ready to Create!',
    placement: 'center',
  },
];

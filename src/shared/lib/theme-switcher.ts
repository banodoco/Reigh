/**
 * Theme Switcher Utility
 * 
 * This utility provides functions to switch between different color themes.
 * Currently supports:
 * - 'lala-land': La La Land inspired theme (purple, gold, blue)
 * - 'wes-anderson': Wes Anderson inspired theme (dark warm orange, soft pink, dusty blue)
 */

export type ThemeName = 'lala-land' | 'wes-anderson' | 'cat-lounging';

/**
 * Theme definitions with all color palettes
 */
const THEME_DEFINITIONS = {
  'wes-anderson': {
    // Core theme colors
    primary: '25 70% 35%',       // Dark Warm Orange
    secondary: '210 35% 82%',    // Dusty Blue
    accent: '40 60% 80%',        // Vintage Gold
    surface: '120 25% 92%',      // Pastel Green
    tertiary: '333 30% 93%',     // Soft Pink
    neutral: '150 30% 25%',      // Forest Green
    
    // Typography settings
    typography: {
      fontFamily: "'Crimson Text', serif",
      headingWeight: '700',     // Make headings even bolder
      bodyWeight: '600',        // Make body text substantially heavier
      lightWeight: '600',       // Make "light" text much more substantial
      mediumWeight: '700',      // Make medium weight heavier
      boldWeight: '800'         // Make bold extra heavy (if available, fallback to 700)
    },
    
    // Extended palette for legacy support and descriptive access
    palette: {
      // Legacy names (keep for backward compatibility)
      pink: '333 30% 93%',
      'pink-dark': '333 25% 82%',
      yellow: '48 85% 88%',
      'yellow-dark': '48 65% 75%',
      mint: '145 35% 85%',
      'mint-dark': '145 30% 70%',
      lavender: '280 35% 88%',
      'lavender-dark': '280 25% 75%',
      cream: '120 25% 92%',
      salmon: '15 60% 85%',
      sage: '120 20% 80%',
      'dusty-blue': '210 35% 82%',
      burgundy: '25 70% 35%',     // NOTE: Now actually dark warm orange
      forest: '150 30% 25%',
      coral: '10 70% 82%',
      mustard: '45 80% 70%',
      teal: '180 40% 75%',
      'vintage-gold': '40 60% 80%',
      
      // Descriptive aliases for clarity (same colors, better names)
      'soft-pink': '333 30% 93%',           // = pink - for accents and highlights
      'soft-pink-dark': '333 25% 82%',      // = pink-dark - for hover states
      'pale-yellow': '48 85% 88%',          // = yellow - for backgrounds
      'pale-yellow-dark': '48 65% 75%',     // = yellow-dark - for borders
      'mint-green': '145 35% 85%',          // = mint - for inputs and success
      'mint-green-dark': '145 30% 70%',     // = mint-dark - for borders
      'dusty-lavender': '280 35% 88%',      // = lavender - for subtle accents
      'dusty-lavender-dark': '280 25% 75%', // = lavender-dark - for text
      'pastel-cream': '120 25% 92%',        // = cream - for backgrounds
      'coral-salmon': '15 60% 85%',         // = salmon - for warmth
      'sage-green': '120 20% 80%',          // = sage - for muted borders
      'dark-orange': '25 70% 35%',          // = burgundy - primary color (misleading name!)
      'forest-green': '150 30% 25%',        // = forest - for neutral text
      'warm-coral': '10 70% 82%',           // = coral - for highlights
      'vintage-mustard': '45 80% 70%',      // = mustard - for warnings
      'muted-teal': '180 40% 75%'           // = teal - for secondary elements
    }
  },
  'lala-land': {
    primary: '254 61% 48%',      // Royal Purple
    secondary: '217 33% 63%',    // Light Blue
    accent: '45 58% 67%',        // Golden Yellow
    surface: '45 40% 95%',       // Cream
    tertiary: '247 49% 58%',     // Medium Purple
    neutral: '242 78% 32%',      // Deep Navy
    
    // Typography settings
    typography: {
      fontFamily: "'Playfair Display', serif",
      headingWeight: '500',
      bodyWeight: '300',
      lightWeight: '300',
      mediumWeight: '500',
      boldWeight: '700'
    },
    
    palette: {
      'royal-purple': '254 61% 48%',
      'light-blue': '217 33% 63%',
      'golden-yellow': '45 58% 67%',
      'medium-purple': '247 49% 58%',
      'deep-navy': '242 78% 32%',
      cream: '45 40% 95%'
    }
  },
  'cat-lounging': {
    primary: '180 35% 45%',      // Muted Teal
    secondary: '91 25% 45%',     // Refined Sage Green
    accent: '35 45% 60%',        // Warm Terracotta
    surface: '45 25% 88%',       // Warm Cream
    tertiary: '40 30% 75%',      // Soft Peach
    neutral: '25 30% 25%',       // Warm Dark Brown
    
    // Typography settings
    typography: {
      fontFamily: "'Cocogoose', 'Inter', sans-serif",
      headingWeight: '350',  // Semilight (clean, non-italic)
      bodyWeight: '350',     // Semilight (clean, readable)
      lightWeight: '300',    // Light (clean version)
      mediumWeight: '400',   // Regular (clean version)
      boldWeight: '700'      // Bold
    },
    
    palette: {
      'muted-teal': '180 35% 45%',
      'sage-green': '91 25% 45%',
      terracotta: '35 45% 60%',
      'warm-cream': '45 25% 88%',
      'soft-peach': '40 30% 75%',
      'warm-brown': '25 30% 25%'
    }
  }
} as const;

/**
 * Dynamically generate CSS custom properties for a theme
 */
function generateThemeCSS(themeName: ThemeName) {
  const theme = THEME_DEFINITIONS[themeName];
  const cssRules: string[] = [];
  
  // Generate legacy palette variables (e.g., --wes-cream, --lala-royal-purple)
  const themePrefix = themeName.split('-')[0]; // 'wes', 'lala', 'cat'
  
  Object.entries(theme.palette || {}).forEach(([colorName, value]) => {
    cssRules.push(`--${themePrefix}-${colorName}: ${value};`);
  });
  
  // Generate typography variables
  if (theme.typography) {
    cssRules.push(`--theme-font-family: ${theme.typography.fontFamily};`);
    cssRules.push(`--theme-heading-weight: ${theme.typography.headingWeight};`);
    cssRules.push(`--theme-body-weight: ${theme.typography.bodyWeight};`);
    cssRules.push(`--theme-light-weight: ${theme.typography.lightWeight};`);
    cssRules.push(`--theme-medium-weight: ${theme.typography.mediumWeight};`);
    cssRules.push(`--theme-bold-weight: ${theme.typography.boldWeight};`);
  }
  
  return cssRules;
}

/**
 * Apply theme-specific styling dynamically
 */
function applyThemeSpecificStyling(root: HTMLElement, themeName: ThemeName) {
  // Remove any existing theme classes
  document.body.classList.remove('wes-anderson-theme', 'lala-land-theme', 'cat-lounging-theme');
  
  if (themeName === 'wes-anderson') {
    // Override core Tailwind variables for Wes Anderson look
    root.style.setProperty('--background', '120 25% 92%'); // Pastel Green
    root.style.setProperty('--foreground', '25 70% 35%'); // Dark Warm Orange
    root.style.setProperty('--primary', '25 70% 35%'); // Dark Warm Orange
    root.style.setProperty('--primary-foreground', '120 25% 92%'); // Pastel Green
    root.style.setProperty('--secondary', '210 35% 82%'); // Dusty Blue
    root.style.setProperty('--secondary-foreground', '25 70% 35%'); // Dark Warm Orange
    root.style.setProperty('--accent', '333 30% 93%'); // Soft Pink
    root.style.setProperty('--accent-foreground', '25 70% 35%'); // Dark Warm Orange
    root.style.setProperty('--muted', '120 20% 80%'); // Sage
    root.style.setProperty('--muted-foreground', '150 30% 25%'); // Forest
    root.style.setProperty('--border', '120 20% 80%'); // Sage
    root.style.setProperty('--input', '145 35% 85%'); // Mint
    root.style.setProperty('--ring', '25 70% 35%'); // Dark Warm Orange
    
    // Add body class and dynamic CSS variables
    document.body.classList.add('wes-anderson-theme');
    injectThemeCSS(themeName);
  } else {
    // For other themes, just inject the dynamic CSS
    injectThemeCSS(themeName);
  }
}

/**
 * Inject dynamic CSS variables into the document
 */
function injectThemeCSS(themeName: ThemeName) {
  // Remove existing dynamic theme styles
  const existingStyle = document.getElementById('dynamic-theme-css');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const cssRules = generateThemeCSS(themeName);
  if (cssRules.length > 0) {
    const style = document.createElement('style');
    style.id = 'dynamic-theme-css';
    style.textContent = `:root { ${cssRules.join(' ')} }`;
    document.head.appendChild(style);
  }
}

/**
 * Remove theme-specific styling
 */
function removeThemeSpecificStyling(root: HTMLElement) {
  // Reset core variables to use the standard theme system
  root.style.removeProperty('--background');
  root.style.removeProperty('--foreground');
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-foreground');
  root.style.removeProperty('--secondary');
  root.style.removeProperty('--secondary-foreground');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--accent-foreground');
  root.style.removeProperty('--muted');
  root.style.removeProperty('--muted-foreground');
  root.style.removeProperty('--border');
  root.style.removeProperty('--input');
  root.style.removeProperty('--ring');
  
  // Remove all theme body classes
  document.body.classList.remove('wes-anderson-theme', 'lala-land-theme', 'cat-lounging-theme');
  
  // Remove dynamic CSS
  const existingStyle = document.getElementById('dynamic-theme-css');
  if (existingStyle) {
    existingStyle.remove();
  }
}

/**
 * Switch to a different color theme by updating CSS custom properties
 */
export function switchTheme(themeName: ThemeName) {
  const root = document.documentElement;
  
  // Remove any existing theme-specific styling first
  removeThemeSpecificStyling(root);
  
  // Apply the new theme colors using CSS variables
  const themePrefixMap = {
    'wes-anderson': 'theme-wes',
    'lala-land': 'theme-lala',
    'cat-lounging': 'theme-cat'
  };
  const themePrefix = themePrefixMap[themeName];
  
  root.style.setProperty('--color-primary', `var(--${themePrefix}-primary)`);
  root.style.setProperty('--color-primary-dark', `var(--${themePrefix}-primary-dark)`);
  root.style.setProperty('--color-primary-light', `var(--${themePrefix}-primary-light)`);
  root.style.setProperty('--color-secondary', `var(--${themePrefix}-secondary)`);
  root.style.setProperty('--color-secondary-dark', `var(--${themePrefix}-secondary-dark)`);
  root.style.setProperty('--color-secondary-light', `var(--${themePrefix}-secondary-light)`);
  root.style.setProperty('--color-accent', `var(--${themePrefix}-accent)`);
  root.style.setProperty('--color-accent-dark', `var(--${themePrefix}-accent-dark)`);
  root.style.setProperty('--color-accent-light', `var(--${themePrefix}-accent-light)`);
  root.style.setProperty('--color-neutral', `var(--${themePrefix}-neutral)`);
  root.style.setProperty('--color-neutral-light', `var(--${themePrefix}-neutral-light)`);
  root.style.setProperty('--color-surface', `var(--${themePrefix}-surface)`);
  root.style.setProperty('--color-surface-bright', `var(--${themePrefix}-surface-bright)`);
  root.style.setProperty('--color-tertiary', `var(--${themePrefix}-tertiary)`);
  
  // Apply icon colors
  root.style.setProperty('--icon-primary', `var(--${themePrefix}-icon-primary)`);
  root.style.setProperty('--icon-secondary', `var(--${themePrefix}-icon-secondary)`);
  root.style.setProperty('--icon-muted', `var(--${themePrefix}-icon-muted)`);
  root.style.setProperty('--icon-interactive', `var(--${themePrefix}-icon-interactive)`);
  root.style.setProperty('--icon-success', `var(--${themePrefix}-icon-success)`);
  root.style.setProperty('--icon-warning', `var(--${themePrefix}-icon-warning)`);
  root.style.setProperty('--icon-danger', `var(--${themePrefix}-icon-danger)`);
  
  // Apply theme-specific styling (visual effects, etc.)
  applyThemeSpecificStyling(root, themeName);
  
  // Store the current theme in localStorage for persistence
  localStorage.setItem('theme-preference', themeName);
}

/**
 * Get the currently active theme name
 */
export function getCurrentTheme(): ThemeName {
  const stored = localStorage.getItem('theme-preference') as ThemeName;
  return stored || 'wes-anderson'; // Default to Wes Anderson theme
}

/**
 * Initialize theme on app startup
 */
export function initializeTheme() {
  const currentTheme = getCurrentTheme();
  switchTheme(currentTheme);
}

/**
 * Get all available themes with their display names
 */
export function getAvailableThemes() {
  return [
    { name: 'lala-land' as const, displayName: 'La La Land', description: 'Dreamy purples and golden tones' },
    { name: 'wes-anderson' as const, displayName: 'Wes Anderson', description: 'Dark warm orange, soft pink, and dusty pastels' },
    { name: 'cat-lounging' as const, displayName: 'Cat Lounging', description: 'Warm oranges, turquoise, and sage greens' }
  ];
}

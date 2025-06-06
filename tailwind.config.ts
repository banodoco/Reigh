import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				'crimson': ['Crimson Text', 'serif'],
				'inter': ['Inter', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Wes Anderson palette
				wes: {
					pink: 'hsl(var(--wes-pink))',
					'pink-dark': 'hsl(var(--wes-pink-dark))',
					yellow: 'hsl(var(--wes-yellow))',
					'yellow-dark': 'hsl(var(--wes-yellow-dark))',
					mint: 'hsl(var(--wes-mint))',
					'mint-dark': 'hsl(var(--wes-mint-dark))',
					lavender: 'hsl(var(--wes-lavender))',
					'lavender-dark': 'hsl(var(--wes-lavender-dark))',
					cream: 'hsl(var(--wes-cream))',
					salmon: 'hsl(var(--wes-salmon))',
					sage: 'hsl(var(--wes-sage))',
					'dusty-blue': 'hsl(var(--wes-dusty-blue))',
					burgundy: 'hsl(var(--wes-burgundy))',
					forest: 'hsl(var(--wes-forest))',
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			spacing: {
				'18': '4.5rem',
				'22': '5.5rem',
				'88': '22rem',
				'104': '26rem',
			},
			letterSpacing: {
				'widest': '0.2em',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'wes-float': {
					'0%, 100%': {
						transform: 'translateY(0px) rotate(0deg)',
					},
					'50%': {
						transform: 'translateY(-10px) rotate(1deg)',
					}
				},
				'wes-shimmer': {
					'0%': {
						transform: 'translateX(-100%)',
					},
					'100%': {
						transform: 'translateX(100%)',
					}
				},
				'wes-appear': {
					'0%': {
						opacity: '0',
						transform: 'translateY(40px) scale(0.9)',
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0px) scale(1)',
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'wes-float': 'wes-float 6s ease-in-out infinite',
				'wes-shimmer': 'wes-shimmer 2s ease-in-out infinite',
				'wes-appear': 'wes-appear 0.6s ease-out forwards',
			},
			boxShadow: {
				'wes': '0 10px 40px -10px hsl(var(--primary) / 0.2), 0 4px 20px -4px hsl(var(--accent) / 0.1)',
				'wes-hover': '0 20px 60px -10px hsl(var(--primary) / 0.3), 0 8px 30px -4px hsl(var(--accent) / 0.2)',
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;

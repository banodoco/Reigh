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
				'playfair': ['Playfair Display', 'serif'],
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
				// Expanded Wes Anderson palette
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
					coral: 'hsl(var(--wes-coral))',
					mustard: 'hsl(var(--wes-mustard))',
					teal: 'hsl(var(--wes-teal))',
					'vintage-gold': 'hsl(var(--wes-vintage-gold))',
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'xl': '1rem',
				'2xl': '1.5rem',
				'3xl': '2rem',
			},
			spacing: {
				'18': '4.5rem',
				'22': '5.5rem',
				'88': '22rem',
				'104': '26rem',
				'128': '32rem',
				'144': '36rem',
			},
			letterSpacing: {
				'widest': '0.2em',
				'ultra-wide': '0.3em',
			},
			blur: {
				'xs': '2px',
				'4xl': '72px',
				'5xl': '96px',
			},
			scale: {
				'102': '1.02',
				'103': '1.03',
				'98': '0.98',
				'97': '0.97',
			},
			rotate: {
				'0.5': '0.5deg',
				'1.5': '1.5deg',
				'2.5': '2.5deg',
			},
			skew: {
				'0.5': '0.5deg',
				'1.5': '1.5deg',
				'2.5': '2.5deg',
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
				},
				'film-grain': {
					'0%': { opacity: '0.3' },
					'50%': { opacity: '0.5' },
					'100%': { opacity: '0.3' }
				},
				'vintage-scratches': {
					'0%': { transform: 'translateX(0) translateY(0)' },
					'25%': { transform: 'translateX(1px) translateY(-1px)' },
					'50%': { transform: 'translateX(-1px) translateY(1px)' },
					'75%': { transform: 'translateX(1px) translateY(1px)' },
					'100%': { transform: 'translateX(0) translateY(0)' }
				},
				'typewriter': {
					'from': { width: '0' },
					'to': { width: '100%' }
				},
				'blink-caret': {
					'from, to': { borderColor: 'transparent' },
					'50%': { borderColor: 'hsl(var(--primary))' }
				},
				'vintage-glow': {
					'0%, 100%': { 
						textShadow: '0 0 5px hsl(var(--wes-vintage-gold) / 0.5), 0 0 10px hsl(var(--wes-vintage-gold) / 0.3)'
					},
					'50%': { 
						textShadow: '0 0 8px hsl(var(--wes-vintage-gold) / 0.7), 0 0 15px hsl(var(--wes-vintage-gold) / 0.5)'
					}
				},
				'subtle-wiggle': {
					'0%, 100%': { transform: 'rotate(-0.2deg)' },
					'50%': { transform: 'rotate(0.2deg)' },
				},
				'spin-left-fade': {
					'0%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
					'100%': { 
						transform: 'rotate(-15deg) scale(0.5)', 
						opacity: '0' 
					},
				},
				'spin-right-fade': {
					'0%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
					'100%': { 
						transform: 'rotate(15deg) scale(0.5)', 
						opacity: '0' 
					},
				},
        'custom-fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'gradient-shift': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '0.8' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.4' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px)', opacity: '0.8' },
          '33%': { transform: 'translateY(-20px) translateX(10px)', opacity: '0.6' },
          '66%': { transform: 'translateY(10px) translateX(-5px)', opacity: '0.9' },
        },
        'float-gentle': {
          '0%, 100%': { transform: 'translateY(0px) translateX(0px) scale(1)', opacity: '0.7' },
          '25%': { transform: 'translateY(-15px) translateX(8px) scale(1.1)', opacity: '0.5' },
          '50%': { transform: 'translateY(-8px) translateX(-3px) scale(0.9)', opacity: '0.8' },
          '75%': { transform: 'translateY(5px) translateX(12px) scale(1.05)', opacity: '0.6' },
        },
        'rotate-gentle': {
          '0%, 100%': { transform: 'rotate(0deg) scale(1)', opacity: '0.6' },
          '25%': { transform: 'rotate(5deg) scale(1.1)', opacity: '0.4' },
          '50%': { transform: 'rotate(-3deg) scale(0.95)', opacity: '0.7' },
          '75%': { transform: 'rotate(8deg) scale(1.05)', opacity: '0.5' },
        },
        'paintbrush-stroke': {
          '0%, 100%': { transform: 'rotate(5deg)' },
          '50%': { transform: 'rotate(-12deg)' },
        },
        'particle-burst': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(3.5)', opacity: '0' },
        },
        'paint-particle-sequential': {
          '0%, 15%': { opacity: '0', transform: 'scale(0.5)' },
          '20%': { opacity: '1', transform: 'scale(0.8)' },
          '30%': { opacity: '1', transform: 'scale(2.2)' },
          '45%': { opacity: '0.8', transform: 'scale(1.8)' },
          '60%': { opacity: '0.4', transform: 'scale(1.2)' },
          '80%': { opacity: '0.1', transform: 'scale(0.8)' },
          '100%': { opacity: '0', transform: 'scale(0.5)' },
        },
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'wes-float': 'wes-float 5s ease-in-out infinite',
				'wes-shimmer': 'wes-shimmer 2s infinite linear',
				'wes-appear': 'wes-appear 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
				'film-grain': 'film-grain 0.5s infinite',
				'vintage-scratches': 'vintage-scratches 8s infinite linear',
				'typewriter': 'typewriter 4s steps(44) 1s 1 normal both',
				'blink-caret': 'blink-caret .75s step-end infinite',
				'vintage-glow': 'vintage-glow 3s ease-in-out infinite',
				'subtle-wiggle': 'subtle-wiggle 2s ease-in-out infinite',
				'spin-left-fade': 'spinLeftFade 0.6s ease-out forwards',
				'spin-right-fade': 'spinRightFade 0.6s ease-out forwards',
        'custom-fade-in': 'custom-fade-in 0.3s ease-out forwards',
        'gradient-shift': 'gradientShift 12s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 8s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        'float-slow': 'floatSlow 20s ease-in-out infinite',
        'float-gentle': 'floatGentle 15s ease-in-out infinite',
        'rotate-gentle': 'rotateGentle 25s ease-in-out infinite',
        'paintbrush-stroke': 'paintbrush-stroke 1.8s ease-in-out infinite',
        'paint-particle-1': 'paint-particle-sequential 1.8s ease-out infinite 0s',
        'paint-particle-2': 'paint-particle-sequential 1.8s ease-out infinite 0.7s',
        'paint-particle-3': 'paint-particle-sequential 1.8s ease-out infinite 0.9s',
        'paint-particle-fractal-1': 'paint-particle-sequential 1.8s ease-out infinite 0.1s',
        'paint-particle-fractal-2': 'paint-particle-sequential 1.8s ease-out infinite 0.2s',
        'paint-particle-fractal-3': 'paint-particle-sequential 1.8s ease-out infinite 0.3s',
        'paint-particle-fractal-4': 'paint-particle-sequential 1.8s ease-out infinite 0.4s',
        'paint-particle-fractal-5': 'paint-particle-sequential 1.8s ease-out infinite 0.5s',
        'paint-particle-fractal-6': 'paint-particle-sequential 1.8s ease-out infinite 0.6s',
			},
			boxShadow: {
				'wes': '0 10px 40px -10px hsl(var(--primary) / 0.2), 0 4px 20px -4px hsl(var(--accent) / 0.1)',
				'wes-hover': '0 20px 60px -10px hsl(var(--primary) / 0.3), 0 8px 30px -4px hsl(var(--accent) / 0.2)',
				'wes-vintage': '0 8px 32px -8px hsl(var(--wes-vintage-gold) / 0.3), inset 0 1px 0 hsl(var(--wes-cream) / 0.5)',
				'wes-ornate': '0 0 0 1px hsl(var(--wes-vintage-gold) / 0.2), 0 2px 4px hsl(var(--primary) / 0.1), 0 8px 16px hsl(var(--primary) / 0.1)',
				'wes-deep': '0 25px 50px -12px hsl(var(--primary) / 0.4), 0 0 0 1px hsl(var(--wes-vintage-gold) / 0.2)',
				'inner-vintage': 'inset 0 2px 4px hsl(var(--primary) / 0.1), inset 0 0 0 1px hsl(var(--wes-vintage-gold) / 0.1)',
			},
			backdropBlur: {
				'xs': '2px',
			},
			borderWidth: {
				'3': '3px',
				'5': '5px',
				'6': '6px',
			},
			textShadow: {
				'vintage': '0 0 5px hsl(var(--wes-vintage-gold) / 0.5)',
				'vintage-glow': '0 0 10px hsl(var(--wes-vintage-gold) / 0.8), 0 0 20px hsl(var(--wes-vintage-gold) / 0.5)',
			},
			backgroundImage: {
				'vintage-gradient': 'linear-gradient(135deg, hsl(var(--wes-cream)) 0%, hsl(var(--wes-pink) / 0.3) 100%)',
				'film-grain': 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
				'wes-pattern': 'linear-gradient(45deg, hsl(var(--accent)) 25%, transparent 25%)',
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		// Custom plugin for text shadow
		function({ addUtilities }: any) {
			const newUtilities = {
				'.text-shadow-vintage': {
					textShadow: '0 0 5px hsl(var(--wes-vintage-gold) / 0.5)',
				},
				'.text-shadow-vintage-glow': {
					textShadow: '0 0 10px hsl(var(--wes-vintage-gold) / 0.8), 0 0 20px hsl(var(--wes-vintage-gold) / 0.5)',
				},
				'.text-shadow-none': {
					textShadow: 'none',
				},
			}
			addUtilities(newUtilities)
		}
	],
} satisfies Config;

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
	corePlugins: {
	},
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
				'cocogoose': ['"Cocogoose"', '"CocogooseNumbers"', '"Inter"', 'system-ui', '-apple-system', '"BlinkMacSystemFont"', '"Segoe UI"', '"Roboto"', 'sans-serif'],
				'cocogoose-numbers': ['"Inter"', 'system-ui', '-apple-system', '"BlinkMacSystemFont"', '"Segoe UI"', '"Roboto"', 'sans-serif'],
				'crimson': ['Crimson Text', 'serif'],
				'inter': ['Inter', 'sans-serif'],
				'playfair': ['Playfair Display', 'serif'],
			},
			fontWeight: {
				'ultralight': '200',
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
				'spin-left-fade-reverse': {
					'0%': { 
						transform: 'rotate(-15deg) scale(0.5)', 
						opacity: '0' 
					},
					'100%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
					},
				},
				'spin-right-fade-reverse': {
					'0%': { 
						transform: 'rotate(15deg) scale(0.5)', 
						opacity: '0' 
					},
					'100%': { 
						transform: 'rotate(0deg) scale(1)', 
						opacity: '1' 
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
        'paper-plane-glide-1': {
          '0%': { 
            left: '-50px',
            top: '20%',
            transform: 'rotate(-15deg) scale(0.8)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.2'
          },
          '15%': {
            left: '15%',
            top: '25%',
            transform: 'rotate(-10deg) scale(1) translateY(0)',
          },
          '30%': {
            left: '35%',
            top: '30%',
            transform: 'rotate(-5deg) scale(1.1) translateY(15px)',
          },
          '45%': {
            left: '55%',
            top: '22%',
            transform: 'rotate(5deg) scale(0.95) translateY(-10px)',
          },
          '60%': {
            left: '75%',
            top: '35%',
            transform: 'rotate(15deg) scale(1.05) translateY(20px)',
          },
          '75%': {
            left: '90%',
            top: '28%',
            transform: 'rotate(8deg) scale(0.9) translateY(0)',
          },
          '95%': {
            opacity: '0.15'
          },
          '100%': {
            left: '110%',
            top: '40%',
            transform: 'rotate(25deg) scale(0.7)',
            opacity: '0'
          },
        },
        'paper-plane-loop': {
          '0%': {
            right: '-40px',
            top: '60%',
            transform: 'rotate(180deg) scale(0.6)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.15'
          },
          '20%': {
            right: '20%',
            top: '55%',
            transform: 'rotate(200deg) scale(0.9)',
          },
          '35%': {
            right: '40%',
            top: '45%',
            transform: 'rotate(360deg) scale(1.1)',
          },
          '50%': {
            right: '50%',
            top: '30%',
            transform: 'rotate(540deg) scale(1)',
          },
          '65%': {
            right: '55%',
            top: '50%',
            transform: 'rotate(720deg) scale(0.95)',
          },
          '80%': {
            right: '70%',
            top: '65%',
            transform: 'rotate(810deg) scale(0.85)',
          },
          '95%': {
            opacity: '0.1'
          },
          '100%': {
            right: '110%',
            top: '70%',
            transform: 'rotate(900deg) scale(0.5)',
            opacity: '0'
          },
        },
        'paper-plane-swoop': {
          '0%': {
            left: '50%',
            top: '-40px',
            transform: 'rotate(90deg) scale(0.7) translateX(0)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.18'
          },
          '20%': {
            left: '45%',
            top: '15%',
            transform: 'rotate(110deg) scale(0.9) translateX(-20px)',
          },
          '35%': {
            left: '30%',
            top: '50%',
            transform: 'rotate(180deg) scale(1.15) translateX(-40px)',
          },
          '50%': {
            left: '25%',
            top: '70%',
            transform: 'rotate(210deg) scale(1.1) translateX(-20px)',
          },
          '65%': {
            left: '35%',
            top: '80%',
            transform: 'rotate(240deg) scale(0.95) translateX(10px)',
          },
          '80%': {
            left: '55%',
            top: '85%',
            transform: 'rotate(270deg) scale(0.85) translateX(30px)',
          },
          '95%': {
            opacity: '0.12'
          },
          '100%': {
            left: '80%',
            bottom: '-50px',
            top: 'auto',
            transform: 'rotate(300deg) scale(0.6) translateX(50px)',
            opacity: '0'
          },
        },
        'paper-plane-figure8': {
          '0%': {
            left: '80%',
            top: '50%',
            transform: 'rotate(0deg) scale(0.5)',
            opacity: '0'
          },
          '5%': {
            opacity: '0.12'
          },
          '12.5%': {
            left: '65%',
            top: '35%',
            transform: 'rotate(-30deg) scale(0.8)',
          },
          '25%': {
            left: '50%',
            top: '20%',
            transform: 'rotate(-60deg) scale(0.95)',
          },
          '37.5%': {
            left: '35%',
            top: '35%',
            transform: 'rotate(-90deg) scale(1.05)',
          },
          '50%': {
            left: '20%',
            top: '50%',
            transform: 'rotate(-180deg) scale(1)',
          },
          '62.5%': {
            left: '35%',
            top: '65%',
            transform: 'rotate(-270deg) scale(0.9)',
          },
          '75%': {
            left: '50%',
            top: '80%',
            transform: 'rotate(-360deg) scale(0.85)',
          },
          '87.5%': {
            left: '65%',
            top: '65%',
            transform: 'rotate(-390deg) scale(0.75)',
          },
          '95%': {
            opacity: '0.08'
          },
          '100%': {
            left: '80%',
            top: '50%',
            transform: 'rotate(-420deg) scale(0.5)',
            opacity: '0'
          },
        },
        'brain-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        'gifting-motion': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-2px) rotate(-5deg)' },
          '75%': { transform: 'translateY(2px) rotate(5deg)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.9', boxShadow: '0 0 10px hsl(var(--wes-vintage-gold) / 0.3)' },
          '50%': { opacity: '1', boxShadow: '0 0 20px hsl(var(--wes-vintage-gold) / 0.5)' },
        },
        'pulse-breathe': {
          '0%, 100%': { transform: 'scaleX(1)', opacity: '0.8' },
          '50%': { transform: 'scaleX(1.1)', opacity: '1' },
        },
        'pulse-wave': {
          '0%, 100%': { transform: 'scaleX(1) translateX(0)', opacity: '0.8' },
          '50%': { transform: 'scaleX(1.2) translateX(2px)', opacity: '1' },
        },
        'pulse-sweep': {
          '0%': { transform: 'translate(-50%, 50%) rotate(-45deg)' },
          '100%': { transform: 'translate(300%, -200%) rotate(-45deg)' },
        },
        // New diverse paper plane animations
        'paper-plane-diagonal-tl-br': {
          '0%': { top: '-40px', left: '-40px', transform: 'rotate(45deg)' },
          '100%': { top: '110%', left: '110%', transform: 'rotate(45deg)' },
        },
        'paper-plane-diagonal-tr-bl': {
          '0%': { top: '-40px', right: '-40px', transform: 'rotate(135deg)' },
          '100%': { top: '110%', right: '110%', transform: 'rotate(135deg)' },
        },
        'paper-plane-diagonal-bl-tr': {
          '0%': { bottom: '-40px', left: '-40px', transform: 'rotate(-45deg)' },
          '100%': { bottom: '110%', left: '110%', transform: 'rotate(-45deg)' },
        },
        'paper-plane-diagonal-br-tl': {
          '0%': { bottom: '-40px', right: '-40px', transform: 'rotate(-135deg)' },
          '100%': { bottom: '110%', right: '110%', transform: 'rotate(-135deg)' },
        },
        'paper-plane-horizontal-lr': {
          '0%': { left: '-40px', transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-5deg) translateY(-10px)' },
          '50%': { transform: 'rotate(5deg) translateY(10px)' },
          '75%': { transform: 'rotate(-3deg) translateY(-5px)' },
          '100%': { left: '110%', transform: 'rotate(0deg)' },
        },
        'paper-plane-horizontal-rl': {
          '0%': { right: '-40px', transform: 'rotate(180deg)' },
          '25%': { transform: 'rotate(175deg) translateY(-10px)' },
          '50%': { transform: 'rotate(185deg) translateY(10px)' },
          '75%': { transform: 'rotate(177deg) translateY(-5px)' },
          '100%': { right: '110%', transform: 'rotate(180deg)' },
        },
        'paper-plane-vertical-tb': {
          '0%': { top: '-40px', transform: 'rotate(90deg)' },
          '25%': { transform: 'rotate(85deg) translateX(-10px)' },
          '50%': { transform: 'rotate(95deg) translateX(10px)' },
          '75%': { transform: 'rotate(87deg) translateX(-5px)' },
          '100%': { top: '110%', transform: 'rotate(90deg)' },
        },
        'paper-plane-vertical-bt': {
          '0%': { bottom: '-40px', transform: 'rotate(-90deg)' },
          '25%': { transform: 'rotate(-85deg) translateX(-10px)' },
          '50%': { transform: 'rotate(-95deg) translateX(10px)' },
          '75%': { transform: 'rotate(-87deg) translateX(-5px)' },
          '100%': { bottom: '110%', transform: 'rotate(-90deg)' },
        },
        'paper-plane-spiral-cw': {
          '0%': { top: '50%', left: '50%', transform: 'rotate(0deg) translateX(0) scale(0.5)' },
          '25%': { transform: 'rotate(90deg) translateX(200px) scale(0.8)' },
          '50%': { transform: 'rotate(180deg) translateX(300px) scale(1.1)' },
          '75%': { transform: 'rotate(270deg) translateX(400px) scale(1.3)' },
          '100%': { transform: 'rotate(360deg) translateX(600px) scale(1.5)', opacity: '0' },
        },
        'paper-plane-spiral-ccw': {
          '0%': { top: '50%', left: '50%', transform: 'rotate(0deg) translateX(0) scale(0.5)' },
          '25%': { transform: 'rotate(-90deg) translateX(200px) scale(0.8)' },
          '50%': { transform: 'rotate(-180deg) translateX(300px) scale(1.1)' },
          '75%': { transform: 'rotate(-270deg) translateX(400px) scale(1.3)' },
          '100%': { transform: 'rotate(-360deg) translateX(600px) scale(1.5)', opacity: '0' },
        },
        'paper-plane-zigzag-h': {
          '0%': { left: '-40px', top: '20%', transform: 'rotate(20deg)' },
          '12.5%': { left: '10%', top: '60%', transform: 'rotate(-20deg)' },
          '25%': { left: '20%', top: '30%', transform: 'rotate(15deg)' },
          '37.5%': { left: '30%', top: '70%', transform: 'rotate(-15deg)' },
          '50%': { left: '50%', top: '40%', transform: 'rotate(10deg)' },
          '62.5%': { left: '70%', top: '65%', transform: 'rotate(-10deg)' },
          '75%': { left: '80%', top: '25%', transform: 'rotate(5deg)' },
          '87.5%': { left: '90%', top: '55%', transform: 'rotate(-5deg)' },
          '100%': { left: '110%', top: '50%', transform: 'rotate(0deg)' },
        },
        'paper-plane-zigzag-v': {
          '0%': { top: '-40px', left: '20%', transform: 'rotate(110deg)' },
          '12.5%': { top: '10%', left: '60%', transform: 'rotate(70deg)' },
          '25%': { top: '20%', left: '30%', transform: 'rotate(105deg)' },
          '37.5%': { top: '30%', left: '70%', transform: 'rotate(75deg)' },
          '50%': { top: '50%', left: '40%', transform: 'rotate(100deg)' },
          '62.5%': { top: '70%', left: '65%', transform: 'rotate(80deg)' },
          '75%': { top: '80%', left: '25%', transform: 'rotate(95deg)' },
          '87.5%': { top: '90%', left: '55%', transform: 'rotate(85deg)' },
          '100%': { top: '110%', left: '50%', transform: 'rotate(90deg)' },
        },
			},
			transitionTimingFunction: {
				'smooth': 'cubic-bezier(0.22, 1, 0.36, 1)',
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
				'spin-left-fade': 'spin-left-fade 0.6s ease-out forwards',
				'spin-right-fade': 'spin-right-fade 0.6s ease-out forwards',
				'spin-left-fade-reverse': 'spin-left-fade-reverse 0.6s ease-out forwards',
				'spin-right-fade-reverse': 'spin-right-fade-reverse 0.6s ease-out forwards',
        'custom-fade-in': 'custom-fade-in 0.3s ease-out forwards',
        'gradient-shift': 'gradient-shift 12s ease-in-out infinite',
        'pulse-subtle': 'pulse-subtle 8s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        'float-slow': 'float-slow 20s ease-in-out infinite',
        'float-gentle': 'float-gentle 15s ease-in-out infinite',
        'rotate-gentle': 'rotate-gentle 25s ease-in-out infinite',
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
        'paper-plane-glide-1': 'paper-plane-glide-1 25s ease-in-out infinite',
        'paper-plane-loop': 'paper-plane-loop 30s ease-in-out infinite',
        'paper-plane-swoop': 'paper-plane-swoop 35s ease-in-out infinite',
        'paper-plane-figure8': 'paper-plane-figure8 40s ease-in-out infinite',
        'paper-plane-diagonal-tl-br': 'paper-plane-diagonal-tl-br 15s linear infinite',
        'paper-plane-diagonal-tr-bl': 'paper-plane-diagonal-tr-bl 15s linear infinite',
        'paper-plane-diagonal-bl-tr': 'paper-plane-diagonal-bl-tr 15s linear infinite',
        'paper-plane-diagonal-br-tl': 'paper-plane-diagonal-br-tl 15s linear infinite',
        'paper-plane-horizontal-lr': 'paper-plane-horizontal-lr 20s ease-in-out infinite',
        'paper-plane-horizontal-rl': 'paper-plane-horizontal-rl 20s ease-in-out infinite',
        'paper-plane-vertical-tb': 'paper-plane-vertical-tb 18s ease-in-out infinite',
        'paper-plane-vertical-bt': 'paper-plane-vertical-bt 18s ease-in-out infinite',
        'paper-plane-spiral-cw': 'paper-plane-spiral-cw 25s ease-out infinite',
        'paper-plane-spiral-ccw': 'paper-plane-spiral-ccw 25s ease-out infinite',
        'paper-plane-zigzag-h': 'paper-plane-zigzag-h 22s ease-in-out infinite',
        'paper-plane-zigzag-v': 'paper-plane-zigzag-v 22s ease-in-out infinite',
        'brain-pulse': 'brain-pulse 2s ease-in-out infinite',
        'gifting-motion': 'gifting-motion 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'pulse-breathe': 'pulse-breathe 3s ease-in-out infinite',
        'pulse-wave': 'pulse-wave 2.5s ease-in-out infinite',
        'pulse-sweep': 'pulse-sweep 2s ease-out infinite',
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
		require('@tailwindcss/container-queries'),
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

import type { Config } from "tailwindcss";

export default {
	darkMode: ["class", '[data-theme="dark"]'],
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
				sans: ['"Heebo"', '"Assistant"', 'system-ui', '-apple-system', 'sans-serif'],
				serif: ['"Frank Ruhl Libre"', '"Cormorant Garamond"', 'Georgia', 'serif'],
				display: ['"Frank Ruhl Libre"', '"Cormorant Garamond"', 'Georgia', 'serif'],
			},
			colors: {
				/* ── מיפוי מותג: כל הסולמות הקשיחים מקבלים גוני TOBY (זהב/יין/קרם/מרווה) ── */
				gray: { '50': '#F7F5F3', '100': '#EEEBE7', '200': '#DAD7D2', '300': '#C3BEB6', '400': '#A8A094', '500': '#8C8273', '600': '#766D60', '700': '#5F584E', '800': '#49433C', '900': '#362F26', '950': '#211D17', },
				slate: { '50': '#F7F5F3', '100': '#EEEBE7', '200': '#DAD7D2', '300': '#C3BEB6', '400': '#A8A094', '500': '#8C8273', '600': '#766D60', '700': '#5F584E', '800': '#49433C', '900': '#362F26', '950': '#211D17', },
				zinc: { '50': '#F7F5F3', '100': '#EEEBE7', '200': '#DAD7D2', '300': '#C3BEB6', '400': '#A8A094', '500': '#8C8273', '600': '#766D60', '700': '#5F584E', '800': '#49433C', '900': '#362F26', '950': '#211D17', },
				stone: { '50': '#F7F5F3', '100': '#EEEBE7', '200': '#DAD7D2', '300': '#C3BEB6', '400': '#A8A094', '500': '#8C8273', '600': '#766D60', '700': '#5F584E', '800': '#49433C', '900': '#362F26', '950': '#211D17', },
				neutral: { '50': '#F7F5F3', '100': '#EEEBE7', '200': '#DAD7D2', '300': '#C3BEB6', '400': '#A8A094', '500': '#8C8273', '600': '#766D60', '700': '#5F584E', '800': '#49433C', '900': '#362F26', '950': '#211D17', },
				yellow: { '50': '#FBF8EF', '100': '#F6EFDA', '200': '#F2E5BA', '300': '#FBE8A2', '400': '#DAC181', '500': '#C5A45E', '600': '#AA8A46', '700': '#886E3A', '800': '#66522E', '900': '#493B22', '950': '#2C2416', },
				amber: { '50': '#FBF8EF', '100': '#F6EFDA', '200': '#F2E5BA', '300': '#FBE8A2', '400': '#DAC181', '500': '#C5A45E', '600': '#AA8A46', '700': '#886E3A', '800': '#66522E', '900': '#493B22', '950': '#2C2416', },
				orange: { '50': '#FBF8EF', '100': '#F6EFDA', '200': '#F2E5BA', '300': '#FBE8A2', '400': '#DAC181', '500': '#C5A45E', '600': '#AA8A46', '700': '#886E3A', '800': '#66522E', '900': '#493B22', '950': '#2C2416', },
				blue: { '50': '#F7F4ED', '100': '#F0E8DB', '200': '#E3D6BF', '300': '#D3BD97', '400': '#C2A470', '500': '#B28D4D', '600': '#967740', '700': '#796034', '800': '#5D4928', '900': '#40331C', '950': '#271F11', },
				indigo: { '50': '#F7F4ED', '100': '#F0E8DB', '200': '#E3D6BF', '300': '#D3BD97', '400': '#C2A470', '500': '#B28D4D', '600': '#967740', '700': '#796034', '800': '#5D4928', '900': '#40331C', '950': '#271F11', },
				sky: { '50': '#F7F4ED', '100': '#F0E8DB', '200': '#E3D6BF', '300': '#D3BD97', '400': '#C2A470', '500': '#B28D4D', '600': '#967740', '700': '#796034', '800': '#5D4928', '900': '#40331C', '950': '#271F11', },
				cyan: { '50': '#F7F4ED', '100': '#F0E8DB', '200': '#E3D6BF', '300': '#D3BD97', '400': '#C2A470', '500': '#B28D4D', '600': '#967740', '700': '#796034', '800': '#5D4928', '900': '#40331C', '950': '#271F11', },
				teal: { '50': '#F7F4ED', '100': '#F0E8DB', '200': '#E3D6BF', '300': '#D3BD97', '400': '#C2A470', '500': '#B28D4D', '600': '#967740', '700': '#796034', '800': '#5D4928', '900': '#40331C', '950': '#271F11', },
				red: { '50': '#F9F0F2', '100': '#F4E1E4', '200': '#EBC2C9', '300': '#DA8B99', '400': '#C94059', '500': '#952338', '600': '#7E202F', '700': '#6B1F2C', '800': '#511A23', '900': '#39131A', '950': '#260D11', },
				rose: { '50': '#F9F0F2', '100': '#F4E1E4', '200': '#EBC2C9', '300': '#DA8B99', '400': '#C94059', '500': '#952338', '600': '#7E202F', '700': '#6B1F2C', '800': '#511A23', '900': '#39131A', '950': '#260D11', },
				purple: { '50': '#F9F1F3', '100': '#F2E3E7', '200': '#E6C7CE', '300': '#D39CAA', '400': '#B96479', '500': '#944257', '600': '#7B3748', '700': '#662E3C', '800': '#512430', '900': '#381921', '950': '#231015', },
				violet: { '50': '#F9F1F3', '100': '#F2E3E7', '200': '#E6C7CE', '300': '#D39CAA', '400': '#B96479', '500': '#944257', '600': '#7B3748', '700': '#662E3C', '800': '#512430', '900': '#381921', '950': '#231015', },
				fuchsia: { '50': '#F9F1F3', '100': '#F2E3E7', '200': '#E6C7CE', '300': '#D39CAA', '400': '#B96479', '500': '#944257', '600': '#7B3748', '700': '#662E3C', '800': '#512430', '900': '#381921', '950': '#231015', },
				pink: { '50': '#FAF3F0', '100': '#F6EAE4', '200': '#EED7CD', '300': '#E4BFAF', '400': '#D7A088', '500': '#C97E5E', '600': '#B8623D', '700': '#955032', '800': '#733D26', '900': '#502B1B', '950': '#321B11', },
				green: { '50': '#EEF7F1', '100': '#DDEEE3', '200': '#C1E2CC', '300': '#95D0A9', '400': '#60BE7F', '500': '#3FA662', '600': '#358D52', '700': '#2E7044', '800': '#255635', '900': '#1B3C26', '950': '#122619', },
				emerald: { '50': '#EEF7F1', '100': '#DDEEE3', '200': '#C1E2CC', '300': '#95D0A9', '400': '#60BE7F', '500': '#3FA662', '600': '#358D52', '700': '#2E7044', '800': '#255635', '900': '#1B3C26', '950': '#122619', },
				lime: { '50': '#EEF7F1', '100': '#DDEEE3', '200': '#C1E2CC', '300': '#95D0A9', '400': '#60BE7F', '500': '#3FA662', '600': '#358D52', '700': '#2E7044', '800': '#255635', '900': '#1B3C26', '950': '#122619', },
				gold: {
					DEFAULT: 'hsl(var(--gold-main))',
					dark: 'hsl(var(--gold-dark))',
					light: 'hsl(var(--gold-light))',
				},
				wine: {
					DEFAULT: 'hsl(var(--wine-main))',
					light: 'hsl(var(--wine-light))',
				},
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
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				}
			},
			backgroundImage: {
				'gradient-musical': 'var(--gradient-musical)',
				'gradient-hero': 'var(--gradient-hero)',
				'gradient-card': 'var(--gradient-card)'
			},
			boxShadow: {
				'musical': 'var(--shadow-musical)',
				'card': 'var(--shadow-card)',
				'soft': 'var(--shadow-soft)',
				'hover': 'var(--shadow-hover)',
				'glow-gold': 'var(--glow-gold)'
			},
			transitionTimingFunction: {
				'bounce-gentle': 'var(--bounce-gentle)'
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
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
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;

import type { Config } from 'tailwindcss';

// Tailwind is scoped for shadcn/ui on the analytics page. `preflight` is OFF so
// the existing hand-CSS pages are untouched, and all theme tokens use a `--sc-`
// prefix so they never collide with the app's own CSS variables (--border, etc.).
export default {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--sc-border))',
        input: 'hsl(var(--sc-input))',
        ring: 'hsl(var(--sc-ring))',
        background: 'hsl(var(--sc-background))',
        foreground: 'hsl(var(--sc-foreground))',
        primary: { DEFAULT: 'hsl(var(--sc-primary))', foreground: 'hsl(var(--sc-primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--sc-secondary))', foreground: 'hsl(var(--sc-secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--sc-destructive))', foreground: 'hsl(var(--sc-destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--sc-muted))', foreground: 'hsl(var(--sc-muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--sc-accent))', foreground: 'hsl(var(--sc-accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--sc-popover))', foreground: 'hsl(var(--sc-popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--sc-card))', foreground: 'hsl(var(--sc-card-foreground))' },
      },
      borderRadius: {
        lg: 'var(--sc-radius)',
        md: 'calc(var(--sc-radius) - 2px)',
        sm: 'calc(var(--sc-radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

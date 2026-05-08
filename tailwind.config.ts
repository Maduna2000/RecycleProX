import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "var(--border)",
        input:      "var(--input)",
        ring:       "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT:    "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT:    "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT:    "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT:    "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT:    "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT:    "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT:    "var(--card)",
          foreground: "var(--card-foreground)",
        },
        rpx: {
          navy:         '#1B3A6B',
          green:        '#217346',
          blue:         '#185ABD',
          amber:        '#C9A020',
          red:          '#C0392B',
          grey:         '#F1F3F4',
          rowalt:       '#F8F9FA',
          border:       '#E0E0E0',
          text:         '#212529',
          muted:        '#6C757D',
          hover:        '#EBF3FC',
          tabmuted:     '#8BA4D4',
          accent:       '#F2AB1A',
          // Tile gradient variants
          'navy-light': '#1e4a8a',
          'navy-hover': '#2558a8',
          'blue-light': '#1d6bc7',
          'blue-hover': '#2278d4',
          'green-light':'#278a54',
          'green-hover':'#2e9e60',
          'amber-light':'#c49b1c',
          'amber-hover':'#d4a820',
          // Dashboard dark palette
          'dash-bg':    '#0a1628',
          'dash-surf':  '#081120',
          'dash-strip': '#0d1f3c',
        },
        sidebar: {
          DEFAULT:               "var(--sidebar)",
          foreground:            "var(--sidebar-foreground)",
          primary:               "var(--sidebar-primary)",
          "primary-foreground":  "var(--sidebar-primary-foreground)",
          accent:                "var(--sidebar-accent)",
          "accent-foreground":   "var(--sidebar-accent-foreground)",
          border:                "var(--sidebar-border)",
          ring:                  "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;

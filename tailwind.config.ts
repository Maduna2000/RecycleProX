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
          navy:    '#1B3A6B',
          green:   '#217346',
          blue:    '#185ABD',
          amber:   '#C9A020',
          red:     '#C0392B',
          grey:    '#F1F3F4',
          rowalt:  '#F8F9FA',
          border:  '#E0E0E0',
          text:    '#212529',
          muted:   '#6C757D',
          hover:   '#EBF3FC',
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

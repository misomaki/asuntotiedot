import type { Config } from "tailwindcss";

// Single source of truth for stacked shadow values
const SHADOW_DARK = "1px 1px 0px #1a1a1a, 2px 2px 0px #2a2a2a, 3px 3px 0px #3a3a3a, 4px 4px 0px #4a4a4a"
const SHADOW_DARK_SM = "1px 1px 0px #1a1a1a, 2px 2px 0px #2a2a2a, 3px 3px 0px #3a3a3a"
const SHADOW_DARK_LG = "1px 1px 0px #1a1a1a, 2px 2px 0px #262626, 3px 3px 0px #333, 4px 4px 0px #404040, 5px 5px 0px #4d4d4d, 6px 6px 0px #595959"
const SHADOW_ACCENT = "1px 1px 0px #e870d0, 2px 2px 0px #d060c0, 3px 3px 0px #b850a8, 4px 4px 0px #a04090"
const SHADOW_ACCENT_SM = "1px 1px 0px #e870d0, 2px 2px 0px #d060c0, 3px 3px 0px #b850a8"
const SHADOW_TEAL = "1px 1px 0px #1aa880, 2px 2px 0px #189870, 3px 3px 0px #148860, 4px 4px 0px #107850"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds – warm cream
        "bg-primary": "#FFFBF5",
        "bg-secondary": "#f8f6f2",
        "bg-glass": "#FFFBF5",

        // Brand pastels
        pink: {
          DEFAULT: "#ff90e8",
          deep: "#e870d0",
          light: "#ffb8f0",
          baby: "#ffd8f4",
          pale: "#fff0fb",
        },
        yellow: {
          DEFAULT: "#ffc900",
          light: "#ffe566",
          pale: "#fff8e0",
        },
        mint: {
          DEFAULT: "#23c8a0",
          light: "#60e8c8",
        },
        peach: "#ffad8a",
        lavender: "#b8a8ff",
        violet: {
          DEFAULT: "#7C3AED",
          light: "#A78BFA",
          pale: "#f0e6ff",
        },

        // Brand accent = pink
        accent: {
          DEFAULT: "#ff90e8",
          hover: "#ffb8f0",
          light: "#fff0fb",
          dark: "#e870d0",
        },

        // Semantic colors
        success: "#23c8a0",
        warning: "#ffc900",
        danger: "#ef4444",

        // shadcn/ui compatible tokens
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // Price scale colors – ivory (cheap) → amber → rose → pink (expensive)
        // Must match PRICE_COLORS in app/lib/colorScales.ts
        price: {
          1: "#f2efe8",
          2: "#efe6d4",
          3: "#ecdcc0",
          4: "#e8d0ac",
          5: "#e4c49c",
          6: "#e0b498",
          7: "#dca4a0",
          8: "#dc98b8",
          9: "#e488cc",
          10: "#f080e0",
        },
      },

      fontFamily: {
        display: ["var(--font-display)", "Libre Franklin", "sans-serif"],
        brand: ["var(--font-brand)", "Fraunces", "serif"],
        heading: ["var(--font-display)", "Libre Franklin", "sans-serif"],
        body: ["var(--font-body)", "Public Sans", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.5rem",
      },

      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "100": "25rem",
        "120": "30rem",
      },

      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "slide-left": "slideLeft 0.3s ease-out",
        "slide-right": "slideRight 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        shimmer: "shimmer 2s infinite linear",
        "pop-in": "popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "count-up": "countUp 0.4s ease-out",
      },

      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideLeft: {
          "0%": { transform: "translateX(16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideRight: {
          "0%": { transform: "translateX(-16px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        countUp: {
          "0%": { transform: "translateY(8px)", opacity: "0", filter: "blur(2px)" },
          "100%": { transform: "translateY(0)", opacity: "1", filter: "blur(0)" },
        },
      },

      boxShadow: {
        // Stacked multi-layer shadows (3D extruded blocks)
        stacked: SHADOW_DARK,
        "stacked-sm": SHADOW_DARK_SM,
        "stacked-lg": SHADOW_DARK_LG,
        "stacked-accent": SHADOW_ACCENT,
        // Legacy aliases
        hard: SHADOW_DARK,
        "hard-sm": SHADOW_DARK_SM,
        "hard-lg": SHADOW_DARK_LG,
        "hard-pink": SHADOW_ACCENT,
        glass: SHADOW_DARK,
        "glass-sm": SHADOW_DARK_SM,
        glow: SHADOW_ACCENT,
        "glow-sm": SHADOW_ACCENT_SM,
        "glow-teal": SHADOW_TEAL,
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds – clean white
        "bg-primary": "#ffffff",
        "bg-secondary": "#f8f8f8",
        "bg-glass": "#ffffff",

        // Brand pastels
        pink: {
          DEFAULT: "#ff90e8",
          deep: "#e870d0",
          light: "#ffb8f0",
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

        // Price scale colors – pink → peach → yellow → mint
        price: {
          1: "#b84080",
          2: "#d4508c",
          3: "#ff6b9d",
          4: "#ff90b8",
          5: "#ffb0c8",
          6: "#ffd4a8",
          7: "#ffe08a",
          8: "#e8f060",
          9: "#a8e8a0",
          10: "#60d4a0",
        },
      },

      fontFamily: {
        display: ["var(--font-display)", "Libre Franklin", "sans-serif"],
        brand: ["var(--font-display)", "Libre Franklin", "sans-serif"],
        heading: ["var(--font-display)", "Libre Franklin", "sans-serif"],
        body: ["var(--font-body)", "DM Sans", "sans-serif"],
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
      },

      boxShadow: {
        // Neobrutalist hard shadows
        hard: "4px 4px 0px #1a1a1a",
        "hard-sm": "3px 3px 0px #1a1a1a",
        "hard-lg": "6px 6px 0px #1a1a1a",
        "hard-pink": "4px 4px 0px #ff90e8",
        // Kept for backwards compat
        glass: "4px 4px 0px #1a1a1a",
        "glass-sm": "3px 3px 0px #1a1a1a",
        glow: "4px 4px 0px #ff90e8",
        "glow-sm": "3px 3px 0px #ff90e8",
        "glow-teal": "4px 4px 0px #23c8a0",
      },
    },
  },
  plugins: [],
};

export default config;

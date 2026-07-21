import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./main.tsx", "./router.tsx"],
  theme: {
    extend: {
      fontSize: {
        md: ["1rem", { lineHeight: "1.5rem" }]
      },
      colors: {
        ink: "hsl(var(--foreground))",
        moss: "hsl(var(--muted-foreground))",
        coral: "hsl(var(--primary))",
        amber: "hsl(var(--accent))",
        skywash: "hsl(var(--secondary))",
        linen: "hsl(var(--background))",
        surface: "hsl(var(--card))"
      },
      backgroundColor: {
        primary: "hsl(var(--foreground) / 0.04)",
        primary_hover: "hsl(var(--foreground) / 0.075)",
        primary_active: "hsl(var(--foreground) / 0.1)",
        disabled_subtle: "hsl(var(--foreground) / 0.025)",
        "brand-solid": "hsl(var(--primary))",
        "brand-solid_hover": "hsl(var(--primary-hover))",
        "error-solid": "hsl(var(--destructive))",
        "error-solid_hover": "hsl(var(--destructive) / 0.88)",
        "error-primary": "hsl(var(--destructive) / 0.12)"
      },
      textColor: {
        primary: "hsl(var(--foreground))",
        secondary: "hsl(var(--foreground) / 0.82)",
        secondary_hover: "hsl(var(--foreground))",
        tertiary: "hsl(var(--muted-foreground))",
        tertiary_hover: "hsl(var(--foreground) / 0.82)",
        quaternary: "hsl(var(--muted-foreground))",
        disabled: "hsl(var(--foreground) / 0.34)",
        placeholder: "hsl(var(--muted-foreground))",
        "brand-secondary": "hsl(var(--accent))",
        "brand-secondary_hover": "hsl(var(--primary-hover))",
        "brand-tertiary": "hsl(var(--accent))",
        "fg-quaternary": "hsl(var(--muted-foreground))",
        "fg-quaternary_hover": "hsl(var(--foreground) / 0.82)",
        "fg-white": "hsl(var(--destructive-foreground))",
        "fg-disabled": "hsl(var(--foreground) / 0.34)",
        "fg-disabled_subtle": "hsl(var(--foreground) / 0.5)",
        "fg-error-secondary": "hsl(var(--destructive))",
        "error-primary": "hsl(var(--destructive))",
        "error-primary_hover": "hsl(var(--destructive) / 0.82)"
      },
      borderColor: {
        primary: "hsl(var(--foreground) / 0.12)",
        secondary: "hsl(var(--foreground) / 0.1)",
        secondary_alt: "hsl(var(--foreground) / 0.12)",
        brand: "hsl(var(--accent))",
        disabled: "hsl(var(--foreground) / 0.06)",
        error: "hsl(var(--destructive))",
        error_subtle: "hsl(var(--destructive) / 0.4)"
      },
      ringColor: {
        primary: "hsl(var(--foreground) / 0.12)",
        secondary: "hsl(var(--foreground) / 0.1)",
        secondary_alt: "hsl(var(--foreground) / 0.12)",
        brand: "hsl(var(--ring))",
        "brand-solid": "hsl(var(--accent))",
        "bg-brand-solid": "hsl(var(--accent))",
        disabled: "hsl(var(--foreground) / 0.06)",
        error: "hsl(var(--destructive))",
        error_subtle: "hsl(var(--destructive) / 0.4)"
      },
      outlineColor: {
        brand: "hsl(var(--ring))",
        "focus-ring": "hsl(var(--ring))",
        error: "hsl(var(--destructive))"
      },
      boxShadow: {
        xs: "0 1px 2px rgb(0 0 0 / 0.28)",
        "xs-skeuomorphic": "0 1px 2px rgb(0 0 0 / 0.28), inset 0 1px 0 rgb(255 255 255 / 0.06)"
      }
    }
  },
  plugins: []
};

export default config;

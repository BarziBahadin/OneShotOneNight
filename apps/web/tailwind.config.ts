import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}", "./main.tsx", "./router.tsx"],
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--foreground))",
        moss: "hsl(var(--muted-foreground))",
        coral: "hsl(var(--primary))",
        amber: "hsl(var(--accent))",
        skywash: "hsl(var(--secondary))",
        linen: "hsl(var(--background))",
        surface: "hsl(var(--card))"
      }
    }
  },
  plugins: []
};

export default config;

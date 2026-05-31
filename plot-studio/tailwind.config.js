/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f172a",
          raised: "#1e293b",
          overlay: "#334155",
        },
        accent: {
          DEFAULT: "#8b5cf6",
          muted: "#a78bfa",
          glow: "#c4b5fd",
        },
        gold: "#fbbf24",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.35)",
        glow: "0 0 40px rgba(139,92,246,0.15)",
      },
    },
  },
  plugins: [],
};

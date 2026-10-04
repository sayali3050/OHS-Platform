/** @type {import('tailwindcss').Config} */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Barlow"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"Barlow Semi Condensed"', '"Barlow"', "system-ui", "sans-serif"],
      },
      colors: {
        bg: token("bg"), surface: token("surface"), sunken: token("sunken"),
        ink: token("ink"), muted: token("muted"), line: token("line"),
        signal: { DEFAULT: token("signal"), ink: token("signal-ink") },
        steel: token("steel"),
        safe: token("safe"), caution: token("caution"), danger: token("danger"), info: token("info"),
        "danger-solid": token("danger-solid"), "safe-solid": token("safe-solid"),
      },
      borderRadius: { sm: "4px", md: "6px", lg: "10px" },
      boxShadow: { panel: "0 1px 0 hsl(var(--line) / 1), 0 8px 24px -12px hsl(var(--shadow) / 0.35)" },
    },
  },
  plugins: [],
};

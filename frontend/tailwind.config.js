/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    screens: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
    },
    extend: {
      colors: {
        bg: "var(--bg)",
        sidebar: "var(--sidebar)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",
        "surface-elevated": "var(--surface-elevated)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-bg": "var(--accent-bg)",
        "accent-fg": "var(--accent-fg)",
        "accent-muted": "var(--accent-muted)",
        "accent-secondary": "var(--accent-secondary)",
        "accent-secondary-muted": "var(--accent-secondary-muted)",
        "new-item-glow": "var(--new-item-glow)",
        success: "var(--success)",
        "success-bg": "var(--success-bg)",
        error: "var(--error)",
        "error-bg": "var(--error-bg)",
        warning: "var(--warning)",
        "modal-overlay": "var(--modal-overlay)",
        "modal-panel": "var(--modal-panel)",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
        300: "300ms",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      minHeight: {
        "touch-target": "48px",
      },
      minWidth: {
        "touch-target": "48px",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

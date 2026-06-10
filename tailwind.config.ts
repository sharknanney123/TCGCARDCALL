import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15131F",        // page background — deep night violet-slate
        panel: "#1E1B2C",      // card/panel surface
        edge: "#2C2840",       // borders
        parchment: "#EDE7DA",  // primary text
        faded: "#9A93AC",      // secondary text
        gold: "#D4A843",       // rare-frame gold — primary accent
        jade: "#3FB68B",       // gains
        ember: "#E0584F",      // losses
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

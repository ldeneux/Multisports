/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        cardinal: {
          DEFAULT: "#D6293F",
          dark: "#A81F31",
          light: "#F4D3D8",
        },
        navy: {
          DEFAULT: "#0B2545",
          light: "#13355E",
        },
        lagoon: {
          DEFAULT: "#1E88C7",
          light: "#DCEEFA",
        },
        sand: "#F7F5F2",
        ink: "#14181F",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
    },
  },
  plugins: [],
};

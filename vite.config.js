import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'src/content/index.js'),
        background: resolve(__dirname, 'src/background/index.js'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'content' || chunk.name === 'background') {
            return 'src/[name]/index.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});

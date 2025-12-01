import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer - generates stats.html
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    // Gzip compression
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli compression
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: [
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      'react-window',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core vendor dependencies
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Material-UI components
          mui: ['@mui/material', '@mui/icons-material'],
          // State management and forms
          state: ['zustand', 'react-hook-form', '@hookform/resolvers', 'zod'],
          // Utilities and networking
          utils: ['axios', 'socket.io-client', 'use-debounce'],
          // Virtualization library
          virtualization: ['react-window'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true,
      },
    },
    // Enable source maps for debugging but smaller
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8099',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8099',
        ws: true,
      },
    },
  },
});

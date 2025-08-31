/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'
import { spawn } from 'child_process';
import type { Plugin } from 'vite';

/**
 * Custom Vite plugin to automatically start react-devtools and inject its script.
 * This provides a zero-config developer experience for debugging.
 */
function autoReactDevtools(): Plugin {
  return {
    name: 'auto-react-devtools',
    // This plugin should only run when serving the development build
    apply: 'serve',

    /**
     * When the dev server is starting, spawn the react-devtools process.
     */
    configureServer(server) {
      // Do not run this plugin in test environments (unit or e2e)
      if (process.env.VITEST || process.env.E2E_TESTING) {
        return;
      }
      
      // npx will find the react-devtools binary in node_modules/.bin
      const devtools = spawn('npx', ['react-devtools'], {
        stdio: 'inherit',
        shell: process.platform === 'win32', // shell: true is needed on Windows for npx
      });

      devtools.on('error', (err) => {
        console.error('Failed to start react-devtools:', err);
      });

      // When the Vite server is closed, we ensure the devtools process is killed
      server.httpServer?.on('close', () => {
        devtools.kill();
      });
    },

    /**
     * In development, inject the script tag to connect to the standalone devtools server.
     */
    transformIndexHtml() {
      // Do not run this plugin in test environments (unit or e2e)
      if (process.env.VITEST || process.env.E2E_TESTING) {
        return [];
      }

      return [
        {
          tag: 'script',
          attrs: { src: 'http://localhost:8097' },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const renderChunks = (id: string) => {
  const vendorLibs = [
    'react',
    'react-dom',
    'three',
    '@react-three/drei',
    '@react-three/fiber',
    'echarts',
    'zustand',
  ];

  if (id.includes('node_modules')) {
    for (const lib of vendorLibs) {
      // Use a regex to ensure we match the package name correctly
      if (id.match(new RegExp(`\/node_modules\/${lib}\/`))) {
        return 'vendor';
      }
    }
  }
};


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    autoReactDevtools(),
    tailwindcss()
  ],
  base: process.env.BASE_URL || '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/e2e/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: renderChunks
      }
    }
  }
});

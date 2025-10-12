/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { spawn } from 'child_process';
import type { Plugin } from 'vite';

import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
);

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
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  plugins: [
    react(), 
    autoReactDevtools(),
    tailwindcss(),
    VitePWA({
        registerType: 'autoUpdate',
        workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        manifest: {
            name: 'EvoGarden: A Predator-Prey Simulation',
            short_name: 'EvoGarden',
            description: packageJson.description,
            theme_color: '#008000',
            background_color: '#004d00',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'favicon.ico',
                sizes: '128x128 64x64 32x32 24x24 16x16',
                type: 'image/x-icon',
              },
              {
                src: 'EvoGarden-icon.png',
                type: 'image/png',
                sizes: '192x192',
              },
              {
                src: 'EvoGarden-icon.png',
                type: 'image/png',
                sizes: '512x512',
              },
              {
                src: 'EvoGarden-icon.png',
                type: 'image/png',
                sizes: '512x512',
                purpose: 'any maskable',
              },
            ],
        },
    }),
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
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: renderChunks
      }
    }
  }
});

import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function copyTitlebarTheme() {
  return {
    name: 'copy-titlebar-theme',
    closeBundle() {
      const theme = resolve('electron/main/titlebar.theme.json')
      if (!existsSync(theme)) return
      const toDir = resolve('out/main')
      mkdirSync(toDir, { recursive: true })
      cpSync(theme, resolve(toDir, 'titlebar.theme.json'))
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyTitlebarTheme()],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main/index.ts'),
          writer: resolve('electron/main/writer.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['custom-electron-titlebar'] })],
    resolve: {
      alias: {
        '@shared': resolve('shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
          inlineDynamicImports: true
        }
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    base: './',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  // 开发环境使用配置的API地址，生产环境使用相对路径
  const apiBase = env.VITE_API_BASE || ''
  const wsBase = env.VITE_WS_BASE || ''

  // 开发环境 proxy 配置
  const proxyConfig: Record<string, any> = {}
  if (apiBase) {
    proxyConfig['/api'] = {
      target: apiBase,
      changeOrigin: true,
    }
    proxyConfig['/ws'] = {
      target: wsBase || apiBase,
      ws: true,
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 8000,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: proxyConfig,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})

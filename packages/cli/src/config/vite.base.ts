import type { InlineConfig } from 'vite'

import type { OptionsType } from '../common/index'
import type { BuildLibOptions } from '../common/index.js'
import vitePluginVue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'

import { setBuildTarget } from '../common/index.js'
import { genMonorepoInfo } from './monorepo-alias-resolve.js'

export async function getViteConfigForSiteDev(_: OptionsType): Promise<InlineConfig> {
  setBuildTarget('site')

  const { alias, dirsList } = await genMonorepoInfo()

  return {
    resolve: {
      alias,
    },

    optimizeDeps: {
      // https://github.com/youzan/vant/issues/10930
      include: ['vue', 'vue-router'],
      exclude: Object.keys(alias),
    },

    plugins: [
      vitePluginVue(),
      // https://github.com/antfu/unplugin-auto-import
      AutoImport({
        imports: ['vue', 'vue-router'],
        vueTemplate: true,
        injectAtEnd: true,
        // 添加对用户定义的 stores 的自动导入支持
        dirs: dirsList,
        // 启用目录扫描的类型支持
        dirsScanOptions: {
          types: true,
        },
      }),
    ],

    server: {
      open: true,
      host: true,
      port: 9547,
    },
  }
}

export async function getViteConfigForSiteProd(e: OptionsType): Promise<InlineConfig> {
  const devConfig = await getViteConfigForSiteDev(e)

  return {
    ...devConfig,
  }
}

export async function getViteConfigForLib(opt: BuildLibOptions): Promise<InlineConfig> {
  const devConfig = await getViteConfigForSiteDev({ mode: 'prod' })
  return {
    ...devConfig,
    build: {
      lib: opt.entry
        ? {
            entry: opt.entry,
          }
        : undefined,
    },
  }
}

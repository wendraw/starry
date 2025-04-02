import type * as CommonModule from '../common/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { monorepoCustomResolver } from './monorepo-alias-resolve.js'

// 模拟 fs 相关函数
vi.mock('../common/index.js', async () => {
  const actualModule = await vi.importActual<typeof CommonModule>('../common/index.js')
  return {
    ...actualModule,
    exists: vi.fn().mockImplementation(async (path: string) => {
      // 模拟文件存在的逻辑
      if (path.includes('dist') || !path.includes('src')) {
        return false
      }
      // 默认情况，其他文件不存在
      return true
    }),
    isDir: vi.fn().mockImplementation((path: string) => {
      // 模拟是否为目录的逻辑
      return !path.includes('.ts')
    }),
  }
})

// 每个测试前重置模拟状态
beforeEach(() => {
  vi.clearAllMocks()
})

describe('main package', () => {
  it('only use main', async () => {
    const res = await monorepoCustomResolver(
      '/wendraw/starry/lib',
      {
        name: '@wendraw/lib',
        type: 'module',
        main: './dist/index.js',
      },
      '/wendraw/starry/lib',
    )
    expect(res).toBe('/wendraw/starry/lib/src/index.ts')
  })

  it('only use module', async () => {
    const res = await monorepoCustomResolver(
      '/wendraw/starry/lib',
      {
        name: '@wendraw/lib',
        type: 'module',
        module: './dist/index.js',
      },
      '/wendraw/starry/lib',
    )
    expect(res).toBe('/wendraw/starry/lib/src/index.ts')
  })

  describe('use exports', () => {
    it('with default', async () => {
      const res = await monorepoCustomResolver(
        '/wendraw/starry/lib',
        {
          name: '@wendraw/lib',
          exports: {
            '.': {
              default: './dist/index.js',
            },
          },
        },
        '/wendraw/starry/lib',
      )
      expect(res).toBe('/wendraw/starry/lib/src/index.ts')
    })

    it('with import', async () => {
      const res = await monorepoCustomResolver(
        '/wendraw/starry/lib',
        {
          name: '@wendraw/lib',
          exports: {
            '.': {
              import: './dist/index.js',
            },
          },
        },
        '/wendraw/starry/lib',
      )
      expect(res).toBe('/wendraw/starry/lib/src/index.ts')
    })
  })
})

describe('sub package', () => {
  it('use exports', async () => {
    const res = await monorepoCustomResolver(
      '/wendraw/starry/lib',
      {
        name: '@wendraw/lib',
        type: 'module',
        exports: {
          '.': {
            default: './dist/index.js',
          },
          './inner': {
            import: './dist/inner/index.js',
          },
        },
      },
      '/wendraw/starry/lib/inner',
    )
    expect(res).toBe('/wendraw/starry/lib/src/inner/index.ts')
  })
})

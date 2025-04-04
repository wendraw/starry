import type { Alias } from 'vite'
import fs from 'node:fs/promises'
import path, { join, resolve } from 'node:path'
import { CWD, ROOT } from '../common/constant.js'
import { exists, isDir } from '../common/index.js'

type relativePath = '.' | `./${string}`
interface PackageJson {
  name: string
  type?: 'module' | 'commonjs'
  main?: string
  module?: string
  exports?: Record<relativePath, {
    import?: relativePath
    default?: relativePath
    require?: relativePath
    /** 源码路径 */
    source?: relativePath
  }>
  buildOptions?: {
    isLib?: boolean
    /** 源码目录，默认是 src */
    srcDir?: string
  }
}

/**
 * dir: user-path/wendraw/packages/styles
 * source: @wendraw/styles => user-path/wendraw/packages/styles
 *      or @wendraw/styles/colors => user-path/wendraw/packages/styles/colors
 */
export async function monorepoCustomResolver(dir: string, packagesJson: PackageJson, source?: string) {
  let sourcePath = source ?? ''
  // 如果 import 使用的 source 是比 dir 长，那说明是使用了 export 的子包如 @wendraw/styles/colors
  const exportSubpackPath = sourcePath.replace(dir, '')
  if (exportSubpackPath) {
    const relativePath = `.${resolve('./', exportSubpackPath)}` as relativePath
    if (packagesJson.exports?.[relativePath]) {
      let subpackPath = packagesJson.type === 'module'
        ? (packagesJson.exports[relativePath].import || packagesJson.exports[relativePath].default || '')
        : packagesJson.exports[relativePath].require ?? ''
      // ./dist/inner/index.js => inner/index.js
      subpackPath = subpackPath.substring(subpackPath.indexOf(exportSubpackPath)).replace(/^\//, '')
      sourcePath = resolve(dir, subpackPath).replace(/\.js|\.mjs$/, '.ts')
    }
  }
  else {
    // 没有使用子包的模式
    const relativePath = '.'
    let mainPath = packagesJson.type === 'module' ? packagesJson.module : packagesJson.main
    mainPath = mainPath || packagesJson.main // 可能没有配置 module 字段
    // 判断 exports
    if (packagesJson.exports?.[relativePath]) {
      // eslint-disable-next-line unused-imports/no-unused-vars
      mainPath = packagesJson.type === 'module'
        ? (packagesJson.exports[relativePath].import || packagesJson.exports[relativePath].default)
        : packagesJson.exports[relativePath].require
    }
    sourcePath = await findSourcePath(sourcePath, dir)
  }

  async function findSourcePath(sourcePath: string, dir: string) {
    let dirPath = sourcePath
    const subpackPath = sourcePath.replace(dir, '').replace(/^\//, '')
    const exts = ['.ts', '.tsx', '.jsx', '.mjs']
    if (exts.some(e => sourcePath.endsWith(e))) {
      // sourcePath 是文件
      dirPath = dir
    }
    for (const e of exts) {
      const srcDir = packagesJson.buildOptions?.srcDir ?? 'src'
      const resPath = resolve(dirPath, srcDir, subpackPath || `index${e}`) // 源码放在 src 下
      const rootPath = resolve(dirPath, subpackPath || `index${e}`) // 源码放在根目录下
      if (await exists(resPath)) {
        return resPath
      }
      if (await exists(rootPath)) {
        return rootPath
      }
    }
    return sourcePath
  }

  // 是否是文件
  if (await exists(sourcePath) && !isDir(sourcePath)) {
    return sourcePath
  }
  // 没有对应的声明就使用 src 下的 index
  return await findSourcePath(sourcePath, dir)
}

export async function getMonoRepoSubpackMap(dir: string) {
  const packageJsonMap: Record<string, PackageJson> = {}
  const getDeps = async (dir: string) => {
    const files = await fs.readdir(dir)

    for (const file of files) {
      if (!file.includes('node_modules') && isDir(resolve(dir, file))) {
        await getDeps(join(dir, file))
      }
    }
    const packageJsonPath = files
      .filter(file => file.endsWith('package.json'))
      .map(file => path.join(dir, file))[0]

    if (packageJsonPath) {
      packageJsonMap[dir] = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    }
  }
  await getDeps(dir)

  return packageJsonMap
}

export async function genMonorepoInfo(prefix?: string): Promise<{ alias: Alias[], dirsList: string[] }> {
  const alias: Alias[] = []
  const dirsList: string[] = []
  // get all package from package.json subpackage
  const packageJsonMap = await getMonoRepoSubpackMap(ROOT)
  for (const dir in packageJsonMap) {
    const json = packageJsonMap[dir]
    if (json.buildOptions?.isLib) {
      continue // 如果是 lib 就不需要 alias
    }
    if (json?.name?.includes('@wendraw/starry')) {
      continue
    }
    if (json?.name?.startsWith(prefix ?? '')) {
      alias.push({
        find: json.name,
        replacement: `${dir}`,
        customResolver: (source) => {
          return monorepoCustomResolver(dir, json, source)
        },
      })
    }

    const relativeDir = path.relative(CWD, dir)
    // 过滤掉运行目录 和 根目录
    if (relativeDir && dir !== ROOT) {
      dirsList.push(path.join(relativeDir, '**/*'))
    }
  }
  return { alias, dirsList }
}

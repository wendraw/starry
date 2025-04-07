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
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
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

export async function genMonorepoInfo(prefix?: string) {
  const alias: Alias[] = []
  const dirsList: string[] = []
  const excludeDirsList: string[] = []
  // get all package from package.json subpackage
  const packageJsonMap = await getMonoRepoSubpackMap(ROOT)
  const cwdPackageJson = JSON.parse(await fs.readFile(join(CWD, 'package.json'), 'utf-8')) as PackageJson
  const deps = Object.entries({ ...cwdPackageJson.dependencies, ...cwdPackageJson.devDependencies })
  for (const dir in packageJsonMap) {
    if (dir.includes('node_modules')) {
      continue
    }
    // 过滤掉运行目录
    if (dir === CWD) {
      continue
    }
    // 过滤掉没有依赖的包
    if (!deps.some(([key, val]) => key === packageJsonMap[dir].name && val.startsWith('workspace:'))) {
      continue
    }

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
      // Add the directory with glob pattern
      dirsList.push(join(relativeDir, '**/*'))

      // 过滤掉 node_modules
      dirsList.push(`!${join(relativeDir, 'node_modules/**/*')}`)

      // 识别源码目录
      const srcDir = json.buildOptions?.srcDir || 'src'
      const possibleSrcDirs = ['src', 'source', 'lib', 'packages']

      // 过滤常见的编译输出目录，但排除可能的源码目录
      const commonOutputDirs = ['dist', 'build', 'output', 'umd', 'cjs', 'esm']
      for (const outputDir of commonOutputDirs) {
        if (!possibleSrcDirs.includes(outputDir)) {
          dirsList.push(`!${join(relativeDir, `${outputDir}/**/*`)}`)
        }
      }

      // 用于判断路径是否是源码文件
      function isSourceFile(path: string): boolean {
        if (!path)
          return false
        const isSourceExt = /\.(?:ts|tsx|jsx)$/.test(path)
        const isMinified = path.includes('.min.') || path.includes('.bundle.')
        return isSourceExt && !isMinified
      }

      // 用于判断目录是否是源码目录
      function isSourceDir(dir: string): boolean {
        if (!dir)
          return false
        return dir === srcDir || possibleSrcDirs.includes(dir)
      }

      // 提取路径中的第一个目录
      function extractFirstDirectory(path: string): string | null {
        if (!path)
          return null
        // 移除开头的 './' 或 '/'
        const normalizedPath = path.replace(/^\.?\/?/, '')
        // 提取第一个斜杠前的内容
        const firstSlashIndex = normalizedPath.indexOf('/')
        if (firstSlashIndex === -1)
          return null
        return normalizedPath.substring(0, firstSlashIndex)
      }

      // 尝试从 package.json 的 main/module 字段推断输出目录
      if (json.main || json.module) {
        const outputPaths = [
          json.main,
          json.module,
        ].filter(Boolean) as string[]

        for (const outputPath of outputPaths) {
          const outputDir = extractFirstDirectory(outputPath)
          if (outputDir) {
            // 如果不是源码目录，并且路径不是指向源码文件，则认为是输出目录
            if (!isSourceDir(outputDir) && !isSourceFile(outputPath)) {
              dirsList.push(`!${join(relativeDir, `${outputDir}/**/*`)}`)
            }
          }
        }
      }

      // 检查 exports 字段中可能的输出目录
      if (json.exports) {
        for (const [, exportValue] of Object.entries(json.exports)) {
          const exportPaths = [
            exportValue.import,
            exportValue.default,
            exportValue.require,
          ].filter(Boolean) as string[]

          for (const exportPath of exportPaths) {
            const outputDir = extractFirstDirectory(exportPath)
            if (outputDir) {
              // 如果不是源码目录，并且路径不是指向源码文件，则认为是输出目录
              if (!isSourceDir(outputDir) && !isSourceFile(exportPath)) {
                dirsList.push(`!${join(relativeDir, `${outputDir}/**/*`)}`)
              }
            }
          }
        }
      }
    }
  }
  return { alias, autoImport: { dirsList, excludeDirsList } }
}

# @wendraw/starry

这是一个封装了 vite 的 cli 工具，主要的目的：

- 简化 vite 配置
  - 0 配置，支持 lib 模式
- 支持 monorepos 项目

## 简化 vite 配置

在一个 monorepos 项目中可能会被拆分成很多个 package，每个 package 都需要一个 vite.config.ts 文件，如果每个文件都配置一遍，那么就会有很多重复的配置，而且如果需要修改配置，就需要修改多个文件。

特别是对于 utils 这种 lib 类型的 package，需要的配置其实并不多，但是每个 package 都需要配置一遍，就会很麻烦。

### 功能点

- [x] dev (site)
- [x] build (site)
- [x] build (lib)

内置 vite 插件：

- @vitejs/plugin-vue
- unplugin-auto-import

## 支持 monorepos 项目

想要支持 monorepos 项目，主要需要解决的问题是：

- vite build 需要找到源代码或者编译后的代码
- 支持直接跳转到源码

而这些需求都可以通过 vite 的 resolve.alias 和 unplugin-auto-import 来解决。

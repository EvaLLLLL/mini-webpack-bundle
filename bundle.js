const fs = require('fs')
const parser = require('@babel/parser')
const path = require('path')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')

const getModuleInfo = filePath => {
  // 获取文件数据并转化为 AST
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const ast = parser.parse(fileContent, { sourceType: 'module' })

  // 收集依赖，并形成依赖映射
  const deps = {}

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      const dirname = path.dirname(filePath)
      const abspath = './' + path.join(dirname, node.source.value)

      // 收集依赖信息
      if (!deps[node.source.value]) {
        deps[node.source.value] = abspath
      }
    },
  })

  // AST 转换成合法 JS
  const { code } = babel.transformFromAst(ast, null, {
    presets: ['@babel/preset-env'],
  })

  const moduleInfo = { filePath, deps, code }
  return moduleInfo
}

// 递归收集转译后的代码，并获得路径映射信息
const parseModules = entryPath => {
  const result = {}
  const visited = {}

  const loop = path => {
    if (!!visited[path]) return

    const entryFile = getModuleInfo(path)
    result[path] = entryFile
    visited[path] = 1

    if (Object.keys(entryFile.deps).length) {
      Object.values(entryFile.deps).forEach(filePath => loop(filePath))
    }
  }

  loop(entryPath)

  return result
}

// 处理 export 和 require
const bundle = filePath => {
  const depsGraph = JSON.stringify(parseModules(filePath))

  return `(function (graph) {
    function require(file) {
        function absRequire(relPath) {
            return require(graph[file].deps[relPath])
        }
        var exports = {}
        ;(function (require,exports,code) {
            eval(code)
        })(absRequire,exports,graph[file].code)
        return exports
    }
    require('${filePath}')
})(${depsGraph})`
}

const content = bundle('./src/index.js')
fs.mkdirSync('./dist')
fs.writeFileSync('./dist/bundle.js', content)

import { existsSync, createWriteStream } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import PortProxy from '../src/index.ts'

const app = express()
const port = process.env.PORT || 3000

// 通过命令行参数获取目录，例如：node server.js ./public 8080
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'public')
const customPort = process.argv[3] || port

// 使用静态文件中间件
app.get(/\/upload\.txt/, express.static(publicDir), (_req, res) => {
  res.status(404)
  res.end()
})

app.post('/upload', async (req, res) => {
  const fileWriteStream = createWriteStream(path.join(publicDir, 'upload.2.txt'))

  req.pipe(fileWriteStream)

  req.on('end', () => {
    res.send('OK')
  })
})

// 对于任何不匹配的路径，返回index.html（支持SPA）
app.get(/.+/, (_req, res) => {
  const indexFile = path.join(publicDir, 'index.html')

  if (existsSync(indexFile)) {
    res.sendFile(indexFile)
  } else {
    res.status(404).send('Not found')
  }
})

// 启动服务器
app.listen(customPort, () => {
  console.debug(`File server running at http://localhost:${customPort}`)
  console.debug(`Serving files from: ${publicDir}`)
})

const proxy = new PortProxy({
  // 源，新的代理服务
  source: '127.0.0.1',
  sourcePort: 3001,
  // 目标，被代理的原服务
  target: '127.0.0.1',
  targetPort: 3000,
  // verbose: true,
  // 单个 tcp 限速，单位 B/s，限速对每个 tcp 连接有 5% 的波动，总限速同
  limiteRate: 400 * 1024
  // 所有 tcp 共享的限速，单位 B/s，注意后面的设置（非缺省）会覆盖前面的设置
  // totalLimiteRate?: number
})

proxy.start()

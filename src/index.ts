import dgram from 'dgram'
import net from 'net'
import { Writable, Readable } from 'node:stream'
import { ReadableStream, TransformStream, type WritableStream } from 'node:stream/web'

export interface ProxyOptions {
  // 源，新的代理服务
  source: string
  sourcePort: number
  // 目标，被代理的原服务
  target: string
  targetPort: number
  verbose?: boolean
  protocol?: 'tcp' | 'udp'
  // 单个 tcp 限速，单位 B/s，限速对每个 tcp 连接有 5% 的波动，总限速同
  limiteRate?: number
  // 所有 tcp 共享的限速，单位 B/s，注意后面的设置（非缺省）会覆盖前面的设置
  totalLimiteRate?: number
  // Qos 权重比例，当网络拥塞时，会按比例分配消息窗口大小，优先传输，但每个连接会至少占用 10B/s 的带宽，权重相同则采用 node 底层默认策略。
  /**@todo 待实现 */
  // weight?: number
}

interface ConnectionPair {
  sourceSocket: net.Socket
  targetSocket: net.Socket
}

/**
 * 端口代理
 */
class PortProxy {
  static #totalLimiteRate: number = 0

  static #totalRate: number = 0

  static #connections = new Map<PortProxy, { sourceSocket: net.Socket; targetSocket: net.Socket }>()

  // static #minRate: number = 10

  /**
   * 是否超限
   */
  static get #overTotalLimit() {
    return PortProxy.#totalRate > 0 && PortProxy.#totalRate > PortProxy.#totalLimiteRate * 1.025
  }

  /**
   * 是否低限
   */
  static get #lowTotalLimit() {
    return PortProxy.#totalRate < PortProxy.#totalLimiteRate * 0.975
  }

  static {
    setInterval(() => {
      let aveWindowSize = 0,
          aliveCount = 0

      PortProxy.#totalRate = 0
      PortProxy.#connections.forEach((_item, proxy) => {
        proxy?.calcRate()
        PortProxy.#totalRate += proxy.rate
        if (proxy.windowSize > 10) {
          aveWindowSize += proxy.windowSize
          aliveCount++
        }
      })
      PortProxy.#aveWindowSize = Math.floor(aveWindowSize / aliveCount)
    }, 1000)
  }

  // 平均窗口大小
  static #aveWindowSize = 0

  #source: string

  #sourcePort: number

  #target: string

  #targetPort: number

  #verbose: boolean

  #tcpServer: net.Server | null = null

  #udpServer: dgram.Socket | null = null

  #protocol: string = 'tcp'

  #limiteRate: number = 0

  rate: number = 0

  windowSize: number = 10

  /**
   * 是否超速
   */
  get #overlimit() {
    return this.#limiteRate > 0 && this.rate > this.#limiteRate * 1.025
  }

  /**
   * 是否低速
   */
  get #lowLimit() {
    return this.#limiteRate > 0 && this.rate < this.#limiteRate * 0.975
  }

  /**
   * 计算当前代理的流量
   */
  calcRate: () => void = () => {}

  /**
   * 构造器
   * @param options 配置项
   */
  constructor(options: ProxyOptions) {
    this.#source = options.source
    this.#sourcePort = options.sourcePort
    this.#target = options.target
    this.#targetPort = options.targetPort
    this.#verbose = options.verbose ?? false
    this.#protocol = options.protocol ?? 'tcp'
    this.#limiteRate = Math.floor(Math.abs(options.limiteRate ?? 0)) || 0
    PortProxy.#totalLimiteRate =
      Math.floor(Math.abs(options.totalLimiteRate ?? 0)) ?? PortProxy.#totalLimiteRate
  }

  /**
   * 启动端口转发代理
   */
  start(): Promise<void> {
    const protocol = this.#protocol

    if (protocol === 'tcp') return this.#startTcp()
    else if (protocol === 'udp') return this.#startUdp()
    else throw new Error('未知的协议')
  }

  /**
   * 启动TCP转发代理
   */
  #startTcp() {
    const { promise: waitReady, resolve, reject } = Promise.withResolvers<void>()
    const connections = PortProxy.#connections
    const limiteRate = this.#limiteRate
    const totalLimiteRate = PortProxy.#totalLimiteRate
    const tcpServer = this.#tcpServer = net.createServer((sourceSocket: net.Socket) => {
      // 为新连接创建到目标的socket
      const targetSocket = net.connect({
        host: this.#target,
        port: this.#targetPort
      })
      const sourceReadStream = Readable.toWeb(sourceSocket)
      const targetReadStream = Readable.toWeb(targetSocket)
      const sourceWriteStream = Writable.toWeb(sourceSocket)
      const targetWriteStream = Writable.toWeb(targetSocket)

      connections.set(this, { sourceSocket, targetSocket })

      if (this.#verbose) {
        const clientInfo = `${sourceSocket.remoteAddress}:${sourceSocket.remotePort}`
        const targetInfo = `${this.#target}:${this.#targetPort}`

        console.debug(`新连接: ${clientInfo} -> ${targetInfo}`)
      }

      if (!limiteRate && !totalLimiteRate)
        this.#pipeThrough({
          sourceReadStream,
          targetReadStream,
          sourceWriteStream,
          targetWriteStream
        })
      else
        this.#pipeTo({
          sourceReadStream,
          targetReadStream,
          sourceWriteStream,
          targetWriteStream
        })

      /**
       * 处理连接关闭
       * @param sourceError 源socket的错误
       * @param targetError 目标socket的错误
       */
      const cleanup = (sourceError: undefined | Error, targetError: undefined | Error) => {
        if (this.#verbose) {
          const clientInfo = `${sourceSocket.remoteAddress}:${sourceSocket.remotePort}`

          console.debug(
            `连接关闭: ${clientInfo} ${sourceError?.message ?? ''} ${targetError?.message ?? ''}`
          )
        }

        connections.delete(this)

        sourceSocket.destroy(targetError)
        targetSocket.destroy(sourceError)
      }

      sourceSocket.on('close', () => cleanup(void 0, void 0))
      sourceSocket.on('error', error => cleanup(error, void 0))
      targetSocket.on('close', () => cleanup(void 0, void 0))
      targetSocket.on('error', error => cleanup(void 0, error))
    })

    // 处理服务器错误
    tcpServer.on('error', (err: Error) => {
      console.error(`服务器错误: ${err.message}`)
      reject(err)
    })

    // 开始监听
    tcpServer.listen(this.#sourcePort, this.#source, () => {
      console.debug(
        `端口转发已启动: ${this.#source}:${this.#sourcePort} -> ${this.#target}:${this.#targetPort}`
      )
      resolve()
    })

    return waitReady
  }

  /**
   * 启动端口转发
   * @param opt                   选项
   * @param opt.sourceReadStream  源数据流
   * @param opt.targetWriteStream 目标数据流
   * @param opt.targetReadStream  源数据流
   * @param opt.sourceWriteStream 目标数据流
   */
  #pipeThrough({
    sourceReadStream,
    targetReadStream,
    sourceWriteStream,
    targetWriteStream
  }: {
    sourceReadStream: ReadableStream
    targetReadStream: ReadableStream
    sourceWriteStream: WritableStream
    targetWriteStream: WritableStream
  }) {
    /**
     * 转发流
     * @param readableStream 可读流
     * @param writableStream 可写流
     */
    const transform = (readableStream: ReadableStream, writableStream: WritableStream) => {
      // 创建双向转换流用于日志记录
      const sourceToTargetTransform = new TransformStream({
        transform: (chunk, controller) => {
          this.#verboseHandler(readableStream === sourceReadStream ? 'source' : 'target', chunk)

          controller.enqueue(chunk)
        }
      })

      readableStream.pipeThrough(sourceToTargetTransform).pipeTo(writableStream)
    }

    transform(sourceReadStream, targetWriteStream)
    transform(targetReadStream, sourceWriteStream)
  }

  /**
   * 启动端口转发
   * @param opt                   选项
   * @param opt.sourceReadStream  源数据流
   * @param opt.targetWriteStream 目标数据流
   * @param opt.targetReadStream  源数据流
   * @param opt.sourceWriteStream 目标数据流
   */
  #pipeTo({
    sourceReadStream,
    targetReadStream,
    sourceWriteStream,
    targetWriteStream
  }: {
    sourceReadStream: ReadableStream<Uint8Array>
    targetReadStream: ReadableStream<Uint8Array>
    sourceWriteStream: WritableStream<Uint8Array>
    targetWriteStream: WritableStream<Uint8Array>
  }) {
    let lastSourceChunk: Uint8Array | null = null,
        lastChunkSize = 0
    /**
     * 将普通流转换为带 Qos 的流
     * @param stream 可读流
     */
    const transfStream = (stream: ReadableStream<Uint8Array>) => {
      const sourceReader = stream.getReader()

      const newSourceReadableStream = new ReadableStream({
        pull: async controller => {
          lastSourceChunk ??= await handleReadNextChunk()
          // console.log('🚀 ~ PortProxy ~ transfStream ~ pull:')

          if (
            (this.#overlimit ||
              this.windowSize > 0 && this.windowSize > PortProxy.#aveWindowSize * 1.1 ||
              PortProxy.#overTotalLimit) &&
            this.windowSize > 10
          ) {
            this.windowSize *= 0.8
          } else if (
            this.#lowLimit ||
            this.windowSize > 0 && this.windowSize < PortProxy.#aveWindowSize * 0.9 ||
            PortProxy.#lowTotalLimit
          )
            this.windowSize *= 1.1

          if (lastSourceChunk) {
            const willsend = lastSourceChunk.slice(0, this.windowSize)

            controller.enqueue(willsend)

            this.#verboseHandler(stream === sourceReadStream ? 'source' : 'target', willsend)

            const rest = lastSourceChunk.slice(this.windowSize)

            if (rest.byteLength) lastSourceChunk = rest
            else lastSourceChunk = null
            // else {
            //   lastSourceChunk = await handleReadNextChunk()
            //   if (!lastSourceChunk) {
            //     // controller.close()
            //     controller.enqueue(null)
            //     console.log('🚀 ~ close:')
            //   }
            // }
          }
        }
      })

      /**
       * 读取数据
       */
      const handleReadNextChunk = async () => {
        const { done, value: chunk } = await sourceReader.read()

        if (done) return null

        return chunk
      }

      return newSourceReadableStream
    }
    const newSourceReadableStream = transfStream(sourceReadStream)
    const newTargetReadableStream = transfStream(targetReadStream)

    /**
     * 获取速度
     */
    const calcRate = () => {
      if (!lastSourceChunk) {
        this.rate = 0
        this.windowSize = 10

        return
      }

      this.rate = Math.abs(lastChunkSize - lastSourceChunk.byteLength)
      lastChunkSize = lastSourceChunk.byteLength
    }

    this.calcRate = calcRate
    newSourceReadableStream.pipeTo(targetWriteStream)
    newTargetReadableStream.pipeTo(sourceWriteStream)
  }

  /**
   * 启动UDP转发代理
   */
  #startUdp() {
    const { promise: waitReady, resolve, reject } = Promise.withResolvers<void>()

    // 创建UDP socket
    const udpServer = this.#udpServer = dgram.createSocket('udp4')

    // 存储客户端地址信息 (UDP是无连接的，需要记录客户端地址)
    const clientMap = new Map()

    // 处理接收到的消息
    udpServer.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      const clientKey = `${rinfo.address}:${rinfo.port}`

      if (this.#verbose) console.debug(`来自客户端 ${clientKey} 的数据: ${msg.length} 字节`)

      // 检查是否已有到目标的socket，如果没有则创建
      if (!clientMap.has(clientKey)) {
        const targetSocket = dgram.createSocket('udp4')

        // 处理目标服务器的响应
        targetSocket.on('message', (responseMsg: Buffer) => {
          if (this.#verbose) {
            console.debug(`来自服务器的数据: ${responseMsg.length} 字节, 返回给 ${clientKey}`)
          }

          // 将响应发送回客户端
          udpServer.send(responseMsg, rinfo.port, rinfo.address, err => {
            if (err && this.#verbose) {
              console.error(`回复客户端时出错: ${err.message}`)
            }
          })
        })

        targetSocket.on('error', (err: Error) => {
          if (this.#verbose) {
            console.error(`目标Socket错误: ${err.message}`)
          }

          // 发生错误时清理该客户端映射
          clientMap.delete(clientKey)
          targetSocket.close()
        })

        // 存储目标socket和客户端信息
        clientMap.set(clientKey, {
          targetSocket,
          lastActivity: Date.now()
        })
      }

      // 转发数据到目标服务器
      const clientData = clientMap.get(clientKey)

      clientData.lastActivity = Date.now() // 更新活动时间
      clientData.targetSocket.send(msg, this.#targetPort, this.#target, (err: Error) => {
        if (err && this.#verbose) {
          console.error(`转发到目标时出错: ${err.message}`)
        }
      })
    })

    // 处理UDP服务器错误
    this.#udpServer.on('error', (err: Error) => {
      console.error(`UDP服务器错误: ${err.message}`)
      reject(err)
    })

    // 处理UDP服务器开始监听
    this.#udpServer.on('listening', () => {
      const address = this.#udpServer!.address()

      console.debug(
        `UDP端口转发已启动: ${address.address}:${address.port} -> ${this.#target}:${
          this.#targetPort
        }`
      )
      resolve()
    })

    // 定期清理不活动的客户端连接
    setInterval(() => {
      const now = Date.now()
      const timeout = 60000 // 60秒无活动视为超时

      for (const [key, data] of clientMap.entries()) {
        if (now - data.lastActivity > timeout) {
          if (this.#verbose) {
            console.debug(`清理不活动的UDP客户端: ${key}`)
          }

          data.targetSocket.close()
          clientMap.delete(key)
        }
      }
    }, 30000) // 每30秒检查一次

    // 开始监听
    this.#udpServer.bind(this.#sourcePort, this.#source)

    return waitReady
  }

  /**
   * 消息日志
   * @param from    发送方
   * @param message 消息
   */
  #verboseHandler(from: string, message: Uint8Array) {
    if (this.#verbose) {
      console.debug(`来自 ${from} 的数据: ${message.length} 字节`)
      const hex = Buffer.from(message).toString('hex')

      console.debug(`${hex.slice(0, 50)}...${hex.slice(-50, hex.length)}`)
    }
  }

  /**
   * 停止端口转发代理
   */
  stop(): Promise<void> {
    const tcpServer = this.#tcpServer
    const { promise: waitClose, resolve } = Promise.withResolvers<void>()

    if (tcpServer) {
      // 关闭所有活动连接
      PortProxy.#connections.forEach(({ sourceSocket, targetSocket }: ConnectionPair) => {
        sourceSocket.destroy()
        targetSocket.destroy()
      })
      PortProxy.#connections.clear()

      // 关闭服务器
      tcpServer.close(() => {
        console.debug(
          `端口转发已停止 ${this.#source}:${this.#sourcePort} -x-> ${this.#target}:${
            this.#targetPort
          }`
        )
        resolve()
      })
    } else resolve()

    return waitClose
  }

  /**
   * 获取代理状态
   */
  getStatus(): {
    listening: boolean
    connections: number
    config: ProxyOptions
    } {
    return {
      listening: this.#tcpServer ? this.#tcpServer.listening : false,
      connections: this.getConnectionCount(),
      config: {
        source: this.#source,
        sourcePort: this.#sourcePort,
        target: this.#target,
        targetPort: this.#targetPort,
        verbose: this.#verbose
      }
    }
  }

  /**
   * 检查代理是否正在运行
   * @returns 代理运行状态
   */
  isRunning(): boolean {
    return this.#tcpServer ? this.#tcpServer.listening : false
  }

  /**
   * 获取活动连接数
   * @returns 当前活动连接数量
   */
  getConnectionCount(): number {
    return PortProxy.#connections.size
  }
}

/**
 * 解析命令行参数
 * @param args 命令行参数
 */
function parseArgs(args: string[]): ProxyOptions {
  const options: ProxyOptions = {
    source: '0.0.0.0',
    sourcePort: 14491,
    target: '127.0.0.1',
    targetPort: 14490,
    verbose: false,
    protocol: 'tcp'
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      options.source = args[i + 1]
      i++
    } else if (args[i] === '--source-port' && args[i + 1]) {
      options.sourcePort = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--target' && args[i + 1]) {
      options.target = args[i + 1]
      i++
    } else if (args[i] === '--target-port' && args[i + 1]) {
      options.targetPort = parseInt(args[i + 1])
      i++
    } else if (args[i] === '--protocol') {
      options.protocol = args[i + 1] as 'tcp' | 'udp'
    } else if (args[i] === '--verbose') {
      options.verbose = true
    } else if (args[i] === '--help') {
      console.debug(`
使用说明: portproxy [选项]
选项:
  --source <IP>        监听地址 (默认: 0.0.0.0)
  --source-port <端口> 监听端口 (默认: 14491)
  --target <IP>        目标地址 (默认: 127.0.0.1)
  --target-port <端口> 目标端口 (默认: 14490)
  --protocol <协议>      协议 (默认: tcp)
  --verbose            详细输出模式
  --help               显示此帮助信息

示例:
  portproxy --source 192.168.196.2 --source-port 14491 --target 127.0.0.1 --target-port 14490
      `)
      process.exit(0)
    }
  }

  return options
}

/**
 * 命令行接口
 */
async function main() {
  const options = parseArgs(process.argv.slice(2))

  // 创建并启动代理
  const proxy = new PortProxy(options)

  /**
   * 处理进程退出信号
   */
  const shutdown = async () => {
    console.debug('\n正在停止端口转发...')
    await proxy.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // 启动代理
  try {
    await proxy.start()

    // 显示状态信息
    console.debug('按 Ctrl+C 停止端口转发')
    console.debug('当前状态:', proxy.getStatus())
  } catch (error) {
    console.error('启动端口转发失败:', error)
    process.exit(1)
  }
}

// 如果是直接执行此文件，则运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

// 导出模块
export default PortProxy

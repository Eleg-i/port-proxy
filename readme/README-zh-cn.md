# port-proxy —— 端口代理工具

简体中文 | [English](../README.md)

## 描述

一个轻量级的端口代理工具，可以将一个端口的流量转发到另一个端口，支持TCP和UDP协议，并且可以限制传输速率。

## 开始使用

安装依赖包

```bash
npm i port-proxy
```

#### 导入

```javascript
import PortProxy from 'port-proxy'
```

#### 使用

```javascript
// 创建一个TCP端口代理实例
const proxy = new PortProxy({
  // 源，新的代理服务
  source: '127.0.0.1',
  sourcePort: 3001,
  // 目标，被代理的原服务
  target: '127.0.0.1',
  targetPort: 3000,
  // 是否输出详细日志
  verbose: false,
  // 协议类型：'tcp' 或 'udp'
  protocol: 'tcp',
  // 单个 tcp 服务限速，单位 B/s，限速对每个 tcp 连接有 5% 的波动
  limiteRate: 400 * 1024
})

// 启动代理服务
await proxy.start()

// 检查代理是否正在运行
const isRunning = proxy.isRunning()

// 获取代理状态
const status = proxy.getStatus()

// 获取活动连接数
const connectionCount = proxy.getConnectionCount()

// 停止代理服务
await proxy.stop()
```

## 说明

### `PortProxy` 类

#### 构造函数

```javascript
new PortProxy(options: ProxyOptions)
```

##### 参数

- `options`: `Object` 类型，必需，配置选项对象
  
  `options` 的属性如下：
  
  - `source`: `string` 类型，必需
    
    监听地址。
  - `sourcePort`: `number` 类型，必需
    
    监听端口。
  - `target`: `string` 类型，必需
    
    目标地址。
  - `targetPort`: `number` 类型，必需
    
    目标端口。
  - `verbose`: `boolean` 类型，可选
    
    是否输出详细日志，默认为 false。
  - `protocol`: `'tcp' | 'udp'` 类型，可选
    
    使用的协议，默认为 'tcp'。
  - `limiteRate`: `number` 类型，可选
    
    单个 TCP 服务限速，单位 B/s，限速对每个 TCP 连接有 5% 的波动。默认为 0（不限速）。

#### 方法

##### `start()` `Promise<void>`

启动端口转发代理。

##### `stop()` `Promise<void>`

停止端口转发代理。

##### `getStatus()` `Object`

获取代理状态。

返回值：

```javascript
{
  listening: boolean, // 是否正在监听
  connections: number, // 当前连接数
  config: ProxyOptions // 当前配置
}
```

##### `isRunning()` `boolean`

检查代理是否正在运行。

##### `getConnectionCount()` `number`

获取活动连接数。

## 命令行使用

该库也可以作为命令行工具使用：

安装全局包后可以直接使用命令行工具：

```bash
npm install -g port-proxy
portproxy --source 127.0.0.1 --source-port 3001 --target 127.0.0.1 --target-port 3000 --verbose --protocol tcp --limite-rate 409600
```

或者在项目中使用：

```bash
npx port-proxy --source 127.0.0.1 --source-port 3001 --target 127.0.0.1 --target-port 3000
```

### 选项

- `--source <IP>`: 监听地址 (默认: 0.0.0.0)
- `--source-port <端口>`: 监听端口 (默认: 14491)
- `--target <IP>`: 目标地址 (默认: 127.0.0.1)
- `--target-port <端口>`: 目标端口 (默认: 14490)
- `--protocol <协议>`: 协议 (默认: tcp)
- `--verbose`: 详细输出模式
- `--limite-rate <速率>`: 单个 TCP 服务限速，单位 B/s，默认为 0（不限速）
- `--help`: 显示帮助信息

### 示例

```bash
portproxy --source 192.168.196.2 --source-port 14491 --target 127.0.0.1 --target-port 14490
```


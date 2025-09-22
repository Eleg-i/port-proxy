# port-proxy —— Port Proxy Tool

[简体中文](readme/README-zh-cn.md) | English

## Description

A lightweight port proxy tool that can forward traffic from one port to another, supporting TCP and UDP protocols, and can limit the transmission rate.

## Getting Started

Install dependencies

```bash
npm i port-proxy
```

#### Import

```javascript
import { PortProxy } from 'port-proxy'
```

#### Usage

```javascript
// Create a TCP port proxy instance
const proxy = new PortProxy({
  // Source, new proxy service
  source: '127.0.0.1',
  sourcePort: 3001,
  // Target, original service being proxied
  target: '127.0.0.1',
  targetPort: 3000,
  // Whether to output detailed logs
  verbose: false,
  // Protocol type: 'tcp' or 'udp'
  protocol: 'tcp',
  // Single TCP service rate limit, unit B/s, rate limit has 5% fluctuation for each TCP connection
  limiteRate: 400 * 1024
})

// Start the proxy service
await proxy.start()

// Check if the proxy is running
const isRunning = proxy.isRunning()

// Get proxy status
const status = proxy.getStatus()

// Get active connection count
const connectionCount = proxy.getConnectionCount()

// Stop the proxy service
await proxy.stop()
```

## Explanation

### `PortProxy` Class

#### Constructor

```javascript
new PortProxy(options: ProxyOptions)
```

##### Parameters

- `options`: `Object` type, required, configuration options object
  
  Properties of `options` are as follows:
  
  - `source`: `string` type, required

    Listening address.
  - `sourcePort`: `number` type, required

    Listening port.
  - `target`: `string` type, required

    Target address.
  - `targetPort`: `number` type, required

    Target port.
  - `verbose`: `boolean` type, optional

    Whether to output detailed logs, default is false.
  - `protocol`: `'tcp' | 'udp'` type, optional

    Protocol to use, default is 'tcp'.
  - `limiteRate`: `number` type, optional

    Single TCP service rate limit, unit B/s, rate limit has 5% fluctuation for each TCP connection. Default is 0 (no limit).

#### Methods

##### `start()` `Promise<void>`

Start the port forwarding proxy.

##### `stop()` `Promise<void>`

Stop the port forwarding proxy.

##### `getStatus()` `Object`

Get the proxy status.

Return value:

```javascript
{
  listening: boolean, // Whether it is listening
  connections: number, // Current number of connections
  config: ProxyOptions // Current configuration
}
```

##### `isRunning()` `boolean`

Check if the proxy is running.

##### `getConnectionCount()` `number`

Get the number of active connections.

## Command Line Usage

This library can also be used as a command line tool. After installing the package globally, you can use it directly:

```bash
npm install -g port-proxy
portproxy --source 127.0.0.1 --source-port 3001 --target 127.0.0.1 --target-port 3000 --verbose --protocol tcp --limite-rate 409600
```

Or use it in your project:

```bash
npx port-proxy --source 127.0.0.1 --source-port 3001 --target 127.0.0.1 --target-port 3000
```

### Options

- `--source <IP>`: Listening address
- `--source-port <port>`: Listening port
- `--target <IP>`: Target address
- `--target-port <port>`: Target port
- `--protocol <protocol>`: Protocol (default: tcp)
- `--verbose`: Detailed output mode
- `--limite-rate <rate>`: Single TCP service rate limit, unit B/s, default is 0 (no limit)
- `--help`: Display help information

### Example

```bash
portproxy --source 192.168.196.2 --source-port 14491 --target 127.0.0.1 --target-port 14490
```

## 🤝 Support

Enjoying this project? Show your support by giving it a star! ⭐

Your stars help the project gain visibility and encourage further development.

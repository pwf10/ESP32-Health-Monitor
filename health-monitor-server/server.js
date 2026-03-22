// server.js - 增强版：支持APP通过WebSocket控制硬件声光报警
const WebSocket = require('ws');
const dgram = require('dgram');
const http = require('http');

console.log('🚀 启动ESP32健康监测服务器...');

// 创建HTTP服务器（处理CORS）
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/plain'
  });
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  res.end('ESP32健康监测服务器');
});

// 将WebSocket服务器附加到HTTP服务器
const wsServer = new WebSocket.Server({ server: httpServer });

// UDP服务器（用于接收硬件数据和发送指令）
const udpServer = dgram.createSocket('udp4');
const UDP_RECV_PORT = 8888;    // 接收硬件数据的端口
const UDP_SEND_PORT = 8889;    // 发送指令给硬件的端口（硬件监听此端口）
let appClients = [];            // 存储连接的APP WebSocket
let udpPacketCount = 0;

// 硬件设备映射表：deviceId -> { ip, lastSeen }
const deviceMap = new Map();

console.log('\n📡 服务器配置:');
console.log(`  UDP接收端口: ${UDP_RECV_PORT} (接收ESP32数据)`);
console.log(`  UDP发送端口: ${UDP_SEND_PORT} (发送指令给ESP32)`);
console.log('  HTTP/WebSocket端口: 8080 (发送给App)');

// ==================== 1. 接收ESP32数据 ====================
udpServer.on('message', (msg, rinfo) => {
  udpPacketCount++;
  console.log(`\n📦 [${udpPacketCount}] 收到UDP数据包 [${new Date().toLocaleTimeString()}] 来自 ${rinfo.address}:${rinfo.port} (长度: ${msg.length}字节)`);

  try {
    const dataStr = msg.toString();
    let data;
    try {
      data = JSON.parse(dataStr);
      console.log('✅ 数据格式: JSON');

      // 显示关键信息
      if (data.posture_data) {
        console.log(`   体态: 俯仰 ${data.posture_data.pitch}°, 横滚 ${data.posture_data.roll}°`);
      }
      if (data.vital_data) {
        console.log(`   生理: 心率 ${data.vital_data.heart_rate}BPM, 血氧 ${data.vital_data.spo2}%`);
      }
      if (data.fall_detected !== undefined) {
        console.log(`   跌倒: ${data.fall_detected ? '🚨是' : '否'}`);
      }
      if (data.wear_status) {
        console.log(`   佩戴: ${data.wear_status.is_worn ? '✅已佩戴' : '❌未佩戴'}`);
      }

      // ===== 新增：记录硬件设备信息 =====
      if (data.device_id) {
        const deviceId = data.device_id;
        deviceMap.set(deviceId, {
          ip: rinfo.address,
          lastSeen: Date.now()
        });
        console.log(`   📍 设备 ${deviceId} 已记录，IP: ${rinfo.address}`);
      }
      // =================================

    } catch (parseError) {
      // JSON解析失败，打印原始数据前100字符
      data = { raw: dataStr.substring(0, 100) };
      console.log('📝 数据格式非JSON，原始数据预览:', dataStr.substring(0, 100));
    }

    // 转发给所有连接的App
    if (appClients.length > 0) {
      const broadcastData = {
        type: 'sensor_data',
        time: new Date().toLocaleTimeString(),
        data: data
      };
      const jsonData = JSON.stringify(broadcastData);
      appClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(jsonData);
        }
      });
      console.log(`📤 已转发给 ${appClients.length} 个客户端`);
    } else {
      console.log('⚠️ 当前没有客户端连接，数据未转发');
    }

  } catch (error) {
    console.log('❌ 处理数据时发生错误:', error.message);
  }
});

// ==================== 2. 处理App连接 ====================
wsServer.on('connection', (ws, req) => {
  console.log('\n📱 新App连接');
  appClients.push(ws);

  const clientIp = req.socket.remoteAddress;
  console.log(`   客户端IP: ${clientIp}`);
  console.log(`   当前总连接数: ${appClients.length}`);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    message: '服务器连接成功',
    time: new Date().toLocaleTimeString(),
    udpPort: UDP_RECV_PORT,
    serverTime: Date.now()
  }));

  ws.on('close', () => {
    console.log('📱 App断开连接');
    appClients = appClients.filter(c => c !== ws);
    console.log(`   剩余连接数: ${appClients.length}`);
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          time: new Date().toLocaleTimeString()
        }));
        console.log('🏓 响应ping-pong');
      }
      // ===== 新增：处理APP下发的声光指令 =====
      else if (data.type === 'app_alert') {
        console.log('📨 收到APP声光指令:', data);
        const { level, duration, targetDevice } = data;

        // 查找目标硬件IP
        let targetIp = null;
        if (targetDevice && deviceMap.has(targetDevice)) {
          targetIp = deviceMap.get(targetDevice).ip;
        } else if (deviceMap.size === 1) {
          // 如果只有一个硬件，默认发给它
          targetIp = Array.from(deviceMap.values())[0].ip;
        }

        if (targetIp) {
          // 构造要发送给硬件的UDP消息（格式与硬件期望的一致）
          const command = JSON.stringify({
            type: 'alert',
            level: level || 0,
            duration: duration || 0,
            timestamp: Date.now()
          });
          udpServer.send(command, 0, command.length, UDP_SEND_PORT, targetIp, (err) => {
            if (err) {
              console.error(`❌ 转发UDP指令给 ${targetIp} 失败:`, err.message);
            } else {
              console.log(`✅ 已通过UDP转发指令给硬件 ${targetIp}:${UDP_SEND_PORT}`);
            }
          });
        } else {
          console.log('⚠️ 未找到目标硬件，无法转发指令');
        }
      }
      // =========================================
    } catch (e) {
      // 忽略非JSON消息
    }
  });
});

// ==================== 3. 启动HTTP服务器和UDP服务器 ====================
httpServer.listen(8080, () => {
  console.log(`🌐 HTTP/WebSocket服务器监听 0.0.0.0:8080`);

  udpServer.bind(UDP_RECV_PORT, () => {
    console.log('\n========================================');
    console.log('✅ 服务器启动成功！');
    console.log('========================================');
    console.log('📱 重要：请根据当前电脑IP修改App连接地址');
    console.log('   运行 ipconfig 查看本机IP，例如 192.168.10.105');
    console.log('   然后在App设置中输入: ws://[你的IP]:8080');
    console.log('========================================\n');
  });
});

// 可选：定期打印统计信息（调试用）
setInterval(() => {
  if (udpPacketCount > 0) {
    console.log(`\n📊 统计信息: 已接收UDP包 ${udpPacketCount} 个，当前客户端数 ${appClients.length}，已发现硬件数 ${deviceMap.size}`);
  }
  // 清理超过5分钟未更新的硬件记录（可选）
  const now = Date.now();
  for (let [id, info] of deviceMap.entries()) {
    if (now - info.lastSeen > 5 * 60 * 1000) {
      deviceMap.delete(id);
      console.log(`🧹 清理过期硬件: ${id}`);
    }
  }
}, 60000); // 每分钟输出一次
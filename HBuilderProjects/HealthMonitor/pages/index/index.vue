<template>
  <view class="page-container">
    <!-- 1. 连接状态栏（顶部） -->
    <view class="connection-bar" :class="connectionStatus">
      <view class="connection-info">
        <view class="status-dot"></view>
        <text class="status-text">{{ getStatusText() }}</text>
      </view>
      <text class="data-count" v-if="dataCount > 0">{{ dataCount }}条数据</text>
      <button v-if="connectionStatus !== 'connected' && connectionStatus !== 'no_data'" class="quick-connect" @tap="connectToServer">连接</button>
    </view>

    <!-- 2. 佩戴状态卡片 -->
    <view class="wear-status-card card">
      <view class="wear-header">
        <text class="wear-title">佩戴状态</text>
        <view :class="['wear-badge', isWorn ? 'wear-normal' : 'wear-warning']">
          {{ isWorn ? '✅ 已佩戴' : '❌ 未佩戴' }}
        </view>
      </view>
      <view class="wear-tip">
        <text v-if="!isWorn">请正确佩戴设备，确保传感器接触良好</text>
        <text v-else>设备佩戴正常，正在实时监测</text>
      </view>
    </view>

    <!-- 3. 跌倒检测卡片 -->
    <view class="fall-card card" :class="{ 'normal': !fallDetected }">
      <view class="fall-header">
        <text class="fall-icon">{{ fallDetected ? '🚨' : '✅' }}</text>
        <text class="fall-title">跌倒检测</text>
        <view :class="['fall-badge', fallDetected ? 'danger' : 'normal']">
          {{ fallDetected ? '紧急' : '正常' }}
        </view>
      </view>
      <view v-if="fallDetected" class="fall-content">
        <text>系统检测到跌倒事件！请立即确认用户安全。</text>
      </view>
      <view v-if="fallDetected" class="fall-actions">
        <button class="fall-btn confirm" @tap="acknowledgeFall">我已确认</button>
        <button class="fall-btn ignore" @tap="ignoreFall">忽略</button>
      </view>
    </view>

    <!-- 4. 体态监测卡片 -->
    <view class="posture-card card">
      <view class="card-header">
        <text class="card-title">体态监测</text>
        <view :class="['alert-badge', getPostureAlertClass()]">
          {{ postureStatus }}
        </view>
      </view>
      
      <view class="posture-indicator">
        <view class="indicator-grid">
          <view class="grid-cell"></view>
          <view class="grid-cell" :class="{'active': pitch > 0}">
            <text class="direction-label">前倾</text>
          </view>
          <view class="grid-cell"></view>
          <view class="grid-cell" :class="{'active': roll < 0}">
            <text class="direction-label">左倾</text>
          </view>
          <view class="grid-cell center-cell">
            <view class="center-dot"></view>
            <text class="angle-display">P:{{ pitch }}°</text>
            <text class="angle-display">R:{{ roll }}°</text>
          </view>
          <view class="grid-cell" :class="{'active': roll > 0}">
            <text class="direction-label">右倾</text>
          </view>
          <view class="grid-cell"></view>
          <view class="grid-cell" :class="{'active': pitch < 0}">
            <text class="direction-label">后仰</text>
          </view>
          <view class="grid-cell"></view>
        </view>
      </view>
      
      <view class="posture-detail">
        <view class="detail-item">
          <text class="detail-label">俯仰角:</text>
          <text class="detail-value">{{ pitch }}°</text>
        </view>
        <view class="detail-item">
          <text class="detail-label">横滚角:</text>
          <text class="detail-value">{{ roll }}°</text>
        </view>
        <view class="detail-item">
          <text class="detail-label">状态:</text>
          <text :class="['detail-value', getPostureAlertClass()]">{{ postureDetail || '正常' }}</text>
        </view>
      </view>
    </view>

    <!-- 5. 生理参数卡片 -->
    <view class="vital-card card">
      <view class="card-header">
        <text class="card-title">生理参数</text>
        <view class="time-display">{{ lastUpdateTime }}</view>
      </view>
      
      <view class="vital-grid">
        <view class="vital-item">
          <view class="vital-icon">❤️</view>
          <text class="vital-label">心率</text>
          <text class="vital-value">{{ heartRate }} BPM</text>
          <text :class="['vital-status', getHeartRateStatusClass()]">{{ getHeartRateStatus() }}</text>
        </view>
        
        <view class="vital-item">
          <view class="vital-icon">🩸</view>
          <text class="vital-label">血氧</text>
          <text class="vital-value">{{ spo2 }} %</text>
          <text :class="['vital-status', getSpo2StatusClass()]">{{ getSpo2Status() }}</text>
        </view>
      </view>
    </view>

    <!-- 6. 环境参数卡片 -->
    <view class="environment-card card">
      <view class="card-header">
        <text class="card-title">环境参数</text>
      </view>
      
      <view class="environment-grid">
        <view class="env-item">
          <view class="env-icon">🌡️</view>
          <text class="env-label">温度</text>
          <text class="env-value">{{ temperature }}°C</text>
        </view>
        
        <view class="env-item">
          <view class="env-icon">💧</view>
          <text class="env-label">湿度</text>
          <text class="env-value">{{ humidity }}%</text>
        </view>
      </view>
    </view>

    <!-- 7. 预警信息卡片 -->
    <view v-if="hasWarning" class="warning-card card">
      <view class="warning-header">
        <text class="warning-title">⚠️ 预警提示</text>
        <text class="warning-level">{{ getWarningLevelText() }}</text>
      </view>
      <view class="warning-content">
        <text>{{ warningMessage }}</text>
      </view>
      <view class="warning-actions">
        <button class="warning-btn" @tap="handleAcknowledge">我知道了</button>
      </view>
    </view>

    <!-- 8. 底部操作按钮 -->
    <view class="action-buttons">
      <button class="action-btn reconnect" @tap="reconnect">
        <text class="btn-icon">🔄</text>
        <text>重新连接</text>
      </button>
      <button class="action-btn test" @tap="sendTestCommand">
        <text class="btn-icon">📡</text>
        <text>测试连接</text>
      </button>
      <button class="action-btn refresh" @tap="refreshData">
        <text class="btn-icon">🔄</text>
        <text>刷新数据</text>
      </button>
    </view>

    <!-- 9. 服务器配置弹窗（保留，用于设置） -->
    <view v-if="showServerConfig" class="server-config-modal">
      <view class="modal-content">
        <view class="modal-header">
          <text class="modal-title">服务器配置</text>
          <button class="modal-close" @tap="showServerConfig = false">✕</button>
        </view>
        
        <view class="modal-body">
          <view class="config-item">
            <text class="config-label">WebSocket地址</text>
            <input class="config-input" v-model="serverAddressInput" placeholder="ws://192.168.10.103:8080" />
          </view>
          
          <view class="config-tip">
            <text>💡 提示：</text>
            <text>1. 确保Node.js服务器正在运行</text>
            <text>2. 确保ESP32和服务器在同一网络</text>
            <text>3. 手机真机调试需使用电脑IP地址</text>
          </view>
        </view>
        
        <view class="modal-footer">
          <button class="modal-btn cancel" @tap="showServerConfig = false">取消</button>
          <button class="modal-btn save" @tap="saveServerConfig">保存并连接</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import realData from '@/common/real-data.js'

export default {
  data() {
    return {
      connectionStatus: 'disconnected',
      serverAddress: 'ws://10.253.88.78:8080',
      serverAddressInput: 'ws://10.253.88.78:8080',
      showServerConfig: false,
      dataCount: 0,
      ws: null,
      reconnectTimer: null,
      timeoutTimer: null,          // 数据超时定时器
      heartbeatTimer: null,        // 心跳定时器（新增）
      lastDataTimestamp: 0,        // 最后一次收到数据的时间戳

      isWorn: false,
      fallDetected: false,

      pitch: 0,
      roll: 0,
      postureStatus: '正常',
      postureDetail: '',
      postureLevel: 0,
      isAbnormal: false,

      heartRate: 0,
      spo2: 0,
      heartRateValid: false,
      spo2Valid: false,

      temperature: 0,
      humidity: 0,
      tempValid: false,
      humValid: false,

      hasWarning: false,
      warningMessage: '',
      warningLevel: 0,

      ledStatus: '关闭',
      buzzerStatus: '关闭',
      abnormalCount: 0,
      rssi: -99,

      lastUpdateTime: '--:--:--',
      deviceId: '未知',
      localIp: '未知',
      deviceIp: '',

      thresholds: {
        pitch: 15,
        roll: 20,
        hrMin: 30,
        hrMax: 200,
        spo2Min: 70,
        tempMin: 0,
        tempMax: 50,
        humMin: 20,
        humMax: 90
      },

      alertLevels: [
        { value: 1, name: '轻度预警', range: [15, 25] },
        { value: 2, name: '中度预警', range: [25, 35] },
        { value: 3, name: '重度预警', range: [35, 50] }
      ],
    }
  },

  onLoad() {
    this.loadServerConfig()
    this.loadThresholds()
    this.loadAlertLevels()
    setTimeout(() => this.connectToServer(), 1000)
  },

  onShow() {
    this.loadThresholds()
    this.loadAlertLevels()
    this.loadServerConfig()  // 每次显示页面都重新加载服务器地址
    console.log('📂 从本地存储重新加载阈值和级别范围')
  },

  onUnload() {
    this.disconnect()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.timeoutTimer) clearInterval(this.timeoutTimer)
    this.stopHeartbeat() // 确保清除心跳
  },

  methods: {
    loadAlertLevels() {
      try {
        const saved = uni.getStorageSync('alert_levels')
        if (saved) this.alertLevels = saved
      } catch (e) {
        console.log('加载预警级别失败:', e)
      }
    },

    loadThresholds() {
      try {
        const saved = uni.getStorageSync('threshold_config')
        if (saved) this.thresholds = { ...this.thresholds, ...saved }
      } catch (e) {
        console.log('加载阈值失败:', e)
      }
    },

    loadServerConfig() {
      try {
        const saved = uni.getStorageSync('server_config')
        if (saved && saved.address) {
          // 如果地址变化，则更新并重连
          if (this.serverAddress !== saved.address) {
            this.serverAddress = saved.address
            this.serverAddressInput = saved.address
            this.reconnect()
          } else {
            this.serverAddress = saved.address
            this.serverAddressInput = saved.address
          }
        }
      } catch (e) {
        console.log('加载配置失败:', e)
      }
    },

    saveServerConfig() {
      const address = this.serverAddressInput.trim()
      if (!address) {
        uni.showToast({ title: '请输入服务器地址', icon: 'none' })
        return
      }
      let normalizedAddress = address
      if (!address.startsWith('ws://') && !address.startsWith('wss://')) {
        normalizedAddress = 'ws://' + address
      }
      this.serverAddress = normalizedAddress
      this.serverAddressInput = normalizedAddress
      try {
        uni.setStorageSync('server_config', { address: normalizedAddress })
      } catch (e) {
        console.log('保存配置失败:', e)
      }
      this.showServerConfig = false
      this.reconnect()
    },

    connectToServer() {
      this.disconnect()
      console.log('开始连接服务器:', this.serverAddress)
      this.connectionStatus = 'connecting'
      try {
        this.ws = uni.connectSocket({
          url: this.serverAddress,
          success: () => console.log('✅ connectSocket成功回调'),
          fail: (error) => {
            console.error('❌ connectSocket失败:', error)
            this.connectionStatus = 'error'
            this.scheduleReconnect(5000)
          }
        })
        this.ws.onOpen(() => {
          console.log('✅ WebSocket连接已打开')
          this.connectionStatus = 'connected'
          // 启动数据超时检测
          this.startDataTimeoutCheck()
          // 启动心跳
          this.startHeartbeat()
          uni.showToast({ title: '连接成功', icon: 'success', duration: 1500 })
          setTimeout(() => this.sendTestCommand(), 500)
        })
        this.ws.onMessage((res) => this.handleWebSocketMessage(res.data))
        this.ws.onError((error) => {
          console.error('❌ WebSocket连接错误:', error)
          this.isWorn = false
          this.connectionStatus = 'error'
          this.stopHeartbeat() // 停止心跳
          uni.showToast({ title: '连接失败', icon: 'error', duration: 2000 })
          this.scheduleReconnect(5000)
        })
        this.ws.onClose(() => {
          console.log('连接关闭')
          this.isWorn = false
          this.stopHeartbeat() // 停止心跳
          if (this.connectionStatus === 'connected' || this.connectionStatus === 'no_data') {
            this.connectionStatus = 'disconnected'
            this.scheduleReconnect(2000)
          }
        })
      } catch (error) {
        console.error('创建WebSocket异常:', error)
        this.connectionStatus = 'error'
        this.scheduleReconnect(3000)
      }
    },

    // 启动数据超时检测（每秒检查一次，超过5秒无数据则标记为无数据）
    startDataTimeoutCheck() {
      if (this.timeoutTimer) clearInterval(this.timeoutTimer)
      this.lastDataTimestamp = Date.now()
      this.timeoutTimer = setInterval(() => {
        if (this.connectionStatus === 'connected' && Date.now() - this.lastDataTimestamp > 10000) {
          console.log('⚠️ 超过5秒未收到数据，标记为无数据')
          this.connectionStatus = 'no_data'
          this.isWorn = false
        }
      }, 1000)
    },

    // ---------- 新增：心跳机制 ----------
    startHeartbeat() {
      this.stopHeartbeat() // 先清除旧的
      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.connectionStatus === 'connected') {
          this.ws.send({
            data: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
            success: () => console.log('💓 心跳发送成功'),
            fail: (err) => console.log('💓 心跳发送失败', err)
          })
        }
      }, 15000) // 每15秒发送一次
    },

    stopHeartbeat() {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = null
      }
    },
    // ------------------------------------

    handleWebSocketMessage(message) {
      this.dataCount++
      // 更新最后数据时间戳
      this.lastDataTimestamp = Date.now()
      // 如果之前是无数据状态，重新标记为已连接
      if (this.connectionStatus === 'no_data') {
        this.connectionStatus = 'connected'
      }

      try {
        const data = JSON.parse(message)
        console.log('收到消息类型:', data.type)

        switch (data.type) {
          case 'welcome':
            console.log('服务器欢迎:', data.message)
            break
          case 'sensor_data':
            // 先更新 UI 并添加字段
            this.updateSensorData(data.data)
            // 再保存到历史（此时 data.data 已包含 posture_is_abnormal 等字段）
            if (realData && realData.websocketManager) {
              realData.websocketManager.addToHistory(data.data)
            }
            break
          case 'pong':
            console.log('收到pong响应')
            break
          default:
            // 对于其他可能包含传感器数据的消息，直接保存原始数据
            if (realData && realData.websocketManager) {
              if (
                data.posture_data ||
                data.vital_data ||
                data.environment_data ||
                data.wear_status ||
                data.fall_detected !== undefined
              ) {
                realData.websocketManager.addToHistory(data)
              }
            }
            break
        }
      } catch (error) {
        console.log('收到非JSON消息:', message)
      }
    },

    updateSensorData(sensorData) {
      console.log('更新传感器数据:', sensorData)

      const now = new Date()
      this.lastUpdateTime = now.toLocaleTimeString()

      if (sensorData.network_info && sensorData.network_info.local_ip) {
        this.deviceIp = sensorData.network_info.local_ip
        console.log('硬件IP:', this.deviceIp)
      }
      if (sensorData.device_id) {
        this.deviceId = sensorData.device_id
      }

      if (sensorData.wear_status) {
        this.isWorn = sensorData.wear_status.is_worn || false
      }

      if (sensorData.posture_data) {
        this.pitch = sensorData.posture_data.pitch || 0
        this.roll = sensorData.posture_data.roll || 0

        console.log('pitch:', this.pitch, 'roll:', this.roll,
                    '阈值 pitch:', this.thresholds.pitch, 'roll:', this.thresholds.roll)

        const maxAngle = Math.max(Math.abs(this.pitch), Math.abs(this.roll))
        const pitchAbs = Math.abs(this.pitch)
        const rollAbs = Math.abs(this.roll)

        const isPitchExceed = pitchAbs > this.thresholds.pitch
        const isRollExceed = rollAbs > this.thresholds.roll
        this.isAbnormal = isPitchExceed || isRollExceed

        console.log('isAbnormal:', this.isAbnormal)

        if (this.isAbnormal) {
          let level = 1
          for (let i = 0; i < this.alertLevels.length; i++) {
            const lvl = this.alertLevels[i]
            if (maxAngle >= lvl.range[0] && maxAngle <= lvl.range[1]) {
              level = lvl.value
              break
            }
          }
          this.postureLevel = level
          console.log('重新计算等级:', this.postureLevel)

          if (isPitchExceed && isRollExceed) {
            this.postureStatus = '异常'
            this.postureDetail = '前倾/后仰且侧倾'
          } else if (isPitchExceed) {
            this.postureStatus = '异常'
            this.postureDetail = this.pitch > 0 ? '前倾过度' : '后仰过度'
          } else if (isRollExceed) {
            this.postureStatus = '注意'
            this.postureDetail = this.roll > 0 ? '右倾过度' : '左倾过度'
          }

          const levelNames = ['', '轻度', '中度', '重度']
          this.postureStatus = levelNames[this.postureLevel] + '异常'
        } else {
          this.postureLevel = 0
          this.postureStatus = '正常'
          this.postureDetail = ''
        }

        this.checkPostureWarning()
      }

      // ========== 将计算出的异常状态写回 sensorData，供历史记录使用 ==========
      sensorData.posture_is_abnormal = this.isAbnormal
      sensorData.posture_level = this.postureLevel
      sensorData.posture_status = this.postureStatus
      sensorData.posture_detail = this.postureDetail
      // ====================================================================

      if (sensorData.fall_detected !== undefined) {
        this.fallDetected = sensorData.fall_detected
        if (this.fallDetected) {
          this.hasWarning = true
          this.warningLevel = 3
          this.warningMessage = '⚠️ 检测到跌倒！请立即确认用户安全！'
          console.log('跌倒检测触发，发送紧急声光')
          this.sendAlertCommand(3, 10)
        }
      }

      if (sensorData.vital_data) {
        this.heartRate = sensorData.vital_data.heart_rate || 0
        this.spo2 = sensorData.vital_data.spo2 || 0
        this.heartRateValid = sensorData.vital_data.hr_valid || false
        this.spo2Valid = sensorData.vital_data.spo2_valid || false
        this.checkVitalWarning()
      }

      if (sensorData.environment_data) {
        this.temperature = sensorData.environment_data.temperature || 0
        this.humidity = sensorData.environment_data.humidity || 0
        this.tempValid = sensorData.environment_data.temp_valid || false
        this.humValid = sensorData.environment_data.hum_valid || false
      }

      if (sensorData.system_status) {
        this.ledStatus = sensorData.system_status.led_status || '关闭'
        this.buzzerStatus = sensorData.system_status.buzzer_status || '关闭'
        this.abnormalCount = sensorData.system_status.abnormal_count || 0
        this.rssi = sensorData.system_status.rssi || -99
      }
    },

    checkPostureWarning() {
      console.log('checkPostureWarning 被调用，isAbnormal=', this.isAbnormal, 'postureLevel=', this.postureLevel)
      if (this.isAbnormal) {
        this.hasWarning = true
        this.warningLevel = this.postureLevel
        const levels = ['', '轻度', '中度', '重度']
        this.warningMessage = `检测到${levels[this.warningLevel]}体态异常：${this.postureDetail}`

        const durations = [0, 1, 3, 5]
        console.log('发送体态异常指令，level=', this.postureLevel, 'duration=', durations[this.postureLevel])
        this.sendAlertCommand(this.postureLevel, durations[this.postureLevel])
      }
    },

    checkVitalWarning() {
      if (this.heartRateValid) {
        if (this.heartRate < this.thresholds.hrMin) {
          this.hasWarning = true
          this.warningLevel = Math.max(this.warningLevel, 2)
          this.warningMessage = `心率过低：${this.heartRate} BPM`
        } else if (this.heartRate > this.thresholds.hrMax) {
          this.hasWarning = true
          this.warningLevel = Math.max(this.warningLevel, 2)
          this.warningMessage = `心率过高：${this.heartRate} BPM`
        }
      }
      if (this.spo2Valid && this.spo2 < this.thresholds.spo2Min) {
        this.hasWarning = true
        this.warningLevel = Math.max(this.warningLevel, 3)
        this.warningMessage = `血氧过低：${this.spo2}%`
      }
    },

    // 双通道发送指令
    sendAlertCommand(level, duration = 0) {
      if (this.deviceIp && typeof uni.createUDPSocket === 'function') {
        this.sendAlertViaUDP(level, duration)
      } else {
        this.sendAlertViaWebSocket(level, duration)
      }
    },

    sendAlertViaUDP(level, duration) {
      const message = JSON.stringify({
        type: 'alert',
        level: level,
        duration: duration,
        timestamp: Date.now()
      })
      console.log('尝试UDP发送到', this.deviceIp, '端口8889，消息:', message)
      try {
        const udp = uni.createUDPSocket()
        udp.bind()
        udp.send({
          address: this.deviceIp,
          port: 8889,
          message: message,
          success: () => {
            console.log('📤 UDP报警指令发送成功，level=' + level + ', duration=' + duration)
          },
          fail: (err) => {
            console.error('UDP发送失败，尝试WebSocket发送:', err)
            this.sendAlertViaWebSocket(level, duration)
          },
          complete: () => udp.close()
        })
      } catch (e) {
        console.error('UDP异常，尝试WebSocket发送:', e)
        this.sendAlertViaWebSocket(level, duration)
      }
    },

    sendAlertViaWebSocket(level, duration) {
      if (this.connectionStatus !== 'connected' || !this.ws) {
        console.warn('WebSocket未连接，无法发送指令')
        return
      }
      const message = JSON.stringify({
        type: 'app_alert',
        level: level,
        duration: duration,
        targetDevice: this.deviceId,
        timestamp: Date.now()
      })
      this.ws.send({
        data: message,
        success: () => {
          console.log('📤 WebSocket报警指令已发送，level=' + level + ', duration=' + duration)
        },
        fail: (err) => {
          console.error('WebSocket发送失败:', err)
        }
      })
    },

    sendStopAlert() {
      if (this.deviceIp && typeof uni.createUDPSocket === 'function') {
        const message = JSON.stringify({ type: 'stop_alert' })
        const udp = uni.createUDPSocket()
        udp.bind()
        udp.send({
          address: this.deviceIp,
          port: 8889,
          message: message,
          success: () => console.log('📤 UDP停止指令已发送'),
          fail: (err) => console.error('UDP停止失败:', err),
          complete: () => udp.close()
        })
      }
      if (this.connectionStatus === 'connected' && this.ws) {
        this.ws.send({
          data: JSON.stringify({ type: 'app_alert', level: 0, duration: 0 }),
          fail: (err) => console.error('WebSocket停止失败:', err)
        })
      }
    },

    disconnect() {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      if (this.timeoutTimer) clearInterval(this.timeoutTimer)
      this.stopHeartbeat() // 停止心跳
    },

    scheduleReconnect(delay = 3000) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => {
        if (this.connectionStatus !== 'connected') {
          console.log('🔄 自动重连...')
          this.connectToServer()
        }
      }, delay)
    },

    reconnect() {
      if (this.connectionStatus === 'connecting') {
        uni.showToast({ title: '正在连接中...', icon: 'none' })
        return
      }
      uni.showLoading({ title: '重新连接中...' })
      this.disconnect()
      this.connectToServer()
      setTimeout(() => uni.hideLoading(), 2000)
    },

    sendTestCommand() {
      if (this.ws && this.connectionStatus === 'connected') {
        this.ws.send({
          data: JSON.stringify({ type: 'ping', timestamp: Date.now(), from: 'health-monitor-app' }),
          success: () => uni.showToast({ title: '测试命令已发送', icon: 'success' }),
          fail: (error) => {
            console.error('发送失败:', error)
            uni.showToast({ title: '发送失败', icon: 'none' })
          }
        })
      } else {
        uni.showToast({ title: '请先连接服务器', icon: 'none' })
      }
    },

    refreshData() {
      if (this.connectionStatus === 'connected') this.sendTestCommand()
      else this.reconnect()
    },

    handleAcknowledge() {
      this.hasWarning = false
      this.warningMessage = ''
      this.warningLevel = 0
      this.sendStopAlert()
    },

    acknowledgeFall() {
      this.fallDetected = false
      this.hasWarning = false
      this.sendStopAlert()
      uni.showToast({ title: '已确认', icon: 'success' })
    },

    ignoreFall() {
      this.fallDetected = false
      this.hasWarning = false
      this.sendStopAlert()
      uni.showToast({ title: '已忽略', icon: 'none' })
    },

    getStatusText() {
      const map = { 
        disconnected: '未连接', 
        connecting: '连接中...', 
        connected: '已连接', 
        error: '连接错误',
        no_data: '无数据' 
      }
      return map[this.connectionStatus] || '未知状态'
    },

    getPostureAlertClass() {
      if (!this.isAbnormal) return 'alert-normal'
      switch (this.postureLevel) {
        case 1: return 'alert-warning'
        case 2: return 'alert-caution'
        case 3: return 'alert-danger'
        default: return 'alert-normal'
      }
    },

    getHeartRateStatus() {
      if (!this.heartRateValid) return '无效'
      if (this.heartRate < this.thresholds.hrMin) return '过低'
      if (this.heartRate > this.thresholds.hrMax) return '过高'
      return '正常'
    },

    getHeartRateStatusClass() {
      if (!this.heartRateValid) return 'status-invalid'
      if (this.heartRate < this.thresholds.hrMin || this.heartRate > this.thresholds.hrMax) return 'status-warning'
      return 'status-normal'
    },

    getSpo2Status() {
      if (!this.spo2Valid) return '无效'
      if (this.spo2 < this.thresholds.spo2Min) return '过低'
      return '正常'
    },

    getSpo2StatusClass() {
      if (!this.spo2Valid) return 'status-invalid'
      if (this.spo2 < this.thresholds.spo2Min) return 'status-warning'
      return 'status-normal'
    },

    getWarningLevelText() {
      const levels = ['', '轻度预警', '中度预警', '重度预警']
      return levels[this.warningLevel] || ''
    },

    getSignalBars() {
      if (this.rssi >= -50) return 5
      if (this.rssi >= -60) return 4
      if (this.rssi >= -70) return 3
      if (this.rssi >= -80) return 2
      return 1
    }
  }
}
</script>

<style scoped>
/* 样式保持不变，完全使用原 index.vue 中的样式 */
.page-container {
  padding: 20rpx;
  background: linear-gradient(180deg, #f5f7fa 0%, #e4e7ec 100%);
  min-height: 100vh;
  padding-bottom: 160rpx;
}

.connection-bar {
  background: white;
  border-radius: 16rpx;
  padding: 20rpx 30rpx;
  margin-bottom: 20rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.05);
}

.connection-bar.disconnected {
  background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
  color: white;
}

.connection-bar.connecting {
  background: linear-gradient(135deg, #FF9800, #FFB74D);
  color: white;
}

.connection-bar.connected {
  background: linear-gradient(135deg, #4CAF50, #66BB6A);
  color: white;
}

.connection-bar.error {
  background: linear-gradient(135deg, #F44336, #EF5350);
  color: white;
}

.connection-bar.no_data {
  background: linear-gradient(135deg, #9e9e9e, #bdbdbd);
  color: white;
}

.connection-info {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-right: 16rpx;
  background: white;
}

.connection-bar.connecting .status-dot {
  animation: blink 1s infinite;
}

.status-text {
  font-size: 28rpx;
  font-weight: 500;
}

.data-count {
  font-size: 24rpx;
  opacity: 0.9;
}

.quick-connect {
  background: rgba(255, 255, 255, 0.3);
  color: white;
  border-radius: 30rpx;
  padding: 8rpx 24rpx;
  font-size: 24rpx;
  border: none;
}

.card {
  background: white;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.05);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.card-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.wear-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.wear-badge {
  padding: 8rpx 24rpx;
  border-radius: 30rpx;
  font-size: 26rpx;
  font-weight: 500;
}

.wear-normal {
  background: #e8f5e9;
  color: #4CAF50;
}

.wear-warning {
  background: #fff3e0;
  color: #FF9800;
}

.wear-tip {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  padding: 16rpx;
  background: #f9f9f9;
  border-radius: 12rpx;
}

.fall-card {
  border-left: 8rpx solid #f44336;
  margin-bottom: 20rpx;
}
.fall-card.normal {
  border-left-color: #4CAF50;
}
.fall-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}
.fall-icon {
  font-size: 40rpx;
  margin-right: 12rpx;
}
.fall-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
}
.fall-badge {
  padding: 4rpx 16rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
  font-weight: 500;
}
.fall-badge.danger {
  background: #ffebee;
  color: #f44336;
}
.fall-badge.normal {
  background: #e8f5e9;
  color: #4CAF50;
}
.fall-content {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.fall-actions {
  display: flex;
  gap: 20rpx;
}
.fall-btn {
  flex: 1;
  padding: 20rpx;
  border-radius: 50rpx;
  font-size: 28rpx;
  font-weight: 500;
  border: none;
}
.fall-btn.confirm {
  background: #4a90e2;
  color: white;
}
.fall-btn.ignore {
  background: #f0f0f0;
  color: #666;
}

.alert-badge {
  padding: 8rpx 24rpx;
  border-radius: 30rpx;
  font-size: 26rpx;
  font-weight: 500;
}

.alert-normal {
  background: #e8f5e9;
  color: #4CAF50;
}

.alert-warning {
  background: #fff3e0;
  color: #FF9800;
}

.alert-caution {
  background: #fff3e0;
  color: #FF9800;
}

.alert-danger {
  background: #ffebee;
  color: #F44336;
}

.posture-indicator {
  margin-bottom: 24rpx;
}

.indicator-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4rpx;
  aspect-ratio: 1;
  background: #f5f5f5;
  border-radius: 16rpx;
  padding: 20rpx;
}

.grid-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8rpx;
  position: relative;
}

.grid-cell.active {
  background: #ffcdd2;
}

.center-cell {
  background: #e3f2fd;
  flex-direction: column;
}

.center-dot {
  width: 40rpx;
  height: 40rpx;
  background: #2196F3;
  border-radius: 50%;
  margin-bottom: 16rpx;
}

.angle-display {
  font-size: 24rpx;
  color: #2196F3;
  font-weight: bold;
}

.direction-label {
  font-size: 22rpx;
  color: #666;
}

.posture-detail {
  display: flex;
  justify-content: space-between;
  background: #f9f9f9;
  padding: 20rpx;
  border-radius: 12rpx;
}

.detail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.detail-label {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.detail-value {
  font-size: 28rpx;
  font-weight: bold;
}

.time-display {
  font-size: 26rpx;
  color: #666;
}

.vital-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.vital-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30rpx 20rpx;
  background: #f9f9f9;
  border-radius: 16rpx;
}

.vital-icon {
  font-size: 60rpx;
  margin-bottom: 16rpx;
}

.vital-label {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.vital-value {
  font-size: 40rpx;
  font-weight: bold;
  color: #2196F3;
  margin-bottom: 8rpx;
}

.vital-status {
  font-size: 24rpx;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}

.status-normal {
  background: #e8f5e9;
  color: #4CAF50;
}

.status-warning {
  background: #fff3e0;
  color: #FF9800;
}

.status-invalid {
  background: #f5f5f5;
  color: #9e9e9e;
}

.environment-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.env-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30rpx 20rpx;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-radius: 16rpx;
}

.env-icon {
  font-size: 60rpx;
  margin-bottom: 16rpx;
}

.env-label {
  font-size: 26rpx;
  color: #1565C0;
  margin-bottom: 8rpx;
}

.env-value {
  font-size: 36rpx;
  font-weight: bold;
  color: #0D47A1;
}

.warning-card {
  border: 2rpx solid #FF9800;
  animation: pulse 2s infinite;
}

.warning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.warning-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #FF9800;
}

.warning-level {
  font-size: 26rpx;
  font-weight: bold;
  color: #F44336;
}

.warning-content {
  font-size: 28rpx;
  color: #333;
  margin-bottom: 24rpx;
  line-height: 1.5;
}

.warning-actions {
  display: flex;
  justify-content: center;
}

.warning-btn {
  background: #FF9800;
  color: white;
  border-radius: 50rpx;
  padding: 20rpx 60rpx;
  font-size: 28rpx;
  font-weight: 500;
}

.action-buttons {
  position: fixed;
  bottom: 40rpx;
  left: 20rpx;
  right: 20rpx;
  display: flex;
  gap: 20rpx;
  z-index: 1000;
}

.action-btn {
  flex: 1;
  background: white;
  border-radius: 50rpx;
  padding: 24rpx;
  font-size: 28rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  border: 2rpx solid #e0e0e0;
  box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.1);
}

.action-btn.reconnect {
  background: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

.action-btn.test {
  background: #FF9800;
  color: white;
  border-color: #FF9800;
}

.action-btn.refresh {
  background: #f0f0f0;
  color: #333;
}

.btn-icon {
  font-size: 32rpx;
}

.server-config-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 20rpx;
  width: 80%;
  max-width: 600rpx;
  box-shadow: 0 20rpx 60rpx rgba(0,0,0,0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 30rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.modal-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.modal-close {
  background: none;
  border: none;
  font-size: 36rpx;
  color: #999;
  padding: 10rpx;
}

.modal-body {
  padding: 30rpx;
}

.config-item {
  margin-bottom: 30rpx;
}

.config-label {
  display: block;
  font-size: 28rpx;
  color: #666;
  margin-bottom: 10rpx;
}

.config-input {
  width: 100%;
  padding: 24rpx;
  background: #f9f9f9;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  border: 2rpx solid #e0e0e0;
}

.config-tip {
  background: #e3f2fd;
  padding: 20rpx;
  border-radius: 8rpx;
  margin-top: 20rpx;
}

.config-tip text {
  display: block;
  font-size: 24rpx;
  color: #1565C0;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.modal-footer {
  display: flex;
  padding: 30rpx;
  border-top: 1rpx solid #f0f0f0;
  gap: 20rpx;
}

.modal-btn {
  flex: 1;
  padding: 24rpx;
  border-radius: 50rpx;
  font-size: 28rpx;
  font-weight: 500;
  border: none;
}

.modal-btn.cancel {
  background: #f0f0f0;
  color: #333;
}

.modal-btn.save {
  background: #4a90e2;
  color: white;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.4); }
  70% { box-shadow: 0 0 0 20rpx rgba(255, 152, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
}

@media (max-width: 750rpx) {
  .page-container {
    padding: 15rpx;
  }
  
  .action-buttons {
    bottom: 30rpx;
    left: 15rpx;
    right: 15rpx;
  }
  
  .action-btn {
    padding: 20rpx;
    font-size: 26rpx;
  }
}
</style>
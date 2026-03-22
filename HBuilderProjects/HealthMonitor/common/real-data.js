/**
 * ESP32健康监测系统 - 数据通信模块
 * 作者：潘文芳
 * 版本：v1.3.2 (增强调试日志)
 */

// WebSocket连接管理器
// WebSocket连接管理器（修复版）
class WebSocketManager {
  constructor() {
    this.ws = null;               // 保存socket实例（用于后续操作）
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.messageHandlers = new Set();
    this.connectionState = 'disconnected';
    this.serverAddress = 'ws://10.253.88.78:8080';
    this.dataHistory = [];
    this.maxHistory = 100;
    this.reconnectCount = 0;       // 重连计数，防止无限重连
    this.maxReconnectCount = 10;    // 最大重连次数
  }

  // 初始化连接
  init(serverAddress = null) {
    if (serverAddress) {
      this.serverAddress = serverAddress;
    }
    this.loadHistory();
    setTimeout(() => {
      this.connect();
    }, 1000);
  }

  // 连接到服务器（关键修复点）
  connect() {
    // 如果已有连接，先彻底销毁
    this.destroySocket();

    console.log(`🔗 连接到服务器: ${this.serverAddress}`);
    this.updateState('connecting');

    try {
      // 使用 uni.connectSocket 代替 new WebSocket
      const socketTask = uni.connectSocket({
        url: this.serverAddress,
        success: () => {
          console.log('✅ connectSocket成功回调');
          // 注意：这里只是表示连接指令发送成功，不代表连接已建立
          // 真正的连接成功在 onOpen 中处理
        },
        fail: (error) => {
          console.error('❌ connectSocket失败:', error);
          this.updateState('error');
          this.scheduleReconnect();
        }
      });

      // 保存 socketTask 供后续使用
      this.ws = socketTask;

      // 监听连接打开
      socketTask.onOpen(() => {
        console.log('✅ WebSocket连接已打开');
        this.updateState('connected');
        this.clearReconnectTimer();
        this.reconnectCount = 0;   // 重置重连计数

        // 发送连接确认
        this.send({
          type: 'handshake',
          client: 'health-monitor-app',
          version: '1.3.3',
          timestamp: Date.now()
        });
      });

      // 监听消息
      socketTask.onMessage((res) => {
        this.handleMessage(res.data);
      });

      // 监听错误
      socketTask.onError((error) => {
        console.error('❌ WebSocket错误:', error);
        this.updateState('error');
        this.scheduleReconnect();
      });

      // 监听关闭
      socketTask.onClose(() => {
        console.log('🔌 WebSocket连接关闭');
        this.updateState('disconnected');
        this.scheduleReconnect();
      });

    } catch (error) {
      console.error('创建WebSocket异常:', error);
      this.updateState('error');
      this.scheduleReconnect();
    }
  }

  // 彻底销毁旧连接（取消所有监听并关闭）
  destroySocket() {
    if (this.ws) {
      try {
        // 移除所有监听器（防止内存泄漏）
        this.ws.onOpen = null;
        this.ws.onMessage = null;
        this.ws.onError = null;
        this.ws.onClose = null;
        this.ws.close();
      } catch (e) {
        console.log('关闭旧连接失败', e);
      } finally {
        this.ws = null;
      }
    }
    this.clearReconnectTimer();
  }

  // 断开连接（供外部调用）
  disconnect() {
    this.destroySocket();
    this.updateState('disconnected');
  }

  // 发送数据
  send(data) {
    if (this.ws && this.connectionState === 'connected') {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send({
        data: message,
        success: () => {
          console.log('📤 发送成功:', data.type || '未知类型');
        },
        fail: (err) => {
          console.error('📤 发送失败:', err);
        }
      });
      return true;
    }
    console.warn('无法发送数据: WebSocket未连接');
    return false;
  }

  // 处理消息（与之前相同，略）
  handleMessage(data) {
    try {
      const parsedData = JSON.parse(data);
      console.log('📨 收到消息类型:', parsedData.type);
      
      if (parsedData.type === 'sensor_data' && parsedData.data) {
        console.log('💾 存入历史 (格式1)');
        this.addToHistory(parsedData.data);
      } else if (
        parsedData.posture_data ||
        parsedData.vital_data ||
        parsedData.environment_data ||
        parsedData.wear_status ||
        parsedData.fall_detected !== undefined
      ) {
        console.log('💾 存入历史 (格式2)');
        this.addToHistory(parsedData);
      } else {
        console.log('⏭️ 消息未存入历史（非传感器数据）');
      }
      
      this.messageHandlers.forEach(handler => {
        try {
          handler(parsedData);
        } catch (error) {
          console.error('消息处理器错误:', error);
        }
      });
      
    } catch (error) {
      console.log('收到非JSON消息:', data);
    }
  }

  // 添加消息处理器
  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  // 添加数据到历史记录
  addToHistory(data) {
    if (!data || typeof data !== 'object') {
      console.warn('⚠️ addToHistory 收到无效数据:', data);
      return;
    }
    
    const historyItem = {
      ...data,
      _timestamp: Date.now(),
      _id: `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.dataHistory.unshift(historyItem);
    console.log(`✅ 数据已存入历史，当前历史条数: ${this.dataHistory.length}`);
    
    if (this.dataHistory.length > this.maxHistory) {
      this.dataHistory = this.dataHistory.slice(0, this.maxHistory);
    }
    
    this.saveHistory();
  }

  // 获取历史数据
  getHistory(limit = 50) {
    console.log(`📋 获取历史数据，返回 ${Math.min(limit, this.dataHistory.length)} 条`);
    return this.dataHistory.slice(0, limit);
  }

  // 获取统计信息
  getStatistics() {
    const heartRates = this.dataHistory
      .filter(item => item.vital_data?.heart_rate > 0)
      .map(item => item.vital_data.heart_rate);
    
    const spo2Values = this.dataHistory
      .filter(item => item.vital_data?.spo2 > 0)
      .map(item => item.vital_data.spo2);
    
    const abnormalCount = this.dataHistory
      .filter(item => item.posture_data?.is_abnormal)
      .length;
    
    return {
      totalCount: this.dataHistory.length,
      heartRate: {
        average: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0,
        min: heartRates.length ? Math.min(...heartRates) : 0,
        max: heartRates.length ? Math.max(...heartRates) : 0
      },
      spo2: {
        average: spo2Values.length ? Math.round(spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length) : 0,
        min: spo2Values.length ? Math.min(...spo2Values) : 0,
        max: spo2Values.length ? Math.max(...spo2Values) : 0
      },
      abnormalCount: abnormalCount
    };
  }

  // 保存历史记录到本地存储
  saveHistory() {
    try {
      const saveData = this.dataHistory.slice(0, 50);
      uni.setStorageSync('sensor_data_history', saveData);
      console.log('💾 历史数据已保存到本地，数量:', saveData.length);
    } catch (error) {
      console.error('保存历史数据失败:', error);
    }
  }

  // 从本地存储加载历史记录
  loadHistory() {
    try {
      const savedData = uni.getStorageSync('sensor_data_history') || [];
      this.dataHistory = savedData;
      console.log('📂 从本地加载历史数据，数量:', savedData.length);
    } catch (error) {
      console.error('加载历史数据失败:', error);
    }
  }

  // 清除历史记录
  clearHistory() {
    this.dataHistory = [];
    uni.removeStorageSync('sensor_data_history');
    console.log('🗑️ 历史数据已清除');
  }

  // 更新连接状态
  updateState(state) {
    this.connectionState = state;
    uni.$emit('websocket_state_change', state);
    uni.setStorageSync('last_connection_state', state);
  }

  // 获取连接状态
  getState() {
    return this.connectionState;
  }

  // 获取服务器地址
  getServerAddress() {
    return this.serverAddress;
  }

  // 设置服务器地址
  setServerAddress(address) {
    this.serverAddress = address;
    uni.setStorageSync('server_address', address);
    console.log('📝 服务器地址已更新:', address);
  }

  // 安排重连（增加重连次数限制）
  scheduleReconnect() {
    this.clearReconnectTimer();
    
    // 如果已经连接，就不需要重连
    if (this.connectionState === 'connected') return;

    // 重连次数限制，防止无限循环
    this.reconnectCount++;
    if (this.reconnectCount > this.maxReconnectCount) {
      console.log('重连次数过多，停止重连');
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.connectionState !== 'connected') {
        console.log('🔄 自动重连...');
        this.connect();
      }
    }, this.reconnectInterval);
  }

  // 清理重连定时器
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // 测试连接
  testConnection() {
    return new Promise((resolve) => {
      if (this.connectionState !== 'connected') {
        resolve({ success: false, message: '未连接服务器' });
        return;
      }
      
      const testId = Date.now();
      const timeout = setTimeout(() => {
        resolve({ success: false, message: '测试超时' });
      }, 3000);
      
      const unsubscribe = this.onMessage((data) => {
        if (data.type === 'pong' && data.testId === testId) {
          clearTimeout(timeout);
          unsubscribe();
          resolve({ 
            success: true, 
            message: '连接正常',
            latency: Date.now() - testId
          });
        }
      });
      
      this.send({
        type: 'ping',
        testId: testId,
        timestamp: Date.now()
      });
    });
  }
}
// 数据解析器
class DataParser {
  constructor() {
    this.validationRules = {
      heartRate: { min: 30, max: 200 },
      spo2: { min: 70, max: 100 },
      temperature: { min: 0, max: 50 },
      humidity: { min: 20, max: 90 },
      pitch: { min: -90, max: 90 },
      roll: { min: -180, max: 180 }
    };
  }

  // 解析传感器数据
  parseSensorData(rawData) {
    try {
      // 基础数据验证
      if (!rawData || typeof rawData !== 'object') {
        throw new Error('无效的数据格式');
      }
      
      // 提取数据
      const data = {
        // 元数据
        deviceId: rawData.device_id || 'ESP32-Health-Monitor',
        timestamp: rawData.timestamp || Date.now(),
        time: rawData.time || new Date().toLocaleString(),
        
        // 佩戴状态
        wearStatus: {
          isWorn: rawData.wear_status?.is_worn || false,
          description: rawData.wear_status?.description || '未知'
        },
        
        // 体态数据
        posture: {
          pitch: parseFloat(rawData.posture_data?.pitch) || 0,
          roll: parseFloat(rawData.posture_data?.roll) || 0,
          status: rawData.posture_data?.status || '正常',
          detail: rawData.posture_data?.detail || '',
          level: parseInt(rawData.posture_data?.level) || 0,
          isAbnormal: rawData.posture_data?.is_abnormal || false,
          threshold: rawData.posture_data?.threshold || 15
        },
        
        // 生理数据
        vital: {
          heartRate: parseInt(rawData.vital_data?.heart_rate) || 0,
          spo2: parseInt(rawData.vital_data?.spo2) || 0,
          hrValid: rawData.vital_data?.hr_valid || false,
          spo2Valid: rawData.vital_data?.spo2_valid || false
        },
        
        // 环境数据
        environment: {
          temperature: parseFloat(rawData.environment_data?.temperature) || 0,
          humidity: parseFloat(rawData.environment_data?.humidity) || 0,
          tempValid: rawData.environment_data?.temp_valid || false,
          humValid: rawData.environment_data?.hum_valid || false
        },
        
        // 系统状态
        system: {
          battery: parseInt(rawData.system_status?.battery) || 85,
          rssi: parseInt(rawData.system_status?.rssi) || -50,
          dataCount: parseInt(rawData.system_status?.data_count) || 0,
          abnormalCount: parseInt(rawData.system_status?.abnormal_count) || 0,
          ledStatus: rawData.system_status?.led_status || '关闭',
          buzzerStatus: rawData.system_status?.buzzer_status || '关闭'
        },
        
        // 网络信息
        network: {
          targetIp: rawData.network_info?.target_ip || '',
          targetPort: rawData.network_info?.target_port || 0,
          localIp: rawData.network_info?.local_ip || '未知'
        },
        
        // 原始数据（用于调试）
        raw: rawData
      };
      
      // 数据验证
      const validation = this.validateData(data);
      data.valid = validation.valid;
      data.validationErrors = validation.errors;
      
      return data;
      
    } catch (error) {
      console.error('数据解析失败:', error);
      return null;
    }
  }

  // 验证数据有效性
  validateData(data) {
    const errors = [];
    let valid = true;
    
    // 心率验证
    if (data.vital.heartRate > 0) {
      const rule = this.validationRules.heartRate;
      if (data.vital.heartRate < rule.min || data.vital.heartRate > rule.max) {
        errors.push(`心率超出范围: ${data.vital.heartRate}BPM`);
        valid = false;
      }
    }
    
    // 血氧验证
    if (data.vital.spo2 > 0) {
      const rule = this.validationRules.spo2;
      if (data.vital.spo2 < rule.min) {
        errors.push(`血氧过低: ${data.vital.spo2}%`);
        valid = false;
      }
    }
    
    // 温度验证
    if (data.environment.temperature > 0) {
      const rule = this.validationRules.temperature;
      if (data.environment.temperature < rule.min || data.environment.temperature > rule.max) {
        errors.push(`温度异常: ${data.environment.temperature}°C`);
        valid = false;
      }
    }
    
    // 体态验证
    if (Math.abs(data.posture.pitch) > 45) {
      errors.push(`俯仰角异常: ${data.posture.pitch}°`);
      valid = false;
    }
    
    return { valid, errors };
  }

  // 格式化数据显示
  formatDisplayData(parsedData) {
    if (!parsedData) return null;
    
    return {
      // 基础信息
      time: parsedData.time.split(' ')[1] || '--:--:--',
      date: parsedData.time.split(' ')[0] || '--',
      
      // 佩戴状态
      wearStatus: parsedData.wearStatus.isWorn ? '✅ 已佩戴' : '❌ 未佩戴',
      wearClass: parsedData.wearStatus.isWorn ? 'normal' : 'warning',
      
      // 体态数据
      posture: {
        pitch: `${parsedData.posture.pitch.toFixed(1)}°`,
        roll: `${parsedData.posture.roll.toFixed(1)}°`,
        status: parsedData.posture.status,
        detail: parsedData.posture.detail,
        level: parsedData.posture.level,
        isAbnormal: parsedData.posture.isAbnormal,
        alertClass: this.getPostureAlertClass(parsedData.posture.level)
      },
      
      // 生理数据
      vital: {
        heartRate: parsedData.vital.hrValid ? `${parsedData.vital.heartRate} BPM` : '-- BPM',
        spo2: parsedData.vital.spo2Valid ? `${parsedData.vital.spo2}%` : '-- %',
        heartRateClass: this.getVitalStatusClass('heartRate', parsedData.vital.heartRate),
        spo2Class: this.getVitalStatusClass('spo2', parsedData.vital.spo2)
      },
      
      // 环境数据
      environment: {
        temperature: parsedData.environment.tempValid ? `${parsedData.environment.temperature.toFixed(1)}°C` : '-- °C',
        humidity: parsedData.environment.humValid ? `${parsedData.environment.humidity.toFixed(1)}%` : '-- %'
      },
      
      // 硬件状态
      hardware: {
        ledStatus: parsedData.system.ledStatus,
        buzzerStatus: parsedData.system.buzzerStatus,
        abnormalCount: parsedData.system.abnormalCount,
        battery: `${parsedData.system.battery}%`,
        rssi: parsedData.system.rssi
      }
    };
  }

  // 获取体态预警样式类
  getPostureAlertClass(level) {
    switch(level) {
      case 1: return 'alert-warning';
      case 2: return 'alert-caution';
      case 3: return 'alert-danger';
      default: return 'alert-normal';
    }
  }

  // 获取生理参数状态样式类
  getVitalStatusClass(type, value) {
    if (value <= 0) return 'status-invalid';
    
    const rules = this.validationRules[type];
    if (!rules) return 'status-normal';
    
    if (value < rules.min || value > rules.max) {
      return 'status-warning';
    }
    
    return 'status-normal';
  }

  // 获取信号强度
  getSignalStrength(rssi) {
    if (rssi >= -50) return 5;
    if (rssi >= -60) return 4;
    if (rssi >= -70) return 3;
    if (rssi >= -80) return 2;
    if (rssi >= -90) return 1;
    return 0;
  }

  // 获取电池状态
  getBatteryStatus(battery) {
    if (battery >= 80) return { level: 'high', color: '#4CAF50' };
    if (battery >= 40) return { level: 'medium', color: '#FF9800' };
    return { level: 'low', color: '#F44336' };
  }
}

// 预警管理器
class AlertManager {
  constructor() {
    this.alerts = [];
    this.maxAlerts = 50;
    this.currentAlert = null;
    this.alertConfig = {
      posture: {
        levels: {
          1: { name: '轻度', color: '#FF9800', sound: 'mild' },
          2: { name: '中度', color: '#FF5722', sound: 'moderate' },
          3: { name: '重度', color: '#F44336', sound: 'severe' }
        },
        thresholds: {
          pitch: 15,
          roll: 20
        }
      },
      heartRate: {
        min: 30,
        max: 200,
        levels: {
          low: { level: 2, name: '心率过低' },
          high: { level: 3, name: '心率过高' }
        }
      },
      spo2: {
        min: 70,
        levels: {
          low: { level: 3, name: '血氧过低' }
        }
      }
    };
  }

  // 检查数据并生成预警
  checkData(data) {
    const alerts = [];
    
    // 检查体态异常
    if (data.posture && data.posture.isAbnormal) {
      alerts.push(this.createPostureAlert(data.posture));
    }
    
    // 检查心率异常
    if (data.vital && data.vital.heartRate > 0) {
      if (data.vital.heartRate < this.alertConfig.heartRate.min) {
        alerts.push(this.createHeartRateAlert(data.vital.heartRate, 'low'));
      } else if (data.vital.heartRate > this.alertConfig.heartRate.max) {
        alerts.push(this.createHeartRateAlert(data.vital.heartRate, 'high'));
      }
    }
    
    // 检查血氧异常
    if (data.vital && data.vital.spo2 > 0 && data.vital.spo2 < this.alertConfig.spo2.min) {
      alerts.push(this.createSpo2Alert(data.vital.spo2));
    }
    
    // 处理所有预警
    alerts.forEach(alert => this.handleAlert(alert));
    
    return alerts;
  }

  // 创建体态预警
  createPostureAlert(postureData) {
    const levelConfig = this.alertConfig.posture.levels[postureData.level] || 
                       this.alertConfig.posture.levels[1];
    
    return {
      id: `posture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'posture',
      level: postureData.level,
      title: '体态异常预警',
      message: `检测到${levelConfig.name}体态异常：${postureData.detail}`,
      data: {
        pitch: postureData.pitch,
        roll: postureData.roll,
        level: postureData.level
      },
      timestamp: Date.now(),
      acknowledged: false,
      config: levelConfig
    };
  }

  // 创建心率预警
  createHeartRateAlert(heartRate, type) {
    const config = this.alertConfig.heartRate.levels[type];
    
    return {
      id: `heartrate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'heartrate',
      level: config.level,
      title: '心率异常预警',
      message: `${config.name}：${heartRate} BPM`,
      data: { heartRate, type },
      timestamp: Date.now(),
      acknowledged: false,
      config: { color: type === 'low' ? '#2196F3' : '#F44336' }
    };
  }

  // 创建血氧预警
  createSpo2Alert(spo2) {
    const config = this.alertConfig.spo2.levels.low;
    
    return {
      id: `spo2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'spo2',
      level: config.level,
      title: '血氧异常预警',
      message: `${config.name}：${spo2}%`,
      data: { spo2 },
      timestamp: Date.now(),
      acknowledged: false,
      config: { color: '#F44336' }
    };
  }

  // 处理预警
  handleAlert(alert) {
    // 添加到历史记录
    this.alerts.unshift(alert);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.pop();
    }
    
    // 设置当前预警
    this.currentAlert = alert;
    
    // 触发预警事件
    this.triggerAlert(alert);
    
    // 保存到本地存储
    this.saveAlerts();
    
    return alert;
  }

  // 触发预警事件
  triggerAlert(alert) {
    // 使用UniApp全局事件
    uni.$emit('health_alert', alert);
    
    // 震动提醒（如果可用）
    if (uni.vibrateShort) {
      const patterns = {
        1: { duration: 100 },
        2: { duration: 200 },
        3: { duration: 400 }
      };
      uni.vibrateShort(patterns[alert.level] || { duration: 100 });
    }
  }

  // 确认预警
  acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.currentAlert = null;
      this.saveAlerts();
    }
  }

  // 获取未确认的预警
  getUnacknowledgedAlerts() {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  // 获取预警统计
  getAlertStatistics(timeRange = 'day') {
    const now = Date.now();
    let timeLimit = now - 24 * 60 * 60 * 1000; // 默认24小时
    
    switch(timeRange) {
      case 'hour': timeLimit = now - 60 * 60 * 1000; break;
      case 'day': timeLimit = now - 24 * 60 * 60 * 1000; break;
      case 'week': timeLimit = now - 7 * 24 * 60 * 60 * 1000; break;
      case 'month': timeLimit = now - 30 * 24 * 60 * 60 * 1000; break;
    }
    
    const recentAlerts = this.alerts.filter(alert => alert.timestamp > timeLimit);
    
    return {
      total: recentAlerts.length,
      byType: recentAlerts.reduce((acc, alert) => {
        acc[alert.type] = (acc[alert.type] || 0) + 1;
        return acc;
      }, {}),
      byLevel: recentAlerts.reduce((acc, alert) => {
        acc[alert.level] = (acc[alert.level] || 0) + 1;
        return acc;
      }, {}),
      unacknowledged: recentAlerts.filter(alert => !alert.acknowledged).length
    };
  }

  // 保存预警到本地存储
  saveAlerts() {
    try {
      uni.setStorageSync('health_alerts', this.alerts);
    } catch (error) {
      console.error('保存预警数据失败:', error);
    }
  }

  // 从本地存储加载预警
  loadAlerts() {
    try {
      const savedAlerts = uni.getStorageSync('health_alerts') || [];
      this.alerts = savedAlerts;
    } catch (error) {
      console.error('加载预警数据失败:', error);
    }
  }

  // 清除所有预警
  clearAlerts() {
    this.alerts = [];
    this.currentAlert = null;
    uni.removeStorageSync('health_alerts');
  }
}

// 工具函数
export const utils = {
  // 格式化时间
  formatTime(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
    const date = new Date(timestamp);
    
    const pad = (n) => n.toString().padStart(2, '0');
    
    const replacements = {
      'YYYY': date.getFullYear(),
      'MM': pad(date.getMonth() + 1),
      'DD': pad(date.getDate()),
      'HH': pad(date.getHours()),
      'mm': pad(date.getMinutes()),
      'ss': pad(date.getSeconds())
    };
    
    return format.replace(/YYYY|MM|DD|HH|mm|ss/g, match => replacements[match]);
  },
  
  // 格式化数字
  formatNumber(num, decimals = 1) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return Number(num).toFixed(decimals);
  },
  
  // 计算角度颜色
  getAngleColor(angle, threshold = 15) {
    const absAngle = Math.abs(angle);
    if (absAngle <= threshold * 0.5) return '#4CAF50';
    if (absAngle <= threshold * 0.8) return '#FF9800';
    if (absAngle <= threshold) return '#FF5722';
    return '#F44336';
  },
  
  // 防抖函数
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  // 节流函数
  throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },
  
  // 生成唯一ID
  generateId(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },
  
  // 验证IP地址
  isValidIP(ip) {
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  },
  
  // 显示提示
  showToast(title, icon = 'none', duration = 2000) {
    uni.showToast({
      title,
      icon,
      duration
    });
  },
  
  // 显示加载
  showLoading(title = '加载中...') {
    uni.showLoading({
      title,
      mask: true
    });
  },
  
  // 隐藏加载
  hideLoading() {
    uni.hideLoading();
  }
};

// 创建单例实例
export const websocketManager = new WebSocketManager();
export const dataParser = new DataParser();
export const alertManager = new AlertManager();

// 初始化警报管理器
alertManager.loadAlerts();

// 导出默认对象
export default {
  websocketManager,
  dataParser,
  alertManager,
  utils,
  
  // 初始化函数
  init(serverAddress = null) {
    // 加载服务器地址
    try {
      const savedAddress = uni.getStorageSync('server_address');
      if (savedAddress) {
        websocketManager.setServerAddress(savedAddress);
      }
    } catch (error) {
      console.error('加载服务器地址失败:', error);
    }
    
    // 初始化WebSocket管理器
    websocketManager.init(serverAddress);
    
    console.log('✅ 数据通信模块初始化完成');
  },
  
  // 连接服务器
  connect() {
    websocketManager.connect();
  },
  
  // 断开连接
  disconnect() {
    websocketManager.disconnect();
  },
  
  // 获取连接状态
  getConnectionState() {
    return websocketManager.getState();
  },
  
  // 设置服务器地址
  setServerAddress(address) {
    websocketManager.setServerAddress(address);
  },
  
  // 获取服务器地址
  getServerAddress() {
    return websocketManager.getServerAddress();
  },
  
  // 发送数据
  send(data) {
    return websocketManager.send(data);
  },
  
  // 订阅消息
  onMessage(handler) {
    return websocketManager.onMessage(handler);
  },
  
  // 测试连接
  testConnection() {
    return websocketManager.testConnection();
  },
  
  // 获取历史数据
  getHistoryData(limit = 50) {
    return websocketManager.getHistory(limit);
  },
  
  // 获取统计数据
  getStatistics() {
    return websocketManager.getStatistics();
  },
  
  // 清除历史数据
  clearHistory() {
    websocketManager.clearHistory();
  },
  
  // 获取警报统计
  getAlertStatistics(timeRange = 'day') {
    return alertManager.getAlertStatistics(timeRange);
  },
  
  // 获取未确认警报
  getUnacknowledgedAlerts() {
    return alertManager.getUnacknowledgedAlerts();
  },
  
  // 确认警报
  acknowledgeAlert(alertId) {
    alertManager.acknowledgeAlert(alertId);
  },
  
  // 清除所有警报
  clearAlerts() {
    alertManager.clearAlerts();
  }
};
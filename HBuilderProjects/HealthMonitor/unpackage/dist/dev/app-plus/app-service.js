if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  function formatAppLog(type, filename, ...args) {
    if (uni.__log__) {
      uni.__log__(type, filename, ...args);
    } else {
      console[type].apply(console, [...args, filename]);
    }
  }
  class WebSocketManager {
    constructor() {
      this.ws = null;
      this.reconnectInterval = 5e3;
      this.reconnectTimer = null;
      this.messageHandlers = /* @__PURE__ */ new Set();
      this.connectionState = "disconnected";
      this.serverAddress = "ws://10.253.88.78:8080";
      this.dataHistory = [];
      this.maxHistory = 100;
      this.reconnectCount = 0;
      this.maxReconnectCount = 10;
    }
    // 初始化连接
    init(serverAddress = null) {
      if (serverAddress) {
        this.serverAddress = serverAddress;
      }
      this.loadHistory();
      setTimeout(() => {
        this.connect();
      }, 1e3);
    }
    // 连接到服务器（关键修复点）
    connect() {
      this.destroySocket();
      formatAppLog("log", "at common/real-data.js:39", `🔗 连接到服务器: ${this.serverAddress}`);
      this.updateState("connecting");
      try {
        const socketTask = uni.connectSocket({
          url: this.serverAddress,
          success: () => {
            formatAppLog("log", "at common/real-data.js:47", "✅ connectSocket成功回调");
          },
          fail: (error) => {
            formatAppLog("error", "at common/real-data.js:52", "❌ connectSocket失败:", error);
            this.updateState("error");
            this.scheduleReconnect();
          }
        });
        this.ws = socketTask;
        socketTask.onOpen(() => {
          formatAppLog("log", "at common/real-data.js:63", "✅ WebSocket连接已打开");
          this.updateState("connected");
          this.clearReconnectTimer();
          this.reconnectCount = 0;
          this.send({
            type: "handshake",
            client: "health-monitor-app",
            version: "1.3.3",
            timestamp: Date.now()
          });
        });
        socketTask.onMessage((res) => {
          this.handleMessage(res.data);
        });
        socketTask.onError((error) => {
          formatAppLog("error", "at common/real-data.js:84", "❌ WebSocket错误:", error);
          this.updateState("error");
          this.scheduleReconnect();
        });
        socketTask.onClose(() => {
          formatAppLog("log", "at common/real-data.js:91", "🔌 WebSocket连接关闭");
          this.updateState("disconnected");
          this.scheduleReconnect();
        });
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:97", "创建WebSocket异常:", error);
        this.updateState("error");
        this.scheduleReconnect();
      }
    }
    // 彻底销毁旧连接（取消所有监听并关闭）
    destroySocket() {
      if (this.ws) {
        try {
          this.ws.onOpen = null;
          this.ws.onMessage = null;
          this.ws.onError = null;
          this.ws.onClose = null;
          this.ws.close();
        } catch (e) {
          formatAppLog("log", "at common/real-data.js:114", "关闭旧连接失败", e);
        } finally {
          this.ws = null;
        }
      }
      this.clearReconnectTimer();
    }
    // 断开连接（供外部调用）
    disconnect() {
      this.destroySocket();
      this.updateState("disconnected");
    }
    // 发送数据
    send(data) {
      if (this.ws && this.connectionState === "connected") {
        const message = typeof data === "string" ? data : JSON.stringify(data);
        this.ws.send({
          data: message,
          success: () => {
            formatAppLog("log", "at common/real-data.js:135", "📤 发送成功:", data.type || "未知类型");
          },
          fail: (err) => {
            formatAppLog("error", "at common/real-data.js:138", "📤 发送失败:", err);
          }
        });
        return true;
      }
      formatAppLog("warn", "at common/real-data.js:143", "无法发送数据: WebSocket未连接");
      return false;
    }
    // 处理消息（与之前相同，略）
    handleMessage(data) {
      try {
        const parsedData = JSON.parse(data);
        formatAppLog("log", "at common/real-data.js:151", "📨 收到消息类型:", parsedData.type);
        if (parsedData.type === "sensor_data" && parsedData.data) {
          formatAppLog("log", "at common/real-data.js:154", "💾 存入历史 (格式1)");
          this.addToHistory(parsedData.data);
        } else if (parsedData.posture_data || parsedData.vital_data || parsedData.environment_data || parsedData.wear_status || parsedData.fall_detected !== void 0) {
          formatAppLog("log", "at common/real-data.js:163", "💾 存入历史 (格式2)");
          this.addToHistory(parsedData);
        } else {
          formatAppLog("log", "at common/real-data.js:166", "⏭️ 消息未存入历史（非传感器数据）");
        }
        this.messageHandlers.forEach((handler) => {
          try {
            handler(parsedData);
          } catch (error) {
            formatAppLog("error", "at common/real-data.js:173", "消息处理器错误:", error);
          }
        });
      } catch (error) {
        formatAppLog("log", "at common/real-data.js:178", "收到非JSON消息:", data);
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
      if (!data || typeof data !== "object") {
        formatAppLog("warn", "at common/real-data.js:193", "⚠️ addToHistory 收到无效数据:", data);
        return;
      }
      const historyItem = {
        ...data,
        _timestamp: Date.now(),
        _id: `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      this.dataHistory.unshift(historyItem);
      formatAppLog("log", "at common/real-data.js:204", `✅ 数据已存入历史，当前历史条数: ${this.dataHistory.length}`);
      if (this.dataHistory.length > this.maxHistory) {
        this.dataHistory = this.dataHistory.slice(0, this.maxHistory);
      }
      this.saveHistory();
    }
    // 获取历史数据
    getHistory(limit = 50) {
      formatAppLog("log", "at common/real-data.js:215", `📋 获取历史数据，返回 ${Math.min(limit, this.dataHistory.length)} 条`);
      return this.dataHistory.slice(0, limit);
    }
    // 获取统计信息
    getStatistics() {
      const heartRates = this.dataHistory.filter((item) => {
        var _a;
        return ((_a = item.vital_data) == null ? void 0 : _a.heart_rate) > 0;
      }).map((item) => item.vital_data.heart_rate);
      const spo2Values = this.dataHistory.filter((item) => {
        var _a;
        return ((_a = item.vital_data) == null ? void 0 : _a.spo2) > 0;
      }).map((item) => item.vital_data.spo2);
      const abnormalCount = this.dataHistory.filter((item) => {
        var _a;
        return (_a = item.posture_data) == null ? void 0 : _a.is_abnormal;
      }).length;
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
        abnormalCount
      };
    }
    // 保存历史记录到本地存储
    saveHistory() {
      try {
        const saveData = this.dataHistory.slice(0, 50);
        uni.setStorageSync("sensor_data_history", saveData);
        formatAppLog("log", "at common/real-data.js:254", "💾 历史数据已保存到本地，数量:", saveData.length);
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:256", "保存历史数据失败:", error);
      }
    }
    // 从本地存储加载历史记录
    loadHistory() {
      try {
        const savedData = uni.getStorageSync("sensor_data_history") || [];
        this.dataHistory = savedData;
        formatAppLog("log", "at common/real-data.js:265", "📂 从本地加载历史数据，数量:", savedData.length);
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:267", "加载历史数据失败:", error);
      }
    }
    // 清除历史记录
    clearHistory() {
      this.dataHistory = [];
      uni.removeStorageSync("sensor_data_history");
      formatAppLog("log", "at common/real-data.js:275", "🗑️ 历史数据已清除");
    }
    // 更新连接状态
    updateState(state) {
      this.connectionState = state;
      uni.$emit("websocket_state_change", state);
      uni.setStorageSync("last_connection_state", state);
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
      uni.setStorageSync("server_address", address);
      formatAppLog("log", "at common/real-data.js:299", "📝 服务器地址已更新:", address);
    }
    // 安排重连（增加重连次数限制）
    scheduleReconnect() {
      this.clearReconnectTimer();
      if (this.connectionState === "connected")
        return;
      this.reconnectCount++;
      if (this.reconnectCount > this.maxReconnectCount) {
        formatAppLog("log", "at common/real-data.js:312", "重连次数过多，停止重连");
        return;
      }
      this.reconnectTimer = setTimeout(() => {
        if (this.connectionState !== "connected") {
          formatAppLog("log", "at common/real-data.js:318", "🔄 自动重连...");
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
        if (this.connectionState !== "connected") {
          resolve({ success: false, message: "未连接服务器" });
          return;
        }
        const testId = Date.now();
        const timeout = setTimeout(() => {
          resolve({ success: false, message: "测试超时" });
        }, 3e3);
        const unsubscribe = this.onMessage((data) => {
          if (data.type === "pong" && data.testId === testId) {
            clearTimeout(timeout);
            unsubscribe();
            resolve({
              success: true,
              message: "连接正常",
              latency: Date.now() - testId
            });
          }
        });
        this.send({
          type: "ping",
          testId,
          timestamp: Date.now()
        });
      });
    }
  }
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
      try {
        if (!rawData || typeof rawData !== "object") {
          throw new Error("无效的数据格式");
        }
        const data = {
          // 元数据
          deviceId: rawData.device_id || "ESP32-Health-Monitor",
          timestamp: rawData.timestamp || Date.now(),
          time: rawData.time || (/* @__PURE__ */ new Date()).toLocaleString(),
          // 佩戴状态
          wearStatus: {
            isWorn: ((_a = rawData.wear_status) == null ? void 0 : _a.is_worn) || false,
            description: ((_b = rawData.wear_status) == null ? void 0 : _b.description) || "未知"
          },
          // 体态数据
          posture: {
            pitch: parseFloat((_c = rawData.posture_data) == null ? void 0 : _c.pitch) || 0,
            roll: parseFloat((_d = rawData.posture_data) == null ? void 0 : _d.roll) || 0,
            status: ((_e = rawData.posture_data) == null ? void 0 : _e.status) || "正常",
            detail: ((_f = rawData.posture_data) == null ? void 0 : _f.detail) || "",
            level: parseInt((_g = rawData.posture_data) == null ? void 0 : _g.level) || 0,
            isAbnormal: ((_h = rawData.posture_data) == null ? void 0 : _h.is_abnormal) || false,
            threshold: ((_i = rawData.posture_data) == null ? void 0 : _i.threshold) || 15
          },
          // 生理数据
          vital: {
            heartRate: parseInt((_j = rawData.vital_data) == null ? void 0 : _j.heart_rate) || 0,
            spo2: parseInt((_k = rawData.vital_data) == null ? void 0 : _k.spo2) || 0,
            hrValid: ((_l = rawData.vital_data) == null ? void 0 : _l.hr_valid) || false,
            spo2Valid: ((_m = rawData.vital_data) == null ? void 0 : _m.spo2_valid) || false
          },
          // 环境数据
          environment: {
            temperature: parseFloat((_n = rawData.environment_data) == null ? void 0 : _n.temperature) || 0,
            humidity: parseFloat((_o = rawData.environment_data) == null ? void 0 : _o.humidity) || 0,
            tempValid: ((_p = rawData.environment_data) == null ? void 0 : _p.temp_valid) || false,
            humValid: ((_q = rawData.environment_data) == null ? void 0 : _q.hum_valid) || false
          },
          // 系统状态
          system: {
            battery: parseInt((_r = rawData.system_status) == null ? void 0 : _r.battery) || 85,
            rssi: parseInt((_s = rawData.system_status) == null ? void 0 : _s.rssi) || -50,
            dataCount: parseInt((_t = rawData.system_status) == null ? void 0 : _t.data_count) || 0,
            abnormalCount: parseInt((_u = rawData.system_status) == null ? void 0 : _u.abnormal_count) || 0,
            ledStatus: ((_v = rawData.system_status) == null ? void 0 : _v.led_status) || "关闭",
            buzzerStatus: ((_w = rawData.system_status) == null ? void 0 : _w.buzzer_status) || "关闭"
          },
          // 网络信息
          network: {
            targetIp: ((_x = rawData.network_info) == null ? void 0 : _x.target_ip) || "",
            targetPort: ((_y = rawData.network_info) == null ? void 0 : _y.target_port) || 0,
            localIp: ((_z = rawData.network_info) == null ? void 0 : _z.local_ip) || "未知"
          },
          // 原始数据（用于调试）
          raw: rawData
        };
        const validation = this.validateData(data);
        data.valid = validation.valid;
        data.validationErrors = validation.errors;
        return data;
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:455", "数据解析失败:", error);
        return null;
      }
    }
    // 验证数据有效性
    validateData(data) {
      const errors = [];
      let valid = true;
      if (data.vital.heartRate > 0) {
        const rule = this.validationRules.heartRate;
        if (data.vital.heartRate < rule.min || data.vital.heartRate > rule.max) {
          errors.push(`心率超出范围: ${data.vital.heartRate}BPM`);
          valid = false;
        }
      }
      if (data.vital.spo2 > 0) {
        const rule = this.validationRules.spo2;
        if (data.vital.spo2 < rule.min) {
          errors.push(`血氧过低: ${data.vital.spo2}%`);
          valid = false;
        }
      }
      if (data.environment.temperature > 0) {
        const rule = this.validationRules.temperature;
        if (data.environment.temperature < rule.min || data.environment.temperature > rule.max) {
          errors.push(`温度异常: ${data.environment.temperature}°C`);
          valid = false;
        }
      }
      if (Math.abs(data.posture.pitch) > 45) {
        errors.push(`俯仰角异常: ${data.posture.pitch}°`);
        valid = false;
      }
      return { valid, errors };
    }
    // 格式化数据显示
    formatDisplayData(parsedData) {
      if (!parsedData)
        return null;
      return {
        // 基础信息
        time: parsedData.time.split(" ")[1] || "--:--:--",
        date: parsedData.time.split(" ")[0] || "--",
        // 佩戴状态
        wearStatus: parsedData.wearStatus.isWorn ? "✅ 已佩戴" : "❌ 未佩戴",
        wearClass: parsedData.wearStatus.isWorn ? "normal" : "warning",
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
          heartRate: parsedData.vital.hrValid ? `${parsedData.vital.heartRate} BPM` : "-- BPM",
          spo2: parsedData.vital.spo2Valid ? `${parsedData.vital.spo2}%` : "-- %",
          heartRateClass: this.getVitalStatusClass("heartRate", parsedData.vital.heartRate),
          spo2Class: this.getVitalStatusClass("spo2", parsedData.vital.spo2)
        },
        // 环境数据
        environment: {
          temperature: parsedData.environment.tempValid ? `${parsedData.environment.temperature.toFixed(1)}°C` : "-- °C",
          humidity: parsedData.environment.humValid ? `${parsedData.environment.humidity.toFixed(1)}%` : "-- %"
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
      switch (level) {
        case 1:
          return "alert-warning";
        case 2:
          return "alert-caution";
        case 3:
          return "alert-danger";
        default:
          return "alert-normal";
      }
    }
    // 获取生理参数状态样式类
    getVitalStatusClass(type, value) {
      if (value <= 0)
        return "status-invalid";
      const rules = this.validationRules[type];
      if (!rules)
        return "status-normal";
      if (value < rules.min || value > rules.max) {
        return "status-warning";
      }
      return "status-normal";
    }
    // 获取信号强度
    getSignalStrength(rssi) {
      if (rssi >= -50)
        return 5;
      if (rssi >= -60)
        return 4;
      if (rssi >= -70)
        return 3;
      if (rssi >= -80)
        return 2;
      if (rssi >= -90)
        return 1;
      return 0;
    }
    // 获取电池状态
    getBatteryStatus(battery) {
      if (battery >= 80)
        return { level: "high", color: "#4CAF50" };
      if (battery >= 40)
        return { level: "medium", color: "#FF9800" };
      return { level: "low", color: "#F44336" };
    }
  }
  class AlertManager {
    constructor() {
      this.alerts = [];
      this.maxAlerts = 50;
      this.currentAlert = null;
      this.alertConfig = {
        posture: {
          levels: {
            1: { name: "轻度", color: "#FF9800", sound: "mild" },
            2: { name: "中度", color: "#FF5722", sound: "moderate" },
            3: { name: "重度", color: "#F44336", sound: "severe" }
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
            low: { level: 2, name: "心率过低" },
            high: { level: 3, name: "心率过高" }
          }
        },
        spo2: {
          min: 70,
          levels: {
            low: { level: 3, name: "血氧过低" }
          }
        }
      };
    }
    // 检查数据并生成预警
    checkData(data) {
      const alerts = [];
      if (data.posture && data.posture.isAbnormal) {
        alerts.push(this.createPostureAlert(data.posture));
      }
      if (data.vital && data.vital.heartRate > 0) {
        if (data.vital.heartRate < this.alertConfig.heartRate.min) {
          alerts.push(this.createHeartRateAlert(data.vital.heartRate, "low"));
        } else if (data.vital.heartRate > this.alertConfig.heartRate.max) {
          alerts.push(this.createHeartRateAlert(data.vital.heartRate, "high"));
        }
      }
      if (data.vital && data.vital.spo2 > 0 && data.vital.spo2 < this.alertConfig.spo2.min) {
        alerts.push(this.createSpo2Alert(data.vital.spo2));
      }
      alerts.forEach((alert) => this.handleAlert(alert));
      return alerts;
    }
    // 创建体态预警
    createPostureAlert(postureData) {
      const levelConfig = this.alertConfig.posture.levels[postureData.level] || this.alertConfig.posture.levels[1];
      return {
        id: `posture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "posture",
        level: postureData.level,
        title: "体态异常预警",
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
        type: "heartrate",
        level: config.level,
        title: "心率异常预警",
        message: `${config.name}：${heartRate} BPM`,
        data: { heartRate, type },
        timestamp: Date.now(),
        acknowledged: false,
        config: { color: type === "low" ? "#2196F3" : "#F44336" }
      };
    }
    // 创建血氧预警
    createSpo2Alert(spo2) {
      const config = this.alertConfig.spo2.levels.low;
      return {
        id: `spo2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "spo2",
        level: config.level,
        title: "血氧异常预警",
        message: `${config.name}：${spo2}%`,
        data: { spo2 },
        timestamp: Date.now(),
        acknowledged: false,
        config: { color: "#F44336" }
      };
    }
    // 处理预警
    handleAlert(alert) {
      this.alerts.unshift(alert);
      if (this.alerts.length > this.maxAlerts) {
        this.alerts.pop();
      }
      this.currentAlert = alert;
      this.triggerAlert(alert);
      this.saveAlerts();
      return alert;
    }
    // 触发预警事件
    triggerAlert(alert) {
      uni.$emit("health_alert", alert);
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
      const alert = this.alerts.find((a) => a.id === alertId);
      if (alert) {
        alert.acknowledged = true;
        this.currentAlert = null;
        this.saveAlerts();
      }
    }
    // 获取未确认的预警
    getUnacknowledgedAlerts() {
      return this.alerts.filter((alert) => !alert.acknowledged);
    }
    // 获取预警统计
    getAlertStatistics(timeRange = "day") {
      const now = Date.now();
      let timeLimit = now - 24 * 60 * 60 * 1e3;
      switch (timeRange) {
        case "hour":
          timeLimit = now - 60 * 60 * 1e3;
          break;
        case "day":
          timeLimit = now - 24 * 60 * 60 * 1e3;
          break;
        case "week":
          timeLimit = now - 7 * 24 * 60 * 60 * 1e3;
          break;
        case "month":
          timeLimit = now - 30 * 24 * 60 * 60 * 1e3;
          break;
      }
      const recentAlerts = this.alerts.filter((alert) => alert.timestamp > timeLimit);
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
        unacknowledged: recentAlerts.filter((alert) => !alert.acknowledged).length
      };
    }
    // 保存预警到本地存储
    saveAlerts() {
      try {
        uni.setStorageSync("health_alerts", this.alerts);
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:796", "保存预警数据失败:", error);
      }
    }
    // 从本地存储加载预警
    loadAlerts() {
      try {
        const savedAlerts = uni.getStorageSync("health_alerts") || [];
        this.alerts = savedAlerts;
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:806", "加载预警数据失败:", error);
      }
    }
    // 清除所有预警
    clearAlerts() {
      this.alerts = [];
      this.currentAlert = null;
      uni.removeStorageSync("health_alerts");
    }
  }
  const utils = {
    // 格式化时间
    formatTime(timestamp, format = "YYYY-MM-DD HH:mm:ss") {
      const date = new Date(timestamp);
      const pad = (n) => n.toString().padStart(2, "0");
      const replacements = {
        "YYYY": date.getFullYear(),
        "MM": pad(date.getMonth() + 1),
        "DD": pad(date.getDate()),
        "HH": pad(date.getHours()),
        "mm": pad(date.getMinutes()),
        "ss": pad(date.getSeconds())
      };
      return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => replacements[match]);
    },
    // 格式化数字
    formatNumber(num, decimals = 1) {
      if (num === null || num === void 0 || isNaN(num))
        return "--";
      return Number(num).toFixed(decimals);
    },
    // 计算角度颜色
    getAngleColor(angle, threshold = 15) {
      const absAngle = Math.abs(angle);
      if (absAngle <= threshold * 0.5)
        return "#4CAF50";
      if (absAngle <= threshold * 0.8)
        return "#FF9800";
      if (absAngle <= threshold)
        return "#FF5722";
      return "#F44336";
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
    generateId(prefix = "") {
      return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },
    // 验证IP地址
    isValidIP(ip) {
      const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      return ipRegex.test(ip);
    },
    // 显示提示
    showToast(title, icon = "none", duration = 2e3) {
      uni.showToast({
        title,
        icon,
        duration
      });
    },
    // 显示加载
    showLoading(title = "加载中...") {
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
  const websocketManager = new WebSocketManager();
  const dataParser = new DataParser();
  const alertManager = new AlertManager();
  alertManager.loadAlerts();
  const realData = {
    websocketManager,
    dataParser,
    alertManager,
    utils,
    // 初始化函数
    init(serverAddress = null) {
      try {
        const savedAddress = uni.getStorageSync("server_address");
        if (savedAddress) {
          websocketManager.setServerAddress(savedAddress);
        }
      } catch (error) {
        formatAppLog("error", "at common/real-data.js:936", "加载服务器地址失败:", error);
      }
      websocketManager.init(serverAddress);
      formatAppLog("log", "at common/real-data.js:942", "✅ 数据通信模块初始化完成");
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
    getAlertStatistics(timeRange = "day") {
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
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _sfc_main$3 = {
    data() {
      return {
        connectionStatus: "disconnected",
        serverAddress: "ws://10.253.88.78:8080",
        serverAddressInput: "ws://10.253.88.78:8080",
        showServerConfig: false,
        dataCount: 0,
        ws: null,
        reconnectTimer: null,
        timeoutTimer: null,
        // 数据超时定时器
        heartbeatTimer: null,
        // 心跳定时器（新增）
        lastDataTimestamp: 0,
        // 最后一次收到数据的时间戳
        isWorn: false,
        fallDetected: false,
        pitch: 0,
        roll: 0,
        postureStatus: "正常",
        postureDetail: "",
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
        warningMessage: "",
        warningLevel: 0,
        ledStatus: "关闭",
        buzzerStatus: "关闭",
        abnormalCount: 0,
        rssi: -99,
        lastUpdateTime: "--:--:--",
        deviceId: "未知",
        localIp: "未知",
        deviceIp: "",
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
          { value: 1, name: "轻度预警", range: [15, 25] },
          { value: 2, name: "中度预警", range: [25, 35] },
          { value: 3, name: "重度预警", range: [35, 50] }
        ]
      };
    },
    onLoad() {
      this.loadServerConfig();
      this.loadThresholds();
      this.loadAlertLevels();
      setTimeout(() => this.connectToServer(), 1e3);
    },
    onShow() {
      this.loadThresholds();
      this.loadAlertLevels();
      this.loadServerConfig();
      formatAppLog("log", "at pages/index/index.vue:284", "📂 从本地存储重新加载阈值和级别范围");
    },
    onUnload() {
      this.disconnect();
      if (this.reconnectTimer)
        clearTimeout(this.reconnectTimer);
      if (this.timeoutTimer)
        clearInterval(this.timeoutTimer);
      this.stopHeartbeat();
    },
    methods: {
      loadAlertLevels() {
        try {
          const saved = uni.getStorageSync("alert_levels");
          if (saved)
            this.alertLevels = saved;
        } catch (e) {
          formatAppLog("log", "at pages/index/index.vue:300", "加载预警级别失败:", e);
        }
      },
      loadThresholds() {
        try {
          const saved = uni.getStorageSync("threshold_config");
          if (saved)
            this.thresholds = { ...this.thresholds, ...saved };
        } catch (e) {
          formatAppLog("log", "at pages/index/index.vue:309", "加载阈值失败:", e);
        }
      },
      loadServerConfig() {
        try {
          const saved = uni.getStorageSync("server_config");
          if (saved && saved.address) {
            if (this.serverAddress !== saved.address) {
              this.serverAddress = saved.address;
              this.serverAddressInput = saved.address;
              this.reconnect();
            } else {
              this.serverAddress = saved.address;
              this.serverAddressInput = saved.address;
            }
          }
        } catch (e) {
          formatAppLog("log", "at pages/index/index.vue:328", "加载配置失败:", e);
        }
      },
      saveServerConfig() {
        const address = this.serverAddressInput.trim();
        if (!address) {
          uni.showToast({ title: "请输入服务器地址", icon: "none" });
          return;
        }
        let normalizedAddress = address;
        if (!address.startsWith("ws://") && !address.startsWith("wss://")) {
          normalizedAddress = "ws://" + address;
        }
        this.serverAddress = normalizedAddress;
        this.serverAddressInput = normalizedAddress;
        try {
          uni.setStorageSync("server_config", { address: normalizedAddress });
        } catch (e) {
          formatAppLog("log", "at pages/index/index.vue:347", "保存配置失败:", e);
        }
        this.showServerConfig = false;
        this.reconnect();
      },
      connectToServer() {
        this.disconnect();
        formatAppLog("log", "at pages/index/index.vue:355", "开始连接服务器:", this.serverAddress);
        this.connectionStatus = "connecting";
        try {
          this.ws = uni.connectSocket({
            url: this.serverAddress,
            success: () => formatAppLog("log", "at pages/index/index.vue:360", "✅ connectSocket成功回调"),
            fail: (error) => {
              formatAppLog("error", "at pages/index/index.vue:362", "❌ connectSocket失败:", error);
              this.connectionStatus = "error";
              this.scheduleReconnect(5e3);
            }
          });
          this.ws.onOpen(() => {
            formatAppLog("log", "at pages/index/index.vue:368", "✅ WebSocket连接已打开");
            this.connectionStatus = "connected";
            this.startDataTimeoutCheck();
            this.startHeartbeat();
            uni.showToast({ title: "连接成功", icon: "success", duration: 1500 });
            setTimeout(() => this.sendTestCommand(), 500);
          });
          this.ws.onMessage((res) => this.handleWebSocketMessage(res.data));
          this.ws.onError((error) => {
            formatAppLog("error", "at pages/index/index.vue:379", "❌ WebSocket连接错误:", error);
            this.isWorn = false;
            this.connectionStatus = "error";
            this.stopHeartbeat();
            uni.showToast({ title: "连接失败", icon: "error", duration: 2e3 });
            this.scheduleReconnect(5e3);
          });
          this.ws.onClose(() => {
            formatAppLog("log", "at pages/index/index.vue:387", "连接关闭");
            this.isWorn = false;
            this.stopHeartbeat();
            if (this.connectionStatus === "connected" || this.connectionStatus === "no_data") {
              this.connectionStatus = "disconnected";
              this.scheduleReconnect(2e3);
            }
          });
        } catch (error) {
          formatAppLog("error", "at pages/index/index.vue:396", "创建WebSocket异常:", error);
          this.connectionStatus = "error";
          this.scheduleReconnect(3e3);
        }
      },
      // 启动数据超时检测（每秒检查一次，超过5秒无数据则标记为无数据）
      startDataTimeoutCheck() {
        if (this.timeoutTimer)
          clearInterval(this.timeoutTimer);
        this.lastDataTimestamp = Date.now();
        this.timeoutTimer = setInterval(() => {
          if (this.connectionStatus === "connected" && Date.now() - this.lastDataTimestamp > 1e4) {
            formatAppLog("log", "at pages/index/index.vue:408", "⚠️ 超过5秒未收到数据，标记为无数据");
            this.connectionStatus = "no_data";
            this.isWorn = false;
          }
        }, 1e3);
      },
      // ---------- 新增：心跳机制 ----------
      startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
          if (this.ws && this.connectionStatus === "connected") {
            this.ws.send({
              data: JSON.stringify({ type: "ping", timestamp: Date.now() }),
              success: () => formatAppLog("log", "at pages/index/index.vue:422", "💓 心跳发送成功"),
              fail: (err) => formatAppLog("log", "at pages/index/index.vue:423", "💓 心跳发送失败", err)
            });
          }
        }, 15e3);
      },
      stopHeartbeat() {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      },
      // ------------------------------------
      handleWebSocketMessage(message) {
        this.dataCount++;
        this.lastDataTimestamp = Date.now();
        if (this.connectionStatus === "no_data") {
          this.connectionStatus = "connected";
        }
        try {
          const data = JSON.parse(message);
          formatAppLog("log", "at pages/index/index.vue:448", "收到消息类型:", data.type);
          switch (data.type) {
            case "welcome":
              formatAppLog("log", "at pages/index/index.vue:452", "服务器欢迎:", data.message);
              break;
            case "sensor_data":
              this.updateSensorData(data.data);
              if (realData && realData.websocketManager) {
                realData.websocketManager.addToHistory(data.data);
              }
              break;
            case "pong":
              formatAppLog("log", "at pages/index/index.vue:463", "收到pong响应");
              break;
            default:
              if (realData && realData.websocketManager) {
                if (data.posture_data || data.vital_data || data.environment_data || data.wear_status || data.fall_detected !== void 0) {
                  realData.websocketManager.addToHistory(data);
                }
              }
              break;
          }
        } catch (error) {
          formatAppLog("log", "at pages/index/index.vue:481", "收到非JSON消息:", message);
        }
      },
      updateSensorData(sensorData) {
        formatAppLog("log", "at pages/index/index.vue:486", "更新传感器数据:", sensorData);
        const now = /* @__PURE__ */ new Date();
        this.lastUpdateTime = now.toLocaleTimeString();
        if (sensorData.network_info && sensorData.network_info.local_ip) {
          this.deviceIp = sensorData.network_info.local_ip;
          formatAppLog("log", "at pages/index/index.vue:493", "硬件IP:", this.deviceIp);
        }
        if (sensorData.device_id) {
          this.deviceId = sensorData.device_id;
        }
        if (sensorData.wear_status) {
          this.isWorn = sensorData.wear_status.is_worn || false;
        }
        if (sensorData.posture_data) {
          this.pitch = sensorData.posture_data.pitch || 0;
          this.roll = sensorData.posture_data.roll || 0;
          formatAppLog(
            "log",
            "at pages/index/index.vue:507",
            "pitch:",
            this.pitch,
            "roll:",
            this.roll,
            "阈值 pitch:",
            this.thresholds.pitch,
            "roll:",
            this.thresholds.roll
          );
          const maxAngle = Math.max(Math.abs(this.pitch), Math.abs(this.roll));
          const pitchAbs = Math.abs(this.pitch);
          const rollAbs = Math.abs(this.roll);
          const isPitchExceed = pitchAbs > this.thresholds.pitch;
          const isRollExceed = rollAbs > this.thresholds.roll;
          this.isAbnormal = isPitchExceed || isRollExceed;
          formatAppLog("log", "at pages/index/index.vue:518", "isAbnormal:", this.isAbnormal);
          if (this.isAbnormal) {
            let level = 1;
            for (let i = 0; i < this.alertLevels.length; i++) {
              const lvl = this.alertLevels[i];
              if (maxAngle >= lvl.range[0] && maxAngle <= lvl.range[1]) {
                level = lvl.value;
                break;
              }
            }
            this.postureLevel = level;
            formatAppLog("log", "at pages/index/index.vue:530", "重新计算等级:", this.postureLevel);
            if (isPitchExceed && isRollExceed) {
              this.postureStatus = "异常";
              this.postureDetail = "前倾/后仰且侧倾";
            } else if (isPitchExceed) {
              this.postureStatus = "异常";
              this.postureDetail = this.pitch > 0 ? "前倾过度" : "后仰过度";
            } else if (isRollExceed) {
              this.postureStatus = "注意";
              this.postureDetail = this.roll > 0 ? "右倾过度" : "左倾过度";
            }
            const levelNames = ["", "轻度", "中度", "重度"];
            this.postureStatus = levelNames[this.postureLevel] + "异常";
          } else {
            this.postureLevel = 0;
            this.postureStatus = "正常";
            this.postureDetail = "";
          }
          this.checkPostureWarning();
        }
        sensorData.posture_is_abnormal = this.isAbnormal;
        sensorData.posture_level = this.postureLevel;
        sensorData.posture_status = this.postureStatus;
        sensorData.posture_detail = this.postureDetail;
        if (sensorData.fall_detected !== void 0) {
          this.fallDetected = sensorData.fall_detected;
          if (this.fallDetected) {
            this.hasWarning = true;
            this.warningLevel = 3;
            this.warningMessage = "⚠️ 检测到跌倒！请立即确认用户安全！";
            formatAppLog("log", "at pages/index/index.vue:567", "跌倒检测触发，发送紧急声光");
            this.sendAlertCommand(3, 10);
          }
        }
        if (sensorData.vital_data) {
          this.heartRate = sensorData.vital_data.heart_rate || 0;
          this.spo2 = sensorData.vital_data.spo2 || 0;
          this.heartRateValid = sensorData.vital_data.hr_valid || false;
          this.spo2Valid = sensorData.vital_data.spo2_valid || false;
          this.checkVitalWarning();
        }
        if (sensorData.environment_data) {
          this.temperature = sensorData.environment_data.temperature || 0;
          this.humidity = sensorData.environment_data.humidity || 0;
          this.tempValid = sensorData.environment_data.temp_valid || false;
          this.humValid = sensorData.environment_data.hum_valid || false;
        }
        if (sensorData.system_status) {
          this.ledStatus = sensorData.system_status.led_status || "关闭";
          this.buzzerStatus = sensorData.system_status.buzzer_status || "关闭";
          this.abnormalCount = sensorData.system_status.abnormal_count || 0;
          this.rssi = sensorData.system_status.rssi || -99;
        }
      },
      checkPostureWarning() {
        formatAppLog("log", "at pages/index/index.vue:596", "checkPostureWarning 被调用，isAbnormal=", this.isAbnormal, "postureLevel=", this.postureLevel);
        if (this.isAbnormal) {
          this.hasWarning = true;
          this.warningLevel = this.postureLevel;
          const levels = ["", "轻度", "中度", "重度"];
          this.warningMessage = `检测到${levels[this.warningLevel]}体态异常：${this.postureDetail}`;
          const durations = [0, 1, 3, 5];
          formatAppLog("log", "at pages/index/index.vue:604", "发送体态异常指令，level=", this.postureLevel, "duration=", durations[this.postureLevel]);
          this.sendAlertCommand(this.postureLevel, durations[this.postureLevel]);
        }
      },
      checkVitalWarning() {
        if (this.heartRateValid) {
          if (this.heartRate < this.thresholds.hrMin) {
            this.hasWarning = true;
            this.warningLevel = Math.max(this.warningLevel, 2);
            this.warningMessage = `心率过低：${this.heartRate} BPM`;
          } else if (this.heartRate > this.thresholds.hrMax) {
            this.hasWarning = true;
            this.warningLevel = Math.max(this.warningLevel, 2);
            this.warningMessage = `心率过高：${this.heartRate} BPM`;
          }
        }
        if (this.spo2Valid && this.spo2 < this.thresholds.spo2Min) {
          this.hasWarning = true;
          this.warningLevel = Math.max(this.warningLevel, 3);
          this.warningMessage = `血氧过低：${this.spo2}%`;
        }
      },
      // 双通道发送指令
      sendAlertCommand(level, duration = 0) {
        if (this.deviceIp && typeof uni.createUDPSocket === "function") {
          this.sendAlertViaUDP(level, duration);
        } else {
          this.sendAlertViaWebSocket(level, duration);
        }
      },
      sendAlertViaUDP(level, duration) {
        const message = JSON.stringify({
          type: "alert",
          level,
          duration,
          timestamp: Date.now()
        });
        formatAppLog("log", "at pages/index/index.vue:644", "尝试UDP发送到", this.deviceIp, "端口8889，消息:", message);
        try {
          const udp = uni.createUDPSocket();
          udp.bind();
          udp.send({
            address: this.deviceIp,
            port: 8889,
            message,
            success: () => {
              formatAppLog("log", "at pages/index/index.vue:653", "📤 UDP报警指令发送成功，level=" + level + ", duration=" + duration);
            },
            fail: (err) => {
              formatAppLog("error", "at pages/index/index.vue:656", "UDP发送失败，尝试WebSocket发送:", err);
              this.sendAlertViaWebSocket(level, duration);
            },
            complete: () => udp.close()
          });
        } catch (e) {
          formatAppLog("error", "at pages/index/index.vue:662", "UDP异常，尝试WebSocket发送:", e);
          this.sendAlertViaWebSocket(level, duration);
        }
      },
      sendAlertViaWebSocket(level, duration) {
        if (this.connectionStatus !== "connected" || !this.ws) {
          formatAppLog("warn", "at pages/index/index.vue:669", "WebSocket未连接，无法发送指令");
          return;
        }
        const message = JSON.stringify({
          type: "app_alert",
          level,
          duration,
          targetDevice: this.deviceId,
          timestamp: Date.now()
        });
        this.ws.send({
          data: message,
          success: () => {
            formatAppLog("log", "at pages/index/index.vue:682", "📤 WebSocket报警指令已发送，level=" + level + ", duration=" + duration);
          },
          fail: (err) => {
            formatAppLog("error", "at pages/index/index.vue:685", "WebSocket发送失败:", err);
          }
        });
      },
      sendStopAlert() {
        if (this.deviceIp && typeof uni.createUDPSocket === "function") {
          const message = JSON.stringify({ type: "stop_alert" });
          const udp = uni.createUDPSocket();
          udp.bind();
          udp.send({
            address: this.deviceIp,
            port: 8889,
            message,
            success: () => formatAppLog("log", "at pages/index/index.vue:699", "📤 UDP停止指令已发送"),
            fail: (err) => formatAppLog("error", "at pages/index/index.vue:700", "UDP停止失败:", err),
            complete: () => udp.close()
          });
        }
        if (this.connectionStatus === "connected" && this.ws) {
          this.ws.send({
            data: JSON.stringify({ type: "app_alert", level: 0, duration: 0 }),
            fail: (err) => formatAppLog("error", "at pages/index/index.vue:707", "WebSocket停止失败:", err)
          });
        }
      },
      disconnect() {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        if (this.reconnectTimer)
          clearTimeout(this.reconnectTimer);
        if (this.timeoutTimer)
          clearInterval(this.timeoutTimer);
        this.stopHeartbeat();
      },
      scheduleReconnect(delay = 3e3) {
        if (this.reconnectTimer)
          clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.connectionStatus !== "connected") {
            formatAppLog("log", "at pages/index/index.vue:726", "🔄 自动重连...");
            this.connectToServer();
          }
        }, delay);
      },
      reconnect() {
        if (this.connectionStatus === "connecting") {
          uni.showToast({ title: "正在连接中...", icon: "none" });
          return;
        }
        uni.showLoading({ title: "重新连接中..." });
        this.disconnect();
        this.connectToServer();
        setTimeout(() => uni.hideLoading(), 2e3);
      },
      sendTestCommand() {
        if (this.ws && this.connectionStatus === "connected") {
          this.ws.send({
            data: JSON.stringify({ type: "ping", timestamp: Date.now(), from: "health-monitor-app" }),
            success: () => uni.showToast({ title: "测试命令已发送", icon: "success" }),
            fail: (error) => {
              formatAppLog("error", "at pages/index/index.vue:749", "发送失败:", error);
              uni.showToast({ title: "发送失败", icon: "none" });
            }
          });
        } else {
          uni.showToast({ title: "请先连接服务器", icon: "none" });
        }
      },
      refreshData() {
        if (this.connectionStatus === "connected")
          this.sendTestCommand();
        else
          this.reconnect();
      },
      handleAcknowledge() {
        this.hasWarning = false;
        this.warningMessage = "";
        this.warningLevel = 0;
        this.sendStopAlert();
      },
      acknowledgeFall() {
        this.fallDetected = false;
        this.hasWarning = false;
        this.sendStopAlert();
        uni.showToast({ title: "已确认", icon: "success" });
      },
      ignoreFall() {
        this.fallDetected = false;
        this.hasWarning = false;
        this.sendStopAlert();
        uni.showToast({ title: "已忽略", icon: "none" });
      },
      getStatusText() {
        const map = {
          disconnected: "未连接",
          connecting: "连接中...",
          connected: "已连接",
          error: "连接错误",
          no_data: "无数据"
        };
        return map[this.connectionStatus] || "未知状态";
      },
      getPostureAlertClass() {
        if (!this.isAbnormal)
          return "alert-normal";
        switch (this.postureLevel) {
          case 1:
            return "alert-warning";
          case 2:
            return "alert-caution";
          case 3:
            return "alert-danger";
          default:
            return "alert-normal";
        }
      },
      getHeartRateStatus() {
        if (!this.heartRateValid)
          return "无效";
        if (this.heartRate < this.thresholds.hrMin)
          return "过低";
        if (this.heartRate > this.thresholds.hrMax)
          return "过高";
        return "正常";
      },
      getHeartRateStatusClass() {
        if (!this.heartRateValid)
          return "status-invalid";
        if (this.heartRate < this.thresholds.hrMin || this.heartRate > this.thresholds.hrMax)
          return "status-warning";
        return "status-normal";
      },
      getSpo2Status() {
        if (!this.spo2Valid)
          return "无效";
        if (this.spo2 < this.thresholds.spo2Min)
          return "过低";
        return "正常";
      },
      getSpo2StatusClass() {
        if (!this.spo2Valid)
          return "status-invalid";
        if (this.spo2 < this.thresholds.spo2Min)
          return "status-warning";
        return "status-normal";
      },
      getWarningLevelText() {
        const levels = ["", "轻度预警", "中度预警", "重度预警"];
        return levels[this.warningLevel] || "";
      },
      getSignalBars() {
        if (this.rssi >= -50)
          return 5;
        if (this.rssi >= -60)
          return 4;
        if (this.rssi >= -70)
          return 3;
        if (this.rssi >= -80)
          return 2;
        return 1;
      }
    }
  };
  function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page-container" }, [
      vue.createElementVNode(
        "view",
        {
          class: vue.normalizeClass(["connection-bar", $data.connectionStatus])
        },
        [
          vue.createElementVNode("view", { class: "connection-info" }, [
            vue.createElementVNode("view", { class: "status-dot" }),
            vue.createElementVNode(
              "text",
              { class: "status-text" },
              vue.toDisplayString($options.getStatusText()),
              1
              /* TEXT */
            )
          ]),
          $data.dataCount > 0 ? (vue.openBlock(), vue.createElementBlock(
            "text",
            {
              key: 0,
              class: "data-count"
            },
            vue.toDisplayString($data.dataCount) + "条数据",
            1
            /* TEXT */
          )) : vue.createCommentVNode("v-if", true),
          $data.connectionStatus !== "connected" && $data.connectionStatus !== "no_data" ? (vue.openBlock(), vue.createElementBlock("button", {
            key: 1,
            class: "quick-connect",
            onClick: _cache[0] || (_cache[0] = (...args) => $options.connectToServer && $options.connectToServer(...args))
          }, "连接")) : vue.createCommentVNode("v-if", true)
        ],
        2
        /* CLASS */
      ),
      vue.createElementVNode("view", { class: "wear-status-card card" }, [
        vue.createElementVNode("view", { class: "wear-header" }, [
          vue.createElementVNode("text", { class: "wear-title" }, "佩戴状态"),
          vue.createElementVNode(
            "view",
            {
              class: vue.normalizeClass(["wear-badge", $data.isWorn ? "wear-normal" : "wear-warning"])
            },
            vue.toDisplayString($data.isWorn ? "✅ 已佩戴" : "❌ 未佩戴"),
            3
            /* TEXT, CLASS */
          )
        ]),
        vue.createElementVNode("view", { class: "wear-tip" }, [
          !$data.isWorn ? (vue.openBlock(), vue.createElementBlock("text", { key: 0 }, "请正确佩戴设备，确保传感器接触良好")) : (vue.openBlock(), vue.createElementBlock("text", { key: 1 }, "设备佩戴正常，正在实时监测"))
        ])
      ]),
      vue.createElementVNode(
        "view",
        {
          class: vue.normalizeClass(["fall-card card", { "normal": !$data.fallDetected }])
        },
        [
          vue.createElementVNode("view", { class: "fall-header" }, [
            vue.createElementVNode(
              "text",
              { class: "fall-icon" },
              vue.toDisplayString($data.fallDetected ? "🚨" : "✅"),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "fall-title" }, "跌倒检测"),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["fall-badge", $data.fallDetected ? "danger" : "normal"])
              },
              vue.toDisplayString($data.fallDetected ? "紧急" : "正常"),
              3
              /* TEXT, CLASS */
            )
          ]),
          $data.fallDetected ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "fall-content"
          }, [
            vue.createElementVNode("text", null, "系统检测到跌倒事件！请立即确认用户安全。")
          ])) : vue.createCommentVNode("v-if", true),
          $data.fallDetected ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 1,
            class: "fall-actions"
          }, [
            vue.createElementVNode("button", {
              class: "fall-btn confirm",
              onClick: _cache[1] || (_cache[1] = (...args) => $options.acknowledgeFall && $options.acknowledgeFall(...args))
            }, "我已确认"),
            vue.createElementVNode("button", {
              class: "fall-btn ignore",
              onClick: _cache[2] || (_cache[2] = (...args) => $options.ignoreFall && $options.ignoreFall(...args))
            }, "忽略")
          ])) : vue.createCommentVNode("v-if", true)
        ],
        2
        /* CLASS */
      ),
      vue.createElementVNode("view", { class: "posture-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "体态监测"),
          vue.createElementVNode(
            "view",
            {
              class: vue.normalizeClass(["alert-badge", $options.getPostureAlertClass()])
            },
            vue.toDisplayString($data.postureStatus),
            3
            /* TEXT, CLASS */
          )
        ]),
        vue.createElementVNode("view", { class: "posture-indicator" }, [
          vue.createElementVNode("view", { class: "indicator-grid" }, [
            vue.createElementVNode("view", { class: "grid-cell" }),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["grid-cell", { "active": $data.pitch > 0 }])
              },
              [
                vue.createElementVNode("text", { class: "direction-label" }, "前倾")
              ],
              2
              /* CLASS */
            ),
            vue.createElementVNode("view", { class: "grid-cell" }),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["grid-cell", { "active": $data.roll < 0 }])
              },
              [
                vue.createElementVNode("text", { class: "direction-label" }, "左倾")
              ],
              2
              /* CLASS */
            ),
            vue.createElementVNode("view", { class: "grid-cell center-cell" }, [
              vue.createElementVNode("view", { class: "center-dot" }),
              vue.createElementVNode(
                "text",
                { class: "angle-display" },
                "P:" + vue.toDisplayString($data.pitch) + "°",
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "angle-display" },
                "R:" + vue.toDisplayString($data.roll) + "°",
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["grid-cell", { "active": $data.roll > 0 }])
              },
              [
                vue.createElementVNode("text", { class: "direction-label" }, "右倾")
              ],
              2
              /* CLASS */
            ),
            vue.createElementVNode("view", { class: "grid-cell" }),
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["grid-cell", { "active": $data.pitch < 0 }])
              },
              [
                vue.createElementVNode("text", { class: "direction-label" }, "后仰")
              ],
              2
              /* CLASS */
            ),
            vue.createElementVNode("view", { class: "grid-cell" })
          ])
        ]),
        vue.createElementVNode("view", { class: "posture-detail" }, [
          vue.createElementVNode("view", { class: "detail-item" }, [
            vue.createElementVNode("text", { class: "detail-label" }, "俯仰角:"),
            vue.createElementVNode(
              "text",
              { class: "detail-value" },
              vue.toDisplayString($data.pitch) + "°",
              1
              /* TEXT */
            )
          ]),
          vue.createElementVNode("view", { class: "detail-item" }, [
            vue.createElementVNode("text", { class: "detail-label" }, "横滚角:"),
            vue.createElementVNode(
              "text",
              { class: "detail-value" },
              vue.toDisplayString($data.roll) + "°",
              1
              /* TEXT */
            )
          ]),
          vue.createElementVNode("view", { class: "detail-item" }, [
            vue.createElementVNode("text", { class: "detail-label" }, "状态:"),
            vue.createElementVNode(
              "text",
              {
                class: vue.normalizeClass(["detail-value", $options.getPostureAlertClass()])
              },
              vue.toDisplayString($data.postureDetail || "正常"),
              3
              /* TEXT, CLASS */
            )
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "vital-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "生理参数"),
          vue.createElementVNode(
            "view",
            { class: "time-display" },
            vue.toDisplayString($data.lastUpdateTime),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "vital-grid" }, [
          vue.createElementVNode("view", { class: "vital-item" }, [
            vue.createElementVNode("view", { class: "vital-icon" }, "❤️"),
            vue.createElementVNode("text", { class: "vital-label" }, "心率"),
            vue.createElementVNode(
              "text",
              { class: "vital-value" },
              vue.toDisplayString($data.heartRate) + " BPM",
              1
              /* TEXT */
            ),
            vue.createElementVNode(
              "text",
              {
                class: vue.normalizeClass(["vital-status", $options.getHeartRateStatusClass()])
              },
              vue.toDisplayString($options.getHeartRateStatus()),
              3
              /* TEXT, CLASS */
            )
          ]),
          vue.createElementVNode("view", { class: "vital-item" }, [
            vue.createElementVNode("view", { class: "vital-icon" }, "🩸"),
            vue.createElementVNode("text", { class: "vital-label" }, "血氧"),
            vue.createElementVNode(
              "text",
              { class: "vital-value" },
              vue.toDisplayString($data.spo2) + " %",
              1
              /* TEXT */
            ),
            vue.createElementVNode(
              "text",
              {
                class: vue.normalizeClass(["vital-status", $options.getSpo2StatusClass()])
              },
              vue.toDisplayString($options.getSpo2Status()),
              3
              /* TEXT, CLASS */
            )
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "environment-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "环境参数")
        ]),
        vue.createElementVNode("view", { class: "environment-grid" }, [
          vue.createElementVNode("view", { class: "env-item" }, [
            vue.createElementVNode("view", { class: "env-icon" }, "🌡️"),
            vue.createElementVNode("text", { class: "env-label" }, "温度"),
            vue.createElementVNode(
              "text",
              { class: "env-value" },
              vue.toDisplayString($data.temperature) + "°C",
              1
              /* TEXT */
            )
          ]),
          vue.createElementVNode("view", { class: "env-item" }, [
            vue.createElementVNode("view", { class: "env-icon" }, "💧"),
            vue.createElementVNode("text", { class: "env-label" }, "湿度"),
            vue.createElementVNode(
              "text",
              { class: "env-value" },
              vue.toDisplayString($data.humidity) + "%",
              1
              /* TEXT */
            )
          ])
        ])
      ]),
      $data.hasWarning ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "warning-card card"
      }, [
        vue.createElementVNode("view", { class: "warning-header" }, [
          vue.createElementVNode("text", { class: "warning-title" }, "⚠️ 预警提示"),
          vue.createElementVNode(
            "text",
            { class: "warning-level" },
            vue.toDisplayString($options.getWarningLevelText()),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "warning-content" }, [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($data.warningMessage),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "warning-actions" }, [
          vue.createElementVNode("button", {
            class: "warning-btn",
            onClick: _cache[3] || (_cache[3] = (...args) => $options.handleAcknowledge && $options.handleAcknowledge(...args))
          }, "我知道了")
        ])
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "action-buttons" }, [
        vue.createElementVNode("button", {
          class: "action-btn reconnect",
          onClick: _cache[4] || (_cache[4] = (...args) => $options.reconnect && $options.reconnect(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🔄"),
          vue.createElementVNode("text", null, "重新连接")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn test",
          onClick: _cache[5] || (_cache[5] = (...args) => $options.sendTestCommand && $options.sendTestCommand(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "📡"),
          vue.createElementVNode("text", null, "测试连接")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn refresh",
          onClick: _cache[6] || (_cache[6] = (...args) => $options.refreshData && $options.refreshData(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🔄"),
          vue.createElementVNode("text", null, "刷新数据")
        ])
      ]),
      $data.showServerConfig ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 1,
        class: "server-config-modal"
      }, [
        vue.createElementVNode("view", { class: "modal-content" }, [
          vue.createElementVNode("view", { class: "modal-header" }, [
            vue.createElementVNode("text", { class: "modal-title" }, "服务器配置"),
            vue.createElementVNode("button", {
              class: "modal-close",
              onClick: _cache[7] || (_cache[7] = ($event) => $data.showServerConfig = false)
            }, "✕")
          ]),
          vue.createElementVNode("view", { class: "modal-body" }, [
            vue.createElementVNode("view", { class: "config-item" }, [
              vue.createElementVNode("text", { class: "config-label" }, "WebSocket地址"),
              vue.withDirectives(vue.createElementVNode(
                "input",
                {
                  class: "config-input",
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => $data.serverAddressInput = $event),
                  placeholder: "ws://192.168.10.103:8080"
                },
                null,
                512
                /* NEED_PATCH */
              ), [
                [vue.vModelText, $data.serverAddressInput]
              ])
            ]),
            vue.createElementVNode("view", { class: "config-tip" }, [
              vue.createElementVNode("text", null, "💡 提示："),
              vue.createElementVNode("text", null, "1. 确保Node.js服务器正在运行"),
              vue.createElementVNode("text", null, "2. 确保ESP32和服务器在同一网络"),
              vue.createElementVNode("text", null, "3. 手机真机调试需使用电脑IP地址")
            ])
          ]),
          vue.createElementVNode("view", { class: "modal-footer" }, [
            vue.createElementVNode("button", {
              class: "modal-btn cancel",
              onClick: _cache[9] || (_cache[9] = ($event) => $data.showServerConfig = false)
            }, "取消"),
            vue.createElementVNode("button", {
              class: "modal-btn save",
              onClick: _cache[10] || (_cache[10] = (...args) => $options.saveServerConfig && $options.saveServerConfig(...args))
            }, "保存并连接")
          ])
        ])
      ])) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesIndexIndex = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2], ["__scopeId", "data-v-1cf27b2a"], ["__file", "F:/1study/Graduation_project/HBuilderProjects/HealthMonitor/pages/index/index.vue"]]);
  const _sfc_main$2 = {
    data() {
      const today = /* @__PURE__ */ new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: this.formatDate(yesterday),
        endDate: this.formatDate(today),
        activeFilter: "today",
        quickFilters: [
          { label: "今天", value: "today" },
          { label: "昨天", value: "yesterday" },
          { label: "最近7天", value: "week" },
          { label: "最近30天", value: "month" },
          { label: "全部", value: "all" }
        ],
        stats: {
          totalCount: 0,
          abnormalCount: 0,
          avgHeartRate: 0,
          avgSpo2: 0,
          maxHeartRate: 0,
          minHeartRate: 0
        },
        recentData: [],
        rawData: [],
        filteredData: [],
        abnormalRecords: [],
        currentPage: 1,
        pageSize: 10,
        totalPages: 1,
        recordsHeight: 300,
        dataListHeight: 400,
        showExportSuccess: false,
        lastDataTime: "--:--"
      };
    },
    computed: {
      paginatedData() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        return this.filteredData.slice(start, end);
      }
    },
    onLoad() {
      this.loadHistoryData();
      this.calculateViewHeight();
    },
    onShow() {
      this.refreshData();
    },
    methods: {
      formatDate(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        return `${year}-${month}-${day}`;
      },
      formatTime(timestamp) {
        if (!timestamp)
          return "--:--:--";
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
      },
      formatShortTime(timestamp) {
        if (!timestamp)
          return "--:--";
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
      },
      formatPosture(posture) {
        if (!posture)
          return "--";
        if (typeof posture === "string")
          return posture;
        const pitch = posture.pitch !== void 0 ? posture.pitch : "--";
        const roll = posture.roll !== void 0 ? posture.roll : "--";
        return `${pitch}°,${roll}°`;
      },
      loadHistoryData() {
        this.rawData = realData.getHistoryData(200) || [];
        formatAppLog("log", "at pages/history/history.vue:365", "📥 原始数据条数:", this.rawData.length);
        this.applyFilter();
        this.calculateStatistics();
        this.extractAbnormalRecords();
        this.getRecentData();
      },
      getRecentData() {
        this.recentData = this.filteredData.slice(0, 10).map((item) => {
          let status = item.posture_status || "正常";
          if (status === "正常" && item.posture_data) {
            item.posture_data.pitch || 0;
            item.posture_data.roll || 0;
          }
          let postureDisplay = "--";
          if (item.posture_data) {
            const pitch = item.posture_data.pitch || 0;
            const roll = item.posture_data.roll || 0;
            postureDisplay = `${pitch}°,${roll}°`;
          }
          return {
            timestamp: item._timestamp || item.timestamp,
            heartRate: item.vital_data && item.vital_data.heart_rate || 0,
            spo2: item.vital_data && item.vital_data.spo2 || 0,
            postureDisplay,
            status,
            // 直接使用存储的状态
            temperature: item.environment_data && item.environment_data.temperature || 0,
            humidity: item.environment_data && item.environment_data.humidity || 0
          };
        });
        if (this.recentData.length > 0) {
          this.lastDataTime = this.formatShortTime(this.recentData[0].timestamp);
        } else {
          this.lastDataTime = "--:--";
        }
      },
      calculateViewHeight() {
        const systemInfo = uni.getSystemInfoSync();
        const windowHeight = systemInfo.windowHeight;
        this.recordsHeight = windowHeight * 0.3;
        this.dataListHeight = windowHeight * 0.4;
      },
      onStartDateChange(e) {
        this.startDate = e.detail.value;
        this.activeFilter = "custom";
        this.applyFilter();
      },
      onEndDateChange(e) {
        this.endDate = e.detail.value;
        this.activeFilter = "custom";
        this.applyFilter();
      },
      applyQuickFilter(filter) {
        this.activeFilter = filter;
        const today = /* @__PURE__ */ new Date();
        const startDate = /* @__PURE__ */ new Date();
        switch (filter) {
          case "today":
            this.startDate = this.formatDate(today);
            this.endDate = this.formatDate(today);
            break;
          case "yesterday":
            startDate.setDate(today.getDate() - 1);
            this.startDate = this.formatDate(startDate);
            this.endDate = this.formatDate(startDate);
            break;
          case "week":
            startDate.setDate(today.getDate() - 6);
            this.startDate = this.formatDate(startDate);
            this.endDate = this.formatDate(today);
            break;
          case "month":
            startDate.setDate(today.getDate() - 29);
            this.startDate = this.formatDate(startDate);
            this.endDate = this.formatDate(today);
            break;
          case "all":
            this.startDate = "2024-01-01";
            this.endDate = this.formatDate(today);
            break;
        }
        this.applyFilter();
      },
      applyFilter() {
        const startTime = (/* @__PURE__ */ new Date(this.startDate + " 00:00:00")).getTime();
        const endTime = (/* @__PURE__ */ new Date(this.endDate + " 23:59:59")).getTime();
        this.filteredData = this.rawData.filter((item) => {
          const itemTime = item._timestamp || item.timestamp || 0;
          return itemTime >= startTime && itemTime <= endTime;
        });
        this.filteredData.sort((a, b) => {
          const timeA = a._timestamp || a.timestamp || 0;
          const timeB = b._timestamp || b.timestamp || 0;
          return timeB - timeA;
        });
        this.currentPage = 1;
        this.totalPages = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize));
        formatAppLog("log", "at pages/history/history.vue:484", "🔍 筛选后数据条数:", this.filteredData.length);
        this.calculateStatistics();
        this.extractAbnormalRecords();
        this.getRecentData();
      },
      calculateStatistics() {
        const validHeartData = this.filteredData.filter(
          (item) => item.vital_data && item.vital_data.heart_rate > 0
        );
        const validSpo2Data = this.filteredData.filter(
          (item) => item.vital_data && item.vital_data.spo2 > 0
        );
        if (validHeartData.length === 0) {
          this.stats = {
            totalCount: this.filteredData.length,
            abnormalCount: 0,
            avgHeartRate: 0,
            avgSpo2: 0,
            maxHeartRate: 0,
            minHeartRate: 0
          };
          return;
        }
        const heartRates = validHeartData.map((item) => item.vital_data.heart_rate);
        const avgHeartRate = Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length);
        const spo2Values = validSpo2Data.map((item) => item.vital_data.spo2);
        const avgSpo2 = spo2Values.length > 0 ? Math.round(spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length) : 0;
        const abnormalCount = this.filteredData.filter(
          (item) => item.posture_is_abnormal || item.fall_detected
        ).length;
        this.stats = {
          totalCount: this.filteredData.length,
          abnormalCount,
          avgHeartRate,
          avgSpo2,
          maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : 0,
          minHeartRate: heartRates.length > 0 ? Math.min(...heartRates) : 0
        };
      },
      // 提取异常记录，包含跌倒事件
      extractAbnormalRecords() {
        this.abnormalRecords = this.filteredData.filter((item) => item.posture_is_abnormal || item.fall_detected).map((item) => {
          const posture = item.posture_data ? `${item.posture_data.pitch || 0}°, ${item.posture_data.roll || 0}°` : "--";
          return {
            timestamp: item._timestamp || item.timestamp,
            level: item.fall_detected ? 3 : item.posture_level || 1,
            description: item.fall_detected ? "跌倒事件" : item.posture_detail || "体态异常",
            posture,
            heartRate: item.vital_data && item.vital_data.heart_rate || 0,
            spo2: item.vital_data && item.vital_data.spo2 || 0,
            isFall: item.fall_detected || false
          };
        }).slice(0, 20);
      },
      getLevelClass(level) {
        switch (level) {
          case 1:
            return "level-mild";
          case 2:
            return "level-moderate";
          case 3:
            return "level-severe";
          default:
            return "level-normal";
        }
      },
      getLevelText(level) {
        switch (level) {
          case 1:
            return "轻度";
          case 2:
            return "中度";
          case 3:
            return "重度";
          default:
            return "正常";
        }
      },
      getItemStatus(item) {
        if (item.fall_detected)
          return "跌倒";
        if (item.posture_is_abnormal) {
          if (item.posture_status)
            return item.posture_status;
          return "体态异常";
        }
        if (item.vital_data) {
          const hr = item.vital_data.heart_rate;
          const spo2 = item.vital_data.spo2;
          if (hr > 0 && (hr < 30 || hr > 200))
            return "心率异常";
          if (spo2 > 0 && spo2 < 70)
            return "血氧异常";
        }
        return "正常";
      },
      getItemStatusClass(item) {
        const status = this.getItemStatus(item);
        if (status === "正常")
          return "status-normal";
        return "status-warning";
      },
      getStatusClass(status) {
        if (!status || status === "正常")
          return "status-normal";
        return "status-warning";
      },
      prevPage() {
        if (this.currentPage > 1)
          this.currentPage--;
      },
      nextPage() {
        if (this.currentPage < this.totalPages)
          this.currentPage++;
      },
      refreshData() {
        this.loadHistoryData();
        uni.showToast({ title: "数据已刷新", icon: "success" });
      },
      clearHistory() {
        uni.showModal({
          title: "清空历史记录",
          content: "确定要清空所有历史数据吗？此操作不可恢复。",
          success: (res) => {
            if (res.confirm) {
              realData.clearHistory();
              this.rawData = [];
              this.filteredData = [];
              this.abnormalRecords = [];
              this.recentData = [];
              this.calculateStatistics();
              uni.showToast({ title: "历史记录已清空", icon: "success" });
            }
          }
        });
      },
      exportData() {
        if (this.filteredData.length === 0) {
          uni.showToast({ title: "没有数据可导出", icon: "none" });
          return;
        }
        uni.showLoading({ title: "正在导出数据..." });
        try {
          const exportData = this.prepareExportData();
          const csvContent = this.convertToCSV(exportData);
          const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `健康监测数据_${this.startDate}_${this.endDate}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          uni.hideLoading();
          this.showExportSuccess = true;
          setTimeout(() => {
            this.showExportSuccess = false;
          }, 3e3);
          uni.showToast({ title: "数据导出成功", icon: "success" });
        } catch (error) {
          uni.hideLoading();
          uni.showToast({ title: "导出失败", icon: "error" });
          formatAppLog("error", "at pages/history/history.vue:664", "导出数据失败:", error);
        }
      },
      prepareExportData() {
        return this.filteredData.map((item) => ({
          时间: new Date(item._timestamp || item.timestamp).toLocaleString(),
          设备ID: item.device_id || "未知",
          佩戴状态: item.wear_status ? item.wear_status.is_worn ? "已佩戴" : "未佩戴" : "未知",
          跌倒事件: item.fall_detected ? "是" : "否",
          俯仰角: item.posture_data && item.posture_data.pitch || 0,
          横滚角: item.posture_data && item.posture_data.roll || 0,
          体态状态: item.posture_status || "正常",
          体态等级: item.posture_level || 0,
          心率: item.vital_data && item.vital_data.heart_rate || 0,
          血氧: item.vital_data && item.vital_data.spo2 || 0,
          温度: item.environment_data && item.environment_data.temperature || 0,
          湿度: item.environment_data && item.environment_data.humidity || 0,
          LED状态: item.system_status && item.system_status.led_status || "关闭",
          蜂鸣器状态: item.system_status && item.system_status.buzzer_status || "关闭",
          异常次数: item.system_status && item.system_status.abnormal_count || 0,
          信号强度: item.system_status && item.system_status.rssi || -99
        }));
      },
      convertToCSV(data) {
        if (!data.length)
          return "";
        const headers = Object.keys(data[0]);
        let csvContent = headers.join(",") + "\n";
        data.forEach((row) => {
          const rowData = headers.map((header) => {
            let cell = row[header];
            if (typeof cell === "string") {
              if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
                cell = `"${cell.replace(/"/g, '""')}"`;
              }
            }
            return cell;
          });
          csvContent += rowData.join(",") + "\n";
        });
        return csvContent;
      },
      goBack() {
        uni.switchTab({ url: "/pages/index/index" });
      }
    }
  };
  function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "history-container" }, [
      vue.createElementVNode("view", { class: "header" }, [
        vue.createElementVNode("text", { class: "title" }, "📊 历史数据"),
        vue.createElementVNode("text", { class: "subtitle" }, "基于ESP32的健康监测记录")
      ]),
      vue.createElementVNode("view", { class: "filter-card card" }, [
        vue.createElementVNode("view", { class: "filter-header" }, [
          vue.createElementVNode("text", { class: "filter-title" }, "数据筛选"),
          vue.createElementVNode(
            "text",
            { class: "data-count" },
            vue.toDisplayString($data.filteredData.length) + " 条记录",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "time-range" }, [
          vue.createElementVNode("view", { class: "time-input" }, [
            vue.createElementVNode("text", { class: "time-label" }, "开始时间"),
            vue.createElementVNode("picker", {
              mode: "date",
              value: $data.startDate,
              onChange: _cache[0] || (_cache[0] = (...args) => $options.onStartDateChange && $options.onStartDateChange(...args))
            }, [
              vue.createElementVNode("view", { class: "time-picker" }, [
                vue.createElementVNode(
                  "text",
                  null,
                  vue.toDisplayString($data.startDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode("text", { class: "icon" }, "📅")
              ])
            ], 40, ["value"])
          ]),
          vue.createElementVNode("text", { class: "time-separator" }, "至"),
          vue.createElementVNode("view", { class: "time-input" }, [
            vue.createElementVNode("text", { class: "time-label" }, "结束时间"),
            vue.createElementVNode("picker", {
              mode: "date",
              value: $data.endDate,
              onChange: _cache[1] || (_cache[1] = (...args) => $options.onEndDateChange && $options.onEndDateChange(...args))
            }, [
              vue.createElementVNode("view", { class: "time-picker" }, [
                vue.createElementVNode(
                  "text",
                  null,
                  vue.toDisplayString($data.endDate),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode("text", { class: "icon" }, "📅")
              ])
            ], 40, ["value"])
          ])
        ]),
        vue.createElementVNode("view", { class: "quick-filters" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.quickFilters, (filter) => {
              return vue.openBlock(), vue.createElementBlock("button", {
                key: filter.value,
                class: vue.normalizeClass(["filter-btn", $data.activeFilter === filter.value ? "active" : ""]),
                onClick: ($event) => $options.applyQuickFilter(filter.value)
              }, vue.toDisplayString(filter.label), 11, ["onClick"]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ]),
      vue.createElementVNode("view", { class: "stats-card card" }, [
        vue.createElementVNode("view", { class: "stats-header" }, [
          vue.createElementVNode("text", { class: "stats-title" }, "📈 统计概览")
        ]),
        vue.createElementVNode("view", { class: "stats-grid" }, [
          vue.createElementVNode("view", { class: "stat-item" }, [
            vue.createElementVNode(
              "text",
              { class: "stat-value" },
              vue.toDisplayString($data.stats.totalCount),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "stat-label" }, "总数据量")
          ]),
          vue.createElementVNode("view", { class: "stat-item" }, [
            vue.createElementVNode(
              "text",
              { class: "stat-value" },
              vue.toDisplayString($data.stats.abnormalCount),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "stat-label" }, "异常次数")
          ]),
          vue.createElementVNode("view", { class: "stat-item" }, [
            vue.createElementVNode(
              "text",
              { class: "stat-value" },
              vue.toDisplayString($data.stats.avgHeartRate),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "stat-label" }, "平均心率")
          ]),
          vue.createElementVNode("view", { class: "stat-item" }, [
            vue.createElementVNode(
              "text",
              { class: "stat-value" },
              vue.toDisplayString($data.stats.avgSpo2),
              1
              /* TEXT */
            ),
            vue.createElementVNode("text", { class: "stat-label" }, "平均血氧")
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "trend-card card" }, [
        vue.createElementVNode("view", { class: "trend-header" }, [
          vue.createElementVNode("text", { class: "trend-title" }, "📈 数据趋势（最近10次）")
        ]),
        vue.createElementVNode("view", { class: "data-summary" }, [
          vue.createElementVNode("view", { class: "summary-grid" }, [
            vue.createElementVNode("view", { class: "summary-item" }, [
              vue.createElementVNode("text", { class: "summary-label" }, "最高心率"),
              vue.createElementVNode(
                "text",
                { class: "summary-value" },
                vue.toDisplayString($data.stats.maxHeartRate) + " BPM",
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode("view", { class: "summary-item" }, [
              vue.createElementVNode("text", { class: "summary-label" }, "最低心率"),
              vue.createElementVNode(
                "text",
                { class: "summary-value" },
                vue.toDisplayString($data.stats.minHeartRate) + " BPM",
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode("view", { class: "summary-item" }, [
              vue.createElementVNode("text", { class: "summary-label" }, "体态异常"),
              vue.createElementVNode(
                "text",
                { class: "summary-value" },
                vue.toDisplayString($data.stats.abnormalCount) + " 次",
                1
                /* TEXT */
              )
            ]),
            vue.createElementVNode("view", { class: "summary-item" }, [
              vue.createElementVNode("text", { class: "summary-label" }, "数据时间"),
              vue.createElementVNode(
                "text",
                { class: "summary-value" },
                vue.toDisplayString($data.lastDataTime),
                1
                /* TEXT */
              )
            ])
          ])
        ]),
        vue.createElementVNode("view", { class: "recent-data-table" }, [
          vue.createElementVNode("view", { class: "table-title" }, "最近数据记录"),
          vue.createElementVNode("view", { class: "table-header" }, [
            vue.createElementVNode("text", { class: "header-cell time" }, "时间"),
            vue.createElementVNode("text", { class: "header-cell heart" }, "心率"),
            vue.createElementVNode("text", { class: "header-cell spo2" }, "血氧"),
            vue.createElementVNode("text", { class: "header-cell posture" }, "体态"),
            vue.createElementVNode("text", { class: "header-cell status" }, "状态")
          ]),
          vue.createElementVNode("view", { class: "table-body" }, [
            (vue.openBlock(true), vue.createElementBlock(
              vue.Fragment,
              null,
              vue.renderList($data.recentData, (item, index) => {
                return vue.openBlock(), vue.createElementBlock("view", {
                  key: index,
                  class: "table-row"
                }, [
                  vue.createElementVNode(
                    "text",
                    { class: "cell time" },
                    vue.toDisplayString($options.formatShortTime(item.timestamp)),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell heart" },
                    vue.toDisplayString(item.heartRate || "--"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell spo2" },
                    vue.toDisplayString(item.spo2 || "--"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell posture" },
                    vue.toDisplayString(item.postureDisplay),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("view", { class: "cell status" }, [
                    vue.createElementVNode(
                      "view",
                      {
                        class: vue.normalizeClass(["status-badge", $options.getStatusClass(item.status)])
                      },
                      vue.toDisplayString(item.status),
                      3
                      /* TEXT, CLASS */
                    )
                  ])
                ]);
              }),
              128
              /* KEYED_FRAGMENT */
            )),
            $data.recentData.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "empty-row"
            }, [
              vue.createElementVNode("text", { class: "empty-text" }, "暂无最近数据")
            ])) : vue.createCommentVNode("v-if", true)
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "records-card card" }, [
        vue.createElementVNode("view", { class: "records-header" }, [
          vue.createElementVNode("text", { class: "records-title" }, "⚠️ 异常记录"),
          vue.createElementVNode(
            "text",
            { class: "records-count" },
            vue.toDisplayString($data.abnormalRecords.length) + " 次",
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode(
          "scroll-view",
          {
            class: "records-list",
            "scroll-y": "",
            style: vue.normalizeStyle({ height: $data.recordsHeight + "px" })
          },
          [
            (vue.openBlock(true), vue.createElementBlock(
              vue.Fragment,
              null,
              vue.renderList($data.abnormalRecords, (record, index) => {
                return vue.openBlock(), vue.createElementBlock("view", {
                  key: index,
                  class: "record-item"
                }, [
                  vue.createElementVNode("view", { class: "record-header" }, [
                    vue.createElementVNode("view", { class: "record-time-wrapper" }, [
                      vue.createElementVNode(
                        "text",
                        { class: "record-time" },
                        vue.toDisplayString($options.formatTime(record.timestamp)),
                        1
                        /* TEXT */
                      ),
                      record.isFall ? (vue.openBlock(), vue.createElementBlock("text", {
                        key: 0,
                        class: "fall-mark"
                      }, "🚨 跌倒")) : vue.createCommentVNode("v-if", true)
                    ]),
                    vue.createElementVNode(
                      "view",
                      {
                        class: vue.normalizeClass(["record-level", $options.getLevelClass(record.level)])
                      },
                      vue.toDisplayString($options.getLevelText(record.level)),
                      3
                      /* TEXT, CLASS */
                    )
                  ]),
                  vue.createElementVNode("view", { class: "record-body" }, [
                    vue.createElementVNode(
                      "text",
                      { class: "record-desc" },
                      vue.toDisplayString(record.description),
                      1
                      /* TEXT */
                    )
                  ]),
                  vue.createElementVNode("view", { class: "record-data" }, [
                    vue.createElementVNode("view", { class: "data-row" }, [
                      vue.createElementVNode("text", { class: "data-label" }, "体态:"),
                      vue.createElementVNode(
                        "text",
                        { class: "data-value" },
                        vue.toDisplayString(record.posture),
                        1
                        /* TEXT */
                      )
                    ]),
                    vue.createElementVNode("view", { class: "data-row" }, [
                      vue.createElementVNode("text", { class: "data-label" }, "心率:"),
                      vue.createElementVNode(
                        "text",
                        { class: "data-value" },
                        vue.toDisplayString(record.heartRate) + " BPM",
                        1
                        /* TEXT */
                      )
                    ]),
                    vue.createElementVNode("view", { class: "data-row" }, [
                      vue.createElementVNode("text", { class: "data-label" }, "血氧:"),
                      vue.createElementVNode(
                        "text",
                        { class: "data-value" },
                        vue.toDisplayString(record.spo2) + "%",
                        1
                        /* TEXT */
                      )
                    ])
                  ])
                ]);
              }),
              128
              /* KEYED_FRAGMENT */
            )),
            $data.abnormalRecords.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "empty-state"
            }, [
              vue.createElementVNode("text", { class: "empty-icon" }, "📊"),
              vue.createElementVNode("text", { class: "empty-text" }, "暂无异常记录"),
              vue.createElementVNode("text", { class: "empty-tip" }, "所有数据都在正常范围内")
            ])) : vue.createCommentVNode("v-if", true)
          ],
          4
          /* STYLE */
        )
      ]),
      vue.createElementVNode("view", { class: "data-list-card card" }, [
        vue.createElementVNode("view", { class: "list-header" }, [
          vue.createElementVNode("text", { class: "list-title" }, "📋 详细数据")
        ]),
        vue.createElementVNode(
          "scroll-view",
          {
            class: "data-list",
            "scroll-y": "",
            style: vue.normalizeStyle({ height: $data.dataListHeight + "px" })
          },
          [
            vue.createElementVNode("view", { class: "list-header-row" }, [
              vue.createElementVNode("text", { class: "header-cell time" }, "时间"),
              vue.createElementVNode("text", { class: "header-cell posture" }, "体态"),
              vue.createElementVNode("text", { class: "header-cell heart" }, "心率"),
              vue.createElementVNode("text", { class: "header-cell spo2" }, "血氧"),
              vue.createElementVNode("text", { class: "header-cell temp" }, "温度"),
              vue.createElementVNode("text", { class: "header-cell hum" }, "湿度"),
              vue.createElementVNode("text", { class: "header-cell status" }, "状态")
            ]),
            (vue.openBlock(true), vue.createElementBlock(
              vue.Fragment,
              null,
              vue.renderList($options.paginatedData, (item, index) => {
                return vue.openBlock(), vue.createElementBlock("view", {
                  key: index,
                  class: "data-row"
                }, [
                  vue.createElementVNode(
                    "text",
                    { class: "cell time" },
                    vue.toDisplayString($options.formatShortTime(item._timestamp || item.timestamp)),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell posture" },
                    vue.toDisplayString($options.formatPosture(item.posture_data)),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell heart" },
                    vue.toDisplayString(item.vital_data && item.vital_data.heart_rate || "--"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell spo2" },
                    vue.toDisplayString(item.vital_data && item.vital_data.spo2 || "--"),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell temp" },
                    vue.toDisplayString(item.environment_data && item.environment_data.temperature || "--") + "°C",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "cell hum" },
                    vue.toDisplayString(item.environment_data && item.environment_data.humidity || "--") + "%",
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("view", { class: "cell status" }, [
                    vue.createElementVNode(
                      "view",
                      {
                        class: vue.normalizeClass(["status-badge", $options.getItemStatusClass(item)])
                      },
                      vue.toDisplayString($options.getItemStatus(item)),
                      3
                      /* TEXT, CLASS */
                    )
                  ])
                ]);
              }),
              128
              /* KEYED_FRAGMENT */
            )),
            $data.filteredData.length === 0 ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "empty-data"
            }, [
              vue.createElementVNode("text", { class: "empty-icon" }, "📭"),
              vue.createElementVNode("text", { class: "empty-text" }, "暂无历史数据"),
              vue.createElementVNode("text", { class: "empty-tip" }, "请确保已连接到服务器并接收数据")
            ])) : vue.createCommentVNode("v-if", true)
          ],
          4
          /* STYLE */
        ),
        $data.filteredData.length > 0 ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "pagination"
        }, [
          vue.createElementVNode("button", {
            class: "page-btn",
            disabled: $data.currentPage === 1,
            onClick: _cache[2] || (_cache[2] = (...args) => $options.prevPage && $options.prevPage(...args))
          }, [
            vue.createElementVNode("text", null, "上一页")
          ], 8, ["disabled"]),
          vue.createElementVNode(
            "text",
            { class: "page-info" },
            "第 " + vue.toDisplayString($data.currentPage) + " / " + vue.toDisplayString($data.totalPages) + " 页",
            1
            /* TEXT */
          ),
          vue.createElementVNode("button", {
            class: "page-btn",
            disabled: $data.currentPage === $data.totalPages,
            onClick: _cache[3] || (_cache[3] = (...args) => $options.nextPage && $options.nextPage(...args))
          }, [
            vue.createElementVNode("text", null, "下一页")
          ], 8, ["disabled"])
        ])) : vue.createCommentVNode("v-if", true)
      ]),
      vue.createElementVNode("view", { class: "action-footer" }, [
        vue.createElementVNode("button", {
          class: "action-btn refresh",
          onClick: _cache[4] || (_cache[4] = (...args) => $options.refreshData && $options.refreshData(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🔄"),
          vue.createElementVNode("text", null, "刷新数据")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn clear",
          onClick: _cache[5] || (_cache[5] = (...args) => $options.clearHistory && $options.clearHistory(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🗑️"),
          vue.createElementVNode("text", null, "清空记录")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn back",
          onClick: _cache[6] || (_cache[6] = (...args) => $options.goBack && $options.goBack(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "←"),
          vue.createElementVNode("text", null, "返回首页")
        ])
      ]),
      $data.showExportSuccess ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "export-success"
      }, [
        vue.createElementVNode("text", null, "✅ 数据导出成功！"),
        vue.createElementVNode("text", null, "文件已保存到本地")
      ])) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesHistoryHistory = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1], ["__scopeId", "data-v-b2d018fa"], ["__file", "F:/1study/Graduation_project/HBuilderProjects/HealthMonitor/pages/history/history.vue"]]);
  const _imports_0 = "/static/icons/avatar.png";
  const _sfc_main$1 = {
    data() {
      return {
        // 服务器配置
        serverConfig: {
          wsServer: "ws://10.253.88.78:8080",
          udpTarget: "10.253.88.78",
          udpPort: 8888
        },
        // 连接状态
        connectionStatus: "disconnected",
        // 阈值配置
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
        // 预警级别设置
        alertLevels: [
          {
            value: 1,
            name: "轻度预警",
            desc: "轻微体态异常，建议调整姿势",
            range: [15, 25]
          },
          {
            value: 2,
            name: "中度预警",
            desc: "明显体态异常，需要注意",
            range: [25, 35]
          },
          {
            value: 3,
            name: "重度预警",
            desc: "严重体态异常，需要立即调整",
            range: [35, 50]
          }
        ],
        // 测试结果
        showTestResult: false,
        testResult: {
          success: false,
          message: "",
          latency: 0
        }
      };
    },
    onLoad() {
      this.loadSettings();
      this.updateConnectionStatus();
      uni.$on("websocket_state_change", this.handleConnectionChange);
    },
    onUnload() {
      uni.$off("websocket_state_change", this.handleConnectionChange);
    },
    methods: {
      // 加载设置
      loadSettings() {
        try {
          const savedServerConfig = uni.getStorageSync("server_config");
          if (savedServerConfig) {
            this.serverConfig = { ...this.serverConfig, ...savedServerConfig };
          }
          const savedThresholds = uni.getStorageSync("threshold_config");
          if (savedThresholds) {
            this.thresholds = { ...this.thresholds, ...savedThresholds };
          }
          const savedAlertLevels = uni.getStorageSync("alert_levels");
          if (savedAlertLevels) {
            this.alertLevels = savedAlertLevels;
          }
          formatAppLog("log", "at pages/settings/settings.vue:340", "✅ 设置加载完成");
        } catch (error) {
          formatAppLog("error", "at pages/settings/settings.vue:342", "加载设置失败:", error);
        }
      },
      // 保存设置
      saveSettings() {
        try {
          uni.setStorageSync("server_config", this.serverConfig);
          uni.setStorageSync("threshold_config", this.thresholds);
          uni.setStorageSync("alert_levels", this.alertLevels);
          realData.setServerAddress(this.serverConfig.wsServer);
          uni.showToast({
            title: "设置已保存",
            icon: "success"
          });
          formatAppLog("log", "at pages/settings/settings.vue:366", "💾 设置保存完成");
        } catch (error) {
          formatAppLog("error", "at pages/settings/settings.vue:369", "保存设置失败:", error);
          uni.showToast({
            title: "保存失败",
            icon: "error"
          });
        }
      },
      // 恢复默认设置
      resetSettings() {
        uni.showModal({
          title: "恢复默认设置",
          content: "确定要恢复所有设置为默认值吗？",
          success: (res) => {
            if (res.confirm) {
              this.serverConfig = {
                wsServer: "ws://10.253.88.78:8080",
                udpTarget: "10.253.88.78",
                udpPort: 8888
              };
              this.thresholds = {
                pitch: 15,
                roll: 20,
                hrMin: 30,
                hrMax: 200,
                spo2Min: 70,
                tempMin: 0,
                tempMax: 50,
                humMin: 20,
                humMax: 90
              };
              this.alertLevels = [
                {
                  value: 1,
                  name: "轻度预警",
                  desc: "轻微体态异常，建议调整姿势",
                  range: [15, 25]
                },
                {
                  value: 2,
                  name: "中度预警",
                  desc: "明显体态异常，需要注意",
                  range: [25, 35]
                },
                {
                  value: 3,
                  name: "重度预警",
                  desc: "严重体态异常，需要立即调整",
                  range: [35, 50]
                }
              ];
              uni.showToast({
                title: "已恢复默认设置",
                icon: "success"
              });
              setTimeout(() => {
                this.saveSettings();
              }, 500);
            }
          }
        });
      },
      // 清除数据
      clearData() {
        uni.showModal({
          title: "清除数据",
          content: "确定要清除所有历史数据和统计信息吗？",
          success: (res) => {
            if (res.confirm) {
              realData.clearHistory();
              realData.clearAlerts();
              uni.showToast({
                title: "数据已清除",
                icon: "success"
              });
              formatAppLog("log", "at pages/settings/settings.vue:458", "🗑️ 所有数据已清除");
            }
          }
        });
      },
      // 测试连接
      async testConnection() {
        uni.showLoading({
          title: "测试连接中..."
        });
        try {
          realData.setServerAddress(this.serverConfig.wsServer);
          const result = await realData.testConnection();
          this.testResult = result;
        } catch (error) {
          this.testResult = {
            success: false,
            message: "测试连接失败: " + error.message
          };
        } finally {
          uni.hideLoading();
          this.showTestResult = true;
        }
      },
      // 更新连接状态
      updateConnectionStatus() {
        this.connectionStatus = realData.getConnectionState();
      },
      // 处理连接状态变化
      handleConnectionChange(state) {
        this.connectionStatus = state;
      },
      // 获取状态文本
      getStatusText() {
        const map = {
          disconnected: "未连接",
          connecting: "连接中...",
          connected: "已连接",
          error: "连接错误"
        };
        return map[this.connectionStatus] || "未知状态";
      },
      // 阈值控制方法
      onPitchChanging(e) {
        this.thresholds.pitch = e.detail.value;
      },
      onPitchChange(e) {
        formatAppLog("log", "at pages/settings/settings.vue:516", "俯仰角阈值设置为:", e.detail.value, "°");
      },
      onRollChanging(e) {
        this.thresholds.roll = e.detail.value;
      },
      onRollChange(e) {
        formatAppLog("log", "at pages/settings/settings.vue:524", "横滚角阈值设置为:", e.detail.value, "°");
      },
      onSpo2Changing(e) {
        this.thresholds.spo2Min = e.detail.value;
      },
      onSpo2Change(e) {
        formatAppLog("log", "at pages/settings/settings.vue:532", "血氧阈值设置为:", e.detail.value, "%");
      },
      // 验证心率范围
      validateHrRange() {
        if (this.thresholds.hrMin >= this.thresholds.hrMax) {
          uni.showToast({
            title: "心率最小值不能大于最大值",
            icon: "error"
          });
          this.thresholds.hrMin = 30;
          this.thresholds.hrMax = 200;
        }
      }
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "settings-container" }, [
      vue.createElementVNode("view", { class: "user-card card" }, [
        vue.createElementVNode("view", { class: "user-header" }, [
          vue.createElementVNode("image", {
            class: "user-avatar",
            src: _imports_0
          }),
          vue.createElementVNode("view", { class: "user-info" }, [
            vue.createElementVNode("text", { class: "user-name" }, "潘文芳"),
            vue.createElementVNode("text", { class: "user-id" }, "学号: 2230090245")
          ])
        ]),
        vue.createElementVNode("view", { class: "user-meta" }, [
          vue.createElementVNode("text", { class: "meta-item" }, "物联网工程专业"),
          vue.createElementVNode("text", { class: "meta-item" }, "指导老师: 张涛"),
          vue.createElementVNode("text", { class: "meta-item" }, "毕业设计: 基于ESP32的多模态生理参数监测系统")
        ])
      ]),
      vue.createElementVNode("view", { class: "server-config-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "服务器配置"),
          vue.createElementVNode("button", {
            class: "test-btn",
            onClick: _cache[0] || (_cache[0] = (...args) => $options.testConnection && $options.testConnection(...args))
          }, "测试连接")
        ]),
        vue.createElementVNode("view", { class: "config-section" }, [
          vue.createElementVNode("view", { class: "config-item" }, [
            vue.createElementVNode("view", { class: "config-info" }, [
              vue.createElementVNode("text", { class: "config-label" }, "WebSocket地址"),
              vue.createElementVNode("text", { class: "config-desc" }, "Node.js数据服务器地址")
            ]),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "config-input",
                type: "text",
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $data.serverConfig.wsServer = $event),
                placeholder: "ws://192.168.10.103:8080"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $data.serverConfig.wsServer]
            ])
          ]),
          vue.createElementVNode("view", { class: "config-item" }, [
            vue.createElementVNode("view", { class: "config-info" }, [
              vue.createElementVNode("text", { class: "config-label" }, "UDP目标地址"),
              vue.createElementVNode("text", { class: "config-desc" }, "ESP32发送数据的目标地址")
            ]),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "config-input",
                type: "text",
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $data.serverConfig.udpTarget = $event),
                placeholder: "192.168.10.103"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $data.serverConfig.udpTarget]
            ])
          ]),
          vue.createElementVNode("view", { class: "config-item" }, [
            vue.createElementVNode("view", { class: "config-info" }, [
              vue.createElementVNode("text", { class: "config-label" }, "UDP端口"),
              vue.createElementVNode("text", { class: "config-desc" }, "ESP32发送数据的端口")
            ]),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "config-input",
                type: "number",
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $data.serverConfig.udpPort = $event),
                placeholder: "8888"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $data.serverConfig.udpPort]
            ])
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "threshold-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "体态预警阈值"),
          vue.createElementVNode("text", { class: "card-subtitle" }, "（单位：度）")
        ]),
        vue.createElementVNode("view", { class: "threshold-section" }, [
          vue.createElementVNode("view", { class: "threshold-item" }, [
            vue.createElementVNode("view", { class: "threshold-info" }, [
              vue.createElementVNode("text", { class: "threshold-label" }, "俯仰角阈值"),
              vue.createElementVNode("text", { class: "threshold-desc" }, "超过此角度判定为异常体态")
            ]),
            vue.createElementVNode("view", { class: "threshold-control" }, [
              vue.createElementVNode("slider", {
                value: $data.thresholds.pitch,
                min: "5",
                max: "30",
                step: "1",
                onChanging: _cache[4] || (_cache[4] = (...args) => $options.onPitchChanging && $options.onPitchChanging(...args)),
                onChange: _cache[5] || (_cache[5] = (...args) => $options.onPitchChange && $options.onPitchChange(...args))
              }, null, 40, ["value"]),
              vue.createElementVNode(
                "text",
                { class: "threshold-value" },
                vue.toDisplayString($data.thresholds.pitch) + "°",
                1
                /* TEXT */
              )
            ])
          ]),
          vue.createElementVNode("view", { class: "threshold-item" }, [
            vue.createElementVNode("view", { class: "threshold-info" }, [
              vue.createElementVNode("text", { class: "threshold-label" }, "横滚角阈值"),
              vue.createElementVNode("text", { class: "threshold-desc" }, "侧倾角度阈值")
            ]),
            vue.createElementVNode("view", { class: "threshold-control" }, [
              vue.createElementVNode("slider", {
                value: $data.thresholds.roll,
                min: "10",
                max: "40",
                step: "1",
                onChanging: _cache[6] || (_cache[6] = (...args) => $options.onRollChanging && $options.onRollChanging(...args)),
                onChange: _cache[7] || (_cache[7] = (...args) => $options.onRollChange && $options.onRollChange(...args))
              }, null, 40, ["value"]),
              vue.createElementVNode(
                "text",
                { class: "threshold-value" },
                vue.toDisplayString($data.thresholds.roll) + "°",
                1
                /* TEXT */
              )
            ])
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "threshold-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "生理参数阈值")
        ]),
        vue.createElementVNode("view", { class: "threshold-section" }, [
          vue.createElementVNode("view", { class: "threshold-item" }, [
            vue.createElementVNode("view", { class: "threshold-info" }, [
              vue.createElementVNode("text", { class: "threshold-label" }, "心率范围"),
              vue.createElementVNode("text", { class: "threshold-desc" }, "正常心率范围 (BPM)")
            ]),
            vue.createElementVNode("view", { class: "threshold-range" }, [
              vue.withDirectives(vue.createElementVNode(
                "input",
                {
                  type: "number",
                  class: "range-input",
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => $data.thresholds.hrMin = $event),
                  onBlur: _cache[9] || (_cache[9] = (...args) => $options.validateHrRange && $options.validateHrRange(...args))
                },
                null,
                544
                /* NEED_HYDRATION, NEED_PATCH */
              ), [
                [vue.vModelText, $data.thresholds.hrMin]
              ]),
              vue.createElementVNode("text", { class: "range-separator" }, "-"),
              vue.withDirectives(vue.createElementVNode(
                "input",
                {
                  type: "number",
                  class: "range-input",
                  "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => $data.thresholds.hrMax = $event),
                  onBlur: _cache[11] || (_cache[11] = (...args) => $options.validateHrRange && $options.validateHrRange(...args))
                },
                null,
                544
                /* NEED_HYDRATION, NEED_PATCH */
              ), [
                [vue.vModelText, $data.thresholds.hrMax]
              ]),
              vue.createElementVNode("text", { class: "range-unit" }, "BPM")
            ])
          ]),
          vue.createElementVNode("view", { class: "threshold-item" }, [
            vue.createElementVNode("view", { class: "threshold-info" }, [
              vue.createElementVNode("text", { class: "threshold-label" }, "血氧下限"),
              vue.createElementVNode("text", { class: "threshold-desc" }, "血氧饱和度最低值")
            ]),
            vue.createElementVNode("view", { class: "threshold-control" }, [
              vue.createElementVNode("slider", {
                value: $data.thresholds.spo2Min,
                min: "60",
                max: "95",
                step: "1",
                onChanging: _cache[12] || (_cache[12] = (...args) => $options.onSpo2Changing && $options.onSpo2Changing(...args)),
                onChange: _cache[13] || (_cache[13] = (...args) => $options.onSpo2Change && $options.onSpo2Change(...args))
              }, null, 40, ["value"]),
              vue.createElementVNode(
                "text",
                { class: "threshold-value" },
                vue.toDisplayString($data.thresholds.spo2Min) + "%",
                1
                /* TEXT */
              )
            ])
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "alert-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "预警级别设置")
        ]),
        vue.createElementVNode("view", { class: "alert-levels" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($data.alertLevels, (level) => {
              return vue.openBlock(), vue.createElementBlock("view", {
                class: "alert-level",
                key: level.value
              }, [
                vue.createElementVNode("view", { class: "level-header" }, [
                  vue.createElementVNode(
                    "view",
                    {
                      class: vue.normalizeClass(["level-indicator", `level-${level.value}`])
                    },
                    null,
                    2
                    /* CLASS */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "level-name" },
                    vue.toDisplayString(level.name),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "level-value" },
                    "(" + vue.toDisplayString(level.range[0]) + "° - " + vue.toDisplayString(level.range[1]) + "°)",
                    1
                    /* TEXT */
                  )
                ]),
                vue.createElementVNode("view", { class: "level-desc" }, [
                  vue.createElementVNode(
                    "text",
                    null,
                    vue.toDisplayString(level.desc),
                    1
                    /* TEXT */
                  )
                ]),
                vue.createElementVNode("view", { class: "level-config" }, [
                  vue.createElementVNode("view", { class: "config-row" }, [
                    vue.createElementVNode("text", { class: "config-label" }, "角度范围:"),
                    vue.withDirectives(vue.createElementVNode("input", {
                      type: "number",
                      class: "config-input small",
                      "onUpdate:modelValue": ($event) => level.range[0] = $event
                    }, null, 8, ["onUpdate:modelValue"]), [
                      [
                        vue.vModelText,
                        level.range[0],
                        void 0,
                        { number: true }
                      ]
                    ]),
                    vue.createElementVNode("text", { class: "config-separator" }, "-"),
                    vue.withDirectives(vue.createElementVNode("input", {
                      type: "number",
                      class: "config-input small",
                      "onUpdate:modelValue": ($event) => level.range[1] = $event
                    }, null, 8, ["onUpdate:modelValue"]), [
                      [
                        vue.vModelText,
                        level.range[1],
                        void 0,
                        { number: true }
                      ]
                    ]),
                    vue.createElementVNode("text", { class: "config-unit" }, "°")
                  ])
                ])
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ])
      ]),
      vue.createElementVNode("view", { class: "system-card card" }, [
        vue.createElementVNode("view", { class: "card-header" }, [
          vue.createElementVNode("text", { class: "card-title" }, "系统信息")
        ]),
        vue.createElementVNode("view", { class: "system-info" }, [
          vue.createElementVNode("view", { class: "system-item" }, [
            vue.createElementVNode("text", { class: "system-label" }, "应用版本"),
            vue.createElementVNode("text", { class: "system-value" }, "v1.3 (声光双重提示)")
          ]),
          vue.createElementVNode("view", { class: "system-item" }, [
            vue.createElementVNode("text", { class: "system-label" }, "ESP32固件"),
            vue.createElementVNode("text", { class: "system-value" }, "v1.3")
          ]),
          vue.createElementVNode("view", { class: "system-item" }, [
            vue.createElementVNode("text", { class: "system-label" }, "开发工具"),
            vue.createElementVNode("text", { class: "system-value" }, "HbuilderX + UniApp + Node.js")
          ]),
          vue.createElementVNode("view", { class: "system-item" }, [
            vue.createElementVNode("text", { class: "system-label" }, "硬件配置"),
            vue.createElementVNode("text", { class: "system-value" }, "MPU6050(体态) + MAX30102(心率血氧) + DHT11(温湿度) + TCRT5000(佩戴检测) | LED:1kΩ, DHT11上拉, 蜂鸣器低电平触发")
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "action-buttons" }, [
        vue.createElementVNode("button", {
          class: "action-btn save",
          onClick: _cache[14] || (_cache[14] = (...args) => $options.saveSettings && $options.saveSettings(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "💾"),
          vue.createElementVNode("text", null, "保存设置")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn reset",
          onClick: _cache[15] || (_cache[15] = (...args) => $options.resetSettings && $options.resetSettings(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🔄"),
          vue.createElementVNode("text", null, "恢复默认")
        ]),
        vue.createElementVNode("button", {
          class: "action-btn clear",
          onClick: _cache[16] || (_cache[16] = (...args) => $options.clearData && $options.clearData(...args))
        }, [
          vue.createElementVNode("text", { class: "btn-icon" }, "🗑️"),
          vue.createElementVNode("text", null, "清除数据")
        ])
      ]),
      $data.showTestResult ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "test-result-modal"
      }, [
        vue.createElementVNode("view", { class: "modal-content" }, [
          vue.createElementVNode("view", { class: "modal-header" }, [
            vue.createElementVNode("text", { class: "modal-title" }, "连接测试结果"),
            vue.createElementVNode("button", {
              class: "modal-close",
              onClick: _cache[17] || (_cache[17] = ($event) => $data.showTestResult = false)
            }, "✕")
          ]),
          vue.createElementVNode("view", { class: "modal-body" }, [
            vue.createElementVNode(
              "view",
              {
                class: vue.normalizeClass(["result-item", $data.testResult.success ? "success" : "error"])
              },
              [
                vue.createElementVNode(
                  "text",
                  { class: "result-icon" },
                  vue.toDisplayString($data.testResult.success ? "✅" : "❌"),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "result-text" },
                  vue.toDisplayString($data.testResult.message),
                  1
                  /* TEXT */
                )
              ],
              2
              /* CLASS */
            ),
            $data.testResult.latency ? (vue.openBlock(), vue.createElementBlock("view", {
              key: 0,
              class: "result-detail"
            }, [
              vue.createElementVNode(
                "text",
                null,
                "连接延迟: " + vue.toDisplayString($data.testResult.latency) + "ms",
                1
                /* TEXT */
              )
            ])) : vue.createCommentVNode("v-if", true),
            vue.createElementVNode("view", { class: "result-tips" }, [
              !$data.testResult.success ? (vue.openBlock(), vue.createElementBlock("text", { key: 0 }, "💡 请检查:")) : vue.createCommentVNode("v-if", true),
              !$data.testResult.success ? (vue.openBlock(), vue.createElementBlock("text", { key: 1 }, "1. Node.js服务器是否运行")) : vue.createCommentVNode("v-if", true),
              !$data.testResult.success ? (vue.openBlock(), vue.createElementBlock("text", { key: 2 }, "2. 服务器地址是否正确")) : vue.createCommentVNode("v-if", true),
              !$data.testResult.success ? (vue.openBlock(), vue.createElementBlock("text", { key: 3 }, "3. 防火墙是否允许端口")) : vue.createCommentVNode("v-if", true)
            ])
          ]),
          vue.createElementVNode("view", { class: "modal-footer" }, [
            vue.createElementVNode("button", {
              class: "modal-btn",
              onClick: _cache[18] || (_cache[18] = ($event) => $data.showTestResult = false)
            }, "确定")
          ])
        ])
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "footer-info" }, [
        vue.createElementVNode("text", { class: "footer-text" }, "基于ESP32的多模态生理参数监测系统"),
        vue.createElementVNode("text", { class: "footer-text" }, "天津师范大学 - 计算机与信息工程学院"),
        vue.createElementVNode("text", { class: "footer-text" }, "© 2026 毕业设计项目")
      ])
    ]);
  }
  const PagesSettingsSettings = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__scopeId", "data-v-7fad0a1c"], ["__file", "F:/1study/Graduation_project/HBuilderProjects/HealthMonitor/pages/settings/settings.vue"]]);
  __definePage("pages/index/index", PagesIndexIndex);
  __definePage("pages/history/history", PagesHistoryHistory);
  __definePage("pages/settings/settings", PagesSettingsSettings);
  const _sfc_main = {
    onLaunch: function() {
      formatAppLog("log", "at App.vue:5", "物联网健康监测系统启动");
      formatAppLog("log", "at App.vue:6", "作者：潘文芳 | 学号：2230090245");
      formatAppLog("log", "at App.vue:7", "指导老师：张涛 | 学院：计算机与信息工程学院");
    },
    onShow: function() {
      formatAppLog("log", "at App.vue:10", "App Show");
    },
    onHide: function() {
      formatAppLog("log", "at App.vue:13", "App Hide");
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "F:/1study/Graduation_project/HBuilderProjects/HealthMonitor/App.vue"]]);
  {
    formatAppLog("log", "at main.js:8", "🚀 开发模式启动");
    formatAppLog("log", "at main.js:9", "作者: 潘文芳 | 学号: 2230090245");
    formatAppLog("log", "at main.js:10", "项目: 基于ESP32的多模态生理参数监测系统");
  }
  function createApp() {
    const app = vue.createVueApp(App);
    app.config.globalProperties.$realData = realData;
    app.config.globalProperties.showConnectionStatus = function() {
      const state = realData.getConnectionState();
      const messages = {
        disconnected: "未连接服务器",
        connecting: "正在连接...",
        connected: "已连接到服务器",
        error: "连接错误"
      };
      uni.showToast({
        title: messages[state] || "未知状态",
        icon: state === "connected" ? "success" : "none"
      });
    };
    app.config.globalProperties.reconnectServer = function() {
      uni.showLoading({
        title: "重新连接中..."
      });
      realData.connect();
      setTimeout(() => {
        uni.hideLoading();
        this.showConnectionStatus();
      }, 2e3);
    };
    app.config.globalProperties.getServerAddress = function() {
      return realData.getServerAddress();
    };
    app.config.globalProperties.setServerAddress = function(address) {
      realData.setServerAddress(address);
    };
    return {
      app
    };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);

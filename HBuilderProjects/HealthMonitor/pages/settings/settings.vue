<template>
  <view class="settings-container">
    <!-- 用户信息 -->
    <view class="user-card card">
      <view class="user-header">
        <image class="user-avatar" src="/static/icons/avatar.png"></image>
        <view class="user-info">
          <text class="user-name">潘文芳</text>
          <text class="user-id">学号: 2230090245</text>
        </view>
      </view>
      <view class="user-meta">
        <text class="meta-item">物联网工程专业</text>
        <text class="meta-item">指导老师: 张涛</text>
        <text class="meta-item">毕业设计: 基于ESP32的多模态生理参数监测系统</text>
      </view>
    </view>

    <!-- 服务器配置 -->
    <view class="server-config-card card">
      <view class="card-header">
        <text class="card-title">服务器配置</text>
        <button class="test-btn" @tap="testConnection">测试连接</button>
      </view>
      
      <view class="config-section">
        <view class="config-item">
          <view class="config-info">
            <text class="config-label">WebSocket地址</text>
            <text class="config-desc">Node.js数据服务器地址</text>
          </view>
          <input class="config-input" type="text" v-model="serverConfig.wsServer" 
                 placeholder="ws://192.168.10.103:8080" />
        </view>
        
        <view class="config-item">
          <view class="config-info">
            <text class="config-label">UDP目标地址</text>
            <text class="config-desc">ESP32发送数据的目标地址</text>
          </view>
          <input class="config-input" type="text" v-model="serverConfig.udpTarget" 
                 placeholder="192.168.10.103" />
        </view>
        
        <view class="config-item">
          <view class="config-info">
            <text class="config-label">UDP端口</text>
            <text class="config-desc">ESP32发送数据的端口</text>
          </view>
          <input class="config-input" type="number" v-model="serverConfig.udpPort" 
                 placeholder="8888" />
        </view>
      </view>
      
      
    </view>

    <!-- 体态预警阈值设置 -->
    <view class="threshold-card card">
      <view class="card-header">
        <text class="card-title">体态预警阈值</text>
        <text class="card-subtitle">（单位：度）</text>
      </view>
      
      <view class="threshold-section">
        <view class="threshold-item">
          <view class="threshold-info">
            <text class="threshold-label">俯仰角阈值</text>
            <text class="threshold-desc">超过此角度判定为异常体态</text>
          </view>
          <view class="threshold-control">
            <slider :value="thresholds.pitch" min="5" max="30" step="1" 
                    @changing="onPitchChanging" @change="onPitchChange" />
            <text class="threshold-value">{{ thresholds.pitch }}°</text>
          </view>
        </view>
        
        <view class="threshold-item">
          <view class="threshold-info">
            <text class="threshold-label">横滚角阈值</text>
            <text class="threshold-desc">侧倾角度阈值</text>
          </view>
          <view class="threshold-control">
            <slider :value="thresholds.roll" min="10" max="40" step="1" 
                    @changing="onRollChanging" @change="onRollChange" />
            <text class="threshold-value">{{ thresholds.roll }}°</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 生理参数阈值设置 -->
    <view class="threshold-card card">
      <view class="card-header">
        <text class="card-title">生理参数阈值</text>
      </view>
      
      <view class="threshold-section">
        <view class="threshold-item">
          <view class="threshold-info">
            <text class="threshold-label">心率范围</text>
            <text class="threshold-desc">正常心率范围 (BPM)</text>
          </view>
          <view class="threshold-range">
            <input type="number" class="range-input" v-model="thresholds.hrMin" 
                   @blur="validateHrRange" />
            <text class="range-separator">-</text>
            <input type="number" class="range-input" v-model="thresholds.hrMax" 
                   @blur="validateHrRange" />
            <text class="range-unit">BPM</text>
          </view>
        </view>
        
        <view class="threshold-item">
          <view class="threshold-info">
            <text class="threshold-label">血氧下限</text>
            <text class="threshold-desc">血氧饱和度最低值</text>
          </view>
          <view class="threshold-control">
            <slider :value="thresholds.spo2Min" min="60" max="95" step="1" 
                    @changing="onSpo2Changing" @change="onSpo2Change" />
            <text class="threshold-value">{{ thresholds.spo2Min }}%</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 预警级别设置 -->
    <view class="alert-card card">
      <view class="card-header">
        <text class="card-title">预警级别设置</text>
      </view>
      
      <view class="alert-levels">
        <view class="alert-level" v-for="level in alertLevels" :key="level.value">
          <view class="level-header">
            <view :class="['level-indicator', `level-${level.value}`]"></view>
            <text class="level-name">{{ level.name }}</text>
            <text class="level-value">({{ level.range[0] }}° - {{ level.range[1] }}°)</text>
          </view>
          <view class="level-desc">
            <text>{{ level.desc }}</text>
          </view>
          <view class="level-config">
            <view class="config-row">
              <text class="config-label">角度范围:</text>
              <input type="number" class="config-input small" v-model.number="level.range[0]" />
              <text class="config-separator">-</text>
              <input type="number" class="config-input small" v-model.number="level.range[1]" />
              <text class="config-unit">°</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 系统信息卡片（已删除最后连接时间和数据统计） -->
    <view class="system-card card">
      <view class="card-header">
        <text class="card-title">系统信息</text>
      </view>
      
      <view class="system-info">
        <view class="system-item">
          <text class="system-label">应用版本</text>
          <text class="system-value">v1.3 (声光双重提示)</text>
        </view>
        
        <view class="system-item">
          <text class="system-label">ESP32固件</text>
          <text class="system-value">v1.3</text>
        </view>
        
        <view class="system-item">
          <text class="system-label">开发工具</text>
          <text class="system-value">HbuilderX + UniApp + Node.js</text>
        </view>
        
        <view class="system-item">
          <text class="system-label">硬件配置</text>
          <text class="system-value">MPU6050(体态) + MAX30102(心率血氧) + DHT11(温湿度) + TCRT5000(佩戴检测) | LED:1kΩ, DHT11上拉, 蜂鸣器低电平触发</text>
        </view>
      </view>
    </view>

    <!-- 操作按钮 -->
    <view class="action-buttons">
      <button class="action-btn save" @tap="saveSettings">
        <text class="btn-icon">💾</text>
        <text>保存设置</text>
      </button>
      
      <button class="action-btn reset" @tap="resetSettings">
        <text class="btn-icon">🔄</text>
        <text>恢复默认</text>
      </button>
      
      <button class="action-btn clear" @tap="clearData">
        <text class="btn-icon">🗑️</text>
        <text>清除数据</text>
      </button>
    </view>

    <!-- 测试结果弹窗 -->
    <view v-if="showTestResult" class="test-result-modal">
      <view class="modal-content">
        <view class="modal-header">
          <text class="modal-title">连接测试结果</text>
          <button class="modal-close" @tap="showTestResult = false">✕</button>
        </view>
        
        <view class="modal-body">
          <view class="result-item" :class="testResult.success ? 'success' : 'error'">
            <text class="result-icon">{{ testResult.success ? '✅' : '❌' }}</text>
            <text class="result-text">{{ testResult.message }}</text>
          </view>
          
          <view v-if="testResult.latency" class="result-detail">
            <text>连接延迟: {{ testResult.latency }}ms</text>
          </view>
          
          <view class="result-tips">
            <text v-if="!testResult.success">💡 请检查:</text>
            <text v-if="!testResult.success">1. Node.js服务器是否运行</text>
            <text v-if="!testResult.success">2. 服务器地址是否正确</text>
            <text v-if="!testResult.success">3. 防火墙是否允许端口</text>
          </view>
        </view>
        
        <view class="modal-footer">
          <button class="modal-btn" @tap="showTestResult = false">确定</button>
        </view>
      </view>
    </view>

    <!-- 页脚信息 -->
    <view class="footer-info">
      <text class="footer-text">基于ESP32的多模态生理参数监测系统</text>
      <text class="footer-text">天津师范大学 - 计算机与信息工程学院</text>
      <text class="footer-text">© 2026 毕业设计项目</text>
    </view>
  </view>
</template>

<script>
import realData from '@/common/real-data.js'

export default {
  data() {
    return {
      // 服务器配置
      serverConfig: {
        wsServer: 'ws://10.253.88.78:8080',
        udpTarget: '10.253.88.78',
        udpPort: 8888
      },
      
      // 连接状态
      connectionStatus: 'disconnected',
      
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
          name: '轻度预警',
          desc: '轻微体态异常，建议调整姿势',
          range: [15, 25]
        },
        {
          value: 2,
          name: '中度预警',
          desc: '明显体态异常，需要注意',
          range: [25, 35]
        },
        {
          value: 3,
          name: '重度预警',
          desc: '严重体态异常，需要立即调整',
          range: [35, 50]
        }
      ],
      
      // 测试结果
      showTestResult: false,
      testResult: {
        success: false,
        message: '',
        latency: 0
      }
    }
  },
  
  onLoad() {
    this.loadSettings()
    this.updateConnectionStatus()
    
    // 监听连接状态变化
    uni.$on('websocket_state_change', this.handleConnectionChange)
  },
  
  onUnload() {
    uni.$off('websocket_state_change', this.handleConnectionChange)
  },
  
  methods: {
    // 加载设置
    loadSettings() {
      try {
        // 加载服务器配置
        const savedServerConfig = uni.getStorageSync('server_config')
        if (savedServerConfig) {
          this.serverConfig = { ...this.serverConfig, ...savedServerConfig }
        }
        
        // 加载阈值配置
        const savedThresholds = uni.getStorageSync('threshold_config')
        if (savedThresholds) {
          this.thresholds = { ...this.thresholds, ...savedThresholds }
        }
        
        // 加载预警级别
        const savedAlertLevels = uni.getStorageSync('alert_levels')
        if (savedAlertLevels) {
          this.alertLevels = savedAlertLevels
        }
        
        console.log('✅ 设置加载完成')
      } catch (error) {
        console.error('加载设置失败:', error)
      }
    },
    
    // 保存设置
    saveSettings() {
      try {
        // 保存服务器配置
        uni.setStorageSync('server_config', this.serverConfig)
        
        // 保存阈值配置
        uni.setStorageSync('threshold_config', this.thresholds)
        
        // 保存预警级别
        uni.setStorageSync('alert_levels', this.alertLevels)
        
        // 更新实时数据模块
        realData.setServerAddress(this.serverConfig.wsServer)
        
        uni.showToast({
          title: '设置已保存',
          icon: 'success'
        })
        
        console.log('💾 设置保存完成')
        
      } catch (error) {
        console.error('保存设置失败:', error)
        uni.showToast({
          title: '保存失败',
          icon: 'error'
        })
      }
    },
    
    // 恢复默认设置
    resetSettings() {
      uni.showModal({
        title: '恢复默认设置',
        content: '确定要恢复所有设置为默认值吗？',
        success: (res) => {
          if (res.confirm) {
            // 重置服务器配置
            this.serverConfig = {
              wsServer: 'ws://10.253.88.78:8080',
              udpTarget: '10.253.88.78',
              udpPort: 8888
            }
            
            // 重置阈值配置
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
            }
            
            // 重置预警级别
            this.alertLevels = [
              {
                value: 1,
                name: '轻度预警',
                desc: '轻微体态异常，建议调整姿势',
                range: [15, 25]
              },
              {
                value: 2,
                name: '中度预警',
                desc: '明显体态异常，需要注意',
                range: [25, 35]
              },
              {
                value: 3,
                name: '重度预警',
                desc: '严重体态异常，需要立即调整',
                range: [35, 50]
              }
            ]
            
            uni.showToast({
              title: '已恢复默认设置',
              icon: 'success'
            })
            
            // 自动保存
            setTimeout(() => {
              this.saveSettings()
            }, 500)
          }
        }
      })
    },
    
    // 清除数据
    clearData() {
      uni.showModal({
        title: '清除数据',
        content: '确定要清除所有历史数据和统计信息吗？',
        success: (res) => {
          if (res.confirm) {
            // 清除历史数据
            realData.clearHistory()
            
            // 清除警报数据
            realData.clearAlerts()
            
            uni.showToast({
              title: '数据已清除',
              icon: 'success'
            })
            
            console.log('🗑️ 所有数据已清除')
          }
        }
      })
    },
    
    // 测试连接
    async testConnection() {
      uni.showLoading({
        title: '测试连接中...'
      })
      
      try {
        // 设置服务器地址
        realData.setServerAddress(this.serverConfig.wsServer)
        
        // 测试连接
        const result = await realData.testConnection()
        
        this.testResult = result
      } catch (error) {
        this.testResult = {
          success: false,
          message: '测试连接失败: ' + error.message
        }
      } finally {
        uni.hideLoading()
        this.showTestResult = true
      }
    },
    
    // 更新连接状态
    updateConnectionStatus() {
      this.connectionStatus = realData.getConnectionState()
    },
    
    // 处理连接状态变化
    handleConnectionChange(state) {
      this.connectionStatus = state
    },
    
    // 获取状态文本
    getStatusText() {
      const map = {
        disconnected: '未连接',
        connecting: '连接中...',
        connected: '已连接',
        error: '连接错误'
      }
      return map[this.connectionStatus] || '未知状态'
    },
    
    // 阈值控制方法
    onPitchChanging(e) {
      this.thresholds.pitch = e.detail.value
    },
    
    onPitchChange(e) {
      console.log('俯仰角阈值设置为:', e.detail.value, '°')
    },
    
    onRollChanging(e) {
      this.thresholds.roll = e.detail.value
    },
    
    onRollChange(e) {
      console.log('横滚角阈值设置为:', e.detail.value, '°')
    },
    
    onSpo2Changing(e) {
      this.thresholds.spo2Min = e.detail.value
    },
    
    onSpo2Change(e) {
      console.log('血氧阈值设置为:', e.detail.value, '%')
    },
    
    // 验证心率范围
    validateHrRange() {
      if (this.thresholds.hrMin >= this.thresholds.hrMax) {
        uni.showToast({
          title: '心率最小值不能大于最大值',
          icon: 'error'
        })
        this.thresholds.hrMin = 30
        this.thresholds.hrMax = 200
      }
    }
  }
}
</script>

<style scoped>
/* 样式保持不变，完全使用原 settings.vue 中的样式 */
.settings-container {
  padding: 20rpx;
  background: #f5f7fa;
  min-height: 100vh;
  padding-bottom: 160rpx;
}

/* 用户卡片 */
.user-card {
  margin-bottom: 20rpx;
}

.user-header {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.user-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  margin-right: 24rpx;
  border: 4rpx solid #4a90e2;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 8rpx;
}

.user-id {
  font-size: 26rpx;
  color: #666;
}

.user-meta {
  display: flex;
  flex-direction: column;
  background: #f9f9f9;
  padding: 20rpx;
  border-radius: 12rpx;
}

.meta-item {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

/* 服务器配置卡片 */
.server-config-card {
  margin-bottom: 20rpx;
}

.test-btn {
  background: #4a90e2;
  color: white;
  border-radius: 30rpx;
  padding: 12rpx 24rpx;
  font-size: 24rpx;
  border: none;
}

.config-section {
  margin-bottom: 24rpx;
}

.config-item {
  margin-bottom: 30rpx;
}

.config-info {
  margin-bottom: 12rpx;
}

.config-label {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 4rpx;
}

.config-desc {
  font-size: 24rpx;
  color: #666;
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

.connection-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx;
  background: #f9f9f9;
  border-radius: 12rpx;
}

.status-label {
  font-size: 28rpx;
  color: #333;
}

.status-indicator {
  display: flex;
  align-items: center;
}

.status-indicator.connected {
  color: #4CAF50;
}

.status-indicator.connecting {
  color: #FF9800;
}

.status-indicator.disconnected {
  color: #9e9e9e;
}

.status-indicator.error {
  color: #F44336;
}

.status-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  margin-right: 12rpx;
}

.status-indicator.connected .status-dot {
  background: #4CAF50;
}

.status-indicator.connecting .status-dot {
  background: #FF9800;
  animation: blink 1s infinite;
}

.status-indicator.disconnected .status-dot {
  background: #9e9e9e;
}

.status-indicator.error .status-dot {
  background: #F44336;
}

.status-text {
  font-size: 28rpx;
  font-weight: 500;
}

/* 阈值卡片 */
.threshold-card {
  margin-bottom: 20rpx;
}

.card-subtitle {
  font-size: 24rpx;
  color: #666;
  margin-left: 12rpx;
}

.threshold-section {
  margin-bottom: 20rpx;
}

.threshold-item {
  margin-bottom: 30rpx;
}

.threshold-control {
  display: flex;
  align-items: center;
}

.threshold-control slider {
  flex: 1;
  margin-right: 24rpx;
}

.threshold-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #4a90e2;
  min-width: 100rpx;
  text-align: right;
}

.threshold-range {
  display: flex;
  align-items: center;
}

.range-input {
  flex: 1;
  padding: 20rpx;
  background: #f9f9f9;
  border-radius: 8rpx;
  text-align: center;
  font-size: 28rpx;
  color: #333;
  border: 2rpx solid #e0e0e0;
}

.range-separator {
  margin: 0 20rpx;
  font-size: 28rpx;
  color: #666;
}

.range-unit {
  margin-left: 20rpx;
  font-size: 28rpx;
  color: #666;
}

/* 预警级别卡片 */
.alert-card {
  margin-bottom: 20rpx;
}

.alert-levels {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.alert-level {
  background: #f9f9f9;
  border-radius: 12rpx;
  padding: 24rpx;
}

.level-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.level-indicator {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  margin-right: 16rpx;
}

.level-1 {
  background: #FF9800;
}

.level-2 {
  background: #FF5722;
}

.level-3 {
  background: #F44336;
}

.level-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  margin-right: 12rpx;
}

.level-value {
  font-size: 24rpx;
  color: #666;
}

.level-desc {
  font-size: 26rpx;
  color: #666;
  margin-bottom: 16rpx;
  line-height: 1.4;
}

.level-config {
  background: white;
  padding: 16rpx;
  border-radius: 8rpx;
}

.config-row {
  display: flex;
  align-items: center;
}

.config-label {
  font-size: 26rpx;
  color: #333;
  margin-right: 16rpx;
  min-width: 140rpx;
}

.config-input.small {
  width: 120rpx;
  padding: 12rpx;
  background: #f9f9f9;
  border-radius: 6rpx;
  text-align: center;
  font-size: 26rpx;
  color: #333;
  border: 1rpx solid #ddd;
}

.config-separator {
  margin: 0 12rpx;
  font-size: 26rpx;
  color: #666;
}

.config-unit {
  margin-left: 12rpx;
  font-size: 26rpx;
  color: #666;
}

/* 系统信息卡片 */
.system-card {
  margin-bottom: 20rpx;
}

.system-info {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.system-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.system-item:last-child {
  border-bottom: none;
}

.system-label {
  font-size: 28rpx;
  color: #666;
  margin-bottom: 8rpx;
  display: block;
}

.system-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  line-height: 1.4;
}

/* 操作按钮 */
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
  border-radius: 50rpx;
  padding: 24rpx;
  font-size: 28rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  border: none;
  box-shadow: 0 6rpx 16rpx rgba(0,0,0,0.1);
}

.action-btn.save {
  background: #4a90e2;
  color: white;
}

.action-btn.reset {
  background: #FF9800;
  color: white;
}

.action-btn.clear {
  background: #f0f0f0;
  color: #333;
}

.btn-icon {
  font-size: 32rpx;
}

/* 测试结果弹窗 */
.test-result-modal {
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

.result-item {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.result-item.success {
  color: #4CAF50;
}

.result-item.error {
  color: #F44336;
}

.result-icon {
  font-size: 40rpx;
  margin-right: 16rpx;
}

.result-text {
  font-size: 28rpx;
  font-weight: 500;
}

.result-detail {
  background: #f9f9f9;
  padding: 16rpx;
  border-radius: 8rpx;
  margin-bottom: 20rpx;
}

.result-detail text {
  font-size: 26rpx;
  color: #666;
}

.result-tips {
  background: #e3f2fd;
  padding: 20rpx;
  border-radius: 8rpx;
}

.result-tips text {
  display: block;
  font-size: 24rpx;
  color: #1565C0;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

.modal-footer {
  padding: 30rpx;
  border-top: 1rpx solid #f0f0f0;
}

.modal-btn {
  width: 100%;
  padding: 24rpx;
  background: #4a90e2;
  color: white;
  border-radius: 50rpx;
  font-size: 28rpx;
  font-weight: 500;
  border: none;
}

/* 页脚信息 */
.footer-info {
  margin-top: 40rpx;
  padding: 30rpx 0;
  text-align: center;
  border-top: 1rpx solid #eee;
}

.footer-text {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-bottom: 8rpx;
  line-height: 1.4;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
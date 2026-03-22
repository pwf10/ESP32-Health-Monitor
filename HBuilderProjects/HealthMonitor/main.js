// main.js - Vue 3 版本（完全重写）
import App from './App.vue'
import { createSSRApp } from 'vue'
import realData from './common/real-data.js'

// 开发环境配置
if (process.env.NODE_ENV === 'development') {
  console.log('🚀 开发模式启动')
  console.log('作者: 潘文芳 | 学号: 2230090245')
  console.log('项目: 基于ESP32的多模态生理参数监测系统')
}

// 创建 Vue 3 应用
export function createApp() {
  const app = createSSRApp(App)
  
  // 配置全局属性
  app.config.globalProperties.$realData = realData
  
  // 全局方法
  app.config.globalProperties.showConnectionStatus = function() {
    const state = realData.getConnectionState()
    const messages = {
      disconnected: '未连接服务器',
      connecting: '正在连接...',
      connected: '已连接到服务器',
      error: '连接错误'
    }
    
    uni.showToast({
      title: messages[state] || '未知状态',
      icon: state === 'connected' ? 'success' : 'none'
    })
  }
  
  app.config.globalProperties.reconnectServer = function() {
    uni.showLoading({
      title: '重新连接中...'
    })
    
    realData.connect()
    
    setTimeout(() => {
      uni.hideLoading()
      this.showConnectionStatus()
    }, 2000)
  }
  
  app.config.globalProperties.getServerAddress = function() {
    return realData.getServerAddress()
  }
  
  app.config.globalProperties.setServerAddress = function(address) {
    realData.setServerAddress(address)
  }
  
  return {
    app
  }
}
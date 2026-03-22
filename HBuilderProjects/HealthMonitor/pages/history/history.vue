<template>
  <view class="history-container">
    <!-- 头部 -->
    <view class="header">
      <text class="title">📊 历史数据</text>
      <text class="subtitle">基于ESP32的健康监测记录</text>
    </view>

    <!-- 时间选择器 -->
    <view class="filter-card card">
      <view class="filter-header">
        <text class="filter-title">数据筛选</text>
        <text class="data-count">{{ filteredData.length }} 条记录</text>
      </view>
      
      <view class="time-range">
        <view class="time-input">
          <text class="time-label">开始时间</text>
          <picker mode="date" :value="startDate" @change="onStartDateChange">
            <view class="time-picker">
              <text>{{ startDate }}</text>
              <text class="icon">📅</text>
            </view>
          </picker>
        </view>
        
        <text class="time-separator">至</text>
        
        <view class="time-input">
          <text class="time-label">结束时间</text>
          <picker mode="date" :value="endDate" @change="onEndDateChange">
            <view class="time-picker">
              <text>{{ endDate }}</text>
              <text class="icon">📅</text>
            </view>
          </picker>
        </view>
      </view>
      
      <view class="quick-filters">
        <button v-for="filter in quickFilters" :key="filter.value" 
                :class="['filter-btn', activeFilter === filter.value ? 'active' : '']"
                @tap="applyQuickFilter(filter.value)">
          {{ filter.label }}
        </button>
      </view>
    </view>

    <!-- 统计概览 -->
    <view class="stats-card card">
      <view class="stats-header">
        <text class="stats-title">📈 统计概览</text>
      </view>
      
      <view class="stats-grid">
        <view class="stat-item">
          <text class="stat-value">{{ stats.totalCount }}</text>
          <text class="stat-label">总数据量</text>
        </view>
        
        <view class="stat-item">
          <text class="stat-value">{{ stats.abnormalCount }}</text>
          <text class="stat-label">异常次数</text>
        </view>
        
        <view class="stat-item">
          <text class="stat-value">{{ stats.avgHeartRate }}</text>
          <text class="stat-label">平均心率</text>
        </view>
        
        <view class="stat-item">
          <text class="stat-value">{{ stats.avgSpo2 }}</text>
          <text class="stat-label">平均血氧</text>
        </view>
      </view>
    </view>

    <!-- 数据趋势卡片 -->
    <view class="trend-card card">
      <view class="trend-header">
        <text class="trend-title">📈 数据趋势（最近10次）</text>
      </view>
      
      <view class="data-summary">
        <view class="summary-grid">
          <view class="summary-item">
            <text class="summary-label">最高心率</text>
            <text class="summary-value">{{ stats.maxHeartRate }} BPM</text>
          </view>
          
          <view class="summary-item">
            <text class="summary-label">最低心率</text>
            <text class="summary-value">{{ stats.minHeartRate }} BPM</text>
          </view>
          
          <view class="summary-item">
            <text class="summary-label">体态异常</text>
            <text class="summary-value">{{ stats.abnormalCount }} 次</text>
          </view>
          
          <view class="summary-item">
            <text class="summary-label">数据时间</text>
            <text class="summary-value">{{ lastDataTime }}</text>
          </view>
        </view>
      </view>
      
      <!-- 最近数据表格 -->
      <view class="recent-data-table">
        <view class="table-title">最近数据记录</view>
        <view class="table-header">
          <text class="header-cell time">时间</text>
          <text class="header-cell heart">心率</text>
          <text class="header-cell spo2">血氧</text>
          <text class="header-cell posture">体态</text>
          <text class="header-cell status">状态</text>
        </view>
        
        <view class="table-body">
          <view v-for="(item, index) in recentData" :key="index" class="table-row">
            <text class="cell time">{{ formatShortTime(item.timestamp) }}</text>
            <text class="cell heart">{{ item.heartRate || '--' }}</text>
            <text class="cell spo2">{{ item.spo2 || '--' }}</text>
            <text class="cell posture">{{ item.postureDisplay }}</text>
            <view class="cell status">
              <view :class="['status-badge', getStatusClass(item.status)]">
                {{ item.status }}
              </view>
            </view>
          </view>
          
          <view v-if="recentData.length === 0" class="empty-row">
            <text class="empty-text">暂无最近数据</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 异常记录（包含跌倒事件） -->
    <view class="records-card card">
      <view class="records-header">
        <text class="records-title">⚠️ 异常记录</text>
        <text class="records-count">{{ abnormalRecords.length }} 次</text>
      </view>
      
      <scroll-view class="records-list" scroll-y :style="{ height: recordsHeight + 'px' }">
        <view v-for="(record, index) in abnormalRecords" :key="index" class="record-item">
          <view class="record-header">
            <view class="record-time-wrapper">
              <text class="record-time">{{ formatTime(record.timestamp) }}</text>
              <text v-if="record.isFall" class="fall-mark">🚨 跌倒</text>
            </view>
            <view :class="['record-level', getLevelClass(record.level)]">
              {{ getLevelText(record.level) }}
            </view>
          </view>
          
          <view class="record-body">
            <text class="record-desc">{{ record.description }}</text>
          </view>
          
          <view class="record-data">
            <view class="data-row">
              <text class="data-label">体态:</text>
              <text class="data-value">{{ record.posture }}</text>
            </view>
            
            <view class="data-row">
              <text class="data-label">心率:</text>
              <text class="data-value">{{ record.heartRate }} BPM</text>
            </view>
            
            <view class="data-row">
              <text class="data-label">血氧:</text>
              <text class="data-value">{{ record.spo2 }}%</text>
            </view>
          </view>
        </view>
        
        <view v-if="abnormalRecords.length === 0" class="empty-state">
          <text class="empty-icon">📊</text>
          <text class="empty-text">暂无异常记录</text>
          <text class="empty-tip">所有数据都在正常范围内</text>
        </view>
      </scroll-view>
    </view>

    <!-- 详细数据列表 -->
    <view class="data-list-card card">
      <view class="list-header">
        <text class="list-title">📋 详细数据</text>
        
      </view>
      
      <scroll-view class="data-list" scroll-y :style="{ height: dataListHeight + 'px' }">
        <view class="list-header-row">
          <text class="header-cell time">时间</text>
          <text class="header-cell posture">体态</text>
          <text class="header-cell heart">心率</text>
          <text class="header-cell spo2">血氧</text>
          <text class="header-cell temp">温度</text>
          <text class="header-cell hum">湿度</text>
          <text class="header-cell status">状态</text>
        </view>
        
        <view v-for="(item, index) in paginatedData" :key="index" class="data-row">
          <text class="cell time">{{ formatShortTime(item._timestamp || item.timestamp) }}</text>
          <text class="cell posture">{{ formatPosture(item.posture_data) }}</text>
          <text class="cell heart">{{ (item.vital_data && item.vital_data.heart_rate) || '--' }}</text>
          <text class="cell spo2">{{ (item.vital_data && item.vital_data.spo2) || '--' }}</text>
          <text class="cell temp">{{ (item.environment_data && item.environment_data.temperature) || '--' }}°C</text>
          <text class="cell hum">{{ (item.environment_data && item.environment_data.humidity) || '--' }}%</text>
          <view class="cell status">
            <view :class="['status-badge', getItemStatusClass(item)]">
              {{ getItemStatus(item) }}
            </view>
          </view>
        </view>
        
        <view v-if="filteredData.length === 0" class="empty-data">
          <text class="empty-icon">📭</text>
          <text class="empty-text">暂无历史数据</text>
          <text class="empty-tip">请确保已连接到服务器并接收数据</text>
        </view>
      </scroll-view>
      
      <!-- 分页控件 -->
      <view v-if="filteredData.length > 0" class="pagination">
        <button class="page-btn" :disabled="currentPage === 1" @tap="prevPage">
          <text>上一页</text>
        </button>
        
        <text class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</text>
        
        <button class="page-btn" :disabled="currentPage === totalPages" @tap="nextPage">
          <text>下一页</text>
        </button>
      </view>
    </view>

    <!-- 底部操作 -->
    <view class="action-footer">
      <button class="action-btn refresh" @tap="refreshData">
        <text class="btn-icon">🔄</text>
        <text>刷新数据</text>
      </button>
      
      <button class="action-btn clear" @tap="clearHistory">
        <text class="btn-icon">🗑️</text>
        <text>清空记录</text>
      </button>
      
      <button class="action-btn back" @tap="goBack">
        <text class="btn-icon">←</text>
        <text>返回首页</text>
      </button>
    </view>

    <!-- 导出成功提示 -->
    <view v-if="showExportSuccess" class="export-success">
      <text>✅ 数据导出成功！</text>
      <text>文件已保存到本地</text>
    </view>
  </view>
</template>

<script>
import realData from '@/common/real-data.js'

export default {
  data() {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    return {
      startDate: this.formatDate(yesterday),
      endDate: this.formatDate(today),
      activeFilter: 'today',
      
      quickFilters: [
        { label: '今天', value: 'today' },
        { label: '昨天', value: 'yesterday' },
        { label: '最近7天', value: 'week' },
        { label: '最近30天', value: 'month' },
        { label: '全部', value: 'all' }
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
      lastDataTime: '--:--'
    }
  },
  
  computed: {
    paginatedData() {
      const start = (this.currentPage - 1) * this.pageSize
      const end = start + this.pageSize
      return this.filteredData.slice(start, end)
    }
  },
  
  onLoad() {
    this.loadHistoryData()
    this.calculateViewHeight()
  },
  
  onShow() {
    // 每次显示页面时刷新数据，确保看到最新记录
    this.refreshData()
  },
  
  methods: {
    formatDate(date) {
      const year = date.getFullYear()
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      return `${year}-${month}-${day}`
    },
    
    formatTime(timestamp) {
      if (!timestamp) return '--:--:--'
      const date = new Date(timestamp)
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
    },
    
    formatShortTime(timestamp) {
      if (!timestamp) return '--:--'
      const date = new Date(timestamp)
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    },
    
    formatPosture(posture) {
      if (!posture) return '--'
      if (typeof posture === 'string') return posture
      // 如果 posture 是对象（包含 pitch/roll）
      const pitch = posture.pitch !== undefined ? posture.pitch : '--'
      const roll = posture.roll !== undefined ? posture.roll : '--'
      return `${pitch}°,${roll}°`
    },
    
    loadHistoryData() {
      // 从 realData 获取历史数据（最多200条）
      this.rawData = realData.getHistoryData(200) || []
      console.log('📥 原始数据条数:', this.rawData.length)
      this.applyFilter()
      this.calculateStatistics()
      this.extractAbnormalRecords()
      this.getRecentData()
    },
    
    getRecentData() {
      this.recentData = this.filteredData.slice(0, 10).map(item => {
        // 优先使用存储的状态字段，否则回退到计算
        let status = item.posture_status || '正常'
        // 如果 status 还是 undefined，根据角度判断（兼容旧数据）
        if (status === '正常' && item.posture_data) {
          const pitch = item.posture_data.pitch || 0
          const roll = item.posture_data.roll || 0
          // 这里需要阈值，但历史数据可能没有阈值，所以只显示原始状态
          // 或者我们可以从存储中获取阈值？为了简单，不在此处计算，直接使用存储状态
        }
        
        // 构造体态显示字符串
        let postureDisplay = '--'
        if (item.posture_data) {
          const pitch = item.posture_data.pitch || 0
          const roll = item.posture_data.roll || 0
          postureDisplay = `${pitch}°,${roll}°`
        }
        
        return {
          timestamp: item._timestamp || item.timestamp,
          heartRate: (item.vital_data && item.vital_data.heart_rate) || 0,
          spo2: (item.vital_data && item.vital_data.spo2) || 0,
          postureDisplay: postureDisplay,
          status: status,  // 直接使用存储的状态
          temperature: (item.environment_data && item.environment_data.temperature) || 0,
          humidity: (item.environment_data && item.environment_data.humidity) || 0
        }
      })
      
      if (this.recentData.length > 0) {
        this.lastDataTime = this.formatShortTime(this.recentData[0].timestamp)
      } else {
        this.lastDataTime = '--:--'
      }
    },
    
    calculateViewHeight() {
      const systemInfo = uni.getSystemInfoSync()
      const windowHeight = systemInfo.windowHeight
      this.recordsHeight = windowHeight * 0.3
      this.dataListHeight = windowHeight * 0.4
    },
    
    onStartDateChange(e) {
      this.startDate = e.detail.value
      this.activeFilter = 'custom'
      this.applyFilter()
    },
    
    onEndDateChange(e) {
      this.endDate = e.detail.value
      this.activeFilter = 'custom'
      this.applyFilter()
    },
    
    applyQuickFilter(filter) {
      this.activeFilter = filter
      
      const today = new Date()
      const startDate = new Date()
      const endDate = new Date()
      
      switch(filter) {
        case 'today':
          this.startDate = this.formatDate(today)
          this.endDate = this.formatDate(today)
          break
        case 'yesterday':
          startDate.setDate(today.getDate() - 1)
          this.startDate = this.formatDate(startDate)
          this.endDate = this.formatDate(startDate)
          break
        case 'week':
          startDate.setDate(today.getDate() - 6)
          this.startDate = this.formatDate(startDate)
          this.endDate = this.formatDate(today)
          break
        case 'month':
          startDate.setDate(today.getDate() - 29)
          this.startDate = this.formatDate(startDate)
          this.endDate = this.formatDate(today)
          break
        case 'all':
          this.startDate = '2024-01-01'
          this.endDate = this.formatDate(today)
          break
      }
      
      this.applyFilter()
    },
    
    applyFilter() {
      const startTime = new Date(this.startDate + ' 00:00:00').getTime()
      const endTime = new Date(this.endDate + ' 23:59:59').getTime()
      
      this.filteredData = this.rawData.filter(item => {
        const itemTime = item._timestamp || item.timestamp || 0
        return itemTime >= startTime && itemTime <= endTime
      })
      
      // 按时间倒序排列（最新的在前）
      this.filteredData.sort((a, b) => {
        const timeA = a._timestamp || a.timestamp || 0
        const timeB = b._timestamp || b.timestamp || 0
        return timeB - timeA
      })
      
      this.currentPage = 1
      this.totalPages = Math.max(1, Math.ceil(this.filteredData.length / this.pageSize))
      
      console.log('🔍 筛选后数据条数:', this.filteredData.length)
      
      this.calculateStatistics()
      this.extractAbnormalRecords()
      this.getRecentData()
    },
    
    calculateStatistics() {
      const validHeartData = this.filteredData.filter(item => 
        item.vital_data && item.vital_data.heart_rate > 0
      )
      
      const validSpo2Data = this.filteredData.filter(item => 
        item.vital_data && item.vital_data.spo2 > 0
      )
      
      if (validHeartData.length === 0) {
        this.stats = {
          totalCount: this.filteredData.length,
          abnormalCount: 0,
          avgHeartRate: 0,
          avgSpo2: 0,
          maxHeartRate: 0,
          minHeartRate: 0
        }
        return
      }
      
      const heartRates = validHeartData.map(item => item.vital_data.heart_rate)
      const avgHeartRate = Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
      
      const spo2Values = validSpo2Data.map(item => item.vital_data.spo2)
      const avgSpo2 = spo2Values.length > 0 
        ? Math.round(spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length)
        : 0
      
      // 异常次数：使用新字段 posture_is_abnormal 或 fall_detected
      const abnormalCount = this.filteredData.filter(item => 
        item.posture_is_abnormal || item.fall_detected
      ).length
      
      this.stats = {
        totalCount: this.filteredData.length,
        abnormalCount: abnormalCount,
        avgHeartRate: avgHeartRate,
        avgSpo2: avgSpo2,
        maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : 0,
        minHeartRate: heartRates.length > 0 ? Math.min(...heartRates) : 0
      }
    },
    
    // 提取异常记录，包含跌倒事件
    extractAbnormalRecords() {
      this.abnormalRecords = this.filteredData
        .filter(item => item.posture_is_abnormal || item.fall_detected)
        .map(item => {
          const posture = item.posture_data ? 
            `${item.posture_data.pitch || 0}°, ${item.posture_data.roll || 0}°` : '--'
          return {
            timestamp: item._timestamp || item.timestamp,
            level: item.fall_detected ? 3 : (item.posture_level || 1),
            description: item.fall_detected ? '跌倒事件' : (item.posture_detail || '体态异常'),
            posture: posture,
            heartRate: (item.vital_data && item.vital_data.heart_rate) || 0,
            spo2: (item.vital_data && item.vital_data.spo2) || 0,
            isFall: item.fall_detected || false
          }
        })
        .slice(0, 20)  // 只显示最近20条异常
    },
    
    getLevelClass(level) {
      switch(level) {
        case 1: return 'level-mild'
        case 2: return 'level-moderate'
        case 3: return 'level-severe'
        default: return 'level-normal'
      }
    },
    
    getLevelText(level) {
      switch(level) {
        case 1: return '轻度'
        case 2: return '中度'
        case 3: return '重度'
        default: return '正常'
      }
    },
    
    getItemStatus(item) {
      if (item.fall_detected) return '跌倒'
      if (item.posture_is_abnormal) {
        // 如果有存储的状态，使用存储的状态
        if (item.posture_status) return item.posture_status
        return '体态异常'
      }
      if (item.vital_data) {
        const hr = item.vital_data.heart_rate
        const spo2 = item.vital_data.spo2
        if (hr > 0 && (hr < 30 || hr > 200)) return '心率异常'
        if (spo2 > 0 && spo2 < 70) return '血氧异常'
      }
      return '正常'
    },
    
    getItemStatusClass(item) {
      const status = this.getItemStatus(item)
      if (status === '正常') return 'status-normal'
      return 'status-warning'
    },
    
    getStatusClass(status) {
      if (!status || status === '正常') return 'status-normal'
      return 'status-warning'
    },
    
    prevPage() {
      if (this.currentPage > 1) this.currentPage--
    },
    
    nextPage() {
      if (this.currentPage < this.totalPages) this.currentPage++
    },
    
    refreshData() {
      this.loadHistoryData()
      uni.showToast({ title: '数据已刷新', icon: 'success' })
    },
    
    clearHistory() {
      uni.showModal({
        title: '清空历史记录',
        content: '确定要清空所有历史数据吗？此操作不可恢复。',
        success: (res) => {
          if (res.confirm) {
            realData.clearHistory()
            this.rawData = []
            this.filteredData = []
            this.abnormalRecords = []
            this.recentData = []
            this.calculateStatistics()
            uni.showToast({ title: '历史记录已清空', icon: 'success' })
          }
        }
      })
    },
    
    exportData() {
      if (this.filteredData.length === 0) {
        uni.showToast({ title: '没有数据可导出', icon: 'none' })
        return
      }
      
      uni.showLoading({ title: '正在导出数据...' })
      
      try {
        const exportData = this.prepareExportData()
        const csvContent = this.convertToCSV(exportData)
        
        // H5 环境导出
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        
        const link = document.createElement('a')
        link.href = url
        link.download = `健康监测数据_${this.startDate}_${this.endDate}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        URL.revokeObjectURL(url)
        uni.hideLoading()
        
        this.showExportSuccess = true
        setTimeout(() => { this.showExportSuccess = false }, 3000)
        uni.showToast({ title: '数据导出成功', icon: 'success' })
        
      } catch (error) {
        uni.hideLoading()
        uni.showToast({ title: '导出失败', icon: 'error' })
        console.error('导出数据失败:', error)
      }
    },
    
    prepareExportData() {
      return this.filteredData.map(item => ({
        时间: new Date(item._timestamp || item.timestamp).toLocaleString(),
        设备ID: item.device_id || '未知',
        佩戴状态: item.wear_status ? (item.wear_status.is_worn ? '已佩戴' : '未佩戴') : '未知',
        跌倒事件: item.fall_detected ? '是' : '否',
        俯仰角: (item.posture_data && item.posture_data.pitch) || 0,
        横滚角: (item.posture_data && item.posture_data.roll) || 0,
        体态状态: item.posture_status || '正常',
        体态等级: item.posture_level || 0,
        心率: (item.vital_data && item.vital_data.heart_rate) || 0,
        血氧: (item.vital_data && item.vital_data.spo2) || 0,
        温度: (item.environment_data && item.environment_data.temperature) || 0,
        湿度: (item.environment_data && item.environment_data.humidity) || 0,
        LED状态: (item.system_status && item.system_status.led_status) || '关闭',
        蜂鸣器状态: (item.system_status && item.system_status.buzzer_status) || '关闭',
        异常次数: (item.system_status && item.system_status.abnormal_count) || 0,
        信号强度: (item.system_status && item.system_status.rssi) || -99
      }))
    },
    
    convertToCSV(data) {
      if (!data.length) return ''
      const headers = Object.keys(data[0])
      let csvContent = headers.join(',') + '\n'
      data.forEach(row => {
        const rowData = headers.map(header => {
          let cell = row[header]
          if (typeof cell === 'string') {
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
              cell = `"${cell.replace(/"/g, '""')}"`
            }
          }
          return cell
        })
        csvContent += rowData.join(',') + '\n'
      })
      return csvContent
    },
    
    goBack() {
      uni.switchTab({ url: '/pages/index/index' })
    }
  }
}
</script>

<style scoped>
/* 样式保持不变，完全使用原 history.vue 中的样式 */
.history-container {
  padding: 20rpx;
  background: #f5f7fa;
  min-height: 100vh;
  padding-bottom: 160rpx;
}

.header {
  text-align: center;
  padding: 40rpx 0;
  margin-bottom: 20rpx;
}

.title {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  display: block;
  margin-bottom: 8rpx;
}

.subtitle {
  font-size: 26rpx;
  color: #666;
}

.card {
  background: white;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.05);
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.filter-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.data-count {
  font-size: 26rpx;
  color: #666;
  background: #f0f0f0;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.time-range {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.time-input {
  flex: 1;
}

.time-label {
  display: block;
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}

.time-picker {
  padding: 20rpx;
  background: #f9f9f9;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.time-separator {
  margin: 0 20rpx;
  font-size: 28rpx;
  color: #666;
}

.quick-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.filter-btn {
  flex: 1;
  min-width: 120rpx;
  padding: 16rpx;
  background: #f9f9f9;
  border: 2rpx solid #eee;
  border-radius: 30rpx;
  font-size: 24rpx;
  color: #666;
}

.filter-btn.active {
  background: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

.stats-header {
  margin-bottom: 24rpx;
}

.stats-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30rpx 20rpx;
  background: #f9f9f9;
  border-radius: 16rpx;
}

.stat-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #4a90e2;
  margin-bottom: 8rpx;
}

.stat-label {
  font-size: 24rpx;
  color: #666;
}

.trend-header {
  margin-bottom: 20rpx;
}

.trend-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.data-summary {
  margin-bottom: 30rpx;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15rpx;
}

.summary-item {
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border-radius: 12rpx;
  padding: 20rpx 16rpx;
  text-align: center;
}

.summary-label {
  font-size: 24rpx;
  color: #1565C0;
  display: block;
  margin-bottom: 8rpx;
  font-weight: 500;
}

.summary-value {
  font-size: 28rpx;
  font-weight: bold;
  color: #0D47A1;
  display: block;
}

.recent-data-table {
  border: 1rpx solid #f0f0f0;
  border-radius: 8rpx;
  overflow: hidden;
}

.table-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  padding: 20rpx;
  background: #f9f9f9;
  display: block;
}

.table-header {
  display: flex;
  background: #f5f5f5;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  font-weight: bold;
  font-size: 24rpx;
  color: #333;
}

.table-body {
  max-height: 400rpx;
  overflow-y: auto;
}

.table-row {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  align-items: center;
  font-size: 26rpx;
  color: #333;
}

.table-row:last-child {
  border-bottom: none;
}

.header-cell, .cell {
  flex: 1;
  text-align: center;
  padding: 0 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-cell.time, .cell.time {
  flex: 1.2;
}

.header-cell.heart, .cell.heart {
  flex: 0.8;
}

.header-cell.spo2, .cell.spo2 {
  flex: 0.8;
}

.header-cell.posture, .cell.posture {
  flex: 1.2;
}

.header-cell.status, .cell.status {
  flex: 1;
}

.status-badge {
  display: inline-block;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  font-size: 22rpx;
  font-weight: 500;
}

.status-normal {
  background: #e7f6ef;
  color: #0a9c5c;
}

.status-warning {
  background: #fff5e6;
  color: #ff8c00;
}

.empty-row {
  text-align: center;
  padding: 40rpx 0;
}

.empty-text {
  font-size: 26rpx;
  color: #999;
}

.records-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.records-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.records-count {
  font-size: 26rpx;
  color: #666;
  background: #fff5e6;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  color: #ff8c00;
}

.records-list {
  max-height: 400rpx;
}

.record-item {
  background: #f9f9f9;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.record-time-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.record-time {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
}

.fall-mark {
  font-size: 24rpx;
  background: #ffebee;
  color: #f44336;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  font-weight: 500;
}

.record-level {
  padding: 6rpx 20rpx;
  border-radius: 30rpx;
  font-size: 22rpx;
  font-weight: 500;
}

.level-mild {
  background: #fff5e6;
  color: #ff8c00;
}

.level-moderate {
  background: #ffeaea;
  color: #ff3b30;
}

.level-severe {
  background: #ffcccc;
  color: #d32f2f;
}

.record-desc {
  font-size: 28rpx;
  color: #333;
  line-height: 1.5;
  margin-bottom: 16rpx;
  display: block;
}

.record-data {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.data-row {
  display: flex;
  align-items: center;
}

.data-label {
  font-size: 24rpx;
  color: #666;
  min-width: 80rpx;
  margin-right: 12rpx;
}

.data-value {
  font-size: 24rpx;
  color: #333;
  font-weight: 500;
}

.empty-state {
  text-align: center;
  padding: 60rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  display: block;
  margin-bottom: 20rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #999;
  display: block;
  margin-bottom: 8rpx;
}

.empty-tip {
  font-size: 24rpx;
  color: #ccc;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}

.list-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
}

.export-btn {
  background: #4a90e2;
  color: white;
  border-radius: 30rpx;
  padding: 12rpx 24rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
  border: none;
}

.data-list {
  border: 1rpx solid #f0f0f0;
  border-radius: 8rpx;
}

.list-header-row {
  display: flex;
  background: #f9f9f9;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  font-weight: bold;
  font-size: 22rpx;
  color: #333;
}

.header-cell.time, .cell.time {
  flex: 1.2;
}

.header-cell.posture, .cell.posture {
  flex: 1;
}

.header-cell.heart, .cell.heart {
  flex: 0.8;
}

.header-cell.spo2, .cell.spo2 {
  flex: 0.8;
}

.header-cell.temp, .cell.temp {
  flex: 0.9;
}

.header-cell.hum, .cell.hum {
  flex: 0.9;
}

.header-cell.status, .cell.status {
  flex: 1;
}

.data-row {
  display: flex;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  font-size: 24rpx;
  color: #333;
}

.data-row:last-child {
  border-bottom: none;
}

.empty-data {
  text-align: center;
  padding: 60rpx 0;
  color: #999;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20rpx;
  padding: 20rpx 0;
  border-top: 1rpx solid #f0f0f0;
}

.page-btn {
  background: #f9f9f9;
  color: #333;
  border-radius: 30rpx;
  padding: 12rpx 24rpx;
  font-size: 24rpx;
  border: 1rpx solid #e0e0e0;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 24rpx;
  color: #666;
}

.action-footer {
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

.action-btn.refresh {
  background: #4a90e2;
  color: white;
}

.action-btn.clear {
  background: #FF9800;
  color: white;
}

.action-btn.back {
  background: #f0f0f0;
  color: #333;
}

.btn-icon {
  font-size: 32rpx;
}

.export-success {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 30rpx 50rpx;
  border-radius: 16rpx;
  text-align: center;
  z-index: 3000;
}

.export-success text {
  display: block;
  font-size: 28rpx;
  margin-bottom: 8rpx;
}
</style>
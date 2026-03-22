<!-- App.vue -->
<script>
export default {
  onLaunch: function() {
    console.log('物联网健康监测系统启动');
    console.log('作者：潘文芳 | 学号：2230090245');
    console.log('指导老师：张涛 | 学院：计算机与信息工程学院');
  },
  onShow: function() {
    console.log('App Show');
  },
  onHide: function() {
    console.log('App Hide');
  }
}
</script>

<style>
/* 全局样式 - 保持统一设计风格 */
page {
  background-color: #f8f9fa;
  font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  height: 100%;
}

/* 页面容器 */
.page-container {
  padding: 20rpx;
  min-height: 100vh;
}

/* 全局卡片样式 */
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.05);
}

/* 标题样式 */
.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 24rpx;
  padding-left: 12rpx;
  border-left: 8rpx solid #4a90e2;
}

/* 按钮样式 */
.primary-btn {
  background: linear-gradient(135deg, #4a90e2, #357abd);
  color: white;
  border-radius: 50rpx;
  padding: 20rpx 40rpx;
  font-size: 28rpx;
  font-weight: 500;
  text-align: center;
  box-shadow: 0 6rpx 16rpx rgba(74, 144, 226, 0.3);
}

.primary-btn:active {
  transform: scale(0.98);
  box-shadow: 0 4rpx 8rpx rgba(74, 144, 226, 0.2);
}

/* 状态标签 */
.status-tag {
  display: inline-block;
  padding: 8rpx 16rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
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

.status-danger {
  background: #ffeaea;
  color: #ff3b30;
}
</style>
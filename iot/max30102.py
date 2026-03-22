# -*- coding: utf-8 -*-
# ==================== 开题报告专属注释（可摘抄至论文） ====================
# 文件名：max30102.py
# 适配系统：基于ESP32的久坐综合健康监测系统
# 设计原则：I2C总线复用、轻量化、低功耗、高鲁棒性、模块化
# 通信方式：I2C（复用SDA21/SCL22），地址0x57，与MPU6050(0x68)无冲突
# 采集指标：心率(30-200BPM)、血氧饱和度(70-100%SpO2)
# 核心算法：滑动窗口滤波 + 简单峰值检测 + 经验公式
# 技术指标：采样率100Hz | LED电流可调 | 滤波窗口5样本
# ==========================================================================
from machine import I2C
import time

# ==================== 寄存器地址定义 ====================
MAX30102_I2C_ADDR = 0x57
REG_INT_STATUS1    = 0x00
REG_INT_STATUS2    = 0x01
REG_INT_ENABLE1    = 0x02
REG_INT_ENABLE2    = 0x03
REG_FIFO_WR_PTR    = 0x04
REG_OVF_COUNTER    = 0x05
REG_FIFO_RD_PTR    = 0x06
REG_FIFO_DATA      = 0x07
REG_FIFO_CONFIG    = 0x08
REG_MODE_CONFIG    = 0x09
REG_SPO2_CONFIG    = 0x0A
REG_LED1_PA        = 0x0C
REG_LED2_PA        = 0x0D
REG_TEMP_INTR      = 0x1F
REG_TEMP_FRAC      = 0x20
REG_TEMP_CONFIG    = 0x21
REG_PART_ID        = 0xFF

# ==================== 可调参数 ====================
SAMPLING_RATE      = 100
LED_CURRENT        = 0x2F        # 提高至约11mA (原0x20=6.4mA)
FIFO_SAMPLES       = 50           # 增加采样数
FILTER_WINDOW      = 5
HR_VALID_RANGE     = (30, 200)
SPO2_VALID_RANGE   = (70, 100)
VALID_DATA_THRESH  = 50           # 降低阈值，提高灵敏度

class MAX30102:
    def __init__(self, i2c):
        self.i2c = i2c
        self._data_buf = bytearray(6)
        self.heart_rate = 0
        self.spo2 = 0
        self._hardware_detection()
        self._sensor_reg_init()
        print("✅ MAX30102心率血氧传感器初始化完成")
        print("  硬件配置：I2C地址0x%02X | 器件ID验证通过" % MAX30102_I2C_ADDR)
        print("  采集参数：采样率%dHz | LED电流0x%02X | 滤波窗口%d样本" % (SAMPLING_RATE, LED_CURRENT, FILTER_WINDOW))
        print("  有效阈值：%d\n" % VALID_DATA_THRESH)

    def _write_reg(self, reg_addr, reg_val):
        self.i2c.writeto_mem(MAX30102_I2C_ADDR, reg_addr, bytearray([reg_val]))

    def _read_reg(self, reg_addr, read_len):
        return self.i2c.readfrom_mem(MAX30102_I2C_ADDR, reg_addr, read_len)

    def _hardware_detection(self):
        try:
            part_id = self._read_reg(REG_PART_ID, 1)[0]
            if part_id != 0x15:
                raise Exception("器件ID验证失败，检测到0x%02X，预期0x15" % part_id)
        except Exception as e:
            raise Exception("MAX30102硬件自检失败：%s\n  排错建议：1.VIN→3.3V 2.SDA→21/SCL→22 3.重新插拔" % e)

    def _sensor_reg_init(self):
        self._write_reg(REG_MODE_CONFIG, 0x00)
        time.sleep_ms(10)
        self._write_reg(REG_FIFO_CONFIG, 0x4F)
        self._write_reg(REG_SPO2_CONFIG, 0x27)
        self._write_reg(REG_LED1_PA, LED_CURRENT)
        self._write_reg(REG_LED2_PA, LED_CURRENT)
        self._write_reg(REG_MODE_CONFIG, 0x03)  # 切换到心率模式
        time.sleep_ms(10)

    def _read_fifo_raw(self):
        fifo_data = self._read_reg(REG_FIFO_DATA, 6)
        red_raw = (fifo_data[0] << 8) | fifo_data[1]
        ir_raw = (fifo_data[3] << 8) | fifo_data[4]
        return red_raw, ir_raw

    def _sliding_window_filter(self, data_list):
        if not data_list:
            return 0.0
        if len(data_list) < FILTER_WINDOW:
            return sum(data_list) / len(data_list)
        return sum(data_list[-FILTER_WINDOW:]) / FILTER_WINDOW

    def get_hr_spo2(self, samples=FIFO_SAMPLES):
        """
        改进版心率血氧解算：使用简单峰值检测 + 交流/直流分量估算
        返回 (心率, 血氧)，若无效返回 (0,0)
        """
        red_vals = []
        ir_vals = []
        for _ in range(samples):
            red_raw, ir_raw = self._read_fifo_raw()
            if red_raw > VALID_DATA_THRESH and ir_raw > VALID_DATA_THRESH:
                red_vals.append(red_raw)
                ir_vals.append(ir_raw)
            time.sleep_us(10000)  # 10ms间隔

        if len(red_vals) < samples // 2:  # 有效样本不足一半
            return 0, 0

        # 计算交流/直流分量
        red_min, red_max = min(red_vals), max(red_vals)
        ir_min, ir_max = min(ir_vals), max(ir_vals)

        red_ac = red_max - red_min
        red_dc = (red_max + red_min) / 2
        ir_ac = ir_max - ir_min
        ir_dc = (ir_max + ir_min) / 2

        if red_dc == 0 or ir_dc == 0:
            return 0, 0

        # 计算比值 R = (AC/DC)red / (AC/DC)ir
        R = (red_ac / red_dc) / (ir_ac / ir_dc)

        # 经验公式计算血氧
        spo2 = 110 - 25 * R
        if spo2 < 70:
            spo2 = 70
        elif spo2 > 100:
            spo2 = 100

        # 估算心率：通过红外信号的波峰检测
        threshold = (ir_max + ir_min) / 2
        peaks = []
        for i in range(1, len(ir_vals)-1):
            if ir_vals[i] > threshold and ir_vals[i] > ir_vals[i-1] and ir_vals[i] > ir_vals[i+1]:
                peaks.append(i)

        if len(peaks) < 2:
            hr = 0
        else:
            intervals = [(peaks[i+1] - peaks[i]) * 0.01 for i in range(len(peaks)-1)]
            avg_interval = sum(intervals) / len(intervals)
            hr = 60 / avg_interval if avg_interval > 0 else 0

        hr = max(HR_VALID_RANGE[0], min(HR_VALID_RANGE[1], int(hr)))
        spo2 = int(spo2)

        self.heart_rate = hr
        self.spo2 = spo2
        return hr, spo2

    def reset(self):
        self._write_reg(REG_MODE_CONFIG, 0x40)
        time.sleep_ms(100)
        print("🔄 MAX30102已重置")

    def get_temp(self):
        self._write_reg(REG_TEMP_CONFIG, 0x01)
        time.sleep_ms(10)
        temp_int = self._read_reg(REG_TEMP_INTR, 1)[0]
        temp_frac = self._read_reg(REG_TEMP_FRAC, 1)[0]
        temp = temp_int + temp_frac * 0.0625
        return round(temp, 1)

    def __del__(self):
        self._write_reg(REG_MODE_CONFIG, 0x00)
        print("🔴 MAX30102已关机")
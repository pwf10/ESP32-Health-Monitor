# max30102.py - 适配弱信号版（降低交流阈值，放宽波峰数量）
from machine import I2C
import time

MAX30102_I2C_ADDR = 0x57
REG_PART_ID        = 0xFF
REG_FIFO_DATA      = 0x07
REG_FIFO_CONFIG    = 0x08
REG_MODE_CONFIG    = 0x09
REG_SPO2_CONFIG    = 0x0A
REG_LED1_PA        = 0x0C
REG_LED2_PA        = 0x0D

SAMPLING_RATE      = 100
LED_CURRENT        = 0x3F          # 22mA
FIFO_SAMPLES       = 100
DC_THRESHOLD       = 8000          # 直流分量阈值（手指必须达到）
PP_THRESHOLD       = 100           # 降低交流阈值，适应弱信号

class MAX30102:
    def __init__(self, i2c):
        self.i2c = i2c
        self.heart_rate = 0
        self.spo2 = 0
        self._hardware_detection()
        self._sensor_init()

    def _write_reg(self, reg, val):
        self.i2c.writeto_mem(MAX30102_I2C_ADDR, reg, bytearray([val]))

    def _read_reg(self, reg, length):
        return self.i2c.readfrom_mem(MAX30102_I2C_ADDR, reg, length)

    def _hardware_detection(self):
        part_id = self._read_reg(REG_PART_ID, 1)[0]
        if part_id != 0x15:
            raise Exception("MAX30102未找到")
        print("✅ MAX30102初始化成功 (弱信号适配版)")

    def _sensor_init(self):
        self._write_reg(REG_MODE_CONFIG, 0x40)
        time.sleep_ms(100)
        self._write_reg(REG_FIFO_CONFIG, 0x4F)
        self._write_reg(REG_SPO2_CONFIG, 0x27)
        self._write_reg(REG_LED1_PA, LED_CURRENT)
        self._write_reg(REG_LED2_PA, LED_CURRENT)
        self._write_reg(REG_MODE_CONFIG, 0x03)
        time.sleep_ms(100)

    def _read_fifo(self):
        data = self._read_reg(REG_FIFO_DATA, 6)
        red = (data[0] << 16) | (data[1] << 8) | data[2]
        ir  = (data[3] << 16) | (data[4] << 8) | data[5]
        return red >> 8, ir >> 8

    def get_hr_spo2(self):
        red_vals = []
        ir_vals = []
        for _ in range(FIFO_SAMPLES):
            red, ir = self._read_fifo()
            red_vals.append(red)
            ir_vals.append(ir)
            time.sleep_us(10000)

        if len(red_vals) < FIFO_SAMPLES // 2:
            return 0, 0

        red_dc = sum(red_vals) / len(red_vals)
        ir_dc = sum(ir_vals) / len(ir_vals)
        red_pp = max(red_vals) - min(red_vals)
        ir_pp = max(ir_vals) - min(ir_vals)

        # 接触检测：直流分量足够大
        if red_dc < DC_THRESHOLD or ir_dc < DC_THRESHOLD:
            print("⚠️ 未接触 (dc:%.0f/%.0f)" % (red_dc, ir_dc))
            return 0, 0

        # 交流波动太小提示，但不直接返回（可能按压过紧）
        if red_pp < PP_THRESHOLD or ir_pp < PP_THRESHOLD:
            print("⚠️ 信号波动小，请减轻按压力度 (pp:%.0f/%.0f)" % (red_pp, ir_pp))

        # 血氧计算
        R = (red_pp / red_dc) / (ir_pp / ir_dc)
        spo2 = 110 - 25 * R
        spo2 = int(max(70, min(100, spo2)))

        # 心率计算（波峰检测）
        threshold = (max(ir_vals) + min(ir_vals)) / 2
        peaks = 0
        for i in range(1, len(ir_vals)-1):
            if ir_vals[i] > threshold and ir_vals[i] > ir_vals[i-1] and ir_vals[i] > ir_vals[i+1]:
                peaks += 1

        # 波峰数量合理性：放宽到1~6个
        if peaks < 1 or peaks > 6:
            print("⚠️ 波峰数量异常: %d" % peaks)
            return 0, 0

        duration_sec = FIFO_SAMPLES * 0.01
        hr = int(peaks / duration_sec * 60)
        hr = max(30, min(200, hr))

        self.heart_rate = hr
        self.spo2 = spo2
        print("✅ 有效数据: HR=%d, SpO2=%d" % (hr, spo2))
        return hr, spo2
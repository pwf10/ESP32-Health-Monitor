# 适配1kΩ临时上拉电阻的DHT11测试代码
from machine import Pin
import dht
import time

# 初始化DHT11（GPIO4），增加引脚初始化
dht_pin = Pin(4, Pin.OUT, value=1)  # 先置为高电平，适配1kΩ上拉
time.sleep(0.5)
dht_sensor = dht.DHT11(dht_pin)

print("=== 用1kΩ电阻临时测试DHT11 ===")
print("接线：DHT11 DATA → GPIO4 + 1kΩ → 3.3V")
print("开始读取10次，适配1kΩ时序...\n")

success_count = 0
retry_times = 3  # 每次采样重试3次

for i in range(10):
    print(f"采样 {i+1}/10:")
    read_ok = False
    # 每次采样重试3次，提高成功率
    for retry in range(retry_times):
        try:
            time.sleep(1.5)  # 延长延时，适配1kΩ时序
            dht_sensor.measure()
            temp = dht_sensor.temperature()
            hum = dht_sensor.humidity()
            # 过滤无效值（DHT11温度范围0-50℃，湿度20-90%）
            if 0 <= temp <= 50 and 20 <= hum <= 90:
                print(f"  ✔ 第{retry+1}次重试成功 → 温度: {temp}°C, 湿度: {hum}%RH")
                success_count += 1
                read_ok = True
                break
            else:
                print(f"  ⚠ 第{retry+1}次重试：数据无效（{temp}°C, {hum}%RH）")
        except Exception as e:
            print(f"  ✗ 第{retry+1}次重试失败 → 原因: {e}")
            # 失败后复位引脚
            dht_pin.value(1)
            time.sleep(0.2)

if not read_ok:
    print("  ✗ 读取失败")

# 测试总结
print(f"\n============================================================")
print(f"测试结果: {success_count}/10 次成功 ({success_count*10}%)")
if success_count >= 1:
    print("✅ DHT11通信正常！1kΩ电阻临时替代有效")
else:
    print("❌ 仍失败，检查：")
    print("  1. 1kΩ电阻是否接在DATA和3.3V之间")
    print("  2. DHT11的VCC是否接3.3V（接5V会通信异常）")
    print("  3. 杜邦线是否插紧（重点查DATA引脚）")
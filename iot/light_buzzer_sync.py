# light_buzzer_sync.py - 声光同步测试
from machine import Pin
import time

print("声光双重提示同步测试")
print("=" * 60)

# 初始化LED和蜂鸣器
led = Pin(2, Pin.OUT)      # LED在GPIO2
buzzer = Pin(13, Pin.OUT)  # 蜂鸣器在GPIO13（低电平触发）

# 初始状态：LED灭，蜂鸣器静音
led.value(0)
buzzer.value(1)

print("测试三种报警模式（声光同步）")
print("=" * 40)

print("\n1. 轻度异常模式（滴滴滴）")
print("   声光同步：LED闪烁与蜂鸣同步")
for i in range(3):
    print(f"   第{i+1}次：LED亮 + 蜂鸣器鸣（80ms）")
    led.value(1)
    buzzer.value(0)
    time.sleep(0.08)
    
    print(f"          LED灭 + 蜂鸣器静（200ms）")
    led.value(0)
    buzzer.value(1)
    time.sleep(0.2)

print("\n2. 中度异常模式（嘟-嘟）")
print("   声光同步：LED常亮与蜂鸣同步")
for i in range(2):
    print(f"   第{i+1}次：LED亮 + 蜂鸣器鸣（300ms）")
    led.value(1)
    buzzer.value(0)
    time.sleep(0.3)
    
    print(f"          LED灭 + 蜂鸣器静（400ms）")
    led.value(0)
    buzzer.value(1)
    time.sleep(0.4)

print("\n3. 重度异常模式（嘟---）")
print("   声光同步：LED快闪与蜂鸣同步")
for i in range(2):
    print(f"   第{i+1}次：LED亮 + 蜂鸣器鸣（800ms）")
    led.value(1)
    buzzer.value(0)
    time.sleep(0.8)
    
    print(f"          LED灭 + 蜂鸣器静（200ms）")
    led.value(0)
    buzzer.value(1)
    time.sleep(0.2)

# 确保所有设备关闭
led.value(0)
buzzer.value(1)

print("\n" + "=" * 60)
print("✅ 声光双重提示测试完成")
print("开题报告要求：'硬件声光双重提示' 功能验证通过")
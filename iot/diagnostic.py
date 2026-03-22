"""
毕业设计系统诊断脚本
"""
from machine import Pin, SoftI2C
import time
import network

print("=== 系统诊断工具 ===")
print("检查所有硬件连接和功能\n")

# 1. 检查WiFi连接
def check_wifi():
    print("1. 检查WiFi连接...")
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    
    if not wlan.isconnected():
        print("   ❌ WiFi未连接")
        print("   请配置WiFi连接")
        return False
    else:
        print(f"   ✅ WiFi已连接")
        print(f"   IP地址: {wlan.ifconfig()[0]}")
        return True

# 2. 检查I2C总线
def check_i2c():
    print("\n2. 检查I2C总线...")
    i2c = SoftI2C(sda=Pin(21), scl=Pin(22))
    
    devices = i2c.scan()
    if not devices:
        print("   ❌ I2C总线无设备")
        print("   检查SDA(21)/SCL(22)接线")
        return False
    else:
        print(f"   ✅ 发现 {len(devices)} 个I2C设备:")
        for addr in devices:
            print(f"     地址: 0x{addr:02X}")
        return True

# 3. 检查引脚状态
def check_pins():
    print("\n3. 检查GPIO引脚...")
    pins = [
        (4, "DHT11_DATA"),
        (14, "TCRT5000_D0"),
        (2, "LED"),
        (15, "BUZZER"),
    ]
    
    all_ok = True
    for pin_num, name in pins:
        try:
            pin = Pin(pin_num, Pin.IN)
            val = pin.value()
            print(f"   {name}(GPIO{pin_num}): 电平={val}")
        except Exception as e:
            print(f"   ❌ {name}(GPIO{pin_num}): 错误 - {e}")
            all_ok = False
    
    return all_ok

# 4. 检查电源
def check_power():
    print("\n4. 检查电源...")
    print("   🔋 请确保：")
    print("   - 所有传感器VCC接3.3V（不是5V！）")
    print("   - 所有GND共地")
    print("   - 电流充足（建议单独供电）")
    return True

# 5. 快速传感器测试
def quick_sensor_test():
    print("\n5. 快速传感器测试...")
    
    # 初始化I2C
    i2c = SoftI2C(sda=Pin(21), scl=Pin(22))
    
    # 测试TCRT5000
    print("   TCRT5000佩戴传感器:")
    try:
        from tcrt5000 import TCRT5000
        tcrt = TCRT5000()
        state = "遮挡" if tcrt.is_worn() else "未遮挡"
        print(f"     状态: {state} ✅")
    except Exception as e:
        print(f"     错误: {e} ❌")
    
    # 测试MPU6050
    print("\n   MPU6050体态传感器:")
    try:
        from mpu6050 import MPU6050
        mpu = MPU6050(i2c)
        accel = mpu.get_accel_data(calibrated=False)
        print(f"     加速度: X={accel['x']:.2f}g, Y={accel['y']:.2f}g, Z={accel['z']:.2f}g")
        
        # 判断放置方向
        if abs(accel['z']) > 0.8:
            print("     放置方向: 水平 ✅")
        elif abs(accel['x']) > 0.8:
            print("     放置方向: 侧放 ⚠（请水平放置）")
        elif abs(accel['y']) > 0.8:
            print("     放置方向: 侧放 ⚠（请水平放置）")
        else:
            print("     放置方向: 未知 ❓")
    except Exception as e:
        print(f"     错误: {e} ❌")

# 主诊断
def main_diagnosis():
    print("\n" + "="*60)
    print("开始系统诊断...")
    print("="*60)
    
    results = []
    
    results.append(check_wifi())
    results.append(check_i2c())
    results.append(check_pins())
    results.append(check_power())
    
    print("\n" + "="*60)
    print("诊断总结:")
    
    if all(results):
        print("✅ 所有基础检查通过")
        print("\n建议运行快速传感器测试:")
        quick_sensor_test()
    else:
        print("❌ 发现一些问题，请根据上述提示修复")
    
    print("\n" + "="*60)
    print("下一步操作:")
    print("1. 修复所有❌标记的问题")
    print("2. 运行 quick_sensor_test() 验证传感器")
    print("3. 重新运行完整系统")

if __name__ == "__main__":
    main_diagnosis()
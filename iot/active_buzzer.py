# buzzer_final.py - 最终蜂鸣器驱动（低电平触发，GPIO13）
from machine import Pin
import time

class BuzzerFinal:
    """
    最终版蜂鸣器驱动（低电平触发，针对GPIO13）
    经过测试确认：低电平(0)鸣响，高电平(1)静音
    报警模式有明显区别，易于区分
    """
    
    def __init__(self, pin_num=13):
        """
        初始化蜂鸣器
        :param pin_num: 引脚号（默认GPIO13）
        """
        self.pin_num = pin_num
        
        # 低电平触发：初始设置为高电平（不响）
        self.buzzer = Pin(pin_num, Pin.OUT)
        self.buzzer.value(1)  # 高电平，蜂鸣器静音
        
        self.is_active = False
        self.current_mode = 0  # 0=关闭，1=轻度，2=中度，3=重度
        
        print("=" * 50)
        print("蜂鸣器初始化完成【低电平触发，GPIO13】")
        print(f"  引脚: GPIO{pin_num}")
        print(f"  触发逻辑: 低电平(0)=鸣响 | 高电平(1)=静音")
        print(f"  初始状态: 高电平(静音)")
        print(f"  接线确认: VCC→3.3V, GND→GND, I/O→GPIO{pin_num}")
        print("=" * 50)
    
    def beep_on(self):
        """开启蜂鸣器（输出低电平）"""
        self.buzzer.value(0)
        self.is_active = True
    
    def beep_off(self):
        """关闭蜂鸣器（输出高电平）"""
        self.buzzer.value(1)
        self.is_active = False
    
    def beep(self, duration_ms=100):
        """单次蜂鸣"""
        self.beep_on()
        time.sleep_ms(duration_ms)
        self.beep_off()
    
    # 优化版报警模式（有明显区别）
    def alert_mode1_light(self):
        """
        轻度异常报警模式
        特点：短促的"滴滴滴"声，间隔较长
        用于：轻微体态异常提醒
        """
        # 三短促：滴-滴-滴
        for i in range(3):
            self.beep_on()
            time.sleep_ms(80)   # 短促鸣响
            self.beep_off()
            time.sleep_ms(200)  # 短间隔
        time.sleep_ms(500)      # 长间隔
    
    def alert_mode2_medium(self):
        """
        中度异常报警模式
        特点：中等的"嘟-嘟"声，间隔中等
        用于：明显体态异常警告
        """
        # 两中等：嘟-嘟
        for i in range(2):
            self.beep_on()
            time.sleep_ms(300)  # 中等鸣响
            self.beep_off()
            time.sleep_ms(400)  # 中等间隔
    
    def alert_mode3_heavy(self):
        """
        重度异常报警模式
        特点：持续的"嘟---"长鸣声，间隔短
        用于：严重体态异常紧急警报
        """
        # 一长鸣：嘟---
        self.beep_on()
        time.sleep_ms(800)      # 长鸣
        self.beep_off()
        time.sleep_ms(200)      # 短间隔
    
    def system_startup_tone(self):
        """系统启动提示音：三短一长"""
        for i in range(3):
            self.beep(80)
            time.sleep_ms(100)
        time.sleep_ms(200)
        self.beep(300)
    
    def system_shutdown_tone(self):
        """系统关闭提示音：一长两短"""
        self.beep(300)
        time.sleep_ms(200)
        for i in range(2):
            self.beep(80)
            time.sleep_ms(100)
    
    def warning_off(self):
        """强制关闭蜂鸣器"""
        self.beep_off()
        self.current_mode = 0
    
    def set_alert_mode(self, mode):
        """
        设置报警模式
        :param mode: 0=关闭，1=轻度，2=中度，3=重度
        """
        if mode == self.current_mode:
            return
        
        self.current_mode = mode
        
        if mode == 0:
            self.warning_off()
        elif mode == 1:
            self.alert_mode1_light()
        elif mode == 2:
            self.alert_mode2_medium()
        elif mode == 3:
            self.alert_mode3_heavy()
    
    def test_clear_modes(self):
        """
        测试清晰区分的报警模式
        """
        print("\n🔊 清晰报警模式测试")
        print("三种模式有明显区别，易于识别")
        print("=" * 50)
        
        print("\n1. 测试启动提示音...")
        self.system_startup_tone()
        time.sleep(1)
        
        print("\n2. 轻度异常模式（滴滴滴）")
        print("   应该听到：滴-滴-滴（短促快速）")
        for i in range(3):
            self.alert_mode1_light()
        
        print("\n3. 中度异常模式（嘟-嘟）")
        print("   应该听到：嘟--嘟--（中等长度）")
        for i in range(3):
            self.alert_mode2_medium()
        
        print("\n4. 重度异常模式（嘟---）")
        print("   应该听到：嘟-------（长鸣）")
        for i in range(3):
            self.alert_mode3_heavy()
        
        print("\n5. 测试关闭提示音...")
        self.system_shutdown_tone()
        
        self.warning_off()
        print("\n✅ 测试完成，蜂鸣器已关闭")
    
    def __del__(self):
        """确保蜂鸣器关闭"""
        self.warning_off()

# 独立测试
if __name__ == "__main__":
    print("最终蜂鸣器测试（低电平触发，GPIO13）")
    print("=" * 60)
    
    # 重要：确认引脚
    pin = 13
    print(f"使用引脚: GPIO{pin}")
    print("请确认接线:")
    print(f"  蜂鸣器I/O → ESP32 GPIO{pin}")
    print("  蜂鸣器VCC → ESP32 3.3V")
    print("  蜂鸣器GND → ESP32 GND")
    print("=" * 60)
    
    input("确认接线正确后按回车键开始测试...")
    
    buzzer = BuzzerFinal(pin_num=pin)
    time.sleep(1)
    
    try:
        buzzer.test_clear_modes()
    except KeyboardInterrupt:
        print("\n测试被中断")
    finally:
        buzzer.warning_off()
        print("蜂鸣器已关闭")
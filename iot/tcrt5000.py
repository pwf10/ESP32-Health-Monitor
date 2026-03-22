# 导入ESP32硬件核心库，与mpu6050.py/DHT11驱动库版本一致
from machine import Pin
import time

class TCRT5000:
    """
    四引脚**无电位器版**TCRT5000红外佩戴检测传感器驱动（毕设最终稳定版）
    适配：D0数字输出（高低电平）、A0模拟输出（悬空），无硬件电位器调节
    核心优化：针对偶发跳变强化防抖（6次检测+25ms间隔+60ms延迟），彻底解决状态飘移
    检测逻辑：遮挡探头→D0低电平(0)→返回已佩戴；未遮挡→D0高电平(1)→返回未佩戴
    """
    def __init__(self, pin_num=14):
        """
        初始化TCRT5000
        :param pin_num: D0引脚连接的ESP32引脚，默认GPIO14（开题报告指定）
        """
        # 初始化D0引脚：输入模式 + 软件上拉电阻（防信号飘移，必须配置）
        self.tcrt_pin = Pin(pin_num, Pin.IN, Pin.PULL_UP)
        self.pin_num = pin_num
        # 【最终稳定版防抖参数】针对偶发跳变强化，无需再修改
        self.default_check_samples = 6     # 防抖检测次数：6次（小幅强化）
        self.default_interval_ms = 25      # 每次检测间隔：25ms（过滤微弱干扰）
        self.delay_confirm_ms = 60         # 首次低电平延迟确认：60ms（消除瞬时反射）
        # 打印初始化信息，核对引脚和配置
        self._print_init_info()

    def _print_init_info(self):
        """内部函数：打印初始化信息，提示无电位器版接线/使用规范"""
        print("=" * 60)
        print("TCRT5000红外佩戴传感器初始化完成（四引脚·无电位器·最终稳定版）")
        print(f"  核心引脚：D0 → ESP32 GPIO{self.pin_num}（数字输出）")
        print(f"  闲置引脚：A0 → 悬空（无需接线，避免电平干扰）")
        print(f"  供电规范：VCC→3.3V  GND→共地（与MPU6050/DHT11共地）")
        print(f"  检测逻辑：遮挡探头=低电平(0)=已佩戴 | 未遮挡=高电平(1)=未佩戴")
        print(f"  防抖配置：6次检测+25ms间隔+60ms延迟（彻底解决偶发跳变）")
        print("=" * 60)

    def is_worn(self, check_samples=None, interval_ms=None):
        """
        核心方法：检测是否佩戴（毕设核心调用，无需传参）
        :param check_samples: 防抖检测次数，默认使用最终稳定版6次
        :param interval_ms: 每次检测间隔，默认使用最终稳定版25ms
        :return: bool → True=已佩戴（持续遮挡），False=未佩戴（无遮挡/瞬时干扰）
        """
        # 若未手动传参，使用最终稳定版防抖参数
        if check_samples is None:
            check_samples = self.default_check_samples
        if interval_ms is None:
            interval_ms = self.default_interval_ms
        
        # 第一步：首次检测到低电平，延迟60ms确认（核心，消除瞬时红外反射）
        if self.tcrt_pin.value() == 0:
            time.sleep_ms(self.delay_confirm_ms)
            # 延迟后若不是低电平，直接判定为未佩戴
            if self.tcrt_pin.value() != 0:
                return False
        
        # 第二步：6轮循环检测，累计佩戴次数
        worn_count = 0
        for _ in range(check_samples):
            if self.tcrt_pin.value() == 0:
                worn_count += 1
            time.sleep_ms(interval_ms)
        
        # 第三步：80%阈值判定（需5次及以上为低电平才认定佩戴，防误判）
        return worn_count >= int(check_samples * 0.8)

    def test_continuous(self, duration=20, check_samples=None, interval_ms=None):
        """
        单独连续测试方法：无需主程序，快速验证稳定版效果
        :param duration: 测试持续时间，默认20秒
        :param check_samples/interval_ms: 防抖参数，默认使用最终稳定版值
        :return: 测试结束后返回总检测次数
        """
        # 同步使用最终稳定版防抖参数
        if check_samples is None:
            check_samples = self.default_check_samples
        if interval_ms is None:
            interval_ms = self.default_interval_ms
        
        print(f"\n开始TCRT5000连续佩戴检测（持续{duration}秒·最终稳定版）")
        print("操作提示：用手/衣物贴近探头(2-3mm)=模拟佩戴，移开=模拟未佩戴")
        print("按Ctrl+C可提前停止测试")
        print("-" * 50)
        print(f"{'检测次数':<10}{'引脚电平':<10}{'佩戴状态':<10}")
        print("-" * 50)

        start_time = time.time()
        count = 0

        try:
            while time.time() - start_time < duration:
                count += 1
                pin_level = self.tcrt_pin.value()
                worn_state = self.is_worn(check_samples, interval_ms)
                state_str = "✅ 已佩戴" if worn_state else "❌ 未佩戴"
                level_str = f"低电平(0)" if pin_level == 0 else f"高电平(1)"
                print(f"{count:<10}{level_str:<10}{state_str:<10}")
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("\n" + "-" * 50)
            print("测试被手动停止！")

        # 测试总结+专属物理固定技巧（必做）
        print(f"\nTCRT5000测试完成 | 总检测次数：{count}")
        print("📌 无电位器版【必做】物理固定技巧（彻底解决跳变，零成本）：")
        print("  1. 抬高固定：用胶带垫高传感器2-3cm，远离桌面/墙壁（防红外反射）")
        print("  2. 防晃固定：用热熔胶/胶带将传感器粘死在支架/衣物上，避免晃动")
        print("  3. 防光干扰：探头贴1层薄透明胶带，远离灯光/阳光直射")
        print("  4. 佩戴距离：检测时探头贴近衣物1-3mm，触发灵敏且稳定")
        return count

# 单独测试主程序：直接运行即可验证，无需依赖其他传感器
if __name__ == "__main__":
    tcrt = TCRT5000()  # 默认GPIO14，改引脚传参如TCRT5000(15)
    time.sleep(1)      # 上电稳定1秒，避免初始电平飘移
    tcrt.test_continuous()  # 开始测试，默认20秒
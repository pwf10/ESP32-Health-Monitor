"""
基于ESP32的多模态生理参数监测系统 - 毕业设计最终版
===================================================
作者：潘文芳 | 学号：2230090245
指导老师：张涛 | 学院：计算机与信息工程学院
硬件配置：LED使用1kΩ限流电阻 | DHT11使用1kΩ上拉电阻 | 蜂鸣器低电平触发
通信地址：UDP发送至223.90.243.198:8888 (数据上报)
          UDP监听端口8889 (接收APP指令)
版本：v4.0（APP完全控制声光报警，服务器中转指令）
"""

from machine import Pin, SoftI2C, Timer
import time
import network
import socket
import json
import math

# ==================== 1. 导入传感器驱动 ====================
try:
    from mpu6050 import MPU6050
    print("✅ MPU6050驱动加载成功")
    MPU6050_可用 = True
except Exception as e:
    print("⚠ MPU6050驱动加载失败: %s" % e)
    MPU6050_可用 = False

try:
    from tcrt5000 import TCRT5000
    print("✅ TCRT5000驱动加载成功")
    TCRT5000_可用 = True
except Exception as e:
    print("⚠ TCRT5000驱动加载失败: %s" % e)
    TCRT5000_可用 = False

try:
    from max30102 import MAX30102
    print("✅ MAX30102驱动加载成功")
    MAX30102_可用 = True
except Exception as e:
    print("⚠ MAX30102驱动加载失败: %s" % e)
    MAX30102_可用 = False

# ==================== 2. 系统配置 ====================
WIFI_SSID = "one"
WIFI_PASSWORD = "2230090245"
UDP_TARGET_IP = "10.14.96.78"        # 服务器IP（电脑IP）
UDP_TARGET_PORT = 8888                   # 服务器UDP接收端口（数据上报）
UDP_RECV_PORT = 8889                      # 硬件接收指令的端口（APP指令）
UDP_BUFFER_SIZE = 1024

PIN_TCRT5000 = 14
PIN_MPU6050_SDA = 21
PIN_MPU6050_SCL = 22
PIN_DHT11 = 4
PIN_LED = 2
PIN_BUZZER = 13

PITCH_THRESHOLD = 15
ROLL_THRESHOLD = 20
HR_VALID_RANGE = (30, 200)
SPO2_VALID_RANGE = (70, 100)
TEMP_VALID_RANGE = (0, 50)
HUM_VALID_RANGE = (20, 90)

COLLECT_INTERVAL = 1.0
DHT11_RETRY_TIMES = 3
WEAR_CHECK_INTERVAL = 2
MAX_DATA_HISTORY = 50

# 跌倒检测参数（仅用于数据上报，不触发硬件报警）
FALL_SAMPLES = 20
FALL_INTERVAL_MS = 20
FALL_ACCEL_THRESH = 1.5
FALL_POSTURE_THRESH = 30
FALL_STATIC_THRESH = 0.05

# ==================== 3. WiFi连接模块 ====================
def connect_wifi():
    print("\n📡 正在连接WiFi: %s" % WIFI_SSID)
    print("=" * 50)
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        timeout = 15
        start_time = time.time()
        while not wlan.isconnected():
            if time.time() - start_time > timeout:
                print("❌ WiFi连接超时")
                return False, None
            time.sleep(1)
    ip_address = wlan.ifconfig()[0]
    print("✅ WiFi连接成功！ IP: %s" % ip_address)
    return True, ip_address

# ==================== 4. 传感器初始化模块 ====================
def initialize_sensors():
    print("\n🔧 正在初始化传感器...")
    print("=" * 50)
    sensors = {}
    sensor_status = {
        'tcrt5000': False, 'mpu6050': False, 'max30102': False,
        'dht11': True, 'led': False, 'buzzer': False
    }

    # I2C总线
    try:
        i2c = SoftI2C(sda=Pin(PIN_MPU6050_SDA), scl=Pin(PIN_MPU6050_SCL), freq=400000)
        print("✅ I2C总线初始化成功")
        sensors['i2c'] = i2c
    except Exception as e:
        print("❌ I2C总线初始化失败: %s" % e)
        return None, sensor_status

    # TCRT5000
    if TCRT5000_可用:
        try:
            sensors['tcrt'] = TCRT5000(pin_num=PIN_TCRT5000)
            sensor_status['tcrt5000'] = True
        except Exception as e:
            print("❌ TCRT5000初始化失败: %s" % e)

    # MPU6050
    if MPU6050_可用:
        try:
            sensors['mpu'] = MPU6050(i2c, addr=0x68)
            sensor_status['mpu6050'] = True
            sensors['mpu'].auto_calibrate(samples=50)  # 自动校准
        except Exception as e:
            print("❌ MPU6050初始化失败: %s" % e)

    # MAX30102
    if MAX30102_可用:
        try:
            sensors['max30102'] = MAX30102(i2c)
            sensor_status['max30102'] = True
        except Exception as e:
            print("❌ MAX30102初始化失败: %s" % e)

    # LED
    try:
        sensors['led'] = Pin(PIN_LED, Pin.OUT, value=0)
        sensor_status['led'] = True
        print("✅ LED初始化成功")
    except Exception as e:
        print("❌ LED初始化失败: %s" % e)

    # 蜂鸣器（低电平触发）
    try:
        sensors['buzzer'] = Pin(PIN_BUZZER, Pin.OUT, value=1)  # 初始高电平（静音）
        sensor_status['buzzer'] = True
        print("✅ 蜂鸣器初始化成功")
    except Exception as e:
        print("❌ 蜂鸣器初始化失败: %s" % e)

    print("=" * 50)
    return sensors, sensor_status

# ==================== 5. DHT11温湿度读取模块 ====================
def read_dht11():
    import dht
    for attempt in range(DHT11_RETRY_TIMES):
        try:
            dht_pin = Pin(PIN_DHT11, Pin.OUT, value=1)
            time.sleep(0.2)
            dht_sensor = dht.DHT11(dht_pin)
            time.sleep(1.0)
            dht_sensor.measure()
            temp = dht_sensor.temperature()
            hum = dht_sensor.humidity()
            if (TEMP_VALID_RANGE[0] <= temp <= TEMP_VALID_RANGE[1] and
                HUM_VALID_RANGE[0] <= hum <= HUM_VALID_RANGE[1]):
                return temp, hum, True
        except:
            time.sleep(0.5)
    return 25.0, 60.0, False

# ==================== 6. MAX30102数据读取模块 ====================
def read_max30102(sensor):
    if not sensor:
        return 0, 0, False
    try:
        hr, spo2 = sensor.get_hr_spo2()
        if (HR_VALID_RANGE[0] <= hr <= HR_VALID_RANGE[1] and
            SPO2_VALID_RANGE[0] <= spo2 <= SPO2_VALID_RANGE[1]):
            return hr, spo2, True
        return 0, 0, False
    except:
        return 0, 0, False

# ==================== 7. 数据打包与UDP上报模块 ====================
def send_udp_data(udp_socket, sensor_data):
    try:
        data_packet = {
            'device_id': 'ESP32-Health-Monitor',  # 固定设备ID
            'student_id': '2230090245',
            'project_name': '基于ESP32的久坐健康监测系统',
            'timestamp': time.time(),
            'time': sensor_data['time'],
            'wear_status': {
                'is_worn': sensor_data['is_worn'],
                'description': '已佩戴' if sensor_data['is_worn'] else '未佩戴'
            },
            'posture_data': {
                'pitch': sensor_data['pitch'],
                'roll': sensor_data['roll'],
                'status': 'unknown',        # APP会重新计算
                'detail': '',
                'level': 0,
                'is_abnormal': False,
                'threshold': PITCH_THRESHOLD
            },
            'vital_data': {
                'heart_rate': sensor_data['heart_rate'],
                'spo2': sensor_data['spo2'],
                'hr_valid': sensor_data['hr_valid'],
                'spo2_valid': sensor_data['spo2_valid']
            },
            'environment_data': {
                'temperature': sensor_data['temperature'],
                'humidity': sensor_data['humidity'],
                'temp_valid': sensor_data['temp_valid'],
                'hum_valid': sensor_data['hum_valid']
            },
            'fall_detected': sensor_data.get('fall_detected', False),
            'system_status': {
                'battery': sensor_data.get('battery', 85),
                'rssi': sensor_data.get('rssi', -50),
                'data_count': sensor_data.get('data_count', 0),
                'abnormal_count': sensor_data.get('abnormal_count', 0),
                'led_status': '关闭',        # 状态由APP控制，此处仅示意
                'buzzer_status': '关闭'
            },
            'network_info': {
                'target_ip': UDP_TARGET_IP,
                'target_port': UDP_TARGET_PORT,
                'local_ip': sensor_data.get('local_ip', '未知')
            }
        }
        json_data = json.dumps(data_packet)
        udp_socket.sendto(json_data.encode(), (UDP_TARGET_IP, UDP_TARGET_PORT))
        return True, len(json_data)
    except Exception as e:
        print("⚠ UDP发送失败: %s" % e)
        return False, 0

# ==================== 8. 数据显示格式化模块 ====================
def format_display_data(sensor_data):
    time_str = sensor_data['time']
    wear_str = "✅佩戴" if sensor_data['is_worn'] else "❌未戴"
    fall_str = "🚨跌倒" if sensor_data.get('fall_detected', False) else "正常"
    pitch_str = "%6.1f°" % sensor_data['pitch']
    roll_str = "%6.1f°" % sensor_data['roll']
    hr_str = "%3dBPM" % sensor_data['heart_rate'] if sensor_data['heart_rate']>0 else "   --   "
    spo2_str = "%3d%% " % sensor_data['spo2'] if sensor_data['spo2']>0 else "   --   "
    temp_str = "%5.1f°C" % sensor_data['temperature'] if sensor_data['temp_valid'] else "   --    "
    hum_str = "%5.1f%% " % sensor_data['humidity'] if sensor_data['hum_valid'] else "   --    "
    display_str = (
        "[%s] %s | 跌倒:%s | 体态: (俯仰%s, 横滚%s) | 心率: %s | 血氧: %s | 温度: %s | 湿度: %s" %
        (time_str, wear_str, fall_str, pitch_str, roll_str, hr_str, spo2_str, temp_str, hum_str)
    )
    return display_str

# ==================== 9. 声光控制函数 ====================
def control_alert(sensors, alert_timer, level, duration):
    """
    控制LED和蜂鸣器
    :param sensors: 传感器字典（包含led和buzzer）
    :param alert_timer: 定时器对象
    :param level: 报警级别（0=关闭，1=轻度，2=中度，3=重度，仅用于显示，实际控制相同）
    :param duration: 持续时间（秒），0表示立即关闭
    """
    # 先停止当前声光（如果有）
    stop_alert(sensors, alert_timer)
    
    if level > 0:
        # 开启声光
        if 'led' in sensors:
            sensors['led'].value(1)
        if 'buzzer' in sensors:
            sensors['buzzer'].value(0)  # 低电平触发
        print("🔊 声光开启，level=%d, duration=%ds" % (level, duration))

        # 如果指定了持续时间，设置定时器自动关闭
        if duration > 0:
            alert_timer.init(period=int(duration * 1000),
                             mode=Timer.ONE_SHOT,
                             callback=lambda t: stop_alert(sensors, alert_timer))
    # else: level == 0 时已经调用 stop_alert，无需额外处理

def stop_alert(sensors, alert_timer):
    """关闭LED和蜂鸣器"""
    if 'led' in sensors:
        sensors['led'].value(0)
    if 'buzzer' in sensors:
        sensors['buzzer'].value(1)
    try:
        alert_timer.deinit()
    except:
        pass
    print("🔕 声光已关闭")

# ==================== 10. 主程序模块 ====================
def main():
    print("=" * 60)
    print("🎯 基于ESP32的多模态生理参数监测系统 - 启动中")
    print("📅 作者：潘文芳 | 学号：2230090245")
    print("🔔 版本：v4.0（APP完全控制声光报警，服务器中转）")
    print("=" * 60)

    # 启动提示音（短鸣两次，表示启动）
    try:
        buzzer = Pin(PIN_BUZZER, Pin.OUT)
        buzzer.value(0)
        time.sleep_ms(100)
        buzzer.value(1)
        time.sleep_ms(100)
        buzzer.value(0)
        time.sleep_ms(200)
        buzzer.value(1)
    except:
        pass

    wifi_connected, local_ip = connect_wifi()
    if not wifi_connected:
        print("❌ WiFi连接失败，系统无法正常运行")
        return

    # 创建 UDP 发送 socket（用于数据上报）
    try:
        udp_send = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        print("✅ UDP发送Socket初始化成功")
    except Exception as e:
        print("❌ UDP发送Socket初始化失败: %s" % e)
        return

    # 创建 UDP 接收 socket（用于接收APP指令）
    try:
        udp_recv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_recv.bind(('0.0.0.0', UDP_RECV_PORT))
        udp_recv.setblocking(False)  # 非阻塞模式
        print("✅ UDP接收Socket初始化成功，监听端口 %d" % UDP_RECV_PORT)
    except Exception as e:
        print("❌ UDP接收Socket初始化失败: %s" % e)
        return

    sensors, sensor_status = initialize_sensors()
    if sensors is None:
        print("❌ 传感器初始化失败，系统退出")
        return

    data_count = 0
    abnormal_count = 0
    history_data = []

    # 用于声光控制的定时器
    alert_timer = Timer(0)

    print("\n🚀 系统启动成功，开始数据采集...")
    print("=" * 60)

    try:
        while True:
            # ---------- 接收APP指令（非阻塞） ----------
            try:
                data, addr = udp_recv.recvfrom(1024)
                if data:
                    cmd = json.loads(data.decode())
                    print("📥 收到指令: %s" % cmd)
                    if cmd.get('type') == 'alert':
                        level = cmd.get('level', 0)
                        duration = cmd.get('duration', 0)
                        control_alert(sensors, alert_timer, level, duration)
                    elif cmd.get('type') == 'stop_alert':
                        stop_alert(sensors, alert_timer)
            except OSError:
                # 无数据可读，正常继续
                pass
            except Exception as e:
                print("⚠ 指令解析错误: %s" % e)

            # ---------- 采集传感器数据 ----------
            current_time = time.localtime()
            time_str = "%04d-%02d-%02d %02d:%02d:%02d" % (
                current_time[0], current_time[1], current_time[2],
                current_time[3], current_time[4], current_time[5]
            )

            sensor_data = {
                'time': time_str,
                'is_worn': False,
                'pitch': 0.0,
                'roll': 0.0,
                'heart_rate': 0,
                'spo2': 0,
                'hr_valid': False,
                'spo2_valid': False,
                'temperature': 0.0,
                'humidity': 0.0,
                'temp_valid': False,
                'hum_valid': False,
                'local_ip': local_ip,           # 已包含硬件IP
                'data_count': data_count,
                'abnormal_count': abnormal_count,
                'fall_detected': False
            }

            # 佩戴检测
            if TCRT5000_可用 and 'tcrt' in sensors:
                try:
                    sensor_data['is_worn'] = sensors['tcrt'].is_worn()
                except:
                    sensor_data['is_worn'] = False
            else:
                sensor_data['is_worn'] = True

            if sensor_data['is_worn']:
                # MPU6050 体态数据
                if MPU6050_可用 and 'mpu' in sensors:
                    try:
                        accel_data = sensors['mpu'].get_accel_data(calibrated=True)
                        pitch = math.atan2(accel_data['y'], math.sqrt(accel_data['x']**2 + accel_data['z']**2)) * 180 / math.pi
                        roll = math.atan2(-accel_data['x'], accel_data['z']) * 180 / math.pi
                        sensor_data['pitch'] = round(pitch, 1)
                        sensor_data['roll'] = round(roll, 1)

                        # 跌倒检测（仅上报，不触发硬件报警）
                        fall = sensors['mpu'].detect_fall(
                            samples=FALL_SAMPLES,
                            interval_ms=FALL_INTERVAL_MS,
                            accel_thresh=FALL_ACCEL_THRESH,
                            posture_thresh=FALL_POSTURE_THRESH,
                            static_thresh=FALL_STATIC_THRESH
                        )
                        sensor_data['fall_detected'] = fall
                    except Exception as e:
                        print("⚠ MPU6050读取失败: %s" % e)
                else:
                    sensor_data['pitch'] = 5.0
                    sensor_data['roll'] = 8.0

                # MAX30102
                if MAX30102_可用 and 'max30102' in sensors:
                    hr, spo2, valid = read_max30102(sensors['max30102'])
                    sensor_data['heart_rate'] = hr
                    sensor_data['spo2'] = spo2
                    sensor_data['hr_valid'] = valid
                    sensor_data['spo2_valid'] = valid
                else:
                    sensor_data['heart_rate'] = 75
                    sensor_data['spo2'] = 98
                    sensor_data['hr_valid'] = True
                    sensor_data['spo2_valid'] = True

                # DHT11
                temp, hum, dht_valid = read_dht11()
                sensor_data['temperature'] = temp
                sensor_data['humidity'] = hum
                sensor_data['temp_valid'] = dht_valid
                sensor_data['hum_valid'] = dht_valid

                # 发送UDP数据
                send_success, data_len = send_udp_data(udp_send, sensor_data)
                if send_success:
                    print("📤 UDP发送成功 (长度: %d字节)" % data_len)

                # 显示
                display_str = format_display_data(sensor_data)
                print(display_str)

                # 历史记录
                history_data.append(sensor_data)
                if len(history_data) > MAX_DATA_HISTORY:
                    history_data.pop(0)

                data_count += 1
                time.sleep(COLLECT_INTERVAL)

            else:  # 未佩戴
                print("[%s] ❌ 未检测到佩戴，%d秒后重试..." % (time_str, WEAR_CHECK_INTERVAL))
                time.sleep(WEAR_CHECK_INTERVAL)

    except KeyboardInterrupt:
        print("\n\n🛑 系统被用户中断")
        stop_alert(sensors, alert_timer)
        # 关机提示音
        try:
            buzzer = Pin(PIN_BUZZER, Pin.OUT)
            buzzer.value(0)
            time.sleep_ms(200)
            buzzer.value(1)
        except:
            pass
    except Exception as e:
        print("\n❌ 系统运行出错: %s" % e)
        import sys
        sys.print_exception(e)
    finally:
        stop_alert(sensors, alert_timer)
        udp_send.close()
        udp_recv.close()
        print("\n🔌 系统资源已释放，退出完成")
        print("=" * 60)

if __name__ == '__main__':
    main()
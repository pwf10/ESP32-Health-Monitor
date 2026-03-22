from machine import SoftI2C, Pin
import time

i2c = SoftI2C(sda=Pin(21), scl=Pin(22))
devices = i2c.scan()
print("I2C devices:", [hex(d) for d in devices])

if 0x57 in devices:
    # 尝试读取 PART_ID 寄存器 (0xFF)
    data = i2c.readfrom_mem(0x57, 0xFF, 1)
    print("PART_ID =", hex(data[0]))
else:
    print("MAX30102 not found")
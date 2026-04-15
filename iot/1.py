from machine import SoftI2C, Pin
import time
from max30102 import MAX30102

i2c = SoftI2C(sda=Pin(21), scl=Pin(22), freq=50000)  # 50kHz
sensor = MAX30102(i2c)
sensor.reset()
time.sleep(0.5)
sensor._sensor_reg_init()
time.sleep(0.5)

while True:
    red, ir = sensor._read_fifo_raw()
    print("Red: %5d  IR: %5d" % (red, ir))
    time.sleep(0.1)
const noble = require('@abandonware/noble');
let Service, Characteristic;

('use strict');
module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-ledstrip-ble', 'LedStrip', LedStrip);
};

function hslToRgb(h, s, l) {
  var r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    var hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

class Device {
  constructor(uuid) {
    this.uuid = uuid;
    this.connected = false;
    this.brightness = 50;
    this.hue = 0;
    this.saturation = 0;
    this.l = 0.5;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log('Start scanning for', this.uuid);
      noble.startScanningAsync();

      noble.on('discover', async peripheral => {
        console.log(peripheral.uuid, peripheral.advertisement.localName);
        if (peripheral.uuid == this.uuid) {
          this.peripheral = peripheral;
          peripheral.once('disconnect', () => {
            console.log("Disconnected");
            this.connected = false;
          });
          noble.stopScanning();
          await peripheral.connectAsync();
          console.log('Connected');
          this.connected = true;
          console.log(this.connected);
          const { characteristics } =
            await peripheral.discoverSomeServicesAndCharacteristicsAsync(
              ['fff0'],
              ['fff3']
            );
          console.log(characteristics);
          this.write = characteristics[0];
          resolve();
        }
      });
    });
  }

  async set_power(status) {
    if (!this.connected) await this.connect();
    if (this.connected && this.write) {
      const buffer = Buffer.from(
        `7e0004${status ? '01' : '00'}00000000ef`,
        'hex'
      );
      console.log('Write:', buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log('Error:', err);
        this.connected = status;
      });
    }
  }

  async set_brightness(level) {
    if (!this.connected) await this.connect();
    if (level > 100 || level < 0) return;
    if (this.connected && this.write) {
      const level_hex = ('0' + level.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e0001${level_hex}00000000ef`, 'hex');
      console.log('Write:', buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log('Error:', err);
        this.brightness = level;
      });
    }
  }

  async set_rgb(r, g, b) {
    if (!connected) await this.connect();
    if (this.connected && this.write) {
      const rhex = ('0' + r.toString(16)).slice(-2);
      const ghex = ('0' + g.toString(16)).slice(-2);
      const bhex = ('0' + b.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e000503${rhex}${ghex}${bhex}00ef`, 'hex');
      console.log('Write:', buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log('Error:', err);
        this.brightness = level;
      });
    }
  }

  async set_hue(hue) {
    if (!connected) await this.connect();
    if (this.connected && this.write) {
      this.hue = hue;
      const rgb = hslToRgb(hue, this.saturation, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
    }
  }

  async set_saturation(saturation) {
    if (!connected) await this.connect();
    if (this.connected && this.write) {
      this.saturation = saturation;
      const rgb = hslToRgb(this.hue, saturation, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
    }
  }

  send_buffer(line) {
    this.write.write(Buffer.from(line, 'hex'), true, err => {
      console.log('Error:', err);
    });
  }
}

function LedStrip(log, config, api) {
  this.log = log;
  this.config = config;
  this.homebridge = api;

  this.log('LedStrip');

  this.bulb = new Service.Lightbulb(this.config.name);
  // Set up Event Handler for bulb on/off
  this.bulb
    .getCharacteristic(Characteristic.On)
    .on('get', this.getPower.bind(this))
    .on('set', this.setPower.bind(this));
  this.bulb
    .getCharacteristic(Characteristic.Brightness)
    .on('get', this.getBrightness.bind(this))
    .on('set', this.setBrightness.bind(this));
  this.bulb
    .getCharacteristic(Characteristic.Hue)
    .on('get', this.getHue.bind(this))
    .on('set', this.setHue.bind(this));
  this.bulb
    .getCharacteristic(Characteristic.Saturation)
    .on('get', this.getSaturation.bind(this))
    .on('set', this.setSaturation.bind(this));

  this.log('all event handler was setup.');

  if (!this.config.uuid) return;
  this.uuid = this.config.uuid;

  this.log('Device UUID:', this.uuid);

  this.device = new Device(this.uuid);
  this.device.connect();
}

LedStrip.prototype = {
  getServices: function () {
    if (!this.bulb) return [];
    this.log('Homekit asked to report service');
    const infoService = new Service.AccessoryInformation();
    infoService.setCharacteristic(Characteristic.Manufacturer, 'LedStrip');
    return [infoService, this.bulb];
  },
  getPower: function (callback) {
    this.log('Homekit Asked Power State', this.device.connected);
    callback(null, this.device.connected);
  },
  setPower: function (on, callback) {
    this.log('Homekit Gave New Power State' + ' ' + on);
    this.device.set_power(on);
    callback(null);
  },
  getBrightness: function (callback) {
    this.log('Homekit Asked Brightness');
    callback(null, this.device.brightness);
  },
  setBrightness: function (brightness, callback) {
    this.log('Homekit Set Brightness', brightness);
    this.device.set_brightness(brightness);
    callback(null);
  },
  getHue: function (callback) {
    callback(null, this.device.hue);
  },
  setHue: function (hue, callback) {
    this.device.set_hue(hue);
    callback(null);
  },
  getSaturation: function (callback) {
    callback(null, this.device.saturation);
  },
  setSaturation: function (saturation, callback) {
    this.device.set_saturation(saturation);
    callback(null);
  }
};

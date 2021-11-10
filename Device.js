const noble = require("@abandonware/noble");

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

module.exports = class Device {
  constructor(uuid) {
    this.uuid = uuid;
    this.connected = false;
    this.power = false;
    this.brightness = 100;
    this.hue = 0;
    this.saturation = 0;
    this.l = 0.5;
    this.peripheral = undefined;

    noble.on("stateChange", state => {
      console.log("State:", state);
      if (state == "poweredOn") {
        noble.startScanningAsync();
      } else {
        // if (this.peripheral) this.peripheral.disconnect();
        this.connected = false;
      }
    });

    noble.on("discover", async peripheral => {
      console.log(peripheral.uuid, peripheral.advertisement.localName);
      if (peripheral.uuid == this.uuid) {
        this.peripheral = peripheral;
        noble.stopScanning();
      }
    });
  }

  async connectAndGetWriteCharacteristics() {
    if (!this.peripheral) {
      noble.startScanningAsync();
      return;
    }
    await this.peripheral.connectAsync();
    this.connected = true;
    //console.log(this.connected);
    const { characteristics } =
      await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
        ["fff0"],
        ["fff3"]
      );
    console.log(characteristics);
    this.write = characteristics[0];
  }

  async disconnect() {
    if (this.peripheral) {
      await this.peripheral.disconnectAsync();
      this.connected = false;
    }
  }

  async set_power(status) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const buffer = Buffer.from(
        `7e0004${status ? "01" : "00"}00000000ef`,
        "hex"
      );
      console.log("Write:", buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log("Error:", err);
        this.power = status;
        this.disconnect();
      });
    }
  }

  async set_brightness(level) {
    if (level > 100 || level < 0) return;
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const level_hex = ("0" + level.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e0001${level_hex}00000000ef`, "hex");
      console.log("Write:", buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log("Error:", err);
        this.brightness = level;
        this.disconnect();
      });
    }
  }

  async set_rgb(r, g, b) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      const rhex = ("0" + r.toString(16)).slice(-2);
      const ghex = ("0" + g.toString(16)).slice(-2);
      const bhex = ("0" + b.toString(16)).slice(-2);
      const buffer = Buffer.from(`7e000503${rhex}${ghex}${bhex}00ef`, "hex");
      console.log("Write:", buffer);
      this.write.write(buffer, true, err => {
        if (err) console.log("Error:", err);
        this.disconnect();
      });
    }
  }

  async set_hue(hue) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      this.hue = hue;
      const rgb = hslToRgb(hue / 360, this.saturation / 100, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
      this.disconnect();
    }
  }

  async set_saturation(saturation) {
    if (!this.connected) await this.connectAndGetWriteCharacteristics();
    if (this.write) {
      this.saturation = saturation;
      const rgb = hslToRgb(this.hue / 360, saturation / 100, this.l);
      this.set_rgb(rgb[0], rgb[1], rgb[2]);
      this.disconnect();
    }
  }

  //   send_buffer(line) {
  //     this.write.write(Buffer.from(line, "hex"), true, err => {
  //       console.log("Error:", err);
  //     });
  //   }
};

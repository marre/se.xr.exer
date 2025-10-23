import { ZigBeeDevice } from 'homey-zigbeedriver';
import { ZCLNode, CLUSTER } from 'zigbee-clusters';
import { ZigBeeNode } from 'homey';

const BATTERY_THRESHOLD = 20;

// https://developer.tuya.com/en/docs/iot-device-dev/tuya-endtocloud-logic?id=Kav5tfxsbsncf#title-10-Sensors

// https://developer.tuya.com/en/docs/connect-subdevices-to-gateways/zigbee-sensor?id=K9ik6zvmhrfh6
// Supported clusters:
//   Power Configuation (0x0001)
//     https://github.com/athombv/node-zigbee-clusters/blob/master/lib/clusters/powerConfiguration.js
//   Temperature Measurment (0x0402)
//     https://github.com/athombv/node-zigbee-clusters/blob/master/lib/clusters/temperatureMeasurement.js 
//   Relative Humidity Measurement (0x0405)
//     https://github.com/athombv/node-zigbee-clusters/blob/master/lib/clusters/relativeHumidity.js

class Tz01Device extends ZigBeeDevice {

  async onNodeInit(payload: { zclNode: ZCLNode; node: ZigBeeNode}): Promise<void> {
    this.printNode();

    if (this.isFirstInit()) {
      await this.configureAttributeReporting([
        {
          endpointId: 1,
          cluster: CLUSTER.POWER_CONFIGURATION,
          attributeName: 'batteryPercentageRemaining',
          minInterval: 3600,
          maxInterval: 86400,
          minChange: 10 // 5% (0-200 scale)
        },
        {
          endpointId: 1,
          cluster: CLUSTER.TEMPERATURE_MEASUREMENT,
          attributeName: 'measuredValue',
          minInterval: 300,
          maxInterval: 3600,
          minChange: 10, // 0.1C
        },
        {
          endpointId: 1,
          cluster: CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT,
          attributeName: 'measuredValue',
          minInterval: 300,
          maxInterval: 3600,
          minChange: 100, // 1%
        },
      ]).catch((err: Error) => this.error('failed to configure attribute reporting', err));
    }

    // Temperature
    payload.zclNode.endpoints[1]?.clusters[CLUSTER.TEMPERATURE_MEASUREMENT.NAME]
      ?.on('attr.measuredValue', this.onTemperatureMeasuredAttributeReport.bind(this));

    // Humidity
    payload.zclNode.endpoints[1]?.clusters[CLUSTER.RELATIVE_HUMIDITY_MEASUREMENT.NAME]
      ?.on('attr.measuredValue', this.onRelativeHumidityMeasuredAttributeReport.bind(this));

    // Battery
    payload.zclNode.endpoints[1]?.clusters[CLUSTER.POWER_CONFIGURATION.NAME]
      ?.on('attr.batteryPercentageRemaining', this.onBatteryPercentageRemainingAttributeReport.bind(this));
  }

  private onTemperatureMeasuredAttributeReport(measuredValue: number): void {
    this.onMeasurementAttributeReport('measure_temperature', measuredValue);
  }

  private onRelativeHumidityMeasuredAttributeReport(measuredValue: number): void {
    this.onMeasurementAttributeReport('measure_humidity', measuredValue);
  }

  private onMeasurementAttributeReport(capability: string, measuredValue: number): void {
    const scaledValue = measuredValue / 100;
    const parsedValue = parseFloat(scaledValue.toFixed(1));

    this.log(`${capability} | measuredValue: ${parsedValue}`);
    this.setCapabilityValue(capability, parsedValue).catch((err: Error) => this.error(`failed to set capability value for ${capability}`, err));
  }

  private onBatteryPercentageRemainingAttributeReport(batteryPercentageRemaining: number): void {
    const batteryLevel = batteryPercentageRemaining / 2;

    this.log('measure_battery | powerConfiguration - batteryPercentageRemaining (%):', batteryLevel);
    this.setCapabilityValue('measure_battery', batteryLevel).catch((err: Error) => this.error('failed to set capability value for measure_battery', err));
    this.setCapabilityValue('alarm_battery', batteryLevel < BATTERY_THRESHOLD).catch((err: Error) => this.error('failed to set capability value for alarm_battery', err));
  }

  onDeleted(): void {
    this.log('tz01 removed');
  }
}

module.exports = Tz01Device;
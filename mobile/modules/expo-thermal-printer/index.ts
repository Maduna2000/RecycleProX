import { requireOptionalNativeModule } from 'expo-modules-core';

export type Printer = {
  name: string;
  address: string;
  type: 'classic' | 'ble';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ThermalPrinter = requireOptionalNativeModule<any>('ExpoThermalPrinter');

export function isPrinterModuleAvailable(): boolean {
  return ThermalPrinter !== null;
}

export async function getPairedPrinters(): Promise<Printer[]> {
  if (!ThermalPrinter) throw new Error('Printer module unavailable');
  return ThermalPrinter.getPairedPrinters();
}

export async function printBytes(address: string, data: number[]): Promise<void> {
  if (!ThermalPrinter) throw new Error('Printer module unavailable');
  await ThermalPrinter.print(address, data);
}

export async function requestPrinterPermissions(): Promise<boolean> {
  if (!ThermalPrinter) return false;
  return ThermalPrinter.requestPermissions();
}

import { requireNativeModule } from 'expo-modules-core';

export type Printer = {
  name: string;
  address: string;
  type: 'classic' | 'ble';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ThermalPrinter = requireNativeModule<any>('ExpoThermalPrinter');

export async function getPairedPrinters(): Promise<Printer[]> {
  return ThermalPrinter.getPairedPrinters();
}

export async function printBytes(address: string, data: number[]): Promise<void> {
  await ThermalPrinter.print(address, data);
}

export async function requestPrinterPermissions(): Promise<boolean> {
  return ThermalPrinter.requestPermissions();
}

export function isPrinterModuleAvailable(): boolean {
  try {
    return !!ThermalPrinter;
  } catch {
    return false;
  }
}

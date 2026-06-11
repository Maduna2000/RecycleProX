import { z } from 'zod'

// Connection types
export const ConnectionTypeSchema = z.enum(['bluetooth', 'ble', 'network'])

// Paper widths (common thermal printer sizes)
export const PaperWidthSchema = z.enum(['58mm', '80mm'])

// Printer configuration schema
export const PrinterConfigSchema = z.object({
  id:             z.string().uuid(),
  label:          z.string().min(1).max(32, 'Label must be 32 characters or less'),
  connectionType: ConnectionTypeSchema,
  address:        z.string().min(1, 'Address is required'), // MAC address or IP:port
  paperWidth:     PaperWidthSchema.default('58mm'),
  density:        z.number().int().min(0).max(7).default(4), // ESC/POS density 0-7
  autoCut:        z.boolean().default(true),
  isDefault:      z.boolean().default(false),
})

// Schema for creating a new printer config (id generated automatically)
export const CreatePrinterConfigSchema = PrinterConfigSchema.omit({ id: true })

// Schema for updating printer config (all fields optional except id)
export const UpdatePrinterConfigSchema = PrinterConfigSchema.partial().required({ id: true })

// Schema for network printer address validation
export const NetworkAddressSchema = z.string().regex(
  /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/,
  'Must be a valid IP address (e.g., 192.168.1.100) or IP:port (e.g., 192.168.1.100:9100)'
)

// Schema for Bluetooth MAC address validation
export const BluetoothAddressSchema = z.string().regex(
  /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/,
  'Must be a valid Bluetooth MAC address (e.g., AA:BB:CC:DD:EE:FF)'
)

// Discovered device from Bluetooth scan
export const DiscoveredDeviceSchema = z.object({
  name:    z.string().nullable(),
  address: z.string(),
  type:    z.enum(['classic', 'ble']),
  rssi:    z.number().optional(), // Signal strength
  paired:  z.boolean(),
})

// Paper width to character columns mapping
export const PAPER_WIDTH_COLUMNS: Record<z.infer<typeof PaperWidthSchema>, number> = {
  '58mm': 32,
  '80mm': 48,
}

// Types
export type ConnectionType      = z.infer<typeof ConnectionTypeSchema>
export type PaperWidth          = z.infer<typeof PaperWidthSchema>
export type PrinterConfig       = z.infer<typeof PrinterConfigSchema>
export type CreatePrinterConfig = z.infer<typeof CreatePrinterConfigSchema>
export type UpdatePrinterConfig = z.infer<typeof UpdatePrinterConfigSchema>
export type DiscoveredDevice    = z.infer<typeof DiscoveredDeviceSchema>

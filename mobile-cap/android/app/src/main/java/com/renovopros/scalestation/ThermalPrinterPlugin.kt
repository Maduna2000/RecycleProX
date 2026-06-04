package com.renovopros.scalestation

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.IOException
import java.util.UUID

@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH],       alias = "bluetooth"),
        Permission(strings = [Manifest.permission.BLUETOOTH_ADMIN], alias = "bluetoothAdmin"),
    ]
)
class ThermalPrinterPlugin : Plugin() {

    companion object {
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }

    private fun adapter(): BluetoothAdapter? {
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return mgr?.adapter
    }

    // On Android 12+ (API 31) BLUETOOTH_CONNECT is required for paired device access.
    private fun hasConnectPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    // Allows the web layer to request BT permissions before the first print
    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN,
                ),
                1001
            )
        }
        call.resolve(JSObject().apply { put("granted", hasConnectPermission()) })
    }

    // ── getPairedPrinters ────────────────────────────────────────────────────

    @PluginMethod
    fun getPairedPrinters(call: PluginCall) {
        if (!hasConnectPermission()) {
            call.reject("BLUETOOTH_CONNECT permission not granted")
            return
        }
        val bt = adapter()
        if (bt == null || !bt.isEnabled) {
            call.reject("Bluetooth is disabled")
            return
        }

        val arr = JSArray()
        try {
            for (dev in bt.bondedDevices ?: emptySet()) {
                val type = when (dev.type) {
                    BluetoothDevice.DEVICE_TYPE_LE -> "ble"
                    else -> "classic"   // CLASSIC or DUAL — prefer Classic SPP
                }
                arr.put(JSObject().apply {
                    put("name",    dev.name ?: "Unknown")
                    put("address", dev.address)
                    put("type",    type)
                })
            }
        } catch (e: SecurityException) {
            call.reject("Bluetooth permission denied: ${e.message}")
            return
        }

        call.resolve(JSObject().apply { put("printers", arr) })
    }

    // ── print ────────────────────────────────────────────────────────────────

    @PluginMethod
    fun print(call: PluginCall) {
        if (!hasConnectPermission()) {
            call.reject("BLUETOOTH_CONNECT permission not granted")
            return
        }

        val address = call.getString("address").orEmpty()
        val rawData = call.getArray("data")
        if (address.isEmpty() || rawData == null) {
            call.reject("address and data are required")
            return
        }

        val bytes = ByteArray(rawData.length()) { i ->
            (rawData.getInt(i) and 0xFF).toByte()
        }

        val bt = adapter()
        if (bt == null || !bt.isEnabled) {
            call.reject("Bluetooth is disabled")
            return
        }

        val device = try {
            bt.getRemoteDevice(address)
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid Bluetooth address")
            return
        }

        // Pure BLE device → go straight to BLE path
        if (device.type == BluetoothDevice.DEVICE_TYPE_LE) {
            printBle(call, device, bytes)
            return
        }

        // Classic (or Dual) → try SPP first
        try {
            printClassicSpp(device, bytes)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            if (device.type == BluetoothDevice.DEVICE_TYPE_DUAL) {
                // Dual-mode device: SPP failed, fall back to BLE
                printBle(call, device, bytes)
            } else {
                call.reject("SPP print failed: ${e.message}")
            }
        }
    }

    // ── Classic Bluetooth (SPP) ──────────────────────────────────────────────

    private fun printClassicSpp(device: BluetoothDevice, bytes: ByteArray) {
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        try {
            socket.connect()
            socket.outputStream.write(bytes)
            socket.outputStream.flush()
        } finally {
            try { socket.close() } catch (_: IOException) {}
        }
    }

    // ── BLE ─────────────────────────────────────────────────────────────────

    private fun printBle(call: PluginCall, device: BluetoothDevice, bytes: ByteArray) {
        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED  -> gatt.discoverServices()
                    BluetoothProfile.STATE_DISCONNECTED -> {
                        gatt.close()
                        if (status != BluetoothGatt.GATT_SUCCESS) {
                            call.reject("BLE disconnected unexpectedly (status $status)")
                        }
                    }
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    gatt.close()
                    call.reject("BLE service discovery failed")
                    return
                }

                // Find first writable characteristic across all services
                val writeChar = gatt.services
                    .flatMap { it.characteristics }
                    .firstOrNull { char ->
                        val p = char.properties
                        (p and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) ||
                        (p and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
                    }

                if (writeChar == null) {
                    gatt.close()
                    call.reject("No writable characteristic found — is this a supported BLE printer?")
                    return
                }

                val writeType = if (
                    writeChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
                ) {
                    BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                } else {
                    BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                }
                writeChar.writeType = writeType

                // Write in 20-byte chunks (safe for all BLE 4.x connections)
                try {
                    var offset = 0
                    while (offset < bytes.size) {
                        val chunk = bytes.copyOfRange(offset, minOf(offset + 20, bytes.size))
                        writeChar.value = chunk
                        gatt.writeCharacteristic(writeChar)
                        Thread.sleep(30) // pace chunks so the printer buffer doesn't overflow
                        offset += 20
                    }
                    Thread.sleep(300) // let the printer process the last chunk
                    gatt.disconnect()
                    gatt.close()
                    call.resolve(JSObject().apply { put("success", true) })
                } catch (e: Exception) {
                    gatt.close()
                    call.reject("BLE write error: ${e.message}")
                }
            }
        }

        try {
            device.connectGatt(context, false, callback)
        } catch (e: SecurityException) {
            call.reject("Bluetooth permission denied: ${e.message}")
        }
    }
}

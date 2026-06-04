package expo.modules.thermalprinter

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
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ExpoThermalPrinterModule : Module() {

  companion object {
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }

  override fun definition() = ModuleDefinition {

    Name("ExpoThermalPrinter")

    // ── getPairedPrinters ─────────────────────────────────────────────────────

    AsyncFunction("getPairedPrinters") {
      checkConnectPermission()
      val adapter = requireAdapter()

      val result = mutableListOf<Map<String, String>>()
      for (device in adapter.bondedDevices ?: emptySet()) {
        val type = if (device.type == BluetoothDevice.DEVICE_TYPE_LE) "ble" else "classic"
        result.add(
          mapOf(
            "name"    to (device.name ?: "Unknown"),
            "address" to device.address,
            "type"    to type,
          )
        )
      }
      result
    }

    // ── print ─────────────────────────────────────────────────────────────────

    AsyncFunction("print") { address: String, data: List<Int> ->
      checkConnectPermission()
      val adapter = requireAdapter()

      val bytes = ByteArray(data.size) { i -> (data[i] and 0xFF).toByte() }
      val device = try {
        adapter.getRemoteDevice(address)
      } catch (e: IllegalArgumentException) {
        throw Exception("Invalid Bluetooth address: $address")
      }

      when (device.type) {
        BluetoothDevice.DEVICE_TYPE_LE -> printBle(device, bytes)
        BluetoothDevice.DEVICE_TYPE_DUAL -> {
          try {
            printClassicSpp(device, bytes)
          } catch (_: IOException) {
            printBle(device, bytes)
          }
        }
        else -> printClassicSpp(device, bytes)
      }
      true
    }

    // ── requestPermissions ────────────────────────────────────────────────────

    AsyncFunction("requestPermissions") {
      hasConnectPermission()
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private fun context(): Context =
    appContext.reactContext ?: throw Exception("React context not available")

  private fun requireAdapter(): BluetoothAdapter {
    val mgr = context().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return mgr?.adapter ?: throw Exception("Bluetooth is not available on this device")
  }

  private fun hasConnectPermission(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }

  private fun checkConnectPermission() {
    if (!hasConnectPermission()) {
      throw Exception("BLUETOOTH_CONNECT permission is required. Call requestPermissions() first.")
    }
  }

  // ── Classic Bluetooth (SPP) ───────────────────────────────────────────────

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

  // ── Bluetooth LE (GATT) ───────────────────────────────────────────────────

  private fun printBle(device: BluetoothDevice, bytes: ByteArray) {
    val latch = CountDownLatch(1)
    var error: Exception? = null

    val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        when (newState) {
          BluetoothProfile.STATE_CONNECTED -> gatt.discoverServices()
          BluetoothProfile.STATE_DISCONNECTED -> {
            gatt.close()
            if (status != BluetoothGatt.GATT_SUCCESS) {
              error = Exception("BLE disconnected unexpectedly (status $status)")
            }
            latch.countDown()
          }
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          error = Exception("BLE service discovery failed")
          gatt.close()
          latch.countDown()
          return
        }

        val writeChar = gatt.services
          .flatMap { it.characteristics }
          .firstOrNull { char ->
            val p = char.properties
            (p and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) ||
            (p and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
          }

        if (writeChar == null) {
          error = Exception("No writable BLE characteristic found — is this a supported printer?")
          gatt.close()
          latch.countDown()
          return
        }

        writeChar.writeType =
          if (writeChar.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0)
            BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
          else
            BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

        try {
          // Write in 20-byte chunks (safe for BLE 4.x)
          var offset = 0
          while (offset < bytes.size) {
            val chunk = bytes.copyOfRange(offset, minOf(offset + 20, bytes.size))
            writeChar.value = chunk
            gatt.writeCharacteristic(writeChar)
            Thread.sleep(30)
            offset += 20
          }
          Thread.sleep(300)
          gatt.disconnect()
          gatt.close()
        } catch (e: Exception) {
          error = e
          gatt.close()
          latch.countDown()
        }
      }
    }

    try {
      device.connectGatt(context(), false, callback)
      if (!latch.await(30, TimeUnit.SECONDS)) {
        throw Exception("BLE print timed out after 30 seconds")
      }
      error?.let { throw it }
    } catch (e: SecurityException) {
      throw Exception("Bluetooth permission denied: ${e.message}")
    }
  }
}

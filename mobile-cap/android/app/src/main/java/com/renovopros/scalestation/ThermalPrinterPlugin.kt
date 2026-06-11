package com.renovopros.scalestation

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
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
import java.net.InetSocketAddress
import java.net.Socket
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
        private const val NETWORK_TIMEOUT_MS = 5000
        private const val SCAN_TIMEOUT_MS = 12000L

        // BLE connection retry settings (fixes GATT status 133 on cheap printers)
        private const val BLE_MAX_RETRIES = 3
        private const val BLE_RETRY_DELAY_MS = 1000L
        private const val BLE_CONNECTION_TIMEOUT_MS = 10000L
        private const val BLE_MTU_CONSERVATIVE = 185  // Safer for cheap BLE printers like Andowl QP01
    }

    // Scanning state
    private var isScanning = false
    private var scanCall: PluginCall? = null
    private var discoveredDevices = mutableListOf<JSObject>()
    private var scanReceiver: BroadcastReceiver? = null

    // BLE connection state (for retry logic)
    private var bleRetryCount = 0
    private var currentGatt: BluetoothGatt? = null
    private var bleTimeoutHandler: Handler? = null

    private fun adapter(): BluetoothAdapter? {
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return mgr?.adapter
    }

    // Clean up GATT resources - critical for avoiding status 133 on retry
    private fun cleanupGatt() {
        bleTimeoutHandler?.removeCallbacksAndMessages(null)
        bleTimeoutHandler = null
        currentGatt?.let { gatt ->
            try {
                gatt.disconnect()
            } catch (_: Exception) {}
            try {
                gatt.close()
            } catch (_: Exception) {}
        }
        currentGatt = null
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

    // On Android 12+ (API 31) BLUETOOTH_SCAN is required for device discovery.
    // On older versions, ACCESS_FINE_LOCATION is required.
    private fun hasScanPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    // Allows the web layer to request BT permissions before the first print or scan
    @PluginMethod
    fun requestBluetoothPermissions(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN,
                ),
                1001
            )
        } else {
            // Pre-Android 12: need location permission for scanning
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ),
                1001
            )
        }
        call.resolve(JSObject().apply {
            put("granted", hasConnectPermission() && hasScanPermission())
        })
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

    // ── BLE (with retry logic for status 133) ─────────────────────────────────

    private fun printBle(call: PluginCall, device: BluetoothDevice, bytes: ByteArray) {
        bleRetryCount = 0
        connectBleWithRetry(call, device, bytes)
    }

    private fun connectBleWithRetry(call: PluginCall, device: BluetoothDevice, bytes: ByteArray) {
        // Clean up any existing connection before attempting new one
        cleanupGatt()

        // Delay before retry (except first attempt)
        val delay = if (bleRetryCount > 0) BLE_RETRY_DELAY_MS else 0L

        Handler(Looper.getMainLooper()).postDelayed({
            try {
                // Use TRANSPORT_LE explicitly for BLE devices (Android M+)
                // This prevents the system from trying Classic Bluetooth first
                currentGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    device.connectGatt(context, false, createBleCallback(call, device, bytes), BluetoothDevice.TRANSPORT_LE)
                } else {
                    device.connectGatt(context, false, createBleCallback(call, device, bytes))
                }

                // Set connection timeout - if no services discovered within timeout, retry
                bleTimeoutHandler = Handler(Looper.getMainLooper())
                bleTimeoutHandler?.postDelayed({
                    if (currentGatt?.services?.isEmpty() != false) {
                        handleBleTimeout(call, device, bytes)
                    }
                }, BLE_CONNECTION_TIMEOUT_MS)

            } catch (e: SecurityException) {
                call.reject("Bluetooth permission denied: ${e.message}")
            }
        }, delay)
    }

    private fun handleBleTimeout(call: PluginCall, device: BluetoothDevice, bytes: ByteArray) {
        cleanupGatt()
        if (bleRetryCount < BLE_MAX_RETRIES) {
            bleRetryCount++
            connectBleWithRetry(call, device, bytes)
        } else {
            call.reject("BLE connection timed out after $BLE_MAX_RETRIES attempts")
        }
    }

    private fun createBleCallback(call: PluginCall, device: BluetoothDevice, bytes: ByteArray): BluetoothGattCallback {
        // Track negotiated MTU (default 23, effective payload 20)
        var negotiatedMtu = 23

        return object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                // Cancel timeout on any state change
                bleTimeoutHandler?.removeCallbacksAndMessages(null)

                when {
                    // Successful connection
                    newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS -> {
                        bleRetryCount = 0  // Reset retry count on success
                        try {
                            // Use conservative MTU for cheap printers like Andowl QP01
                            gatt.requestMtu(BLE_MTU_CONSERVATIVE)
                        } catch (e: SecurityException) {
                            // Fallback: proceed with default MTU
                            gatt.discoverServices()
                        }
                    }
                    // Status 133 or other connection error - retry
                    status == 133 || (status != BluetoothGatt.GATT_SUCCESS && newState != BluetoothProfile.STATE_CONNECTED) -> {
                        gatt.close()
                        currentGatt = null

                        if (bleRetryCount < BLE_MAX_RETRIES) {
                            bleRetryCount++
                            // Retry on main thread with delay
                            Handler(Looper.getMainLooper()).post {
                                connectBleWithRetry(call, device, bytes)
                            }
                        } else {
                            call.reject("BLE connection failed after $BLE_MAX_RETRIES attempts (status $status)")
                        }
                    }
                    // Normal disconnect after successful print
                    newState == BluetoothProfile.STATE_DISCONNECTED && status == BluetoothGatt.GATT_SUCCESS -> {
                        gatt.close()
                        currentGatt = null
                    }
                    // Unexpected disconnect
                    newState == BluetoothProfile.STATE_DISCONNECTED -> {
                        gatt.close()
                        currentGatt = null
                        // Don't reject here - might be normal end of connection
                    }
                }
            }

            override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
                // MTU includes 3-byte ATT header, so effective payload is mtu - 3
                negotiatedMtu = if (status == BluetoothGatt.GATT_SUCCESS) mtu else 23
                gatt.discoverServices()
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                // Cancel timeout - we successfully discovered services
                bleTimeoutHandler?.removeCallbacksAndMessages(null)

                if (status != BluetoothGatt.GATT_SUCCESS) {
                    gatt.close()
                    currentGatt = null
                    call.reject("BLE service discovery failed (status $status)")
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
                    currentGatt = null
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

                // Calculate chunk size from negotiated MTU (subtract 3 for ATT header)
                // Use 20 as minimum (BLE 4.0 safe), cap at 512 for safety
                val chunkSize = maxOf(20, minOf(negotiatedMtu - 3, 512))

                // Move write operation to background thread to avoid blocking GATT callback
                // (blocking the callback thread can cause ANR on tablets with strict watchdogs)
                Thread {
                    try {
                        var offset = 0
                        while (offset < bytes.size) {
                            val end = minOf(offset + chunkSize, bytes.size)
                            val chunk = bytes.copyOfRange(offset, end)
                            writeChar.value = chunk
                            gatt.writeCharacteristic(writeChar)
                            // Slower pacing for cheap BLE printers (Andowl QP01, HOIN, etc.)
                            val paceMs = when {
                                chunkSize > 100 -> 20L   // Large MTU: 20ms
                                chunkSize > 50 -> 40L    // Medium MTU: 40ms
                                else -> 60L              // Small MTU: 60ms (safer)
                            }
                            Thread.sleep(paceMs)
                            offset = end
                        }
                        Thread.sleep(500) // Let the printer process the last chunk
                        gatt.disconnect()
                        // Note: gatt.close() will be called in onConnectionStateChange
                        call.resolve(JSObject().apply { put("success", true) })
                    } catch (e: Exception) {
                        gatt.close()
                        currentGatt = null
                        call.reject("BLE write error: ${e.message}")
                    }
                }.start()
            }
        }
    }

    // ── Bluetooth Scanning ────────────────────────────────────────────────────

    @PluginMethod
    fun startBluetoothScan(call: PluginCall) {
        if (!hasScanPermission()) {
            call.resolve(JSObject().apply {
                put("devices", JSArray())
                put("error", "Bluetooth scan permission not granted")
            })
            return
        }

        val bt = adapter()
        if (bt == null || !bt.isEnabled) {
            call.resolve(JSObject().apply {
                put("devices", JSArray())
                put("error", "Bluetooth is disabled")
            })
            return
        }

        // Cancel any existing scan
        if (isScanning) {
            try {
                bt.cancelDiscovery()
            } catch (e: SecurityException) {
                // Ignore
            }
        }

        // Clear previous results
        discoveredDevices.clear()
        scanCall = call
        isScanning = true

        // Create receiver for discovered devices
        scanReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                        }

                        device?.let { dev ->
                            val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()

                            // Check if already discovered
                            val exists = discoveredDevices.any {
                                it.getString("address") == dev.address
                            }
                            if (!exists) {
                                try {
                                    val type = when (dev.type) {
                                        BluetoothDevice.DEVICE_TYPE_LE -> "ble"
                                        else -> "classic"
                                    }
                                    val paired = dev.bondState == BluetoothDevice.BOND_BONDED

                                    discoveredDevices.add(JSObject().apply {
                                        put("name", dev.name ?: null)
                                        put("address", dev.address)
                                        put("type", type)
                                        put("rssi", rssi)
                                        put("paired", paired)
                                    })
                                } catch (e: SecurityException) {
                                    // Skip device if no permission
                                }
                            }
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        finishScan()
                    }
                }
            }
        }

        // Register receiver
        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        context.registerReceiver(scanReceiver, filter)

        // Start discovery
        try {
            bt.startDiscovery()

            // Set timeout to auto-finish scan
            android.os.Handler(context.mainLooper).postDelayed({
                if (isScanning) {
                    try {
                        bt.cancelDiscovery()
                    } catch (e: SecurityException) {
                        // Ignore
                    }
                    finishScan()
                }
            }, SCAN_TIMEOUT_MS)

        } catch (e: SecurityException) {
            finishScan("Bluetooth scan permission denied: ${e.message}")
        }
    }

    @PluginMethod
    fun stopBluetoothScan(call: PluginCall) {
        val bt = adapter()
        try {
            bt?.cancelDiscovery()
        } catch (e: SecurityException) {
            // Ignore
        }
        finishScan()
        call.resolve()
    }

    private fun finishScan(error: String? = null) {
        isScanning = false

        // Unregister receiver
        scanReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: IllegalArgumentException) {
                // Receiver not registered
            }
        }
        scanReceiver = null

        // Resolve pending call
        scanCall?.let { call ->
            val arr = JSArray()
            discoveredDevices.forEach { arr.put(it) }

            call.resolve(JSObject().apply {
                put("devices", arr)
                error?.let { put("error", it) }
            })
        }
        scanCall = null
    }

    // ── Device Pairing ────────────────────────────────────────────────────────

    @PluginMethod
    fun pairDevice(call: PluginCall) {
        if (!hasConnectPermission()) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "Bluetooth permission not granted")
            })
            return
        }

        val address = call.getString("address").orEmpty()
        if (address.isEmpty()) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "Address is required")
            })
            return
        }

        val bt = adapter()
        if (bt == null || !bt.isEnabled) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "Bluetooth is disabled")
            })
            return
        }

        try {
            val device = bt.getRemoteDevice(address)

            // Check if already paired
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                call.resolve(JSObject().apply {
                    put("success", true)
                })
                return
            }

            // Initiate pairing - this will show the system pairing dialog
            val success = device.createBond()
            call.resolve(JSObject().apply {
                put("success", success)
                if (!success) put("error", "Failed to initiate pairing")
            })

        } catch (e: IllegalArgumentException) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "Invalid Bluetooth address")
            })
        } catch (e: SecurityException) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "Bluetooth permission denied: ${e.message}")
            })
        }
    }

    // ── Network Printing ──────────────────────────────────────────────────────

    @PluginMethod
    fun testNetworkConnection(call: PluginCall) {
        val ip = call.getString("ip").orEmpty()
        val port = call.getInt("port") ?: 9100

        if (ip.isEmpty()) {
            call.resolve(JSObject().apply {
                put("success", false)
                put("error", "IP address is required")
            })
            return
        }

        Thread {
            try {
                val startTime = System.currentTimeMillis()
                val socket = Socket()
                socket.connect(InetSocketAddress(ip, port), NETWORK_TIMEOUT_MS)
                val latency = System.currentTimeMillis() - startTime
                socket.close()

                activity.runOnUiThread {
                    call.resolve(JSObject().apply {
                        put("success", true)
                        put("latencyMs", latency)
                    })
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    call.resolve(JSObject().apply {
                        put("success", false)
                        put("error", e.message ?: "Connection failed")
                    })
                }
            }
        }.start()
    }

    @PluginMethod
    fun printToNetwork(call: PluginCall) {
        val ip = call.getString("ip").orEmpty()
        val port = call.getInt("port") ?: 9100
        val rawData = call.getArray("data")

        if (ip.isEmpty() || rawData == null) {
            call.reject("ip and data are required")
            return
        }

        val bytes = ByteArray(rawData.length()) { i ->
            (rawData.getInt(i) and 0xFF).toByte()
        }

        Thread {
            try {
                val socket = Socket()
                socket.connect(InetSocketAddress(ip, port), NETWORK_TIMEOUT_MS)
                socket.getOutputStream().write(bytes)
                socket.getOutputStream().flush()
                socket.close()

                activity.runOnUiThread {
                    call.resolve(JSObject().apply { put("success", true) })
                }
            } catch (e: Exception) {
                activity.runOnUiThread {
                    call.reject("Network print failed: ${e.message}")
                }
            }
        }.start()
    }
}

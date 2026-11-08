package expo.modules.credimasterprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID

// Imprime en una impresora térmica ESC/POS por Bluetooth clásico (perfil SPP). La impresora
// se empareja una vez en los ajustes del teléfono; aquí solo se lista lo emparejado y se
// envían los bytes. El permiso BLUETOOTH_CONNECT (Android 12+) se pide desde JS
// (PermissionsAndroid) antes de llamar a print().
@SuppressLint("MissingPermission")
class CredimasterPrinterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  @Volatile
  private var printing = false

  private fun hasConnectPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  private fun adapter(): BluetoothAdapter? =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  // Abre el socket SPP. Algunas impresoras chinas no responden al canal seguro: se
  // prueba el seguro, luego el inseguro y por último el canal 1 directo.
  private fun connect(device: BluetoothDevice): BluetoothSocket {
    var lastError: Exception? = null
    val attempts = listOf<() -> BluetoothSocket>(
      { device.createRfcommSocketToServiceRecord(sppUuid) },
      { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
      {
        val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        m.invoke(device, 1) as BluetoothSocket
      },
    )
    for (open in attempts) {
      var socket: BluetoothSocket? = null
      try {
        socket = open()
        socket.connect()
        return socket
      } catch (e: Exception) {
        lastError = e
        try { socket?.close() } catch (_: Exception) {}
      }
    }
    throw IOException(lastError?.message ?: "No se pudo abrir la conexión", lastError)
  }

  override fun definition() = ModuleDefinition {
    Name("CredimasterPrinter")

    Function("isSupported") { adapter() != null }

    Function("hasPermission") { hasConnectPermission() }

    Function("isBluetoothOn") { adapter()?.isEnabled == true }

    // Dispositivos ya emparejados (no busca nuevos: eso se hace en los ajustes del teléfono).
    Function("getPairedDevices") {
      val ad = adapter()
      if (ad == null || !hasConnectPermission()) {
        emptyList<Map<String, Any>>()
      } else {
        ad.bondedDevices.map { d ->
          mapOf<String, Any>(
            "name" to (d.name ?: d.address),
            "address" to d.address,
            "isPrinter" to (d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING),
          )
        }
      }
    }

    // Conecta, envía los bytes (base64) en bloques y cierra. Rechaza con un código legible.
    AsyncFunction("print") { address: String, data: String, promise: Promise ->
      if (!hasConnectPermission()) {
        promise.reject("ERR_NO_PERMISSION", "Falta el permiso de Bluetooth para la app", null)
        return@AsyncFunction
      }
      val ad = adapter()
      if (ad == null) {
        promise.reject("ERR_NO_BLUETOOTH", "Este teléfono no tiene Bluetooth", null)
        return@AsyncFunction
      }
      if (!ad.isEnabled) {
        promise.reject("ERR_BT_OFF", "El Bluetooth está apagado", null)
        return@AsyncFunction
      }
      val bytes = try {
        Base64.decode(data, Base64.DEFAULT)
      } catch (e: Exception) {
        promise.reject("ERR_BAD_DATA", "El recibo no se pudo preparar para imprimir", e)
        return@AsyncFunction
      }
      if (printing) {
        promise.reject("ERR_BUSY", "Ya se está imprimiendo, espere un momento", null)
        return@AsyncFunction
      }
      printing = true

      Thread {
        var socket: BluetoothSocket? = null
        var stage = "connect"
        try {
          val device = try { ad.getRemoteDevice(address) } catch (_: IllegalArgumentException) { null }
          if (device == null) {
            promise.reject("ERR_NOT_FOUND", "La impresora guardada ya no existe. Elíjala de nuevo.", null)
            return@Thread
          }
          ad.cancelDiscovery()
          socket = connect(device)
          stage = "write"
          val out = socket.outputStream
          var offset = 0
          while (offset < bytes.size) {
            val n = minOf(512, bytes.size - offset)
            out.write(bytes, offset, n)
            out.flush()
            offset += n
            if (offset < bytes.size) Thread.sleep(40)
          }
          out.flush()
          Thread.sleep(700) // deja que la impresora termine de recibir antes de cerrar
          promise.resolve(true)
        } catch (e: SecurityException) {
          promise.reject("ERR_NO_PERMISSION", "Falta el permiso de Bluetooth para la app", e)
        } catch (e: IOException) {
          if (stage == "connect") {
            promise.reject("ERR_CONNECT", "No se pudo conectar con la impresora. Verifique que esté encendida, cerca y emparejada.", e)
          } else {
            promise.reject("ERR_WRITE", "Se perdió la conexión con la impresora mientras imprimía.", e)
          }
        } catch (e: Exception) {
          promise.reject("ERR_PRINT_FAILED", e.message ?: "No se pudo imprimir", e)
        } finally {
          try { socket?.close() } catch (_: Exception) {}
          printing = false
        }
      }.start()
    }
  }
}

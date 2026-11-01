package expo.modules.credimastersms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Envía un SMS en segundo plano con el plan del chip del teléfono (el cobrador no
// toca "enviar"). Solo Android: iOS no permite enviar SMS sin que el usuario confirme.
// El permiso SEND_SMS se pide desde JS (PermissionsAndroid) antes de llamar a send().
class CredimasterSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var counter = 0

  override fun definition() = ModuleDefinition {
    Name("CredimasterSms")

    Function("hasPermission") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
    }

    Function("isSimReady") {
      val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      tm != null && tm.simState == TelephonyManager.SIM_STATE_READY
    }

    // Resuelve cuando la red acepta el mensaje (RESULT_OK) y rechaza con un código
    // legible si falla (sin servicio, modo avión, sin saldo/cuota, etc.) o a los 20 s.
    AsyncFunction("send") { phone: String, body: String, promise: Promise ->
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
        promise.reject("ERR_NO_PERMISSION", "Falta el permiso para enviar SMS", null)
        return@AsyncFunction
      }
      val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
      if (tm == null || tm.simState != TelephonyManager.SIM_STATE_READY) {
        promise.reject("ERR_NO_SIM", "El teléfono no tiene un chip listo para enviar SMS", null)
        return@AsyncFunction
      }

      val manager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }

      try {
        val parts = manager.divideMessage(body)
        if (parts.size > 1) {
          // Mensaje largo: se envía por partes y no se espera confirmación.
          manager.sendMultipartTextMessage(phone, null, parts, null, null)
          promise.resolve(true)
          return@AsyncFunction
        }

        val action = "expo.modules.credimastersms.SMS_SENT_${++counter}"
        val handler = Handler(Looper.getMainLooper())
        var finished = false
        lateinit var receiver: BroadcastReceiver
        lateinit var timeout: Runnable

        val finish = { error: Pair<String, String>? ->
          if (!finished) {
            finished = true
            handler.removeCallbacks(timeout)
            try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
            if (error == null) promise.resolve(true) else promise.reject(error.first, error.second, null)
          }
        }

        receiver = object : BroadcastReceiver() {
          override fun onReceive(c: Context?, intent: Intent?) {
            when (resultCode) {
              Activity.RESULT_OK -> finish(null)
              SmsManager.RESULT_ERROR_NO_SERVICE -> finish(Pair("ERR_NO_SERVICE", "Sin señal de red para enviar el SMS"))
              SmsManager.RESULT_ERROR_RADIO_OFF -> finish(Pair("ERR_RADIO_OFF", "El teléfono está en modo avión"))
              else -> finish(Pair("ERR_SEND_FAILED", "No se pudo enviar el SMS (código $resultCode). Verifique el saldo del plan."))
            }
          }
        }
        timeout = Runnable { finish(Pair("ERR_TIMEOUT", "El SMS tardó demasiado en confirmarse")) }

        ContextCompat.registerReceiver(context, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
        val sentIntent = PendingIntent.getBroadcast(
          context, counter, Intent(action).setPackage(context.packageName),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT
        )
        handler.postDelayed(timeout, 20000)
        manager.sendTextMessage(phone, null, body, sentIntent, null)
      } catch (e: Exception) {
        promise.reject("ERR_SEND_FAILED", e.message ?: "No se pudo enviar el SMS", e)
      }
    }
  }
}

package expo.modules.tinzit0avisos

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Escucha las notificaciones del celular, pero SOLO guarda las que vienen de apps de bancos
 * (paquetes que contienen alguna de las palabras de la lista). Todo lo demás se ignora sin leerlo.
 * Lo guardado queda en una cola local; la app la procesa al abrirse (o al instante si está abierta).
 */
class AvisosService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      val ctx = applicationContext
      val pkg = sbn.packageName ?: return
      if (pkg == ctx.packageName) return
      if (!esDeBanco(ctx, pkg)) return
      // Los resúmenes de grupo no traen el texto de la compra.
      if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

      val extras = sbn.notification.extras ?: return
      val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
      if (titulo.isBlank() && texto.isBlank()) return

      val aviso = JSONObject()
        .put("pkg", pkg)
        .put("title", titulo)
        .put("text", texto)
        .put("ts", sbn.postTime)
      if (guardar(ctx, aviso)) AvisosModule.emitir(aviso.toString())
    } catch (e: Exception) {
      // Nunca botar el servicio por un aviso raro.
    }
  }

  companion object {
    const val PREFS = "tinzit0_avisos"
    const val COLA = "cola"
    const val PAQUETES = "paquetes"
    private const val MAX = 200

    val PAQUETES_POR_DEFECTO = listOf(
      "bancoestado", "bech", "cuentarut", "falabella", "cmr", "fpay", "santander", "bci", "bancochile",
      "bancodechile", "itau", "scotiabank", "tenpo", "mercadopago", "machbank", "mach", "bice", "security",
      "ripley", "consorcio", "coopeuch"
    )

    fun paquetes(ctx: Context): List<String> {
      val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PAQUETES, null) ?: return PAQUETES_POR_DEFECTO
      return try {
        val arr = JSONArray(raw)
        (0 until arr.length()).map { arr.getString(it).lowercase() }.filter { it.isNotBlank() }
      } catch (e: Exception) {
        PAQUETES_POR_DEFECTO
      }
    }

    fun esDeBanco(ctx: Context, pkg: String): Boolean {
      val p = pkg.lowercase()
      return paquetes(ctx).any { p.contains(it) }
    }

    /** Agrega a la cola (sin duplicados: mismo banco y mismo texto en menos de 2 minutos). */
    @Synchronized
    fun guardar(ctx: Context, aviso: JSONObject): Boolean {
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val cola = try { JSONArray(prefs.getString(COLA, "[]")) } catch (e: Exception) { JSONArray() }
      for (i in 0 until cola.length()) {
        val o = cola.optJSONObject(i) ?: continue
        if (o.optString("pkg") == aviso.optString("pkg") &&
          o.optString("text") == aviso.optString("text") &&
          o.optString("title") == aviso.optString("title") &&
          Math.abs(o.optLong("ts") - aviso.optLong("ts")) < 120_000
        ) return false
      }
      cola.put(aviso)
      val recortada = JSONArray()
      val desde = Math.max(0, cola.length() - MAX)
      for (i in desde until cola.length()) recortada.put(cola.get(i))
      prefs.edit().putString(COLA, recortada.toString()).apply()
      return true
    }

    @Synchronized
    fun leer(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(COLA, "[]") ?: "[]"

    @Synchronized
    fun vaciar(ctx: Context) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(COLA, "[]").apply()
    }
  }
}

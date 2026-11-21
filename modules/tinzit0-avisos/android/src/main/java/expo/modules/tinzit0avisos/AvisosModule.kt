package expo.modules.tinzit0avisos

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

/** Puente entre el servicio que lee avisos de bancos y la app (JavaScript). */
class AvisosModule : Module() {

  private val ctx: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Sin contexto de Android")

  override fun definition() = ModuleDefinition {
    Name("Tinzit0Avisos")

    Events("onAviso")

    OnCreate {
      instancia = this@AvisosModule
    }

    OnDestroy {
      if (instancia === this@AvisosModule) instancia = null
    }

    /** ¿El usuario activó "Acceso a notificaciones" para Tinzit0? */
    Function("tienePermiso") {
      val habilitados = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: ""
      habilitados.contains(ctx.packageName)
    }

    /** Abre la pantalla de Android donde se activa el acceso a notificaciones. */
    Function("abrirAjustesPermiso") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }

    /** Abre la info de la app (para "Permitir ajustes restringidos" en Android 13+). */
    Function("abrirInfoApp") {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(android.net.Uri.parse("package:" + ctx.packageName))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }

    /** Avisos guardados que aún no procesa la app (JSON). */
    Function("leerCola") {
      AvisosService.leer(ctx)
    }

    /** Quita de la cola solo los avisos ya guardados por la app (JSON con pkg, ts, title y text). */
    Function("confirmarCola") { procesados: String ->
      AvisosService.confirmar(ctx, procesados)
    }

    Function("vaciarCola") {
      AvisosService.vaciar(ctx)
    }

    /** Qué apps escuchar (partes del nombre del paquete). */
    Function("configurarPaquetes") { lista: List<String> ->
      ctx.getSharedPreferences(AvisosService.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(AvisosService.PAQUETES, JSONArray(lista).toString())
        .apply()
    }
  }

  companion object {
    @Volatile
    private var instancia: AvisosModule? = null

    /** Si la app está abierta, le avisamos al tiro. */
    fun emitir(json: String) {
      try {
        instancia?.sendEvent("onAviso", mapOf("json" to json))
      } catch (e: Exception) {
        // la app no está escuchando: queda en la cola
      }
    }
  }
}

package expo.modules.imeheight

import android.content.Context
import android.os.Build
import android.view.ViewTreeObserver
import android.view.WindowInsets
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Vista invisible que avisa del alto del teclado de la ventana en la que está.
 *
 * React Native, en Android 11 o posterior, solo avisa cuando el teclado sale o
 * se va, no cuando cambia de alto (de números a letras, que es más alto con la
 * barra de sugerencias). Aquí se lee de la propia ventana cada vez que cambia.
 * El alto va en puntos y sin la barra de navegación, como el de React Native.
 * En Android 10 o anterior no hace nada: ahí React Native ya avisa del cambio.
 */
class ImeHeightView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onImeChange by EventDispatcher()
  private var lastHeight = -1f

  private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener {
    rootWindowInsets?.let { report(it) }
  }

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      setOnApplyWindowInsetsListener { view, insets ->
        report(insets)
        view.onApplyWindowInsets(insets)
      }
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
      requestApplyInsets()
    }
  }

  override fun onDetachedFromWindow() {
    viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
    super.onDetachedFromWindow()
  }

  private fun report(insets: WindowInsets) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val ime = WindowInsets.Type.ime()
    val px = if (insets.isVisible(ime)) {
      maxOf(0, insets.getInsets(ime).bottom - insets.getInsets(WindowInsets.Type.systemBars()).bottom)
    } else {
      0
    }
    val height = px / resources.displayMetrics.density
    if (height == lastHeight) return
    lastHeight = height
    onImeChange(mapOf("height" to height))
  }
}

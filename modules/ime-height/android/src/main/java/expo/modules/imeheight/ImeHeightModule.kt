package expo.modules.imeheight

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ImeHeightModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ImeHeight")

    View(ImeHeightView::class) {
      Events("onImeChange")
    }
  }
}

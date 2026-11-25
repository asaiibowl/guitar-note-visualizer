# JUCE plugin target: VST3 + Standalone, with the web UI embedded as a zip resource.

set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${CMAKE_CURRENT_SOURCE_DIR}/third_party/webview2" CACHE PATH "" FORCE)

juce_add_plugin(GuitarNoteVisualizer
  COMPANY_NAME "GuitarNoteVisualizer"
  PRODUCT_NAME "Guitar Note Visualizer"
  PLUGIN_MANUFACTURER_CODE Gnvz
  PLUGIN_CODE Gnv1
  FORMATS VST3 Standalone
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  VST3_CATEGORIES Analyzer Fx
  NEEDS_WEBVIEW2 TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE)

# The web UI is built by `npm run build:plugin` into ../dist-plugin and zipped here.
set(GNV_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../dist-plugin")
if(NOT EXISTS "${GNV_UI_DIR}/index.html")
  message(FATAL_ERROR "Web UI not built: run `npm run build:plugin` in the project root first.")
endif()
file(GLOB_RECURSE GNV_UI_FILES CONFIGURE_DEPENDS "${GNV_UI_DIR}/*")
set(GNV_UI_ZIP "${CMAKE_CURRENT_BINARY_DIR}/ui/gnv_ui.zip")
add_custom_command(
  OUTPUT "${GNV_UI_ZIP}"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_CURRENT_BINARY_DIR}/ui"
  COMMAND ${CMAKE_COMMAND} -E tar cf "${GNV_UI_ZIP}" --format=zip .
  WORKING_DIRECTORY "${GNV_UI_DIR}"
  DEPENDS ${GNV_UI_FILES}
  COMMENT "Zipping web UI")
juce_add_binary_data(GnvUiData SOURCES "${GNV_UI_ZIP}")

target_sources(GuitarNoteVisualizer PRIVATE
  src/PluginProcessor.cpp
  src/PluginEditor.cpp)

target_compile_definitions(GuitarNoteVisualizer PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0)

# Third-party sources contain UTF-8 text; avoid C4819 under the Japanese code page.
target_compile_options(GuitarNoteVisualizer PRIVATE $<$<CXX_COMPILER_ID:MSVC>:/utf-8>)

target_link_libraries(GuitarNoteVisualizer
  PRIVATE
    GnvUiData
    effetune_dsp_core
    juce::juce_audio_utils
    juce::juce_gui_extra
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

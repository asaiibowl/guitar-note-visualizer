cmake_minimum_required(VERSION 3.24)
project(GuitarNoteVisualizerPlugin VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Static MSVC runtime so the plugin DLL has no VC++ redistributable dependency.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

option(GNV_BUILD_PROBE "Build the NoteSpectrogram comparison probe" ON)
option(GNV_BUILD_PLUGIN "Build the JUCE VST3 / Standalone plugin" ON)

# EffeTune DSP core (MIT): third_party/effetune/dsp, sparse checkout of Frieve-A/effetune.
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory(third_party/effetune/dsp EXCLUDE_FROM_ALL)

if(GNV_BUILD_PROBE)
  add_executable(ns_probe tools/ns_probe.cpp)
  target_link_libraries(ns_probe PRIVATE effetune_dsp_core)
endif()

if(GNV_BUILD_PLUGIN)
  add_subdirectory(third_party/JUCE EXCLUDE_FROM_ALL)
  include(plugin.cmake)
endif()

#pragma once
// Editor: hosts the web UI in WebView2 and streams telemetry / samples to it.

#include <juce_gui_extra/juce_gui_extra.h>

#include <memory>
#include <vector>

#include "PluginProcessor.h"

class GnvEditor final : public juce::AudioProcessorEditor, private juce::Timer {
public:
  explicit GnvEditor(GnvProcessor &);
  ~GnvEditor() override;

  void paint(juce::Graphics &) override;
  void resized() override;

private:
  void timerCallback() override;
  std::optional<juce::WebBrowserComponent::Resource> getResource(const juce::String &url);

  GnvProcessor &processor_;
  std::unique_ptr<juce::ZipFile> ui_;
  std::unique_ptr<juce::WebBrowserComponent> browser_;
  std::vector<std::uint8_t> telemetry_;
  std::vector<float> samples_;
  bool pageReady_ = false;
  bool tunerWanted_ = false;
  int tick_ = 0;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GnvEditor)
};

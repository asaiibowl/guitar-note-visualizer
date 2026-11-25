#include "PluginEditor.h"

#include "BinaryData.h"

#include <cmath>

namespace {
constexpr int kTunerSamples = 2048;
constexpr int kLevelSamples = 1024;

juce::String mimeFor(const juce::String &path) {
  const auto ext = path.fromLastOccurrenceOf(".", false, false).toLowerCase();
  if (ext == "html") return "text/html";
  if (ext == "js" || ext == "mjs") return "text/javascript";
  if (ext == "css") return "text/css";
  if (ext == "json") return "application/json";
  if (ext == "svg") return "image/svg+xml";
  if (ext == "png") return "image/png";
  if (ext == "wasm") return "application/wasm";
  if (ext == "woff2") return "font/woff2";
  if (ext == "txt" || !path.containsChar('.')) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

juce::File userDataFolder() {
  return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
      .getChildFile("GuitarNoteVisualizer")
      .getChildFile("WebView2");
}
} // namespace

GnvEditor::GnvEditor(GnvProcessor &p) : AudioProcessorEditor(&p), processor_(p) {
  ui_ = std::make_unique<juce::ZipFile>(
      new juce::MemoryInputStream(BinaryData::gnv_ui_zip, BinaryData::gnv_ui_zipSize, false), true);

  using WBC = juce::WebBrowserComponent;
  auto options =
      WBC::Options{}
          .withBackend(WBC::Options::Backend::webview2)
          .withWinWebView2Options(WBC::Options::WinWebView2{}
                                      .withUserDataFolder(userDataFolder())
                                      .withStatusBarDisabled()
                                      .withBuiltInErrorPageDisabled()
                                      .withBackgroundColour(juce::Colour(0xff0f1218)))
          .withNativeIntegrationEnabled()
          .withKeepPageLoadedWhenBrowserIsHidden()
          .withResourceProvider([this](const juce::String &url) { return getResource(url); })
          .withEventListener("gnvReady",
                             [this](const juce::var &) {
                               pageReady_ = true;
                               juce::DynamicObject::Ptr init = new juce::DynamicObject();
                               init->setProperty("inputChannel", processor_.inputChannel.load());
                               init->setProperty("uiState", processor_.uiState);
                               init->setProperty("sampleRate", processor_.getAnalysisSampleRate());
                               browser_->emitEventIfBrowserIsVisible("gnvInit", juce::var(init.get()));
                             })
          .withEventListener("gnvSetChannel",
                             [this](const juce::var &v) {
                               processor_.inputChannel = juce::jlimit(0, 2, static_cast<int>(v["channel"]));
                             })
          .withEventListener("gnvTest",
                             [this](const juce::var &v) {
                               int midis[6] = {};
                               int count = 0;
                               if (const auto *arr = v["midis"].getArray())
                                 for (const auto &m : *arr)
                                   if (count < 6) midis[count++] = static_cast<int>(m);
                               processor_.playTestNotes(midis, count);
                             })
          .withEventListener("gnvTuner", [this](const juce::var &v) { tunerWanted_ = static_cast<bool>(v["on"]); })
          .withEventListener("gnvState", [this](const juce::var &v) { processor_.uiState = v["json"].toString(); });

  browser_ = std::make_unique<WBC>(options);
  addAndMakeVisible(*browser_);
  browser_->goToURL(WBC::getResourceProviderRoot());

  samples_.assign(kTunerSamples, 0.0f);
  setResizable(true, true);
  setResizeLimits(900, 560, 3840, 2160);
  setSize(1440, 900);
  startTimer(8); // ~125 Hz: telemetry arrives every ~20 ms, keep the extra wait short
}

GnvEditor::~GnvEditor() { stopTimer(); }

void GnvEditor::paint(juce::Graphics &g) { g.fillAll(juce::Colour(0xff0f1218)); }

void GnvEditor::resized() { browser_->setBounds(getLocalBounds()); }

std::optional<juce::WebBrowserComponent::Resource> GnvEditor::getResource(const juce::String &url) {
  auto path = url.upToFirstOccurrenceOf("?", false, false).trimCharactersAtStart("/");
  if (path.isEmpty()) path = "index.html";
  const auto *entry = ui_->getEntry(path);
  if (entry == nullptr) return std::nullopt;
  std::unique_ptr<juce::InputStream> stream(ui_->createStreamForEntry(*entry));
  if (stream == nullptr) return std::nullopt;
  juce::MemoryBlock block;
  stream->readIntoMemoryBlock(block);
  std::vector<std::byte> data(block.getSize());
  std::memcpy(data.data(), block.getData(), block.getSize());
  return juce::WebBrowserComponent::Resource{std::move(data), mimeFor(path)};
}

void GnvEditor::timerCallback() {
  if (!pageReady_) return;

  processor_.drainTelemetry(telemetry_);
  if (!telemetry_.empty())
    browser_->emitEventIfBrowserIsVisible("gnvTelemetry",
                                          juce::Base64::toBase64(telemetry_.data(), telemetry_.size()));

  // Input level (and samples for the tuner) about every 24 ms.
  static constexpr int kAudioEvery = 3;
  if (++tick_ % kAudioEvery != 0) return;
  processor_.copyRecentSamples(samples_.data(), kTunerSamples);
  double sum = 0.0;
  for (int i = kTunerSamples - kLevelSamples; i < kTunerSamples; ++i) sum += samples_[static_cast<size_t>(i)] * samples_[static_cast<size_t>(i)];
  const double rms = std::sqrt(sum / kLevelSamples);
  juce::DynamicObject::Ptr audio = new juce::DynamicObject();
  audio->setProperty("levelDb", rms > 1e-6 ? 20.0 * std::log10(rms) : -120.0);
  audio->setProperty("sampleRate", processor_.getAnalysisSampleRate());
  audio->setProperty("engineReady", processor_.isEngineReady());
  if (tunerWanted_)
    audio->setProperty("samples", juce::Base64::toBase64(samples_.data(), samples_.size() * sizeof(float)));
  browser_->emitEventIfBrowserIsVisible("gnvAudio", juce::var(audio.get()));
}

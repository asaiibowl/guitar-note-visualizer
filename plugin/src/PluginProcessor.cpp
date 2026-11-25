#include "PluginProcessor.h"

#include "PluginEditor.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace {
// NoteSpectrogramPluginParams (dsp/generated/cpp/NoteSpectrogramPluginParams.h).
constexpr std::uint32_t kNoteSpectrogramHash = 0xb8518943u;
constexpr std::uint32_t kTelemetryRingBytes = 512u * 1024u;
constexpr float kTelemetryRateHz = 60.0f; // same as the web build
// Guitar range E2..D6 plus a little headroom, as in the web app.
constexpr float kMinMidi = 40.0f;
constexpr float kMaxMidi = 88.0f;
} // namespace

GnvProcessor::GnvProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      telemetryStore_(static_cast<size_t>(telemetryFifo_.getTotalSize())),
      ring_(kRingSize, 0.0f) {}

GnvProcessor::~GnvProcessor() { destroyEngine(); }

bool GnvProcessor::isBusesLayoutSupported(const BusesLayout &layouts) const {
  const auto in = layouts.getMainInputChannelSet();
  const auto out = layouts.getMainOutputChannelSet();
  const bool okIn = in == juce::AudioChannelSet::mono() || in == juce::AudioChannelSet::stereo();
  return okIn && out == in;
}

void GnvProcessor::destroyEngine() {
  engineReady_ = false;
  if (engine_ != 0) {
    if (instance_ != 0) et_instance_destroy(engine_, instance_);
    et_engine_destroy(engine_);
  }
  engine_ = 0;
  instance_ = 0;
}

void GnvProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
  destroyEngine();
  sampleRate_ = sampleRate;
  samplePosition_ = 0.0;
  maxFrames_ = static_cast<std::uint32_t>(std::clamp(samplesPerBlock, 32, 2048));
  planar_.assign(static_cast<size_t>(maxFrames_) * 2, 0.0f);
  packet_.assign(kTelemetryRingBytes, 0);
  telemetryFifo_.reset();
  std::fill(ring_.begin(), ring_.end(), 0.0f);
  ringWrite_ = 0;

  engine_ = et_engine_create();
  if (engine_ == 0) return;
  if (et_engine_prepare(engine_, static_cast<float>(sampleRate), 2, maxFrames_, kTelemetryRingBytes) != 0) {
    destroyEngine();
    return;
  }
  et_engine_set_telemetry_rate(engine_, kTelemetryRateHz);
  instance_ = et_instance_create(engine_, "NoteSpectrogramPlugin");
  if (instance_ == 0) {
    destroyEngine();
    return;
  }
  et_instance_set_tap(engine_, instance_, 1);
  const float params[4] = {kMinMidi, kMaxMidi, 0.0f /* timbre */, 1.0f /* chord/key */};
  if (et_instance_set_params(engine_, instance_, params, 4, kNoteSpectrogramHash, 0) != 0) {
    destroyEngine();
    return;
  }
  engineReady_ = true;
  setLatencySamples(0);
}

void GnvProcessor::releaseResources() { destroyEngine(); }

void GnvProcessor::processBlock(juce::AudioBuffer<float> &buffer, juce::MidiBuffer &) {
  juce::ScopedNoDenormals noDenormals;
  const int numIn = getTotalNumInputChannels();
  const int numSamples = buffer.getNumSamples();
  for (int ch = numIn; ch < getTotalNumOutputChannels(); ++ch) buffer.clear(ch, 0, numSamples);
  if (numIn == 0 || numSamples == 0) return;

  // Audio passes through untouched; analysis reads a mono copy.
  const int sel = inputChannel.load(std::memory_order_relaxed);
  const float *left = buffer.getReadPointer(0);
  const float *right = numIn > 1 ? buffer.getReadPointer(1) : left;

  if (testPending_.load(std::memory_order_acquire)) startPendingVoices();

  int write = ringWrite_.load(std::memory_order_relaxed);
  int done = 0;
  while (done < numSamples) {
    const int n = std::min(numSamples - done, static_cast<int>(maxFrames_));
    float *a = planar_.data();
    for (int i = 0; i < n; ++i) {
      const float l = left[done + i];
      const float r = right[done + i];
      const float v = (sel == kLeft ? l : sel == kRight ? r : 0.5f * (l + r)) + nextTestSample();
      a[i] = v;
      ring_[static_cast<size_t>(write)] = v;
      write = (write + 1) & (kRingSize - 1);
    }
    if (engineReady_.load(std::memory_order_relaxed)) {
      // The engine expects planar data with frame_count frames per channel: pack channel 2 right after.
      std::memcpy(a + n, a, static_cast<size_t>(n) * sizeof(float));
      if (et_instance_process(engine_, instance_, a, 2, static_cast<std::uint32_t>(n),
                              samplePosition_ / sampleRate_.load(std::memory_order_relaxed)) == 0) {
        std::uint32_t dropped = 0;
        const std::uint32_t bytes =
            et_telemetry_read(engine_, packet_.data(), static_cast<std::uint32_t>(packet_.size()), &dropped);
        // Only whole packets go into the FIFO so frame boundaries stay intact; drop if the UI is behind.
        if (bytes > 0 && telemetryFifo_.getFreeSpace() >= static_cast<int>(bytes)) {
          const auto scope = telemetryFifo_.write(static_cast<int>(bytes));
          if (scope.blockSize1 > 0)
            std::memcpy(telemetryStore_.data() + scope.startIndex1, packet_.data(), static_cast<size_t>(scope.blockSize1));
          if (scope.blockSize2 > 0)
            std::memcpy(telemetryStore_.data() + scope.startIndex2, packet_.data() + scope.blockSize1,
                        static_cast<size_t>(scope.blockSize2));
        }
      }
    }
    samplePosition_ += n;
    done += n;
  }
  ringWrite_.store(write, std::memory_order_release);
}

void GnvProcessor::playTestNotes(const int *midis, int count) {
  if (testPending_.load(std::memory_order_acquire)) return; // previous request not consumed yet
  pendingCount_ = std::min(count, kVoices);
  for (int i = 0; i < pendingCount_; ++i) pendingMidis_[i] = midis[i];
  testPending_.store(true, std::memory_order_release);
}

void GnvProcessor::startPendingVoices() {
  const double sr = sampleRate_.load(std::memory_order_relaxed);
  for (int v = 0; v < kVoices; ++v) voices_[v].remaining = 0;
  for (int v = 0; v < pendingCount_; ++v) {
    Voice &voice = voices_[v];
    const double freq = 440.0 * std::pow(2.0, (pendingMidis_[v] - 69) / 12.0);
    voice.len = std::clamp(static_cast<int>(std::lround(sr / freq)), 2, kVoiceBuf);
    float mean = 0.0f;
    for (int i = 0; i < voice.len; ++i) {
      noiseSeed_ = noiseSeed_ * 1664525u + 1013904223u;
      voice.buf[i] = (static_cast<float>(noiseSeed_ >> 8) / 8388608.0f) * 2.0f - 1.0f;
      mean += voice.buf[i];
    }
    mean /= static_cast<float>(voice.len);
    for (int i = 0; i < voice.len; ++i) voice.buf[i] -= mean; // no DC, like a real string
    voice.idx = 0;
    voice.delay = static_cast<int>(v * 0.012 * sr); // 12 ms strum
    voice.remaining = static_cast<int>(2.0 * sr);
  }
  testPending_.store(false, std::memory_order_release);
}

float GnvProcessor::nextTestSample() {
  float sum = 0.0f;
  for (Voice &voice : voices_) {
    if (voice.remaining <= 0) continue;
    if (voice.delay > 0) {
      --voice.delay;
      continue;
    }
    const int next = voice.idx + 1 == voice.len ? 0 : voice.idx + 1;
    const float out = voice.buf[voice.idx];
    voice.buf[voice.idx] = 0.996f * 0.5f * (out + voice.buf[next]);
    voice.idx = next;
    --voice.remaining;
    sum += out;
  }
  return 0.25f * sum;
}

void GnvProcessor::drainTelemetry(std::vector<std::uint8_t> &out) {
  const int ready = telemetryFifo_.getNumReady();
  out.resize(static_cast<size_t>(ready));
  if (ready == 0) return;
  const auto scope = telemetryFifo_.read(ready);
  if (scope.blockSize1 > 0)
    std::memcpy(out.data(), telemetryStore_.data() + scope.startIndex1, static_cast<size_t>(scope.blockSize1));
  if (scope.blockSize2 > 0)
    std::memcpy(out.data() + scope.blockSize1, telemetryStore_.data() + scope.startIndex2,
                static_cast<size_t>(scope.blockSize2));
}

void GnvProcessor::copyRecentSamples(float *dest, int count) const {
  count = std::min(count, kRingSize);
  const int end = ringWrite_.load(std::memory_order_acquire);
  int start = (end - count) & (kRingSize - 1);
  for (int i = 0; i < count; ++i) {
    dest[i] = ring_[static_cast<size_t>(start)];
    start = (start + 1) & (kRingSize - 1);
  }
}

void GnvProcessor::getStateInformation(juce::MemoryBlock &destData) {
  juce::ValueTree state("GNV");
  state.setProperty("inputChannel", inputChannel.load(), nullptr);
  state.setProperty("uiState", uiState, nullptr);
  juce::MemoryOutputStream stream(destData, false);
  state.writeToStream(stream);
}

void GnvProcessor::setStateInformation(const void *data, int sizeInBytes) {
  const auto state = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
  if (!state.isValid()) return;
  inputChannel = std::clamp(static_cast<int>(state.getProperty("inputChannel", 0)), 0, 2);
  uiState = state.getProperty("uiState", "").toString();
}

juce::AudioProcessorEditor *GnvProcessor::createEditor() { return new GnvEditor(*this); }

juce::AudioProcessor *JUCE_CALLTYPE createPluginFilter() { return new GnvProcessor(); }

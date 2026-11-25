#pragma once
// Audio side: passes audio through unchanged and runs EffeTune's NoteSpectrogram on a mono mix.
// Telemetry packets and recent samples are handed to the editor through lock-free buffers.

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <cstdint>
#include <vector>

#include "effetune/abi.h"

class GnvProcessor final : public juce::AudioProcessor {
public:
  /** Which input channel feeds the analyser. */
  enum Channel { kLeft = 0, kRight = 1, kMix = 2 };

  GnvProcessor();
  ~GnvProcessor() override;

  void prepareToPlay(double sampleRate, int samplesPerBlock) override;
  void releaseResources() override;
  bool isBusesLayoutSupported(const BusesLayout &layouts) const override;
  void processBlock(juce::AudioBuffer<float> &, juce::MidiBuffer &) override;
  using AudioProcessor::processBlock;

  juce::AudioProcessorEditor *createEditor() override;
  bool hasEditor() const override { return true; }

  const juce::String getName() const override { return JucePlugin_Name; }
  bool acceptsMidi() const override { return false; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 0.0; }

  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String &) override {}

  void getStateInformation(juce::MemoryBlock &destData) override;
  void setStateInformation(const void *data, int sizeInBytes) override;

  // ---- editor (message thread) API ----

  /** Moves all pending telemetry bytes (whole EffeTune packets) into `out`. */
  void drainTelemetry(std::vector<std::uint8_t> &out);
  /** Copies the most recent `count` mono analysis samples (oldest first). */
  void copyRecentSamples(float *dest, int count) const;
  double getAnalysisSampleRate() const { return sampleRate_.load(); }
  /** True once the engine has been prepared successfully. */
  bool isEngineReady() const { return engineReady_.load(); }

  /** Queue synthetic plucked notes (MIDI numbers, max 6) mixed into the analysis input only. */
  void playTestNotes(const int *midis, int count);

  std::atomic<int> inputChannel{kLeft};
  /** UI settings JSON saved with the DAW project (written by the editor). */
  juce::String uiState;

private:
  void destroyEngine();

  et_engine engine_ = 0;
  et_instance instance_ = 0;
  std::uint32_t maxFrames_ = 0;
  double samplePosition_ = 0.0;
  std::vector<float> planar_;        // 2 x maxFrames_, planar
  std::vector<std::uint8_t> packet_; // telemetry staging

  juce::AbstractFifo telemetryFifo_{1 << 20};
  std::vector<std::uint8_t> telemetryStore_;

  static constexpr int kRingSize = 1 << 14;
  std::vector<float> ring_;
  std::atomic<int> ringWrite_{0};

  // Test-signal voices (Karplus-Strong), owned by the audio thread once triggered.
  static constexpr int kVoices = 6;
  static constexpr int kVoiceBuf = 4096;
  struct Voice {
    float buf[kVoiceBuf];
    int len = 0;
    int idx = 0;
    int delay = 0;      // samples before it starts (strum)
    int remaining = 0;  // samples left to play
  };
  Voice voices_[kVoices];
  int pendingMidis_[kVoices] = {};
  int pendingCount_ = 0;
  std::atomic<bool> testPending_{false};
  std::uint32_t noiseSeed_ = 12345u;
  void startPendingVoices();
  float nextTestSample();

  std::atomic<double> sampleRate_{48000.0};
  std::atomic<bool> engineReady_{false};

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GnvProcessor)
};

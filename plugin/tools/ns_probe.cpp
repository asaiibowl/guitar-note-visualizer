// Native NoteSpectrogram probe: runs a mono float32 file through EffeTune's C ABI and dumps
// the raw telemetry packets, so they can be compared with the WebAssembly build.
//   ns_probe <in.f32> <sampleRate> <out.bin> [blockFrames]
// out.bin = repeated [uint32 byteCount][bytes...]
#include <cstdio>
#include <cstdint>
#include <cstdlib>
#include <vector>

#include "effetune/abi.h"

namespace {
constexpr std::uint32_t kNoteSpectrogramHash = 0xb8518943u;
constexpr std::uint32_t kRingBytes = 512u * 1024u;
} // namespace

int main(int argc, char **argv) {
  if (argc < 4) {
    std::fprintf(stderr, "usage: ns_probe <in.f32> <sampleRate> <out.bin> [blockFrames]\n");
    return 2;
  }
  const float sampleRate = static_cast<float>(std::atof(argv[2]));
  const std::uint32_t block = argc > 4 ? static_cast<std::uint32_t>(std::atoi(argv[4])) : 128u;

  std::FILE *in = std::fopen(argv[1], "rb");
  if (!in) return 3;
  std::vector<float> mono;
  float sample;
  while (std::fread(&sample, sizeof(float), 1, in) == 1) mono.push_back(sample);
  std::fclose(in);

  const et_engine engine = et_engine_create();
  if (!engine) return 4;
  if (et_engine_prepare(engine, sampleRate, 2, block, kRingBytes) != 0) return 5;
  et_engine_set_telemetry_rate(engine, 60.0f);
  const et_instance inst = et_instance_create(engine, "NoteSpectrogramPlugin");
  if (!inst) return 6;
  et_instance_set_tap(engine, inst, 1);
  const float params[4] = {40.0f, 88.0f, 0.0f, 1.0f}; // minimumMidi, maximumMidi, timbre, chordKey
  if (et_instance_set_params(engine, inst, params, 4, kNoteSpectrogramHash, 0) != 0) return 7;

  std::FILE *out = std::fopen(argv[3], "wb");
  if (!out) return 8;
  std::vector<float> planar(static_cast<size_t>(block) * 2);
  std::vector<std::uint8_t> packet(kRingBytes);
  std::uint32_t packets = 0;
  for (size_t pos = 0; pos + block <= mono.size(); pos += block) {
    for (std::uint32_t i = 0; i < block; ++i) {
      planar[i] = mono[pos + i];
      planar[block + i] = mono[pos + i];
    }
    const double t = static_cast<double>(pos) / sampleRate;
    if (et_instance_process(engine, inst, planar.data(), 2, block, t) != 0) return 9;
    std::uint32_t dropped = 0;
    const std::uint32_t bytes = et_telemetry_read(engine, packet.data(), kRingBytes, &dropped);
    if (bytes > 0) {
      std::fwrite(&bytes, sizeof(bytes), 1, out);
      std::fwrite(packet.data(), 1, bytes, out);
      ++packets;
    }
  }
  std::fclose(out);
  et_instance_destroy(engine, inst);
  et_engine_destroy(engine);
  std::printf("packets=%u latency=%u\n", packets, 0u);
  return 0;
}

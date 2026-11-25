// Audio interface input: device selection, channel selection, gain, level metering.

export type ChannelChoice = 'mix' | number;

export interface InputInfo {
  label: string;
  channelCount: number;
  /** Input latency reported by the browser for the capture track, in seconds (if available). */
  reportedLatency: number | null;
  sampleRate: number | null;
}

export class InputDevice {
  /** Mono bus after channel selection and gain; connect it to the engine. */
  readonly bus: GainNode;
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private splitter: ChannelSplitterNode | null = null;

  constructor(private context: AudioContext) {
    this.bus = context.createGain();
    this.bus.channelCount = 1;
    this.bus.channelCountMode = 'explicit';
    this.bus.channelInterpretation = 'speakers';
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.bus.connect(this.analyser);
  }

  static async listInputs(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  }

  async open(deviceId: string | null, channel: ChannelChoice): Promise<InputInfo> {
    this.close();
    const audio: MediaTrackConstraints & { latency?: ConstrainDouble } = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      latency: { ideal: 0 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.source = this.context.createMediaStreamSource(this.stream);
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings() as MediaTrackSettings & { latency?: number };
    const channelCount = settings.channelCount ?? this.source.channelCount ?? 1;
    this.routeChannel(channel, channelCount);
    return {
      label: track.label,
      channelCount,
      reportedLatency: typeof settings.latency === 'number' ? settings.latency : null,
      sampleRate: settings.sampleRate ?? null,
    };
  }

  private routeChannel(channel: ChannelChoice, channelCount: number): void {
    if (!this.source) return;
    if (channel === 'mix' || channelCount <= 1) {
      this.source.connect(this.bus);
      return;
    }
    const ch = Math.min(channel, channelCount - 1);
    this.splitter = this.context.createChannelSplitter(Math.max(2, channelCount));
    this.source.connect(this.splitter);
    this.splitter.connect(this.bus, ch);
  }

  setGainDb(db: number): void {
    this.bus.gain.setTargetAtTime(10 ** (db / 20), this.context.currentTime, 0.01);
  }

  /** Current RMS level of the selected input after gain, in dBFS. */
  levelDb(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -120;
  }

  close(): void {
    this.splitter?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.splitter = null;
    this.source = null;
    this.stream = null;
  }
}

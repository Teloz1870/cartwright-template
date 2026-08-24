"use client";

import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Voice-plan Fase 1.6: browser-side WS-wrapper omkring @google/genai's
 * ai.live.connect().
 *
 * Sessionen kører direkte fra browser → Google med ephemeral token.
 * Server-relayet er bevidst undgået fordi (a) Vercel Fluid Compute kan ikke
 * hoste persistente WebSockets, og (b) Google's pre-committed setup-message
 * + lockAdditionalFields garanterer at sessionen kun kan bruge de tools
 * server-side bestemte ved token-mint.
 *
 * Tool-calls routes alligevel gennem serveren via /api/live/tool-dispatch
 * så scope-guards, confirmation-gates og audit-log fungerer identisk med
 * text-chatten.
 *
 * Audio-håndtering:
 *   - Input: 16 kHz mono PCM (Google's krav). AudioContext med AudioWorklet
 *     resampler getUserMedia-stream'en.
 *   - Output: Gemini sender 24 kHz PCM. Vi spiller via AudioContext med
 *     scheduled buffer-sources for at undgå glitches mellem frames.
 */

export type VoiceShopClientOptions = {
  /** Ephemeral token name fra /api/live/token */
  token: string;
  /** Stable session-id (round-trip via /api/live/tool-dispatch) */
  sessionId: string;
  /** Model-id; skal matche det server-side mintede setup */
  model: string;
};

export type ToolCallFrame = {
  functionCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
};

export type ToolResponsePayload = {
  result?: unknown;
  error?: string;
};

export type VoiceShopState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

type Listeners = {
  state?: (state: VoiceShopState) => void;
  transcript?: (text: string, isFinal: boolean) => void;
  toolCall?: (frame: ToolCallFrame) => void;
  error?: (err: Error) => void;
};

const TARGET_INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

/**
 * AudioWorklet code er inlinet som Blob-URL så vi undgår byggetool-friktion
 * (Next.js + Turbopack håndterer ikke AudioWorklet-loading transparent).
 * Worklet'en down-samples mic-input til 16 kHz mono og emitter Float32-frames.
 */
const PCM_WORKLET_SOURCE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.targetRate = opts.processorOptions.targetRate;
    this.sourceRate = sampleRate;
    this.ratio = this.sourceRate / this.targetRate;
    this.acc = 0;
    this.buffer = [];
    this.FRAME_SIZE = 1600; // 100ms ved 16 kHz
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        this.buffer.push(channel[i]);
        if (this.buffer.length >= this.FRAME_SIZE) {
          const out = new Float32Array(this.buffer);
          this.buffer = [];
          this.port.postMessage(out, [out.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCaptureProcessor);
`;

export class VoiceShopClient {
  private readonly opts: VoiceShopClientOptions;
  private readonly listeners: Listeners = {};

  private session: Awaited<
    ReturnType<GoogleGenAI["live"]["connect"]>
  > | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private playbackCursor = 0;
  private startedAt = 0;
  private videoTimer: ReturnType<typeof setInterval> | null = null;
  private videoStream: MediaStream | null = null;
  private state: VoiceShopState = "idle";

  constructor(opts: VoiceShopClientOptions) {
    this.opts = opts;
  }

  on<K extends keyof Listeners>(event: K, handler: Listeners[K]) {
    this.listeners[event] = handler;
  }

  /** Total session-tid i minutter siden start() blev kaldt. */
  get sessionMinutes(): number {
    if (!this.startedAt) return 0;
    return (Date.now() - this.startedAt) / 60_000;
  }

  async start(): Promise<void> {
    this.setState("connecting");
    this.startedAt = Date.now();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true },
      });
    } catch (err) {
      this.emitError(err, "Mikrofon-adgang blev nægtet.");
      return;
    }

    this.audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });

    const workletBlob = new Blob([PCM_WORKLET_SOURCE], {
      type: "application/javascript",
    });
    const workletUrl = URL.createObjectURL(workletBlob);
    try {
      await this.audioCtx.audioWorklet.addModule(workletUrl);
    } catch (err) {
      URL.revokeObjectURL(workletUrl);
      this.emitError(err, "Kunne ikke starte audio-pipeline.");
      return;
    }
    URL.revokeObjectURL(workletUrl);

    try {
      const ai = new GoogleGenAI({
        apiKey: this.opts.token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      this.session = await ai.live.connect({
        model: this.opts.model,
        // config-feltet er pre-committet i token-setup; vi kan ikke ændre
        // det her, men SDK'et kræver et minimal default.
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => this.setState("listening"),
          onmessage: (msg: unknown) => this.handleServerMessage(msg),
          onerror: (err: unknown) => {
            this.emitError(err, "Voice-forbindelsen blev afbrudt.");
          },
          onclose: () => {
            if (this.state !== "ended") this.setState("ended");
          },
        },
      });
    } catch (err) {
      this.emitError(err, "Kunne ikke forbinde til voice-service.");
      return;
    }

    const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-capture", {
      processorOptions: { targetRate: TARGET_INPUT_SAMPLE_RATE },
    });
    this.workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      this.sendAudioFrame(e.data);
    };
    source.connect(this.workletNode);
  }

  /** Send et 16 kHz mono PCM-frame til Gemini. */
  private sendAudioFrame(pcm: Float32Array): void {
    if (!this.session) return;
    const int16 = float32ToInt16(pcm);
    const base64 = base64FromArrayBuffer(int16.buffer as ArrayBuffer);
    this.session.sendRealtimeInput({
      audio: { data: base64, mimeType: `audio/pcm;rate=${TARGET_INPUT_SAMPLE_RATE}` },
    });
  }

  /**
   * Start sampling video-frames ved 1 fps fra getUserMedia. Bagkamera på
   * mobil hvis tilgængeligt (facingMode: 'environment').
   */
  async startVideo(): Promise<void> {
    if (this.videoStream) return;
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 },
      });
    } catch (err) {
      this.emitError(err, "Kamera-adgang blev nægtet.");
      return;
    }
    const track = this.videoStream.getVideoTracks()[0];
    const imageCapture =
      typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture ===
      "function"
        ? new (window as unknown as { ImageCapture: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture(track)
        : null;

    this.videoTimer = setInterval(async () => {
      if (!this.session) return;
      try {
        let blob: Blob;
        if (imageCapture) {
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
              "image/jpeg",
              0.7,
            ),
          );
        } else {
          // Fallback: <video> + canvas-grab
          const video = document.createElement("video");
          video.srcObject = this.videoStream;
          await video.play();
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext("2d")?.drawImage(video, 0, 0);
          blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
              "image/jpeg",
              0.7,
            ),
          );
        }
        const buf = await blob.arrayBuffer();
        const base64 = base64FromArrayBuffer(buf);
        this.session.sendRealtimeInput({
          video: { data: base64, mimeType: "image/jpeg" },
        });
      } catch {
        // Frame-fail er silent — næste tick prøver igen
      }
    }, 1000);
  }

  stopVideo(): void {
    if (this.videoTimer) {
      clearInterval(this.videoTimer);
      this.videoTimer = null;
    }
    this.videoStream?.getTracks().forEach((t) => t.stop());
    this.videoStream = null;
  }

  /**
   * Browser kalder denne efter den har POSTet til /api/live/tool-dispatch
   * og fået `kind: "result"`. Forwarder Gemini's BidiGenerateContentToolResponse.
   */
  sendToolResponse(payload: {
    functionResponses: Array<{ id: string; name: string; response: unknown }>;
  }): void {
    if (!this.session) return;
    // Google's type signature kræver response: Record<string, unknown>, men i
    // praksis kan vi sende vores diskriminerede {result|error}-shape — cast.
    this.session.sendToolResponse(
      payload as unknown as Parameters<typeof this.session.sendToolResponse>[0],
    );
  }

  async close(): Promise<void> {
    this.setState("ended");
    if (this.workletNode) {
      try {
        this.workletNode.port.close();
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    this.stopVideo();
    if (this.session) {
      try {
        this.session.close();
      } catch {
        // ignore
      }
      this.session = null;
    }
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try {
        await this.audioCtx.close();
      } catch {
        // ignore
      }
    }
    this.audioCtx = null;
  }

  private handleServerMessage(msg: unknown): void {
    const m = msg as {
      serverContent?: {
        modelTurn?: {
          parts?: Array<{
            inlineData?: { data: string; mimeType: string };
            text?: string;
          }>;
        };
        turnComplete?: boolean;
        outputTranscription?: { text: string };
        inputTranscription?: { text: string };
      };
      toolCall?: ToolCallFrame;
    };

    if (m.toolCall) {
      this.setState("thinking");
      this.listeners.toolCall?.(m.toolCall);
      return;
    }

    if (m.serverContent) {
      const sc = m.serverContent;
      if (sc.outputTranscription?.text) {
        this.listeners.transcript?.(sc.outputTranscription.text, false);
      }
      if (sc.inputTranscription?.text) {
        this.listeners.transcript?.(sc.inputTranscription.text, false);
      }
      const parts = sc.modelTurn?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data && part.inlineData.mimeType.startsWith("audio")) {
          this.setState("speaking");
          this.playAudioChunk(part.inlineData.data);
        }
        if (part.text) {
          this.listeners.transcript?.(part.text, false);
        }
      }
      if (sc.turnComplete) {
        this.listeners.transcript?.("", true);
        this.setState("listening");
      }
    }
  }

  private playAudioChunk(base64: string): void {
    if (!this.audioCtx) return;
    const bytes = arrayBufferFromBase64(base64);
    const int16 = new Int16Array(bytes);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    const audioBuffer = this.audioCtx.createBuffer(
      1,
      float32.length,
      OUTPUT_SAMPLE_RATE,
    );
    audioBuffer.getChannelData(0).set(float32);
    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioCtx.destination);
    const startAt = Math.max(this.audioCtx.currentTime, this.playbackCursor);
    source.start(startAt);
    this.playbackCursor = startAt + audioBuffer.duration;
  }

  private setState(next: VoiceShopState): void {
    if (this.state === next) return;
    this.state = next;
    this.listeners.state?.(next);
  }

  private emitError(err: unknown, fallback: string): void {
    const e = err instanceof Error ? err : new Error(fallback);
    this.setState("error");
    this.listeners.error?.(e);
  }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

function base64FromArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function arrayBufferFromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

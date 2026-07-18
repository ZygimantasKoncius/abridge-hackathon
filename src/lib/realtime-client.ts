// Browser-side OpenAI Realtime client over WebRTC (spec §5b, GA interface).
//
// Flow:
//   1. POST /api/realtime-session  → ephemeral client secret + model
//   2. getUserMedia(mic) → addTrack; ontrack → play the agent's audio
//   3. createDataChannel("oai-events") for events; session.update on open
//   4. POST the SDP offer to /v1/realtime/calls with the ephemeral key
//   5. accumulate patient + agent turns; when the agent calls end_session
//      (or the cap/manual-stop fires), surface the assembled transcript
//
// The agent owns the conversation; this client only assembles the record and
// hands the full transcript back. It never extracts or interprets anything.

import { buildSessionConfig, SESSION_HARD_CAP_MS, type JournalPatient } from "./journal-persona";

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export type Role = "patient" | "agent";

export interface Turn {
  id: string;
  role: Role;
  text: string;
  final: boolean;
}

export type Phase = "connecting" | "live" | "ended";

export interface RealtimeCallbacks {
  onPhase?: (phase: Phase) => void;
  onTurns?: (turns: Turn[]) => void;
  onAgentSpeaking?: (speaking: boolean) => void;
  // Fired once when the session ends (agent tool call, manual stop, or cap).
  // Receives the assembled "Patient:/Agent:" transcript and elapsed seconds.
  onEnded?: (transcript: string, durationSeconds: number) => void;
  onError?: (message: string) => void;
}

export class RealtimeJournalSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;

  private turns: Turn[] = [];
  private agentBuffer = ""; // in-progress agent transcript (deltas)
  private startedAt = 0;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  private seq = 0;

  constructor(
    private patient: JournalPatient,
    private cb: RealtimeCallbacks,
  ) {}

  async start(): Promise<void> {
    this.cb.onPhase?.("connecting");
    try {
      const { value, model } = await this.mintToken();

      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true });

      const pc = new RTCPeerConnection();
      this.pc = pc;

      // Play the agent's audio.
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audioEl) this.audioEl.srcObject = e.streams[0];
      };

      for (const track of this.mic.getTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onopen = () => this.configureSession();
      dc.onmessage = (e) => this.handleEvent(e.data);

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          if (!this.ended) this.cb.onError?.("Voice connection dropped.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${OPENAI_CALLS_URL}?model=${encodeURIComponent(model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        throw new Error(`OpenAI call setup failed (${sdpRes.status})`);
      }
      const answer = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      this.startedAt = Date.now();
      this.capTimer = setTimeout(() => this.finish("cap"), SESSION_HARD_CAP_MS);
      this.cb.onPhase?.("live");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not start the voice session.";
      this.cb.onError?.(message);
      this.teardown();
    }
  }

  // Patient taps "End check-in" — the explicit fallback to the agent's tool call.
  stop(): void {
    this.finish("manual");
  }

  private async mintToken(): Promise<{ value: string; model: string }> {
    const res = await fetch("/api/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: this.patient.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error ?? "Could not start a voice session.");
    }
    // client_secrets returns the ephemeral key on `value` (GA), older shapes
    // nested it under client_secret.value — accept both.
    const value: string | undefined =
      json?.token?.value ?? json?.token?.client_secret?.value;
    if (!value) throw new Error("No ephemeral key returned from token mint.");
    return { value, model: json.model };
  }

  private configureSession(): void {
    // Persona/tools/transcription are already set at mint time; re-assert over
    // the data channel so a stale server default can't win.
    this.send({ type: "session.update", session: buildSessionConfig(this.patient) });
  }

  private send(obj: unknown): void {
    if (this.dc && this.dc.readyState === "open") this.dc.send(JSON.stringify(obj));
  }

  // Defensive across GA event-name variants — the shape has churned, so we match
  // several spellings for each of the three signals we care about.
  private handleEvent(raw: string): void {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    const type = String(evt.type ?? "");

    // --- Patient (input audio) transcription ------------------------------
    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio_transcription.done"
    ) {
      const text = String(evt.transcript ?? "").trim();
      if (text) this.pushTurn("patient", text);
      return;
    }
    if (type === "conversation.item.done" || type === "conversation.item.added") {
      const item = evt.item as
        | { role?: string; content?: { type?: string; text?: string; transcript?: string }[] }
        | undefined;
      if (item?.role === "user" && Array.isArray(item.content)) {
        const text = item.content
          .map((c) => c?.transcript ?? c?.text ?? "")
          .join(" ")
          .trim();
        if (text) this.pushTurn("patient", text);
      }
      return;
    }

    // --- Agent (assistant) transcript -------------------------------------
    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      this.agentBuffer += String(evt.delta ?? "");
      this.cb.onAgentSpeaking?.(true);
      this.emitTurns(true);
      return;
    }
    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const text = String(evt.transcript ?? this.agentBuffer).trim();
      this.agentBuffer = "";
      if (text) this.pushTurn("agent", text);
      this.cb.onAgentSpeaking?.(false);
      return;
    }

    // --- Tool call: end_session ------------------------------------------
    if (
      type === "response.function_call_arguments.done" &&
      String(evt.name ?? "") === "end_session"
    ) {
      this.finish("tool");
      return;
    }
    if (type === "response.done") {
      const response = evt.response as { output?: { type?: string; name?: string }[] } | undefined;
      const calledEnd = response?.output?.some(
        (o) => o?.type === "function_call" && o?.name === "end_session",
      );
      if (calledEnd) this.finish("tool");
      return;
    }
  }

  private pushTurn(role: Role, text: string): void {
    this.turns.push({ id: `t${this.seq++}`, role, text, final: true });
    this.emitTurns(false);
  }

  // Emit turns, optionally including the in-progress agent buffer as a
  // non-final trailing turn so the live transcript scrolls as the agent speaks.
  private emitTurns(includeBuffer: boolean): void {
    const live = includeBuffer && this.agentBuffer.trim()
      ? [
          ...this.turns,
          { id: "agent-live", role: "agent" as Role, text: this.agentBuffer, final: false },
        ]
      : this.turns;
    this.cb.onTurns?.(live);
  }

  private finish(_reason: "tool" | "manual" | "cap"): void {
    if (this.ended) return;
    this.ended = true;
    const durationSeconds = this.startedAt
      ? Math.round((Date.now() - this.startedAt) / 1000)
      : 0;
    const transcript = this.assembleTranscript();
    this.cb.onPhase?.("ended");
    this.teardown();
    this.cb.onEnded?.(transcript, durationSeconds);
  }

  // "Patient:/Agent:" turns — the shape the extraction system prompt expects
  // ("the raw transcript of a patient's short daily journal (patient + agent
  // turns)"). Extraction is the single source of truth over this text.
  private assembleTranscript(): string {
    return this.turns
      .filter((t) => t.text.trim())
      .map((t) => `${t.role === "patient" ? "Patient" : "Agent"}: ${t.text.trim()}`)
      .join("\n");
  }

  private teardown(): void {
    if (this.capTimer) clearTimeout(this.capTimer);
    this.capTimer = null;
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.dc = null;
    this.pc = null;
    this.mic = null;
  }
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeJournalSession, type Turn } from "@/lib/realtime-client";
import type { JournalPatient } from "@/lib/journal-persona";
import type { ReceiptChip } from "@/lib/receipt";
import { CoverageReceipt } from "./components/CoverageReceipt";

// Patient voice check-in state machine (spec §5). One conversational session:
//   idle → connecting → live → submitting → receipt → done
// with an `error` branch that never loses the captured transcript.
//
// The OpenAI Realtime agent runs the conversation; when it ends the session we
// POST the transcript to /api/entries (the clinical pipeline, unchanged) and
// render the returned coverage-receipt chips.

type Phase =
  | "idle"
  | "connecting"
  | "live"
  | "submitting"
  | "receipt"
  | "done"
  | "error";

interface Receipt {
  entryId: string;
  chips: ReceiptChip[];
}

export function JournalSession({
  patient,
  today,
}: {
  patient: JournalPatient;
  today: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RealtimeJournalSession | null>(null);
  // Hold the last transcript so an extraction failure can be retried.
  const lastTranscript = useRef<{ transcript: string; duration: number } | null>(null);

  const submit = useCallback(
    async (transcript: string, duration: number) => {
      lastTranscript.current = { transcript, duration };
      setPhase("submitting");
      setError(null);
      try {
        if (!transcript.trim()) {
          throw new Error("I didn't catch anything that time — let's try again.");
        }
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: patient.id,
            transcript,
            source: "realtime_voice",
            duration,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Something went wrong saving that.");
        setReceipt({ entryId: json.entry_id, chips: json.chips as ReceiptChip[] });
        setPhase("receipt");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPhase("error");
      }
    },
    [patient.id],
  );

  const start = useCallback(async () => {
    setError(null);
    setTurns([]);
    setReceipt(null);
    const session = new RealtimeJournalSession(patient, {
      onPhase: (p) => {
        if (p === "connecting") setPhase("connecting");
        if (p === "live") setPhase("live");
      },
      onTurns: setTurns,
      onAgentSpeaking: setAgentSpeaking,
      onEnded: (transcript, duration) => submit(transcript, duration),
      onError: (message) => {
        setError(message);
        setPhase("error");
      },
    });
    sessionRef.current = session;
    await session.start();
  }, [patient, submit]);

  const retrySubmit = useCallback(() => {
    const last = lastTranscript.current;
    if (last) submit(last.transcript, last.duration);
    else setPhase("idle");
  }, [submit]);

  useEffect(() => {
    return () => sessionRef.current?.stop();
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto">
      {phase === "idle" && (
        <StartScreen patient={patient} today={today} onStart={start} />
      )}

      {(phase === "connecting" || phase === "live") && (
        <LiveScreen
          phase={phase}
          turns={turns}
          agentSpeaking={agentSpeaking}
          onEnd={() => sessionRef.current?.stop()}
        />
      )}

      {phase === "submitting" && (
        <CenteredNote
          title="One sec…"
          body="Reading back what you told me and tidying it into your check-in."
          pulse
        />
      )}

      {phase === "receipt" && receipt && (
        <div className="space-y-8">
          <CoverageReceipt entryId={receipt.entryId} initialChips={receipt.chips} />
          <button
            type="button"
            onClick={() => setPhase("done")}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-ink transition-colors"
          >
            Looks right — done
          </button>
        </div>
      )}

      {phase === "done" && <DoneScreen />}

      {phase === "error" && (
        <ErrorScreen
          message={error}
          canRetry={Boolean(lastTranscript.current)}
          onRetry={lastTranscript.current ? retrySubmit : start}
          onRestart={start}
        />
      )}
    </div>
  );
}

function StartScreen({
  patient,
  today,
  onStart,
}: {
  patient: JournalPatient;
  today: string;
  onStart: () => void;
}) {
  return (
    <div className="text-center reveal">
      <p className="eyebrow mb-3">{today}</p>
      <h1 className="text-2xl font-semibold text-ink tracking-tight">
        Hey {patient.firstName}, ready for today&apos;s check-in?
      </h1>
      <p className="mt-2 text-sm text-ink-muted max-w-sm mx-auto">
        Just talk about how your day went. It takes under a minute, and there&apos;s
        nothing to fill out.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-8 inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-3.5 text-base font-medium text-white hover:bg-primary-ink transition-colors focus-visible:outline-primary"
      >
        <MicIcon />
        Start check-in
      </button>
      <p className="mt-4 text-xs text-ink-faint">Uses your microphone.</p>
    </div>
  );
}

function LiveScreen({
  phase,
  turns,
  agentSpeaking,
  onEnd,
}: {
  phase: "connecting" | "live";
  turns: Turn[];
  agentSpeaking: boolean;
  onEnd: () => void;
}) {
  return (
    <div className="flex flex-col items-center reveal">
      <MicOrb active={phase === "live"} speaking={agentSpeaking} />
      <p className="mt-5 text-sm text-ink-muted h-5">
        {phase === "connecting"
          ? "Connecting…"
          : agentSpeaking
            ? "Listening back…"
            : "Go ahead, I'm listening."}
      </p>

      <LiveTranscript turns={turns} />

      {phase === "live" && (
        <button
          type="button"
          onClick={onEnd}
          className="mt-6 rounded-full border border-line-strong bg-surface px-5 py-2 text-sm text-ink-muted hover:text-ink hover:border-ink-faint transition-colors"
        >
          End check-in
        </button>
      )}
    </div>
  );
}

// Faint scrolling live transcript during the session (spec §5.2).
function LiveTranscript({ turns }: { turns: Turn[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  if (turns.length === 0) return <div className="mt-8 h-40" aria-hidden />;

  return (
    <div
      ref={scrollRef}
      className="mt-8 h-40 w-full overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface/60 px-4 py-3 text-sm"
      aria-live="polite"
    >
      {turns.map((t) => (
        <p
          key={t.id}
          className={`mb-1.5 leading-snug ${
            t.role === "patient" ? "text-ink" : "text-ink-faint italic"
          } ${t.final ? "" : "opacity-60"}`}
        >
          {t.text}
        </p>
      ))}
    </div>
  );
}

function DoneScreen() {
  return (
    <div className="text-center reveal">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M5 12.5l4.5 4.5L19 7"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold text-ink tracking-tight">See you tomorrow.</h1>
      <p className="mt-2 text-sm text-ink-muted">
        That&apos;s logged. Missed a day here and there is totally fine — no streaks to keep.
      </p>
    </div>
  );
}

function CenteredNote({
  title,
  body,
  pulse,
}: {
  title: string;
  body: string;
  pulse?: boolean;
}) {
  return (
    <div className="text-center reveal">
      {pulse && (
        <div className="mx-auto mb-6 h-10 w-10 rounded-full bg-primary-soft animate-pulse" />
      )}
      <h1 className="text-xl font-semibold text-ink tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
    </div>
  );
}

function ErrorScreen({
  message,
  canRetry,
  onRetry,
  onRestart,
}: {
  message: string | null;
  canRetry: boolean;
  onRetry: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="text-center reveal">
      <h1 className="text-xl font-semibold text-ink tracking-tight">
        Hmm, that didn&apos;t go through.
      </h1>
      <p className="mt-2 text-sm text-ink-muted max-w-sm mx-auto">
        {message ?? "Something went wrong."}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-ink transition-colors"
        >
          {canRetry ? "Try saving again" : "Start over"}
        </button>
        {canRetry && (
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full px-4 py-2.5 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            New check-in
          </button>
        )}
      </div>
    </div>
  );
}

function MicOrb({ active, speaking }: { active: boolean; speaking: boolean }) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      {active && (
        <span
          className={`absolute inset-0 rounded-full ${
            speaking ? "bg-primary-soft" : "bg-primary/10"
          } ${speaking ? "animate-ping" : "animate-pulse"}`}
          aria-hidden
        />
      )}
      <span
        className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
          active ? "bg-primary text-white" : "bg-surface-sunken text-ink-faint"
        } transition-colors`}
      >
        <MicIcon large />
      </span>
    </div>
  );
}

function MicIcon({ large }: { large?: boolean }) {
  const s = large ? 28 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M6 11a6 6 0 0012 0M12 17v4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

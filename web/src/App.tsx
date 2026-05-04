import { useState, useRef, useCallback, useEffect } from "react";
import { Shell } from "./components/Shell";

type Tab = "stopwatch" | "timer";

const PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
];

const LS_KEY = "timer_last_duration";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function playBeep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.type = "square";
  gain.gain.value = 0.3;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.stop(ctx.currentTime + 0.8);

  // Second beep after a short pause
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.frequency.value = 880;
  osc2.type = "square";
  gain2.gain.value = 0.3;
  osc2.start(ctx.currentTime + 1.0);
  gain2.gain.setValueAtTime(0.3, ctx.currentTime + 1.0);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
  osc2.stop(ctx.currentTime + 1.8);

  // Third beep
  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.connect(gain3);
  gain3.connect(ctx.destination);
  osc3.frequency.value = 1100;
  osc3.type = "square";
  gain3.gain.value = 0.3;
  osc3.start(ctx.currentTime + 2.0);
  gain3.gain.setValueAtTime(0.3, ctx.currentTime + 2.0);
  gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);
  osc3.stop(ctx.currentTime + 3.0);
}

function getSavedDuration(): number {
  try {
    const val = localStorage.getItem(LS_KEY);
    if (val) {
      const n = Number(val);
      if (n > 0 && Number.isFinite(n)) return n;
    }
  } catch {
    // ignore
  }
  return 300; // default 5 minutes
}

const btnBase: React.CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid var(--line)",
  padding: "0.5rem 1rem",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.875rem",
  transition: "background 0.15s, border-color 0.15s",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("stopwatch");

  // ── Stopwatch state ──
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsed, setSwElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swStart = useRef(0);
  const swRaf = useRef(0);

  const tickSw = useCallback(() => {
    setSwElapsed(Date.now() - swStart.current);
    swRaf.current = requestAnimationFrame(tickSw);
  }, []);

  const handleSwStart = () => {
    if (swRunning) return;
    swStart.current = Date.now() - swElapsed;
    setSwRunning(true);
    swRaf.current = requestAnimationFrame(tickSw);
  };

  const handleSwStop = () => {
    setSwRunning(false);
    cancelAnimationFrame(swRaf.current);
  };

  const handleSwReset = () => {
    setSwRunning(false);
    cancelAnimationFrame(swRaf.current);
    setSwElapsed(0);
    setLaps([]);
  };

  const handleLap = () => {
    if (swRunning) {
      setLaps((prev) => [swElapsed, ...prev]);
    }
  };

  // ── Timer state ──
  const [tmDuration, setTmDuration] = useState(getSavedDuration); // in seconds
  const [tmRemaining, setTmRemaining] = useState(0); // in ms
  const [tmRunning, setTmRunning] = useState(false);
  const [tmDone, setTmDone] = useState(false);
  const [tmStarted, setTmStarted] = useState(false); // has countdown been initiated
  const tmEnd = useRef(0);
  const tmRaf = useRef(0);
  const [customMin, setCustomMin] = useState("");
  const [customSec, setCustomSec] = useState("");

  const tickTm = useCallback(() => {
    const remaining = tmEnd.current - Date.now();
    if (remaining <= 0) {
      setTmRemaining(0);
      setTmRunning(false);
      setTmDone(true);
      playBeep();
      return;
    }
    setTmRemaining(remaining);
    tmRaf.current = requestAnimationFrame(tickTm);
  }, []);

  const handleTmStart = () => {
    if (tmRunning) return;
    const startMs = tmStarted ? tmRemaining : tmDuration * 1000;
    if (startMs <= 0) return;
    tmEnd.current = Date.now() + startMs;
    setTmRunning(true);
    setTmStarted(true);
    setTmDone(false);
    localStorage.setItem(LS_KEY, String(tmDuration));
    tmRaf.current = requestAnimationFrame(tickTm);
  };

  const handleTmPause = () => {
    setTmRunning(false);
    cancelAnimationFrame(tmRaf.current);
  };

  const handleTmReset = () => {
    setTmRunning(false);
    setTmStarted(false);
    setTmDone(false);
    cancelAnimationFrame(tmRaf.current);
    setTmRemaining(tmDuration * 1000);
  };

  const handlePreset = (seconds: number) => {
    cancelAnimationFrame(tmRaf.current);
    setTmRunning(false);
    setTmStarted(false);
    setTmDone(false);
    setTmDuration(seconds);
    setTmRemaining(seconds * 1000);
  };

  const handleCustomSet = () => {
    const m = parseInt(customMin || "0", 10);
    const s = parseInt(customSec || "0", 10);
    const total = m * 60 + s;
    if (total > 0) {
      handlePreset(total);
      setCustomMin("");
      setCustomSec("");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(swRaf.current);
      cancelAnimationFrame(tmRaf.current);
    };
  }, []);

  // Display value for timer
  const tmDisplay = tmStarted ? tmRemaining : tmDuration * 1000;

  return (
    <Shell>
      <div
        style={{
          maxWidth: "32rem",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Tab toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--panel)",
            borderRadius: "0.75rem",
            border: "1px solid var(--line)",
            overflow: "hidden",
          }}
        >
          {(["stopwatch", "timer"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "0.625rem 0",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.875rem",
                background: tab === t ? "var(--accent)" : "transparent",
                color: tab === t ? "#fff" : "var(--muted)",
                transition: "background 0.15s, color 0.15s",
                fontFamily: "inherit",
              }}
            >
              {t === "stopwatch" ? "Stopwatch" : "Timer"}
            </button>
          ))}
        </div>

        {/* ── Stopwatch Tab ── */}
        {tab === "stopwatch" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            {/* Time display */}
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: "4rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(swElapsed)}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {!swRunning ? (
                <button
                  onClick={handleSwStart}
                  style={{
                    ...btnBase,
                    background: "var(--accent)",
                    color: "#fff",
                    borderColor: "var(--accent)",
                  }}
                >
                  {swElapsed > 0 ? "Resume" : "Start"}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSwStop}
                    style={{
                      ...btnBase,
                      background: "var(--error)",
                      color: "#fff",
                      borderColor: "var(--error)",
                    }}
                  >
                    Stop
                  </button>
                  <button
                    onClick={handleLap}
                    style={{
                      ...btnBase,
                      background: "var(--panel)",
                      color: "var(--ink)",
                    }}
                  >
                    Lap
                  </button>
                </>
              )}
              {(swElapsed > 0 && !swRunning) && (
                <button
                  onClick={handleSwReset}
                  style={{
                    ...btnBase,
                    background: "var(--panel)",
                    color: "var(--muted)",
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Laps */}
            {laps.length > 0 && (
              <div
                style={{
                  width: "100%",
                  borderTop: "1px solid var(--line)",
                  paddingTop: "1rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--muted)",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Laps
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.375rem",
                  }}
                >
                  {laps.map((lap, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "0.5rem 0.75rem",
                        background: "var(--panel)",
                        borderRadius: "0.75rem",
                        fontSize: "0.875rem",
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>
                        Lap {laps.length - i}
                      </span>
                      <span
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                        }}
                      >
                        {formatTime(lap)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Timer Tab ── */}
        {tab === "timer" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1.5rem",
            }}
          >
            {/* Time display */}
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: "4rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: tmDone ? "var(--error)" : "var(--ink)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(tmDisplay)}
            </div>

            {tmDone && (
              <div
                style={{
                  color: "var(--error)",
                  fontWeight: 600,
                  fontSize: "1.125rem",
                }}
              >
                Time's up!
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {!tmRunning ? (
                <button
                  onClick={handleTmStart}
                  style={{
                    ...btnBase,
                    background: "var(--accent)",
                    color: "#fff",
                    borderColor: "var(--accent)",
                    opacity: (tmStarted ? tmRemaining : tmDuration) <= 0 ? 0.5 : 1,
                  }}
                  disabled={(tmStarted ? tmRemaining : tmDuration) <= 0}
                >
                  {tmStarted && !tmDone ? "Resume" : "Start"}
                </button>
              ) : (
                <button
                  onClick={handleTmPause}
                  style={{
                    ...btnBase,
                    background: "var(--warning)",
                    color: "#fff",
                    borderColor: "var(--warning)",
                  }}
                >
                  Pause
                </button>
              )}
              {(tmStarted || tmDone) && (
                <button
                  onClick={handleTmReset}
                  style={{
                    ...btnBase,
                    background: "var(--panel)",
                    color: "var(--muted)",
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Presets */}
            {!tmRunning && !tmStarted && (
              <>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    justifyContent: "center",
                  }}
                >
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => handlePreset(p.seconds)}
                      style={{
                        ...btnBase,
                        background:
                          tmDuration === p.seconds
                            ? "var(--accent)"
                            : "var(--panel)",
                        color:
                          tmDuration === p.seconds ? "#fff" : "var(--ink)",
                        borderColor:
                          tmDuration === p.seconds
                            ? "var(--accent)"
                            : "var(--line)",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom input */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <input
                    type="number"
                    min="0"
                    max="999"
                    placeholder="min"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCustomSet();
                    }}
                    style={{
                      width: "4rem",
                      padding: "0.5rem",
                      borderRadius: "0.75rem",
                      border: "1px solid var(--line)",
                      background: "var(--panel)",
                      color: "var(--ink)",
                      textAlign: "center",
                      fontSize: "0.875rem",
                      fontFamily: "inherit",
                    }}
                  />
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>
                    :
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="sec"
                    value={customSec}
                    onChange={(e) => setCustomSec(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCustomSet();
                    }}
                    style={{
                      width: "4rem",
                      padding: "0.5rem",
                      borderRadius: "0.75rem",
                      border: "1px solid var(--line)",
                      background: "var(--panel)",
                      color: "var(--ink)",
                      textAlign: "center",
                      fontSize: "0.875rem",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={handleCustomSet}
                    style={{
                      ...btnBase,
                      background: "var(--panel)",
                      color: "var(--ink)",
                    }}
                  >
                    Set
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

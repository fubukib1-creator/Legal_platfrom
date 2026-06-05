import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SLAMood = "lavender" | "fire" | "burnt";

type Props = {
  mood: SLAMood;
  caption: string;
  detail?: string;
};

// Three CSS-only "cat" scenes used on the contract detail page to make the
// SLA state legible at a glance:
//   lavender → peaceful field, plenty of time
//   fire     → cat hurries at a laptop, deadline imminent
//   burnt    → blackened cat in smoke, SLA breached
//
// Keyframes live in src/app/globals.css.
export function SLACatAnimation({ mood, caption, detail }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="relative h-44 w-full overflow-hidden">
          {mood === "lavender" ? <LavenderScene /> : null}
          {mood === "fire" ? <FireScene /> : null}
          {mood === "burnt" ? <BurntScene /> : null}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/55 via-black/30 to-transparent px-4 py-2 text-white">
            <p className="text-sm font-semibold">{caption}</p>
            {detail ? (
              <p className="text-xs text-white/90">{detail}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LavenderScene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-violet-200 via-purple-100 to-purple-50">
      {/* Drifting clouds */}
      <div
        className="absolute left-2 top-2 text-3xl opacity-80"
        style={{ animation: "sla-cloud-drift 10s ease-in-out infinite alternate" }}
      >
        ☁️
      </div>
      <div
        className="absolute right-4 top-6 text-2xl opacity-70"
        style={{ animation: "sla-cloud-drift 14s ease-in-out infinite alternate-reverse" }}
      >
        ☁️
      </div>

      {/* Sun */}
      <div className="absolute right-6 top-3 text-3xl">☀️</div>

      {/* Lavender stalks */}
      <Lavenders />

      {/* The cat */}
      <div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-5xl drop-shadow-md"
        style={{ animation: "sla-cat-bob 2.4s ease-in-out infinite" }}
      >
        🐱
      </div>

      {/* Grass line */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-green-300 to-transparent" />
    </div>
  );
}

function Lavenders() {
  const positions = [
    { left: "8%", delay: "0s", size: "1.6rem" },
    { left: "22%", delay: "0.4s", size: "1.4rem" },
    { left: "35%", delay: "0.8s", size: "1.8rem" },
    { left: "62%", delay: "0.2s", size: "1.5rem" },
    { left: "76%", delay: "0.6s", size: "1.7rem" },
    { left: "90%", delay: "1s", size: "1.4rem" },
  ];
  return (
    <>
      {positions.map((p) => (
        <span
          key={p.left}
          className="absolute bottom-2 origin-bottom select-none"
          style={{
            left: p.left,
            fontSize: p.size,
            animation: `sla-flower-sway 2.6s ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        >
          💜
        </span>
      ))}
    </>
  );
}

function FireScene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-amber-200 via-orange-200 to-amber-50">
      {/* Sweat drops */}
      <div className="absolute left-1/2 top-4 text-xl">💦</div>

      {/* Cat at laptop */}
      <div className="absolute inset-x-0 bottom-10 flex items-end justify-center gap-1">
        <span
          className={cn("text-5xl drop-shadow-md")}
          style={{ animation: "sla-cat-shake 0.5s ease-in-out infinite" }}
        >
          🐱
        </span>
        <span className="mb-1 text-3xl">💻</span>
      </div>

      {/* Fire flickers around the cat */}
      <span
        className="absolute bottom-8 left-[26%] text-3xl"
        style={{ animation: "sla-fire-flicker 0.45s ease-in-out infinite" }}
      >
        🔥
      </span>
      <span
        className="absolute bottom-6 left-[40%] text-2xl"
        style={{ animation: "sla-fire-flicker 0.55s ease-in-out infinite" }}
      >
        🔥
      </span>
      <span
        className="absolute bottom-7 right-[24%] text-3xl"
        style={{ animation: "sla-fire-flicker 0.4s ease-in-out infinite" }}
      >
        🔥
      </span>
      <span
        className="absolute bottom-5 right-[12%] text-2xl"
        style={{ animation: "sla-fire-flicker 0.6s ease-in-out infinite" }}
      >
        🔥
      </span>

      {/* Floor */}
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-orange-400/70 to-transparent" />
    </div>
  );
}

function BurntScene() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-zinc-700 via-zinc-800 to-black">
      {/* Smoke plumes */}
      <span
        className="absolute bottom-20 left-[30%] text-3xl"
        style={{ animation: "sla-smoke-rise 2.4s ease-out infinite" }}
      >
        💨
      </span>
      <span
        className="absolute bottom-24 left-1/2 text-2xl"
        style={{
          animation: "sla-smoke-rise 2.8s ease-out infinite",
          animationDelay: "0.6s",
        }}
      >
        💨
      </span>
      <span
        className="absolute bottom-20 right-[30%] text-3xl"
        style={{
          animation: "sla-smoke-rise 2.2s ease-out infinite",
          animationDelay: "1.1s",
        }}
      >
        💨
      </span>

      {/* The burnt cat — desaturated + dimmed via filter, with red ember glow */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full"
        style={{ animation: "sla-ember-glow 1.4s ease-in-out infinite" }}
      >
        <span
          className="block text-5xl"
          style={{ filter: "grayscale(1) brightness(0.4) contrast(1.2)" }}
        >
          🐱
        </span>
      </div>

      {/* Smoldering ground */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-red-900/80 via-red-950/40 to-transparent" />

      {/* Drifting ash */}
      <span className="absolute right-4 top-3 text-xs text-zinc-300/70">·  ·  ·</span>
      <span className="absolute left-6 top-6 text-xs text-zinc-300/70">·  ·</span>
    </div>
  );
}

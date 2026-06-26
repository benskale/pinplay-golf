import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, X, Users, Swords, MapPin, Trophy } from "lucide-react";

const STEPS = [
  {
    icon: <Swords className="w-8 h-8 text-yellow-300" />,
    title: "Pick Your Game",
    desc: "23 formats — from Skins and Wolf to Stableford and Vegas. Handicap-aware for fair play.",
  },
  {
    icon: <Users className="w-8 h-8 text-yellow-300" />,
    title: "Add Your Group",
    desc: "2–4 players. Search by name or enter manually. Handicaps auto-fill from profiles.",
  },
  {
    icon: <MapPin className="w-8 h-8 text-yellow-300" />,
    title: "Score Every Hole",
    desc: "Real-time multiplayer. Everyone sees live updates. Works even with spotty course cell service.",
  },
  {
    icon: <Trophy className="w-8 h-8 text-yellow-300" />,
    title: "Share the Results",
    desc: "Final standings, full scorecard, and a shareable link. Screenshot-worthy summaries.",
  },
];

interface OnboardingProps {
  onDismiss: () => void;
}

export default function Onboarding({ onDismiss }: OnboardingProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem("pinplay_onboarding_seen", "1");
      onDismiss();
    }
  };

  const handleSkip = () => {
    localStorage.setItem("pinplay_onboarding_seen", "1");
    onDismiss();
  };

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header with gradient */}
        <div className="relative px-6 pt-8 pb-6 text-center header-surface">
          <button
            onClick={handleSkip}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/10 flex items-center justify-center">
            {current.icon}
          </div>
          <h2 className="text-xl font-bold text-white mb-1 font-display">{current.title}</h2>
          <p className="text-sm text-white/70 leading-relaxed">{current.desc}</p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 py-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-green-500" : i < step ? "w-1.5 bg-green-300" : "w-1.5 bg-gray-300 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2">
          <Button
            onClick={handleNext}
            className="w-full h-12 rounded-xl font-semibold text-white"
            style={{ background: "var(--cta)", }}
          >
            {step < STEPS.length - 1 ? (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            ) : (
              "Start Playing"
            )}
          </Button>
          <button
            onClick={handleSkip}
            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1"
          >
            {step < STEPS.length - 1 ? "Skip tour" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

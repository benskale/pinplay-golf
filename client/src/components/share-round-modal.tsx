import { useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";

interface ShareRoundModalProps {
  gameId: string;
  courseName?: string;
  playerCount?: number;
  onClose: () => void;
}

export default function ShareRoundModal({ gameId, courseName, playerCount, onClose }: ShareRoundModalProps) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/game/${gameId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for older webviews
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = `Join my PinPlay round${courseName ? ` at ${courseName}` : ""} - follow live scores and enter your own:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "PinPlay Golf", text, url: link });
        return;
      } catch {
        // user cancelled or share failed - fall through to copy
      }
    }
    handleCopy();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl p-6 pb-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary-700 dark:text-primary-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Share your round</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {playerCount && playerCount > 0 ? `${playerCount} in the game. ` : ""}
              Everyone can follow live and enter their own scores.
            </p>
          </div>
        </div>

        <div className="flex items-center p-3 mb-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1 font-mono">{link}</span>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors"
          >
            <Share2 className="w-5 h-5" />
            Share with your group
          </button>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:border-primary-500 transition-colors"
          >
            {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

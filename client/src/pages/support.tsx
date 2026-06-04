import { useLocation } from "wouter";
import { ArrowLeft, Mail, MessageCircle, HelpCircle } from "lucide-react";

export default function SupportPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to PinPlay
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Support</h1>
        <p className="text-sm text-gray-400 mb-8">Need help? We're here for you.</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Contact Us</h2>
            </div>
            <p>
              For any questions, bug reports, or feedback, email us at{" "}
              <a href="mailto:support@pinplay.golf" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                support@pinplay.golf
              </a>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              We typically respond within 24 hours.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">How do I create a game?</h3>
                <p className="mt-1">
                  From the home screen, tap "New Game" and select your game type. Choose from 23 different scoring formats including Wolf, Nines, Stableford, Stroke Play, and more.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Can I play with friends in real-time?</h3>
                <p className="mt-1">
                  Yes! Share the game link with your group and everyone can enter scores live. Scores sync instantly across all devices.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">How do I track my handicap?</h3>
                <p className="mt-1">
                  You can enter your GHIN Handicap Index in your profile. We use it to calculate net scores in supported game types. PinPlay does not officially calculate handicaps for GHIN purposes.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">How do I delete my account?</h3>
                <p className="mt-1">
                  Go to your Profile page and scroll to the bottom. Tap "Delete Account" to permanently remove your account and all personal data. This action cannot be undone.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Is my data secure?</h3>
                <p className="mt-1">
                  Yes. All connections are encrypted (HTTPS/WSS), passwords are hashed using industry-standard algorithms, and we never sell your data. See our{" "}
                  <a href="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">Privacy Policy</a>{" "}
                  for details.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">What game types are supported?</h3>
                <p className="mt-1">
                  PinPlay supports 23 game types including: Wolf, Nines, Rabbit, Snake, Bingo Bango Bongo, Stableford, Modified Stableford, Stroke Play, Match Play, Nassau, Skins, Best Ball, Scramble, and more.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">How do tournaments work?</h3>
                <p className="mt-1">
                  Create a tournament, share the invite code with your group, and players can join. Once started, all rounds are tracked on a live leaderboard with gross and net scoring.
                </p>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feedback</h2>
            </div>
            <p>
              We love hearing from our users! If you have feature requests or suggestions to improve PinPlay Golf, please reach out to{" "}
              <a href="mailto:support@pinplay.golf" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                support@pinplay.golf
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

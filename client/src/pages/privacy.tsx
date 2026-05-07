import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 7, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">1. Information We Collect</h2>
            <p><strong>Account Information:</strong> When you create an account, we collect your name, email address, and optionally your phone number. If you sign in with Google, we collect your Google account email and profile name.</p>
            <p><strong>Profile Information:</strong> You may optionally provide a handicap index, home course, and profile photo.</p>
            <p><strong>Game Data:</strong> When you create or participate in a game, we store the game details, player names, scores, and results. This data is associated with your account if you are logged in.</p>
            <p><strong>Usage Data:</strong> We automatically collect standard server logs including IP address, browser type, pages visited, and timestamps for security and performance monitoring.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and maintain the PinPlay Golf service</li>
              <li>To create and manage your account</li>
              <li>To save your game history and scoring data</li>
              <li>To enable real-time multiplayer scoring with other players</li>
              <li>To communicate with you about your account or service updates</li>
              <li>To protect against unauthorized access and maintain security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">3. Information Sharing</h2>
            <p>We do <strong>not</strong> sell, trade, or rent your personal information to third parties.</p>
            <p><strong>Other Players:</strong> Your name, handicap index, and game results are visible to other players in shared games. Profile photos are visible to users who search for you or have you as a favorite.</p>
            <p><strong>Service Providers:</strong> We may use third-party services for hosting (e.g., cloud database providers) that process your data solely to deliver our service.</p>
            <p><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect the rights and safety of our users.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">4. Data Storage & Security</h2>
            <p>Your data is stored on secure servers with encrypted connections (HTTPS/WSS). Passwords are hashed using industry-standard cryptographic algorithms (scrypt) and are never stored in plain text.</p>
            <p>While we take reasonable measures to protect your information, no method of electronic storage is 100% secure. We cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">5. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. Game history is retained indefinitely unless you delete it. You may delete your account and associated data at any time by contacting us.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of any non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">7. Children's Privacy</h2>
            <p>PinPlay Golf is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will take steps to remove it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">8. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on this page with a new "Last updated" date.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">9. Contact Us</h2>
            <p>If you have questions about this Privacy Policy or your personal data, please contact us at:</p>
            <p><strong>Email:</strong> support@pinplay.golf</p>
          </section>
        </div>
      </div>
    </div>
  );
}

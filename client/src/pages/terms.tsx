import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: May 7, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">1. Acceptance of Terms</h2>
            <p>By accessing or using PinPlay Golf ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
            <p>PinPlay Golf is operated by Silver Springs Ventures LLC.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">2. Description of Service</h2>
            <p>PinPlay Golf is a golf scoring application that allows users to create, play, and track golf games in various formats including but not limited to Match Play, Stroke Play, Skins, Nassau, Wolf, Scramble, and Stableford. The Service supports real-time multiplayer scoring for 2-4 players.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">3. User Accounts</h2>
            <p>You may create an account using your email address and password, or through Google OAuth. You are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized use of your account</li>
              <li>Providing accurate and truthful information when creating your account</li>
            </ul>
            <p>You must be at least 13 years old to create an account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">4. Acceptable Use</h2>
            <p>You agree <strong>not</strong> to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to other users' accounts or our systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Post or transmit offensive, obscene, or objectionable content</li>
              <li>Use automated scripts or bots to interact with the Service without authorization</li>
              <li>Impersonate another person or entity</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">5. User Content</h2>
            <p>You retain ownership of any content you submit to the Service, including player names, game data, and profile information. By using the Service, you grant us a limited license to store, display, and process your content solely for the purpose of providing the Service.</p>
            <p>Game results and scores shared with other players in a game are visible to all participants in that game.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">6. Intellectual Property</h2>
            <p>The PinPlay Golf name, logo, and all associated graphics, page headers, button icons, scripts, and service names are trademarks or trade dress of Silver Springs Ventures LLC. You may not use these marks without our prior written permission.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">7. Disclaimers</h2>
            <p>The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, expressed or implied, regarding the Service's reliability, accuracy, availability, or fitness for a particular purpose.</p>
            <p>We do not guarantee that the Service will be uninterrupted, timely, secure, or error-free. Golf scoring results provided by the Service are for entertainment purposes only and should not be considered official.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">8. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, Silver Springs Ventures LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service, including but not limited to loss of data, game history, or goodwill.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">9. Termination</h2>
            <p>We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason at our discretion. You may delete your account at any time by contacting us.</p>
            <p>Upon termination, your right to use the Service will cease immediately. Provisions of these Terms that by their nature should survive termination shall remain in effect.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">10. Changes to Terms</h2>
            <p>We reserve the right to modify these Terms at any time. Material changes will be communicated via the Service or by email. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">11. Governing Law</h2>
            <p>These Terms shall be governed by the laws of the State of Arizona, United States, without regard to conflict of law principles.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">12. Contact</h2>
            <p>For questions about these Terms, please contact us at:</p>
            <p><strong>Email:</strong> support@pinplay.golf</p>
            <p><strong>Business:</strong> Silver Springs Ventures LLC</p>
          </section>
        </div>
      </div>
    </div>
  );
}

import LegalPage from "@/components/LegalPage";

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>TreEbay connects buyers (landscapers, contractors, designers, and homeowners) with verified local plant nurseries and vendors. This policy describes what we collect, how we use it, and your choices.</p>

      <h3>Information we collect</h3>
      <p><strong>Account & business information:</strong> name, business name, buyer type, phone, and the city/state/ZIP you provide during onboarding. We do not request access to your contacts, SMS, call logs, microphone, camera, or background location.</p>
      <p><strong>Approximate location:</strong> we use the city, state, and ZIP you enter — never precise device GPS — to show nearby vendors and estimate delivery regions.</p>
      <p><strong>Listings & photos:</strong> product details, specifications, and photos you upload as a vendor.</p>
      <p><strong>RFQs, quotes & projects:</strong> the items, quantities, delivery location, and notes you provide when requesting or submitting quotes.</p>
      <p><strong>Messages:</strong> the content of conversations you send within TreEbay between buyers and vendors.</p>
      <p><strong>Orders, reviews & reports:</strong> order details, ratings and reviews you submit, and reports you file about listings, vendors, conversations, or reviews.</p>
      <p><strong>Payment references:</strong> when payments are enabled, we store provider transaction references — never raw card details.</p>

      <h3>How we use information</h3>
      <p>To operate the marketplace: matching buyers and vendors, processing orders and quotes, coordinating pickup and delivery, sending in-app notifications, preventing fraud, and providing support. We do not sell your personal data. Vendors see only the RFQ details needed to quote — items, sizes, quantities, general destination, and delivery requirements — not unrelated private account data.</p>

      <h3>Service providers</h3>
      <p>We use trusted processors to host data, authenticate accounts, send email, and (when enabled) process payments. These providers receive only the data necessary to provide the service, under contract.</p>

      <h3>Data retention</h3>
      <p>We keep your profile and marketplace data while your account is active. Orders, reviews, and messages are retained as transaction records for accounting, tax, fraud prevention, and legal compliance, even after account deletion.</p>

      <h3>Account deletion</h3>
      <p>You can delete your account from Settings → Delete Account, or from the public <em>Delete your account</em> page. Deletion removes your profile, projects, favorites, blocks, and notifications, and archives your listings. Orders, reviews, and messages are retained as <strong>de-identified transaction records</strong> and are no longer linked to an identifiable profile. Your login account is signed out; full removal of the underlying authentication account is completed by TreEbay on request.</p>

      <h3>Security</h3>
      <p>We protect data with access controls, row-level permissions, and secure server-side processing of marketplace transactions. No system is perfectly secure, but we apply industry-standard safeguards.</p>

      <h3>Your rights</h3>
      <p>You can review and update your profile, request deletion, and contact us about your data. You may stop using TreEbay at any time.</p>

      <h3>Contact</h3>
      <p>For privacy questions or deletion requests, use the in-app Delete Account option or the public account-deletion page. You can also reach TreEbay support through the app's Help section.</p>
    </LegalPage>
  );
}
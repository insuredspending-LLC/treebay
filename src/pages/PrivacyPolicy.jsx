import LegalPage from "@/components/LegalPage";

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Treebay respects your privacy. This policy explains what we collect and how we use it.</p>
      <h3>Information we collect</h3>
      <p>Account details you provide during onboarding (name, business, contact, location), listings and orders you create, and messages you send within Treebay. We do not request access to your contacts, SMS, call logs, microphone, camera, or background location.</p>
      <h3>How we use information</h3>
      <p>To operate the marketplace: matching buyers and vendors, processing orders and quotes, coordinating delivery, and preventing fraud. We never sell your personal data.</p>
      <h3>Location</h3>
      <p>Location is based on the city, state, and ZIP you provide. Optional precise location is only requested for features that clearly benefit from it, and the marketplace remains usable without it.</p>
      <h3>Data retention & deletion</h3>
      <p>You can delete your account at any time from Settings → Delete Account, which removes your profile, projects, favorites, messages, orders, and notifications. An external account-deletion page is also available for app-store compliance.</p>
      <h3>Contact</h3>
      <p>For privacy questions, contact Base44 support.</p>
    </LegalPage>
  );
}
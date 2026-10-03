export default function Privacy() {
  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-200">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2 border-b border-zinc-800 pb-6">
          <h1 className="font-display text-4xl font-semibold text-white">Privacy Policy</h1>
          <p className="text-sm text-zinc-400">InstaMenu — Digital Menu Board Player</p>
          <p className="text-sm text-zinc-400">Provided by Uni2 Marketing Group · Last updated: June 2026</p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <p>
            InstaMenu is a digital signage player used by businesses to display menus, images and videos
            on televisions. This policy explains what information the InstaMenu application handles and how
            it is used. We respect your privacy and collect only what is needed to operate the service.
          </p>
        </section>

        <Section title="Information we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Device information:</strong> a randomly generated device identifier and a pairing code,
              used only to link the television to the correct business account and show the right content.
            </li>
            <li>
              <strong>Account information:</strong> for business operators, the name, email and password used
              to sign in to the management dashboard.
            </li>
            <li>
              <strong>Operational data:</strong> basic status signals (such as last-seen time and playback
              state) so operators can see whether a screen is online.
            </li>
          </ul>
        </Section>

        <Section title="Information we do NOT collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>We do not collect personal information from people viewing the screens.</li>
            <li>The app does not use the camera or microphone.</li>
            <li>We do not sell or share your data with third parties for advertising.</li>
          </ul>
        </Section>

        <Section title="How we use the information">
          <p>
            Information is used solely to deliver the service: pairing devices, displaying the content you
            assign, and showing the online status of your screens. We do not use it for any other purpose.
          </p>
        </Section>

        <Section title="Data storage and security">
          <p>
            Content and account data are stored on secured servers operated by the business. Passwords are
            stored using industry-standard hashing (bcrypt) and are never stored in plain text. Media is
            delivered over encrypted (HTTPS) connections.
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            Account and device data are retained while the account is active. When a device is unpaired or an
            account is closed, the associated data is removed.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>InstaMenu is a business tool and is not directed to children under 13.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. The latest version will always be available at this
            page.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            If you have any questions about this Privacy Policy, contact us at{" "}
            <a className="text-amber-400 underline" href="mailto:pzsuave007@gmail.com">
              pzsuave007@gmail.com
            </a>
            .
          </p>
          <p className="text-zinc-400">Uni2 Marketing Group</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

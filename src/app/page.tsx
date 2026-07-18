export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem", lineHeight: 1.6 }}>
      <h1>ADHD Check-In — Backend</h1>
      <p>Core pipeline is live. API routes:</p>
      <ul>
        <li><code>POST /api/entries</code> — transcript → extraction → store</li>
        <li><code>PATCH /api/entries/[id]</code> — corrections from receipt chips</li>
        <li><code>GET /api/digest/[pid]</code> — computed 30-day digest</li>
        <li><code>GET /api/patients</code> — provider list summary</li>
      </ul>
      <p>Seed synthetic data with <code>npm run seed</code>, then hit <code>/api/patients</code>.</p>
    </main>
  );
}

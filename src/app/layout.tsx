export const metadata = {
  title: "Abridge Hackathon — ADHD Check-In API",
  description: "Backend for the ADHD voice check-in + provider digest build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

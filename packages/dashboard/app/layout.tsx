import './globals.css';

export const metadata = {
  title: 'Traffic Analytics Control Center',
  description: 'Real-time traffic shaping and session management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
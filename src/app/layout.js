import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const jbMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Speed Sum | Real-Time Multiplayer Duel",
  description: "A fast-paced multiplayer addition duel. Select secret numbers, watch the countdown, and type the sum first to win!",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

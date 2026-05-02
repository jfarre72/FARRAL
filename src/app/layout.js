import Providers from "@/components/Providers";

export const metadata = {
  title: "FARRALAPP — Administración de obra",
  description: "Control administrativo, financiero y de avance de obra.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

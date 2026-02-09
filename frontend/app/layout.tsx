import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Restated AI",
    description: "Navigate amended agreements with precision and clarity",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}

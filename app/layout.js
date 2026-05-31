import "./globals.css";

export const metadata = {
  title: "শুদ্ধি – বাংলা বানান শুদ্ধিকরণ",
  description: "নির্ভুল বাংলা লেখার জন্য স্মার্ট বানান পরীক্ষা, সম্পাদনা এবং শুদ্ধিকরণ টুল।",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}

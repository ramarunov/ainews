import type { Metadata } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Tentang Kami — ${SITE_NAME}`,
  description: `Tentang ${SITE_NAME}, kebijakan redaksi dan penggunaan AI, kebijakan koreksi, dan cara menghubungi redaksi.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 pb-20">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">Tentang Kami</h1>
        <p className="text-lg text-muted-foreground">{SITE_TAGLINE}.</p>
      </div>

      <Section title={`Tentang ${SITE_NAME}`}>
        <p>
          {SITE_NAME} adalah media berita digital yang menggabungkan teknologi AI dengan
          pengawasan editorial manusia. Kami percaya kecepatan menyampaikan berita tidak boleh
          mengorbankan akurasi maupun tanggung jawab jurnalistik.
        </p>
      </Section>

      <Section title="Kebijakan Redaksi &amp; Penggunaan AI">
        <p>
          Sebagian artikel di {SITE_NAME} dibantu proses penulisannya menggunakan kecerdasan
          buatan (AI) untuk merangkum dan menyusun draf awal dari berbagai sumber berita. AI di
          sini hanya berperan sebagai alat bantu — setiap artikel tetap wajib ditinjau dan
          disetujui oleh redaksi manusia sebelum tayang. Tanggung jawab atas keakuratan dan
          kepatutan setiap berita yang terbit tetap berada di tangan redaksi, bukan sistem
          otomatis.
        </p>
        <p>
          Artikel yang proses penulisannya dibantu AI diberi label{" "}
          <span className="rounded border px-1.5 py-0.5 text-xs font-medium">AI-assisted</span>{" "}
          pada halaman artikel terkait.
        </p>
      </Section>

      <Section title="Kebijakan Koreksi">
        <p>
          Kami berkomitmen menyajikan berita yang akurat. Jika Anda menemukan kesalahan pada
          artikel kami — baik faktual, ejaan, maupun konteks — silakan hubungi kami melalui email
          di bawah dengan menyertakan tautan artikel dan penjelasan singkat. Setiap koreksi yang
          valid akan kami tinjau dan perbaiki, dengan waktu pembaruan artikel yang tercatat jelas
          pada artikel terkait.
        </p>
      </Section>

      <Section title="Kepemilikan &amp; Pendanaan">
        <p>
          {SITE_NAME} dikelola secara independen. Untuk pertanyaan terkait kepemilikan,
          pendanaan, atau kerja sama, silakan hubungi kami melalui email di bawah.
        </p>
      </Section>

      <Section title="Kontak Redaksi">
        <p>
          Email:{" "}
          <a href="mailto:support@beritabot.com" className="font-medium text-primary hover:underline">
            support@beritabot.com
          </a>
        </p>
      </Section>
    </div>
  );
}

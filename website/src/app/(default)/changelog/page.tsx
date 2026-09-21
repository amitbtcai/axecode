import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { getLocaleMessages } from "@/lib/i18n/messages";
import { createPageMetadata } from "@/lib/seo";
import { ChangelogContent } from "@/app/changelog/changelog-content";

export const metadata: Metadata = createPageMetadata({
  title: "AxeCode Changelog",
  description: "Everything new in AxeCode — features, improvements, and fixes, newest first.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return (
    <I18nProvider messages={getLocaleMessages()}>
      <ChangelogContent />
    </I18nProvider>
  );
}

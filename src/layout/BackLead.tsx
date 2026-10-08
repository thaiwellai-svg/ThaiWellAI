import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { IconButton } from "../design-system";
import { PageTitles } from "./WorkPage";

/** sub-page header: round back button beside the eyebrow + title (same on every sub-page) */
export function BackLead({ eyebrow, title, onBack }: { eyebrow: ReactNode; title: ReactNode; onBack: () => void }) {
  return (
    <div className="apg__lead">
      <IconButton label="ย้อนกลับ" variant="white" onClick={onBack}>
        <ChevronLeft size={22} strokeWidth={2} />
      </IconButton>
      <PageTitles eyebrow={eyebrow} title={title} />
    </div>
  );
}

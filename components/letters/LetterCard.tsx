import { formatLetterDate } from "@/lib/letters/format";

export const AI_BADGE_TEXT = "Drafted with AI assistance from the owner's notes";

export interface LetterCardProps {
  ownerName: string;
  /** ISO timestamp the letter was written. */
  writtenAt: string;
  subject: string;
  body: string;
  aiAssisted: boolean;
}

/**
 * A letter as a sheet of paper: serif type, batik-inspired lattice frame, the
 * owner's name and the date written. SHARED by the owner's preview and the
 * keeper's reading view, so the owner sees exactly what the keeper will see
 * (requirement 10). Presentational only: no state, no crypto.
 */
export function LetterCard({ ownerName, writtenAt, subject, body, aiAssisted }: LetterCardProps) {
  const date = formatLetterDate(writtenAt);
  return (
    <article
      aria-label={`Letter: ${subject}`}
      className="rounded-sm p-2 shadow-lg"
      style={{
        // Batik-inspired lattice (crossed diagonals, like a kawung/ceplok repeat).
        backgroundColor: "#8a5a2b",
        backgroundImage:
          "repeating-linear-gradient(45deg, #d9a441 0 3px, transparent 3px 9px), repeating-linear-gradient(-45deg, #d9a441 0 3px, transparent 3px 9px)",
      }}
    >
      <div
        className="rounded-[2px] px-6 py-7 font-serif sm:px-10"
        style={{ backgroundColor: "#f4ecd8", color: "#2b2118" }}
      >
        {aiAssisted && (
          <p
            className="mb-4 inline-block rounded-full border px-3 py-0.5 font-sans text-xs"
            style={{ borderColor: "#8a5a2b", color: "#5b3a17" }}
          >
            {AI_BADGE_TEXT}
          </p>
        )}
        <h2 className="text-2xl font-semibold leading-snug">{subject}</h2>
        <p className="mt-1 text-sm italic" style={{ color: "#5b4a38" }}>
          {date ? `Written ${date}` : "Written"}
        </p>
        <div className="mt-5 whitespace-pre-wrap text-base leading-relaxed">{body}</div>
        <p className="mt-8 text-right text-lg italic">— {ownerName}</p>
      </div>
    </article>
  );
}

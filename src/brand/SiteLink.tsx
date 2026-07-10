export function SiteLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://tobymusic.club"
      target="_blank"
      rel="noreferrer"
      title="לאתר TOBY music"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/60 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:border-primary hover:shadow-[0_0_14px_rgba(201,169,97,0.35)]"
    >
      <span aria-hidden="true">🏠</span>
      {!compact && <span>tobymusic.club</span>}
    </a>
  );
}

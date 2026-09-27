/** Фирменный знак LAST LIGHT — мотылёк в разорванном кольце. Векторный, читается на 16px. */
export function Mark({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Last Light"
      fill="none"
    >
      <defs>
        <g id="ll-wing">
          <path
            d="M57 55 C46 40 26 33 15 41 C4 49 6 68 18 78 C29 87 46 85 56 76 Z"
            fill="currentColor"
            opacity="0.92"
          />
          <path
            d="M57 74 C48 76 34 82 28 93 C23 102 30 110 40 108 C50 106 56 94 58 84 Z"
            fill="currentColor"
            opacity="0.62"
          />
          <path d="M20 46 C30 52 42 60 54 66" stroke="#0E1210" strokeWidth="1.6" opacity="0.5" />
        </g>
      </defs>

      <circle
        cx="60"
        cy="60"
        r="53"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="150 42 66 30"
        strokeLinecap="square"
        opacity="0.75"
      />
      <circle cx="60" cy="60" r="46" stroke="currentColor" strokeWidth="1" opacity="0.3" />

      <ellipse cx="60" cy="70" rx="5" ry="19" fill="currentColor" />
      <circle cx="60" cy="49" r="6.4" fill="currentColor" />
      <path d="M57 45 C50 36 43 32 36 31" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M63 45 C70 36 77 32 84 31" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />

      <use href="#ll-wing" />
      <use href="#ll-wing" transform="translate(120,0) scale(-1,1)" />

      <path d="M60 90 L60 112" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <path d="M52 112 L68 112" stroke="currentColor" strokeWidth="2.5" opacity="0.85" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Mark size={44} className="text-rust" />
      <div className="leading-none">
        <div className="stamped text-[13px] text-bone/70">CORDEPS STUDIO</div>
        <div className="stamped text-[11px] text-neutral-warm/70">PRESENTS · 2033</div>
      </div>
    </div>
  );
}

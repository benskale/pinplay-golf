interface LogoProps {
  className?: string;
}

export default function PinPlayLogo({ className = "w-8 h-8" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Green — ellipse at the bottom */}
      <ellipse cx="16" cy="26" rx="13" ry="4.5" fill="#22c55e" />
      <ellipse cx="16" cy="26" rx="10" ry="3" fill="#16a34a" />

      {/* Flagstick */}
      <rect x="15" y="7" width="2" height="19" rx="1" fill="white" opacity="0.95" />

      {/* Flag */}
      <path d="M17 7 L26 10.5 L17 14 Z" fill="#ef4444" />
    </svg>
  );
}

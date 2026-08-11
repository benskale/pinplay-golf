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
      {/* Rounded square background — dark forest green */}
      <rect width="32" height="32" rx="7" fill="#0B281E" />

      {/* Stylized "P" / location pin — cream outline */}
      <path
        d="M16 6
           C 11.5 6, 8 9, 8 13.5
           C 8 18, 11.5 21, 16 21
           C 20.5 21, 24 18, 24 13.5
           C 24 9, 20.5 6, 16 6 Z
           M 16 9.5
           C 18.5 9.5, 20.5 11.2, 20.5 13.5
           C 20.5 15.8, 18.5 17.5, 16 17.5
           C 13.5 17.5, 11.5 15.8, 11.5 13.5
           C 11.5 11.2, 13.5 9.5, 16 9.5 Z"
        fill="#FAF4E3"
      />

      {/* Pin tail pointing down */}
      <path d="M14.5 20.5 L16 25.5 L17.5 20.5 Z" fill="#FAF4E3" />

      {/* Flagstick inside the loop */}
      <rect x="15.3" y="10" width="1.4" height="6" rx="0.5" fill="#FAF4E3" opacity="0.9" />

      {/* Olive-green flag */}
      <path d="M16.7 10 L20.5 11.5 L16.7 13 Z" fill="#8DAF2B" />

      {/* Putting green curve */}
      <ellipse cx="16" cy="16.5" rx="3" ry="1" fill="#8DAF2B" opacity="0.6" />
    </svg>
  );
}

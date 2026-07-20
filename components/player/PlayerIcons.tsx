interface PlayerIconProps {
  readonly className?: string;
}

function iconProps(className?: string) {
  return {
    "aria-hidden": true,
    className,
    fill: "none",
    focusable: false,
    viewBox: "0 0 24 24",
  } as const;
}

const strokeProps = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.35,
  vectorEffect: "non-scaling-stroke",
} as const;

export function PreviousIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M19 5 9 12l10 7V5ZM5 5v14" {...strokeProps} />
    </svg>
  );
}

export function NextIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="m5 5 10 7-10 7V5Zm14 0v14" {...strokeProps} />
    </svg>
  );
}

export function PlayIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="m7 4 12 8-12 8V4Z" {...strokeProps} />
    </svg>
  );
}

export function PauseIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M9 5v14M15 5v14" {...strokeProps} />
    </svg>
  );
}

export function RepeatIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path
        d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"
        {...strokeProps}
      />
    </svg>
  );
}

export function ShuffleIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path
        d="M3 7h3.5c4.5 0 6.5 10 11 10H21m-4-4 4 4-4 4M3 17h3.5c1.8 0 3.2-1.6 4.5-3.5M17 3l4 4-4 4m4-4h-3.5c-1.8 0-3.2 1.6-4.5 3.5"
        {...strokeProps}
      />
    </svg>
  );
}

export function QueueIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 6h16M4 12h16M4 18h10" {...strokeProps} />
    </svg>
  );
}

export function VolumeIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path
        d="M11 5 6 9H3v6h3l5 4V5Zm4.5 4a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12"
        {...strokeProps}
      />
    </svg>
  );
}

export function CloseIcon({ className }: PlayerIconProps) {
  return (
    <svg {...iconProps(className)}>
      <path d="m6 6 12 12M18 6 6 18" {...strokeProps} />
    </svg>
  );
}

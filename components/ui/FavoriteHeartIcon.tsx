export interface FavoriteHeartIconProps {
  readonly active?: boolean;
  readonly className?: string;
}

export function FavoriteHeartIcon({
  active = false,
  className,
}: FavoriteHeartIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill={active ? "currentColor" : "none"}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78a5.5 5.5 0 0 0 1.06-8.84Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface Props {
  size?: number;
  className?: string;
}

/** A compact P drawn as a constellation path. It remains legible at favicon size. */
export default function PerseusMark({ size = 32, className }: Props) {
  return (
    <img
      className={className}
      width={size}
      height={size}
      src="/brand/perseus-icon-192.png"
      alt=""
      aria-hidden="true"
    />
  );
}

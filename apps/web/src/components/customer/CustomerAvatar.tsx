type CustomerAvatarProps = { src?: string | null; name?: string | null };

export function CustomerAvatar({ src, name }: CustomerAvatarProps) {
  if (src) return <img src={src} alt="Customer profile" />;
  return <span aria-label="Customer profile initials">{(name || "C").slice(0, 1).toUpperCase()}</span>;
}

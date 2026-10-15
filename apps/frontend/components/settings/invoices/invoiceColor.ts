/** Même formule sRGB que le serveur ; le serveur revérifie à l'enregistrement. */
export function invoiceContrast(color: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = linear.reduce((sum, v, i) => sum + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
  return 1.05 / (luminance + 0.05);
}

export function invoiceAccent(color: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return '';
  let rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  while (invoiceContrast(color) < 4.5) {
    rgb = rgb.map((v) => Math.max(0, Math.floor(v * 0.98)));
    color = `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return color.toLowerCase();
}

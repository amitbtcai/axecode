/** "Axe Code on host" → "host"; the brand prefix is noise inside the app.
 *  Legacy "Poracode on …" and "Lightcode on …" labels (paired before each
 *  rebrand) are stripped too, so already-paired desktops keep short titles. */
export function desktopTitle(label: string): string {
  const stripped = label.replace(/^(?:Axe Code|Poracode|Lightcode)\s+on\s+/i, "");
  return stripped || label;
}

export function validateSourceUrl(
  raw: string,
  approvedHosts: readonly string[],
): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('Unsafe URL');
  // IP literals, single-label/local names and unreviewed hosts never enter the collector.
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
    !approvedHosts.includes(host)
  )
    throw new Error('Unapproved host');
  url.hash = '';
  return url;
}
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? '',
  );
}

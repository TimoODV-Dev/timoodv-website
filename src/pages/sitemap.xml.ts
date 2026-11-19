// Lists every public page so search engines find them. Rebuilt on each deploy (nightly), so the date is always fresh.
const PAGES = ['/', '/privacy', '/terms', '/cookies'];
export const GET = ({ site }: { site?: URL }) => {
  const base = (site?.origin || 'https://timoodv.com');
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    PAGES.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + `\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};

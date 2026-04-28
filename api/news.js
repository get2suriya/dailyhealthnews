// DailyHealth — Real News via Google News RSS
// No API key required. Fetches real published healthcare articles.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Google News RSS feeds by healthcare category
  const FEEDS = [
    { query: 'medicare medicaid CMS healthcare policy US',  category: 'government', count: 2 },
    { query: 'health insurance UnitedHealth Cigna Aetna',   category: 'insurer',    count: 2 },
    { query: 'hospital health system merger acquisition',   category: 'provider',   count: 2 },
    { query: 'FDA drug pricing pharmacy biosimilar',        category: 'pharmacy',   count: 2 },
    { query: 'AI artificial intelligence digital health',   category: 'ai',         count: 2 },
  ];

  function parseRSS(xml, category, maxItems) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      const getLinkAttr = () => {
        const m = block.match(/<source url="([^"]+)"/);
        return m ? m[1] : '';
      };
      const rawTitle = get('title');
      // Google News titles are "Headline - Source Name"
      const lastDash = rawTitle.lastIndexOf(' - ');
      const title   = lastDash > 0 ? rawTitle.slice(0, lastDash).trim() : rawTitle;
      const source  = lastDash > 0 ? rawTitle.slice(lastDash + 3).trim() : get('source');
      const link    = get('link') || getLinkAttr();
      const pubDate = get('pubDate');
      const desc    = get('description').replace(/<[^>]+>/g, '').slice(0, 160);

      if (title && link) {
        items.push({
          id: `art-${category}-${items.length}`,
          title,
          excerpt: desc || title,
          source: source || 'Healthcare News',
          category,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          sourceUrl: link,
          tags: [category],
          content: desc,
        });
      }
    }
    return items;
  }

  try {
    const results = await Promise.all(
      FEEDS.map(async ({ query, category, count }) => {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) return [];
        const xml = await r.text();
        return parseRSS(xml, category, count);
      })
    );

    // Flatten, deduplicate by title, rank by recency
    const seen = new Set();
    const articles = results
      .flat()
      .filter(a => {
        if (seen.has(a.title)) return false;
        seen.add(a.title);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, 10)
      .map((a, i) => ({ ...a, rank: i + 1, id: `art-${i + 1}` }));

    return res.status(200).json({ articles });
  } catch (e) {
    return res.status(500).json({ articles: [], error: e.message });
  }
}

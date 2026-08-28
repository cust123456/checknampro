const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36';

const TOPICS = {
  'Bet/Casino': [
    'casino','betting','sportsbook','slot','poker','jackpot','odds','wager',
    'baccarat','roulette','cá cược','nhà cái','xổ số','bắn cá'
  ],
  'Blog/News': [
    'blog','news','article','magazine','editorial','post','category',
    'tin tức','bài viết'
  ],
  'Shop/Ecommerce': [
    'shop','store','product','cart','checkout','ecommerce','price',
    'buy now','mua hàng','sản phẩm'
  ],
  'Business/Company': [
    'company','business','services','solutions','contact us',
    'about us','corporate','agency'
  ],
  'Education': [
    'school','university','college','course','student',
    'education','academy','training'
  ],
  'Tech/Software': [
    'software','developer','hosting','cloud','app',
    'technology','github','api','saas'
  ],
  'Forum/Community': [
    'forum','community','member','thread',
    'discussion','register','login'
  ],
  'Adult': [
    'porn','xxx','adult','sex','escort','camgirl'
  ]
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function get(url, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const r = await fetch(url, {
        headers: {
          'user-agent': UA,
          'accept': 'application/json,text/html;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
        ...options
      });

      clearTimeout(timeout);

      if (r.ok) {
        return r;
      }

      if ([429, 500, 502, 503, 504].includes(r.status)) {
        lastError = new Error(`Wayback ${r.status}`);
        await sleep(700 + attempt * 800 + Math.random() * 500);
        continue;
      }

      throw new Error(`Wayback ${r.status}`);

    } catch (e) {
      clearTimeout(timeout);

      lastError = e;

      if (attempt < 2) {
        await sleep(700 + attempt * 800 + Math.random() * 500);
      }
    }
  }

  throw lastError || new Error('Wayback fetch failed');
}

async function cdx(domain, sort, limit = 1) {
  const params = new URLSearchParams({
    url: `${domain}/*`,
    output: 'json',
    matchType: 'host',
    fl: 'timestamp',
    sort,
    limit: String(limit)
  });

  const url =
    `https://web.archive.org/cdx/search/cdx?${params.toString()}` +
    `&filter=statuscode:200&filter=mimetype:text/html`;

  const r = await get(url);

  try {
    return await r.json();
  } catch {
    return null;
  }
}

function textOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000);
}

function titleOf(html) {
  const m = String(html || '').match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return (m?.[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function classify(text) {
  const t = String(text || '').toLowerCase();

  const scored = Object.entries(TOPICS)
    .map(([topic, words]) => {
      let score = 0;

      for (const w of words) {
        if (t.includes(w.toLowerCase())) {
          score++;
        }
      }

      return [topic, score];
    })
    .filter(x => x[1] > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!scored.length) {
    return 'Khác/Không rõ';
  }

  return scored
    .slice(0, 2)
    .map(x => x[0])
    .join(' + ');
}

async function fetchSnapshot(domain, ts, scheme) {
  const url =
    `https://web.archive.org/web/${ts}id_/${scheme}://${domain}/`;

  const r = await get(url);

  const html = await r.text();

  return {
    year: ts.slice(0, 4),
    title: titleOf(html),
    text: textOf(html)
  };
}

async function snap(domain, ts) {
  try {
    return await fetchSnapshot(domain, ts, 'https');
  } catch {}

  try {
    return await fetchSnapshot(domain, ts, 'http');
  } catch {}

  return null;
}

async function getTotalSnapshots(domain) {
  try {
    const params = new URLSearchParams({
      url: `${domain}/*`,
      output: 'json',
      matchType: 'host',
      fl: 'timestamp',
      limit: '2000'
    });

    const url =
      `https://web.archive.org/cdx/search/cdx?${params.toString()}` +
      `&filter=statuscode:200&filter=mimetype:text/html&collapse=digest`;

    const r = await get(url);
    const j = await r.json();

    if (Array.isArray(j)) {
      return Math.max(0, j.length - 1);
    }
  } catch {}

  return 0;
}

async function getMiddleTimestamp(domain) {
  try {
    const rows = await cdx(domain, 'ascending', 60);

    if (!Array.isArray(rows) || rows.length <= 2) {
      return null;
    }

    const data = rows.slice(1);

    const mid = data[Math.floor(data.length / 2)];

    return mid?.[0] || null;

  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const domain = String(req.query.domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];

  const domainRe =
    /^(?=.{1,253}$)(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.)+[a-z]{2,63}$/i;

  if (!domainRe.test(domain)) {
    return res.status(400).json({
      error: 'Domain không hợp lệ'
    });
  }

  try {
    let first;
    let last;

    try {
      [first, last] = await Promise.all([
        cdx(domain, 'ascending', 1),
        cdx(domain, 'descending', 1)
      ]);
    } catch (e) {
      return res.status(503).json({
        domain,
        years: '—',
        firstYear: '—',
        lastYear: '—',
        totalSnapshots: 0,
        topic: 'Wayback tạm lỗi',
        description: 'Không kết nối được Wayback sau nhiều lần thử.'
      });
    }

    const a = first?.[1]?.[0];
    const b = last?.[1]?.[0];

    if (!a || !b) {
      return res.json({
        domain,
        years: '—',
        firstYear: '—',
        lastYear: '—',
        totalSnapshots: 0,
        topic: 'Không có lịch sử',
        description: 'Không tìm thấy snapshot HTML 200 trên Wayback.'
      });
    }

    const firstYear = a.slice(0, 4);
    const lastYear = b.slice(0, 4);

    const years =
      `${Math.max(0, Number(lastYear) - Number(firstYear))} năm`;

    const [totalSnapshots, middleTs] =
      await Promise.all([
        getTotalSnapshots(domain),
        getMiddleTimestamp(domain)
      ]);

    let timestamps = [
      a,
      middleTs,
      b
    ].filter(Boolean);

    timestamps = [...new Set(timestamps)].slice(0, 3);

    const snaps = (
      await Promise.all(
        timestamps.map(ts => snap(domain, ts))
      )
    ).filter(Boolean);

    let topic = 'Khác/Không rõ';
    let description = '';

    if (snaps.length) {
      const merged = snaps
        .map(x => `${x.title} ${x.text}`)
        .join(' ');

      topic = classify(merged);

      const titles = snaps
        .filter(x => x.title)
        .map(x => `${x.year}: ${x.title}`)
        .slice(0, 3);

      if (titles.length) {
        description = titles.join(' | ');
      } else {
        description =
          `Có lịch sử từ ${firstYear} đến ${lastYear}, nhưng không đọc được title.`;
      }

    } else {
      description =
        `Có snapshot từ ${firstYear} đến ${lastYear}, nhưng Vercel không đọc được nội dung snapshot.`;
    }

    res.setHeader(
      'Cache-Control',
      's-maxage=86400, stale-while-revalidate=604800'
    );

    return res.json({
      domain,
      years,
      firstYear,
      lastYear,
      totalSnapshots,
      topic,
      description
    });

  } catch (e) {
    return res.status(500).json({
      domain,
      error: e?.message || 'Không thể quét Wayback'
    });
  }
};

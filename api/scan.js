const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/123.0 Safari/537.36";

const TOPICS = {
  "Bet/Casino": [
    "casino",
    "betting",
    "sportsbook",
    "slot",
    "slots",
    "poker",
    "jackpot",
    "odds",
    "wager",
    "baccarat",
    "roulette",
    "cá cược",
    "nhà cái",
    "xổ số",
    "bắn cá",
    "game bài"
  ],

  "Blog/News": [
    "blog",
    "news",
    "article",
    "magazine",
    "editorial",
    "post",
    "category",
    "tin tức",
    "bài viết"
  ],

  "Shop/Ecommerce": [
    "shop",
    "store",
    "product",
    "cart",
    "checkout",
    "ecommerce",
    "price",
    "buy now",
    "mua hàng",
    "sản phẩm"
  ],

  "Business/Company": [
    "company",
    "business",
    "services",
    "solutions",
    "contact us",
    "about us",
    "corporate",
    "agency"
  ],

  "Education": [
    "school",
    "university",
    "college",
    "course",
    "student",
    "education",
    "academy",
    "training"
  ],

  "Tech/Software": [
    "software",
    "developer",
    "hosting",
    "cloud",
    "app",
    "technology",
    "github",
    "api",
    "saas"
  ],

  "Forum/Community": [
    "forum",
    "community",
    "member",
    "thread",
    "discussion",
    "register",
    "login"
  ],

  "Adult": [
    "porn",
    "xxx",
    "adult",
    "escort",
    "camgirl"
  ]
};


/* ==============================
   HELPERS
============================== */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function fetchRetry(url, {
  timeout = 8000,
  attempts = 2,
  type = "text"
} = {}) {

  let lastError = null;

  for (let i = 0; i < attempts; i++) {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      timeout
    );

    try {

      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          "accept": "application/json,text/html,text/plain,*/*"
        },
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal
      });

      clearTimeout(timer);

      if (
        res.status === 429 ||
        res.status === 500 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504
      ) {

        lastError =
          new Error(`Wayback ${res.status}`);

        await sleep(
          500 +
          (i * 700) +
          Math.random() * 300
        );

        continue;
      }

      if (!res.ok) {

        throw new Error(
          `Wayback HTTP ${res.status}`
        );

      }

      if (type === "json") {

        return await res.json();

      }

      return await res.text();

    } catch (e) {

      clearTimeout(timer);

      lastError = e;

      if (i < attempts - 1) {

        await sleep(
          500 +
          Math.random() * 500
        );

      }

    }

  }

  throw lastError ||
    new Error("Không kết nối được Wayback");
}


function validDomain(domain) {

  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
    .test(domain);

}


function normalizeDomain(input) {

  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .split(":")[0];

}


/* ==============================
   CDX
============================== */

function cdxURL(domain, sort, limit = 1) {

  const params = new URLSearchParams();

  params.set(
    "url",
    `${domain}/*`
  );

  params.set(
    "output",
    "json"
  );

  params.set(
    "matchType",
    "host"
  );

  params.set(
    "fl",
    "timestamp"
  );

  params.set(
    "sort",
    sort
  );

  params.set(
    "limit",
    String(limit)
  );

  return (
    "https://web.archive.org/cdx/search/cdx?" +
    params.toString() +
    "&filter=statuscode:200" +
    "&filter=mimetype:text/html"
  );

}


async function getFirstLast(domain) {

  const [first, last] =
    await Promise.all([

      fetchRetry(
        cdxURL(
          domain,
          "ascending",
          1
        ),
        {
          type: "json",
          timeout: 7000,
          attempts: 2
        }
      ),

      fetchRetry(
        cdxURL(
          domain,
          "descending",
          1
        ),
        {
          type: "json",
          timeout: 7000,
          attempts: 2
        }
      )

    ]);


  const firstTs =
    first?.[1]?.[0] || null;

  const lastTs =
    last?.[1]?.[0] || null;


  return {
    firstTs,
    lastTs
  };

}


/* ==============================
   SNAPSHOT COUNT
============================== */

async function getSnapshotCount(domain) {

  try {

    const params =
      new URLSearchParams();

    params.set(
      "url",
      `${domain}/*`
    );

    params.set(
      "output",
      "json"
    );

    params.set(
      "matchType",
      "host"
    );

    params.set(
      "fl",
      "timestamp"
    );

    params.set(
      "limit",
      "2000"
    );


    const url =
      "https://web.archive.org/cdx/search/cdx?" +
      params.toString() +
      "&filter=statuscode:200" +
      "&filter=mimetype:text/html" +
      "&collapse=digest";


    const data =
      await fetchRetry(
        url,
        {
          type: "json",
          timeout: 7000,
          attempts: 1
        }
      );


    if (Array.isArray(data)) {

      return Math.max(
        0,
        data.length - 1
      );

    }

  } catch {}


  return 0;
}


/* ==============================
   HTML
============================== */

function titleOf(html) {

  const match =
    String(html || "")
      .match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );


  return String(
    match?.[1] || ""
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

}


function descriptionOf(html) {

  const source =
    String(html || "");


  let match =
    source.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    );


  if (!match) {

    match =
      source.match(
        /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
      );

  }


  return String(
    match?.[1] || ""
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

}


function textOf(html) {

  return String(html || "")
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<noscript[\s\S]*?<\/noscript>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /&nbsp;|&#160;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(0, 25000);

}


/* ==============================
   CLASSIFY
============================== */

function classify(text) {

  const source =
    String(text || "")
      .toLowerCase();


  const scores =
    Object.entries(TOPICS)
      .map(([topic, words]) => {

        let score = 0;

        const hits = [];


        for (const word of words) {

          if (
            source.includes(
              word.toLowerCase()
            )
          ) {

            score++;
            hits.push(word);

          }

        }


        return {
          topic,
          score,
          hits
        };

      })
      .filter(
        x => x.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );


  if (!scores.length) {

    return {
      topic: "Khác/Không rõ",
      keywords: []
    };

  }


  return {
    topic:
      scores
        .slice(0, 2)
        .map(x => x.topic)
        .join(" + "),

    keywords:
      scores[0]
        .hits
        .slice(0, 6)
  };

}


/* ==============================
   FETCH SNAPSHOT
============================== */

async function getSnapshot(
  domain,
  timestamp
) {

  if (!timestamp) {
    return null;
  }


  const urls = [

    `https://web.archive.org/web/${timestamp}id_/http://${domain}/`,

    `https://web.archive.org/web/${timestamp}id_/https://${domain}/`

  ];


  for (const url of urls) {

    try {

      const html =
        await fetchRetry(
          url,
          {
            timeout: 8000,
            attempts: 1
          }
        );


      if (
        html &&
        html.length > 100
      ) {

        return html;

      }

    } catch {}

  }


  return null;
}


/* ==============================
   PHASE 1
============================== */

async function phaseAge(domain) {

  const {
    firstTs,
    lastTs
  } =
    await getFirstLast(domain);


  if (
    !firstTs ||
    !lastTs
  ) {

    return {
      domain,

      hasHistory: false,

      years: "—",

      firstYear: "—",

      lastYear: "—",

      firstTs: null,

      lastTs: null,

      topic: "Không có lịch sử",

      description:
        "Không tìm thấy snapshot HTML 200 trên Wayback."
    };

  }


  const firstYear =
    firstTs.slice(0, 4);

  const lastYear =
    lastTs.slice(0, 4);


  return {

    domain,

    hasHistory: true,

    years:
      `${Math.max(
        0,
        Number(lastYear) -
        Number(firstYear)
      )} năm`,

    firstYear,

    lastYear,

    firstTs,

    lastTs,

    topic:
      "Chờ phân tích",

    description:
      `Có lịch sử từ ${firstYear} đến ${lastYear}.`

  };

}


/* ==============================
   PHASE 2
============================== */

async function phaseTopic(
  domain,
  firstTs,
  lastTs
) {

  /*
    Ưu tiên snapshot đầu tiên.
    Nếu đầu không đọc được thì thử cuối.
  */

  let html =
    await getSnapshot(
      domain,
      firstTs
    );


  let usedTs =
    firstTs;


  if (!html) {

    html =
      await getSnapshot(
        domain,
        lastTs
      );

    usedTs =
      lastTs;

  }


  const totalSnapshots =
    await getSnapshotCount(domain);


  if (!html) {

    return {

      domain,

      totalSnapshots,

      topic:
        "Không đọc được nội dung",

      description:
        "Có lịch sử Wayback nhưng không tải được nội dung snapshot."

    };

  }


  const title =
    titleOf(html);

  const meta =
    descriptionOf(html);

  const text =
    textOf(html);


  const classified =
    classify(
      `${title} ${meta} ${text}`
    );


  const year =
    String(usedTs || "")
      .slice(0, 4);


  let description = "";


  if (title) {

    description +=
      `${year}: ${title}`;

  }


  if (meta) {

    description +=
      `${description ? " | " : ""}${meta}`;

  }


  if (
    classified.keywords.length
  ) {

    description +=
      `${description ? " | " : ""}` +
      `Từ khóa: ` +
      classified.keywords.join(", ");

  }


  if (!description) {

    description =
      `Đã đọc snapshot năm ${year}.`;

  }


  return {

    domain,

    totalSnapshots,

    topic:
      classified.topic,

    description

  };

}


/* ==============================
   HANDLER
============================== */

module.exports =
async function handler(req, res) {

  const domain =
    normalizeDomain(
      req.query.domain
    );


  const mode =
    String(
      req.query.mode || "age"
    ).toLowerCase();


  if (
    !validDomain(domain)
  ) {

    return res
      .status(400)
      .json({
        error:
          "Domain không hợp lệ"
      });

  }


  try {

    if (
      mode === "age"
    ) {

      const result =
        await phaseAge(domain);


      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );


      return res.json(
        result
      );

    }


    if (
      mode === "topic"
    ) {

      const firstTs =
        String(
          req.query.firstTs || ""
        );


      const lastTs =
        String(
          req.query.lastTs || ""
        );


      const result =
        await phaseTopic(
          domain,
          firstTs,
          lastTs
        );


      res.setHeader(
        "Cache-Control",
        "s-maxage=86400, stale-while-revalidate=604800"
      );


      return res.json(
        result
      );

    }


    return res
      .status(400)
      .json({
        error:
          "Mode không hợp lệ"
      });


  } catch (e) {

    return res
      .status(503)
      .json({

        domain,

        error:
          e?.name ===
          "AbortError"
            ? "Wayback quá thời gian phản hồi"
            : (
              e?.message ||
              "Không thể truy vấn Wayback"
            )

      });

  }

};

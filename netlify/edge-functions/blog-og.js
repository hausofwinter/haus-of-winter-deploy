// Haus of Wintër — per-post social preview tags for /blog/<slug>
// -----------------------------------------------------------------------------
// The blog is rendered in the browser, so social scrapers (Facebook, WhatsApp,
// X, LinkedIn, iMessage) that DON'T run JavaScript only ever saw the generic
// blog page image. This Netlify Edge Function runs on the server for /blog and
// /blog/<slug>: it loads the same content JSON the site uses, finds the shared
// post, and rewrites the <title> + Open Graph / Twitter tags so the preview
// shows THAT post's own picture, title and text. Everything else is untouched,
// and the normal in-browser blog still renders exactly as before.
//
// Cloud name + content tag mirror assets/js/config.js — keep them in sync.
const CLOUD = "chuzvjmb";
const TAG = "hw_content";
const SITE_NAME = "Haus of Wintër";

export default async (request, context) => {
  const url = new URL(request.url);

  // Always start from the real static blog page.
  let res;
  try {
    res = await fetch(new URL("/blog.html", url.origin).toString(), {
      headers: { "x-og-passthrough": "1" },
    });
  } catch (_) {
    return context.next();
  }
  if (!res.ok) return context.next();
  let html = await res.text();

  // No slug -> this is the main /blog page. Make sure its canonical/og:url point
  // at the clean /blog on whatever domain was requested, then serve as-is.
  const m = url.pathname.match(/^\/blog\/([^\/]+)\/?$/);
  if (!m) {
    html = setMeta(html, "link-canonical", url.origin + "/blog");
    html = setMeta(html, "og:url", url.origin + "/blog");
    return htmlResponse(html);
  }

  const slug = decodeURIComponent(m[1]).toLowerCase();

  // Load posts and find the one whose slug matches (same logic as site.js).
  let posts = [];
  try { posts = await loadPosts(); } catch (_) { posts = []; }
  let post = null;
  for (let i = 0; i < posts.length; i++) {
    if (blogSlug(posts[i].title, i) === slug) { post = posts[i]; break; }
  }
  // Unknown slug (renamed/removed post) -> serve the normal blog page.
  if (!post) return htmlResponse(html);

  const title = (post.title ? post.title + " — " : "") + SITE_NAME;
  const desc = excerpt(post.body) || "Updates, stories and news from " + SITE_NAME + ".";
  const image = ogImage(post.image, url.origin);
  const canonical = url.origin + "/blog/" + slug;

  html = setTitle(html, title);
  html = setMeta(html, "description", desc);
  html = setMeta(html, "link-canonical", canonical);
  html = setMeta(html, "og:type", "article");
  html = setMeta(html, "og:title", title);
  html = setMeta(html, "og:description", desc);
  html = setMeta(html, "og:url", canonical);
  html = setMeta(html, "og:image", image);
  html = setMeta(html, "twitter:title", title);
  html = setMeta(html, "twitter:description", desc);
  html = setMeta(html, "twitter:image", image);

  return htmlResponse(html);
};

export const config = { path: ["/blog", "/blog/*"] };

/* ---------------- helpers ---------------- */

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}

async function loadPosts() {
  const listUrl = "https://res.cloudinary.com/" + CLOUD + "/raw/list/" + TAG + ".json";
  const lr = await fetch(listUrl, { cache: "no-store" });
  if (!lr.ok) return [];
  const list = await lr.json();
  const resources = (list && list.resources) || [];
  if (!resources.length) return [];
  resources.sort((a, b) => {
    const vd = (Number(b.version) || 0) - (Number(a.version) || 0);
    if (vd) return vd;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  const newest = resources[0];
  const jsonUrl = "https://res.cloudinary.com/" + CLOUD + "/raw/upload/v" + newest.version + "/" + newest.public_id;
  const jr = await fetch(jsonUrl, { cache: "no-store" });
  if (!jr.ok) return [];
  const data = await jr.json();
  return (data && data.blog && data.blog.posts) || [];
}

// Must match blogSlug() in assets/js/site.js exactly.
function blogSlug(title, i) {
  const base = String(title == null ? "" : title).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || ("post-" + i);
}

function ogImage(image, origin) {
  if (!image) return origin + "/assets/img/og-default.jpg";
  if (/^https?:\/\//.test(image)) return image;
  if (image.charAt(0) === "/") return origin + image;
  return "https://res.cloudinary.com/" + CLOUD +
    "/image/upload/f_jpg,q_auto,w_1200,h_630,c_fill,g_auto/" + image;
}

// Strip the site's [[...]] rich-text tokens + any HTML, collapse to ~200 chars.
function excerpt(body) {
  let t = String(body || "");
  t = t.replace(/\[\[\/?[a-z](?::[^\]]*)?\]\]/gi, "");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 200) t = t.slice(0, 197).replace(/\s+\S*$/, "") + "…";
  return t;
}

function escAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setTitle(html, value) {
  const re = /<title>[\s\S]*?<\/title>/i;
  const tag = "<title>" + escAttr(value) + "</title>";
  return re.test(html) ? html.replace(re, tag) : html.replace(/<\/head>/i, tag + "\n</head>");
}

// key: "og:xxx" / "twitter:xxx" / "description" / "link-canonical"
function setMeta(html, key, value) {
  if (key === "link-canonical") {
    const re = /(<link\s+rel="canonical"\s+href=")[^"]*(")/i;
    if (re.test(html)) return html.replace(re, "$1" + escAttr(value) + "$2");
    return html.replace(/<\/head>/i, '<link rel="canonical" href="' + escAttr(value) + '">\n</head>');
  }
  const attr = key.indexOf("og:") === 0 ? "property" : "name";
  const re = new RegExp('(<meta\\s+' + attr + '="' + key.replace(/:/g, "\\:") + '"\\s+content=")[^"]*(")', "i");
  if (re.test(html)) return html.replace(re, "$1" + escAttr(value) + "$2");
  return html.replace(/<\/head>/i, '<meta ' + attr + '="' + key + '" content="' + escAttr(value) + '">\n</head>');
}

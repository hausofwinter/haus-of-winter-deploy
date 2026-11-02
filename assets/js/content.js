/* ============================================================================
   content.js — Cloudinary content layer (runtime, unsigned, client-only)
   ----------------------------------------------------------------------------
   How it works:
   - All editable site content lives in ONE JSON object.
   - /manage saves that JSON to Cloudinary as a RAW file via an UNSIGNED upload
     preset, tagged HW_CONFIG.contentTag. Every save creates a new version file.
   - On page load we read the tag's resource list:
       https://res.cloudinary.com/<cloud>/raw/list/<tag>.json
     pick the NEWEST entry, fetch it, and merge over DEFAULT_CONTENT.
   - Because the list JSON is CDN-cached, edits appear "within about a minute".
     Requires: Cloudinary Settings → Security → "Resource list" = allowed.
   - Gallery images load from Cloudinary by tag (galleryTagPrefix + slug) via the
     image list endpoint. Order / cropping position / hidden state come from the
     content JSON (unsigned uploads can't delete, so "delete/hide" = a flag).
   ========================================================================== */

(function (global) {
  "use strict";

  var CFG = global.HW_CONFIG || {};
  var CLOUD = CFG.cloudinaryCloudName;
  var BASE = "https://res.cloudinary.com/" + CLOUD;

  /* ---- Default content: the shape of everything editable ----------------- */
  /* Real copy/prices/embeds arrive from Drive later. These are safe fallbacks
     shown until the first /manage save exists, and the schema the panel edits. */
  var DEFAULT_CONTENT = {
    _version: 1,
    // Per-page visibility. Missing / false = shown. Set hidden:true in /manage → Pages
    // to drop a page from the nav + footer and send direct visitors home.
    pages: {},
    // Site appearance (editable in /manage → Appearance). Colours are per-area so
    // one change affects only that area. Missing area colours fall back so old saves
    // still work (cards/header/footer default to the section colour; header matches
    // footer). site.js derives borders, dim/section-text and gradients.
    theme: {
      bg: "#0c0c10", sectionBg: "#15151b", cardBg: "#15151b",
      headerBg: "#101015", footerBg: "#101015", ink: "#f4f5f7",
      brand: "#ffafcc", brand2: "#a2d2ff",
      headingMode: "gradient", headingColor: "#ffafcc",
      fontHead: "Playfair Display", fontBody: "Inter"
    },
    home: {
      logoScale: 1,
      headlineScale: 1,
      subheadScale: 1,
      heroVAlign: "center",
      heroHAlign: "center",
      heroMode: "image",
      heroImage: "/assets/img/hero.jpg",   // bundled starter hero; swap via /manage once Cloudinary is set up
      heroVideo: "",
      headline: "Move with the Haus",
      subhead: "A community-based street dance school in Nottingham — Hip Hop, House, Heels & more.",
      primaryCtaLabel: "Book a class",
      secondaryCtaLabel: "Shop gear",
      intro: "Haus of Wintër is a vibrant, community-based dance school built on inclusivity and creativity — a safe, welcoming space for dancers of all abilities. From foundational technique to advanced choreography, we help you find your voice through movement.\n\nWe looking forward to twirling with you.",
      heroOpacity: 0.7,
      // The three feature cards on the home page (editable in /manage → Home)
      cards: [
        { title: "Classes", text: "See the schedule and book online.", url: "/classes.html" },
        { title: "Gallery", text: "Performances, classes and events.", url: "/gallery.html" },
        { title: "Shop", text: "Dancewear and gear.", url: "/shop.html" }
      ]
    },
    about: {
      heading: "About the Haus",
      photos: [
        { image: "/assets/img/about-headshot.jpg", caption: "Chimellé Winter · Founder" },
        { image: "/assets/img/about-teaching.jpg", caption: "In the studio" },
        { image: "/assets/img/about-3.jpg", caption: "On stage" }
      ],
      body: "Haus of Wintër is a vibrant community-based dance school dedicated to inclusivity and creativity, offering a safe and welcoming space for individuals of all abilities. We teach a diverse range of styles, from Hip Hop and House to Heels and Trainers choreography and much more. The Haus fosters self-expression, confidence, and connection — to the music, the community, and the dance scene. This space promotes personal growth, unity, and a sense of freedom through movement.\n\nHow the Haus started: the name 'Haus of Wintër' was born during a casual conversation among the longest-standing members of the Haus. 'Haus' is the German spelling for home — a word used heavily in the ballroom community to mean 'collective' or 'home'. 'Wintër' is the founder's surname, and her alter ego when dancing. Putting the two together just made sense.\n\nWho is the founder? Chimellé Winter — a highly experienced and passionate dancer with deep roots in street dance. She has honed her craft through years of battling, competing, and performing, earning respect within the dance community. A skilled teacher and judge, she has shared her knowledge worldwide, inspiring dancers of all levels. Her vision is to keep inspiring others in spaces where creativity thrives and everyone feels empowered to express themselves through movement.\n\nWhat we offer: dynamic classes across street dance styles, from foundational technique to advanced choreography, plus performance opportunities guided by skilled creative professionals. From concept to stage, every performance is designed to inspire creativity, build confidence, and showcase the unique talents of each dancer."
    },
    lessons: {
      heading: "Private 1-to-1 lessons",
      intro: "Personalised dance lessons built entirely around you — your goals, your pace, your style. Whether you're preparing for a performance or competition, building confidence, or refining technique, a 1-to-1 gives you focused, undivided guidance.",
      body: "Every session starts with where you are now. We'll agree what you want to work on — foundations, choreography, heels technique, freestyle, musicality, stage presence — and build a plan around it. You get the whole room and the whole hour: detailed feedback, room to repeat things until they feel right, and a pace that suits you.\n\nWho it's for: complete beginners who'd rather start one-to-one, dancers prepping for an audition, competition or showcase, and anyone who wants to level up a specific skill faster than a group class allows.\n\nHow it works: sessions run at the Expressive Arts Academy in Bobbers Mill, Nottingham, or we can talk about a location that works for you. Book a single session or a block — reach out and we'll find a time.",
      photo: "/assets/img/about-teaching.jpg",
      ctaLabel: "Enquire about 1-to-1s",
      ctaUrl: "/contact.html"
    },
    classes: {
      heading: "Classes & booking",
      intro: "Weekly classes run at the Expressive Arts Academy in Bobbers Mill, Nottingham. Book your spot below. Want something tailored? We also offer personalised 1-to-1 private lessons built around your goals.",
      descriptions: "Tuesdays — Haus Heels 8–10pm\nHeels technique followed by choreography with a range of textures, dynamics and styles. Intermediate and advanced.\n\nThursdays — Haus Street Styles Training 8–10pm\nHip Hop, House, Dancehall, Afro & more.\n\nFridays — Haus Beginner Heels 7:30–10:30pm\nHeels technique followed by choreography, put together for beginners.\n\n1-to-1 Private Lessons\nPersonalised sessions with a tailored lesson plan — focused guidance to improve technique, build confidence and refine your skills at your own pace, whether you're preparing for a performance, a competition, or personal growth.",
      // Bookwhen public iCal feed URL — when set, the calendar shows REAL events
      // from Bookwhen (auto-updates; only shows scheduled lessons). Empty = use the
      // weekly pattern below as a fallback.
      feedUrl: "https://feeds.bookwhen.com/ical/rkstnqdfkexd/q8vxsy/public.ics",
      // Weekly recurring classes for the month calendar (fallback when no feedUrl)
      weekly: [
        { day: 2, name: "Haus Heels", time: "8–10pm" },
        { day: 4, name: "Street Styles", time: "8–10pm" },
        { day: 5, name: "Beginner Heels", time: "7:30–10:30pm", everyOther: true, anchor: "2026-09-04" }
      ],
      bookingEmbed: '<iframe src="https://bookwhen.com/hausofwinter/iframe" frameborder="0" scrolling="yes" seamless="seamless" title="Haus of Wintër class schedule" style="display:block;border:none;width:100%;min-height:1000px;border-radius:12px;background:#fff;"></iframe>'
    },
    shop: {
      heading: "Shop the Haus",
      intro: "Haus merch and dancing gear. Store coming soon — check back, or follow us on Instagram for drops.",
      storeEmbed: (CFG.defaultEmbeds && CFG.defaultEmbeds.ecwid) || ""
    },
    reviews: {
      heading: "What dancers say",
      items: []
    },
    contact: {
      heading: "Get in touch",
      intro: "Request a heels guide, ask a question, or find out more about classes and opportunities — reach out by email, the form here, or Instagram and we'll be happy to help. Whether you're joining a class, booking a 1-to-1, or just curious, we looking forward to twirling with you.",
      email: CFG.formSubmitEmail || "hausofwinter@hotmail.com",
      phone: "07341944068",
      whatsapp: "",
      address: "Expressive Arts Academy, Bobbers Mill, Nottingham, NG8 5AH",
      mapQuery: "52.966615,-1.180463",
      socials: {
        instagram: "https://www.instagram.com/hausofwinterr",
        tiktok: "https://www.tiktok.com/@hausofwinter",
        facebook: "",
        youtube: ""
      }
    },
    faq: {
      heading: "FAQ",
      items: [
        { q: "Do I need experience to join?", a: "No. The Haus welcomes all abilities. We have beginner classes (Friday Beginner Heels) and training sessions that cover everything from foundations to advanced choreography." },
        { q: "Where are classes held?", a: "Expressive Arts Academy, Bobbers Mill, Nottingham, NG8 5AH." },
        { q: "What should I bring to a heels class?", a: "Your heels (or trainers to start), water, and comfortable clothing you can move in. New to heels? Email us and we can send a heels guide." },
        { q: "How do I book a 1-to-1?", a: "Reach out via the contact form, email, or Instagram and we'll arrange a session built around your goals." },
        { q: "What's the cancellation policy?", a: "Let us know as early as you can if you can't make a class or 1-to-1. For free classes just drop out so we can offer the space; for paid sessions, 24 hours' notice means we'll happily move you to another date." }
      ]
    },
    blog: {
      heading: "Blog & news",
      intro: "Updates, stories and news from the Haus.",
      posts: [ /* { title, date, body, image } */ ]
    },
    gallery: {
      categories: {
        showcase: { label: "Showcase 2024", hidden: false, order: 0 },
        classes:  { label: "Classes",       hidden: false, order: 1 }
      },
      photos: {},
      // Featured videos on the gallery page: YouTube/Vimeo links, direct .mp4 URLs,
      // or Cloudinary video public IDs. Managed in /manage → Gallery → Featured videos.
      videos: [],
      // Local starter images shown until you upload to Cloudinary via /manage.
      // Once Cloudinary returns photos for a category tag, those take over.
      localPhotos: {
        showcase: [
          "/assets/img/gallery/show-01.jpg", "/assets/img/gallery/show-02.jpg",
          "/assets/img/gallery/show-03.jpg", "/assets/img/gallery/show-04.jpg",
          "/assets/img/gallery/show-05.jpg", "/assets/img/gallery/show-06.jpg",
          "/assets/img/gallery/show-07.jpg", "/assets/img/gallery/show-08.jpg"
        ],
        classes: []
      }
    },
    // Footer — all editable in /manage → Footer
    footer: {
      tagline: "Dance classes · galleries · gear.",
      copyright: "Haus of Wintër. All rights reserved.",
      // Newsletter signup shown in the footer. Submits to the Contact email via
      // FormSubmit (each signup emails you the address). Paste a Mailchimp/other
      // embed into `embed` to use that instead.
      newsletter: {
        enabled: true,
        heading: "Join the Haus mailing list",
        text: "Sign up for class drops, showcase news and updates.",
        buttonLabel: "Sign up",
        embed: "",
        // Also saves every signup to Samuel's Google Sheet via a Google Form.
        // googleFormAction = the form's .../formResponse URL; googleFormField = the
        // email question's field id. Also editable in /manage → Footer.
        googleFormAction: "https://docs.google.com/forms/d/e/1FAIpQLScUB-eGFm4g1KRJJs2m7TKKEeq6_8fzbyEo5UKbE_SpZZFlSw/formResponse",
        googleFormField: "entry.1789348634"
      },
      // The footer buttons (label + link). Rename, reorder, add or remove in /manage.
      links: [
        { label: "About", url: "/about.html" },
        { label: "Classes", url: "/classes.html" },
        { label: "1-to-1 Lessons", url: "/lessons.html" },
        { label: "Gallery", url: "/gallery.html" },
        { label: "Videos", url: "/videos.html" },
        { label: "Shop", url: "/shop.html" },
        { label: "Reviews", url: "/reviews.html" },
        { label: "Blog", url: "/blog.html" },
        { label: "FAQ", url: "/faq.html" },
        { label: "Contact", url: "/contact.html" }
      ]
    }
  };

  /* ---- Deep merge (loaded content over defaults) ------------------------- */
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function merge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    var out = {}, k;
    for (k in base) out[k] = base[k];
    for (k in over) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }

  /* ---- Load newest content JSON by tag ---------------------------------- */
  /* Local cache so a laggy/empty Cloudinary index never wipes what you saved.
     Reads never go backwards: whichever copy has the higher _version wins. */
  var CACHE_KEY = "hw_content_cache_v1";
  function readCache() {
    try { var s = localStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function writeCache(obj) {
    try { if (obj) localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function loadContent() {
    var listUrl = BASE + "/raw/list/" + CFG.contentTag + ".json?_=" + Date.now();
    return fetch(listUrl, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { resources: [] }; })
      .then(function (list) {
        var res = (list && list.resources) || [];
        if (!res.length) return null;
        res.sort(function (a, b) {
          var vd = (Number(b.version) || 0) - (Number(a.version) || 0);
          if (vd) return vd;
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        var newest = res[0];
        var url = BASE + "/raw/upload/v" + newest.version + "/" + newest.public_id + "?_=" + Date.now();
        return fetch(url, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; });
      })
      .then(function (json) {
        var cached = readCache();
        var remoteV = json && json._version ? Number(json._version) : -1;
        var cachedV = cached && cached._version ? Number(cached._version) : -1;
        var chosen = (json && remoteV >= cachedV) ? json : (cached || json);
        if (chosen && Number(chosen._version || 0) >= cachedV) writeCache(chosen);
        return merge(DEFAULT_CONTENT, chosen || {});
      })
      .catch(function (err) {
        console.warn("[HoW] content load failed, using cache/defaults:", err);
        return merge(DEFAULT_CONTENT, readCache() || {});
      });
  }

  /* ---- Cloudinary image URL helper -------------------------------------- */
  function imgUrl(publicIdOrUrl, transform) {
    if (!publicIdOrUrl) return "";
    // full URL or local bundled path -> use as-is
    if (/^https?:\/\//.test(publicIdOrUrl) || publicIdOrUrl.charAt(0) === "/") return publicIdOrUrl;
    var t = transform || "f_auto,q_auto";
    return BASE + "/image/upload/" + t + "/" + publicIdOrUrl;
  }
  function videoUrl(publicIdOrUrl) {
    if (!publicIdOrUrl) return "";
    if (/^https?:\/\//.test(publicIdOrUrl) || publicIdOrUrl.charAt(0) === "/") return publicIdOrUrl;
    return BASE + "/video/upload/q_auto/" + publicIdOrUrl + ".mp4";
  }

  /* ---- Load gallery images for a category slug -------------------------- */
  function loadGallery(slug) {
    var tag = CFG.galleryTagPrefix + slug;
    var url = BASE + "/image/list/" + tag + ".json?_=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { resources: [] }; })
      .then(function (list) { return (list && list.resources) || []; })
      .catch(function () { return []; });
  }

  /* ---- Theme presets + curated web fonts -------------------------------- */
  var PRESETS = {
    dark: {
      bg: "#0c0c10", sectionBg: "#15151b", cardBg: "#15151b",
      headerBg: "#101015", footerBg: "#101015", ink: "#f4f5f7",
      brand: "#ffafcc", brand2: "#a2d2ff",
      headingMode: "gradient", headingColor: "#ffafcc",
      fontHead: "Playfair Display", fontBody: "Inter"
    },
    light: {
      bg: "#ffffff", sectionBg: "#f4edf8", cardBg: "#fbf7fd",
      headerBg: "#efe6f6", footerBg: "#efe6f6", ink: "#211c29",
      brand: "#d6408f", brand2: "#2f6db3",
      headingMode: "gradient", headingColor: "#d6408f",
      fontHead: "Playfair Display", fontBody: "Inter"
    }
  };
  // name -> { g: Google Fonts family param, stack: CSS font-family }
  var FONTS = {
    "Playfair Display": { g: "Playfair+Display:wght@500;600;700;800;900", stack: '"Playfair Display", Georgia, serif' },
    "Cormorant Garamond": { g: "Cormorant+Garamond:wght@500;600;700", stack: '"Cormorant Garamond", Georgia, serif' },
    "Lora": { g: "Lora:wght@400;500;600;700", stack: '"Lora", Georgia, serif' },
    "Merriweather": { g: "Merriweather:wght@400;700", stack: '"Merriweather", Georgia, serif' },
    "Poppins": { g: "Poppins:wght@400;500;600;700", stack: '"Poppins", system-ui, sans-serif' },
    "Montserrat": { g: "Montserrat:wght@400;500;600;700", stack: '"Montserrat", system-ui, sans-serif' },
    "Raleway": { g: "Raleway:wght@400;500;600;700", stack: '"Raleway", system-ui, sans-serif' },
    "Oswald": { g: "Oswald:wght@400;500;600;700", stack: '"Oswald", system-ui, sans-serif' },
    "Bebas Neue": { g: "Bebas+Neue", stack: '"Bebas Neue", Impact, sans-serif' },
    "Inter": { g: "Inter:wght@400;500;600;700", stack: '"Inter", system-ui, sans-serif' },
    "Work Sans": { g: "Work+Sans:wght@400;500;600;700", stack: '"Work Sans", system-ui, sans-serif' },
    "Lato": { g: "Lato:wght@400;700", stack: '"Lato", system-ui, sans-serif' },
    "Nunito": { g: "Nunito:wght@400;600;700", stack: '"Nunito", system-ui, sans-serif' },
    "Roboto": { g: "Roboto:wght@400;500;700", stack: '"Roboto", system-ui, sans-serif' },
    "Source Sans 3": { g: "Source+Sans+3:wght@400;600;700", stack: '"Source Sans 3", system-ui, sans-serif' },
    "Dancing Script": { g: "Dancing+Script:wght@500;600;700", stack: '"Dancing Script", cursive' }
  };

  /* ---- Rich text: safe inline styling of selected words ------------------ */
  /* Authors mark up text in /manage with tokens (inserted by the toolbar):
       [[b]]bold[[/b]]  [[i]]italic[[/i]]  [[c:#e0559b]]colour[[/c]]
       [[s:1.4]]bigger[[/s]]  [[f:Poppins]]font[[/f]]
     We ESCAPE the text first (so no raw HTML can be injected), then convert the
     tokens into a small, whitelisted set of styled spans. Colour/size/font values
     are validated, so nothing arbitrary reaches the style attribute. */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function validColor(c) { return /^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-zA-Z]{3,20}$/.test(c); }
  function richInline(s) {
    for (var pass = 0; pass < 5; pass++) {
      var before = s;
      s = s.replace(/\[\[b\]\]([\s\S]*?)\[\[\/b\]\]/g, "<strong>$1</strong>");
      s = s.replace(/\[\[i\]\]([\s\S]*?)\[\[\/i\]\]/g, "<em>$1</em>");
      s = s.replace(/\[\[u\]\]([\s\S]*?)\[\[\/u\]\]/g, "<u>$1</u>");
      s = s.replace(/\[\[c:([^\]|]{1,24})\]\]([\s\S]*?)\[\[\/c\]\]/g, function (m, col, txt) {
        col = col.trim(); return validColor(col) ? "<span style=\"color:" + col + "\">" + txt + "</span>" : txt;
      });
      s = s.replace(/\[\[s:([0-9.]{1,5})\]\]([\s\S]*?)\[\[\/s\]\]/g, function (m, sz, txt) {
        var n = parseFloat(sz); if (!(n >= 0.5 && n <= 4)) return txt;
        return "<span style=\"font-size:" + n + "em\">" + txt + "</span>";
      });
      s = s.replace(/\[\[f:([^\]|]{1,40})\]\]([\s\S]*?)\[\[\/f\]\]/g, function (m, fn, txt) {
        fn = fn.trim(); var f = FONTS[fn];
        return f ? "<span style=\"font-family:" + f.stack.replace(/"/g, "&quot;") + "\">" + txt + "</span>" : txt;
      });
      if (s === before) break;
    }
    return s;
  }
  // Paragraph-ise (blank line => new paragraph) with inline styling. Token-free
  // text renders exactly as plain escaped paragraphs, so old content is unchanged.
  function rich(text) {
    return String(text || "").split(/\n{2,}/).map(function (p) {
      return "<p>" + richInline(esc(p).replace(/\n/g, "<br>")) + "</p>";
    }).join("");
  }
  // font names referenced by [[f:...]] tokens anywhere in the content (so site.js
  // can load them).
  function fontsUsedIn(obj) {
    var out = {};
    try {
      (JSON.stringify(obj).match(/\[\[f:([^\]|]{1,40})\]\]/g) || []).forEach(function (m) {
        var n = m.replace(/\[\[f:|\]\]/g, "").trim(); if (FONTS[n]) out[n] = 1;
      });
    } catch (e) {}
    return Object.keys(out);
  }

  global.HoWContent = {
    DEFAULT_CONTENT: DEFAULT_CONTENT,
    load: loadContent,
    loadGallery: loadGallery,
    imgUrl: imgUrl,
    videoUrl: videoUrl,
    merge: merge,
    saveCache: writeCache,
    PRESETS: PRESETS,
    FONTS: FONTS,
    rich: rich,
    esc: esc,
    fontsUsedIn: fontsUsedIn
  };
})(window);

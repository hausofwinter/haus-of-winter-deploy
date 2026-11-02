/* ============================================================================
   site.js — renders editable content into the public pages + shared UI
   Each page carries data-* hooks; this fills them from the loaded content JSON.
   ========================================================================== */
(function (global) {
  "use strict";
  var C = global.HoWContent;
  var CFG = global.HW_CONFIG || {};

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(sel, val) { var el = $(sel); if (el && val != null) el.textContent = val; }
  function setHTML(sel, val) { var el = $(sel); if (el && val != null) el.innerHTML = val; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  }); }
  // Paragraph-ise text (double newline => paragraph), with safe inline styling
  // (colour/bold/italic/size/font) from /manage. Delegates to content.js.
  function paras(text) {
    if (C && C.rich) return C.rich(text);
    return String(text || "").split(/\n{2,}/).map(function (p) {
      return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* ---- Theme: apply colours + fonts from content.theme ------------------- */
  function _hex(h) {
    if (typeof h !== "string") return null;
    h = h.trim(); var m = h.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/); if (!m) return null;
    var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }
  function _toHex(c) { function p(n) { n = Math.max(0, Math.min(255, Math.round(n))).toString(16); return n.length === 1 ? "0" + n : n; } return "#" + p(c.r) + p(c.g) + p(c.b); }
  function _mix(a, b, t) { // t = weight of a
    var ca = _hex(a), cb = _hex(b); if (!ca || !cb) return a;
    return _toHex({ r: ca.r * t + cb.r * (1 - t), g: ca.g * t + cb.g * (1 - t), b: ca.b * t + cb.b * (1 - t) });
  }
  function _lum(h) { var c = _hex(h); if (!c) return 1; return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255; }
  function _rgba(h, a) { var c = _hex(h); if (!c) return h; return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }

  var _fontsLoaded = {};
  function loadFonts(names) {
    var FONTS = C.FONTS || {};
    var fams = (names || []).filter(function (n) { return FONTS[n] && !_fontsLoaded[n]; });
    if (!fams.length) return;
    fams.forEach(function (n) { _fontsLoaded[n] = 1; });
    var href = "https://fonts.googleapis.com/css2?" + fams.map(function (n) { return "family=" + FONTS[n].g; }).join("&") + "&display=swap";
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
  function _inkFor(bg) { return _lum(bg) < 0.5 ? "#f5f6f8" : "#1a1622"; }   // readable text on a bg
  function applyTheme(content) {
    var t = (content && content.theme) || {};
    var FONTS = C.FONTS || {};
    var root = document.documentElement;
    function setv(k, v) { if (v != null && v !== "") root.style.setProperty(k, v); }
    var bg = t.bg || "#0c0c10";
    var sectionBg = t.sectionBg || "#15151b";
    var cardBg = t.cardBg || sectionBg;         // cards/boxes/inputs
    var footerBg = t.footerBg || sectionBg;
    var headerBg = t.headerBg || footerBg;      // top bar matches the footer unless set
    var ink = t.ink || "#f4f5f7";
    var brand = t.brand || "#ffafcc", brand2 = t.brand2 || "#a2d2ff";
    setv("--bg", bg);
    setv("--bg-elev", cardBg);
    setv("--section-bg", sectionBg);
    setv("--header-bg", headerBg);
    setv("--footer-bg", footerBg);
    setv("--ink", ink);
    setv("--ink-dim", _mix(ink, bg, 0.62));
    setv("--line", _mix(ink, bg, 0.16));
    setv("--brand", brand); setv("--brand-2", brand2);
    setv("--brand-ink", _lum(brand) > 0.55 ? "#241722" : "#ffffff");
    setv("--grad", "linear-gradient(90deg," + brand + "," + _mix(brand, brand2, 0.5) + " 45%," + brand2 + ")");
    // Per-area text colours, so header/footer stay readable at any colour.
    var hInk = _inkFor(headerBg), fInk = _inkFor(footerBg);
    setv("--header-ink", hInk); setv("--header-dim", _mix(hInk, headerBg, 0.6));
    setv("--footer-ink", fInk); setv("--footer-dim", _mix(fInk, footerBg, 0.6));
    if (t.headingMode === "solid") { root.setAttribute("data-headings", "solid"); setv("--heading-color", t.headingColor || ink); }
    else root.removeAttribute("data-headings");
    if (FONTS[t.fontHead]) setv("--font-head", FONTS[t.fontHead].stack);
    if (FONTS[t.fontBody]) setv("--font-body", FONTS[t.fontBody].stack);
    var need = {}; if (t.fontHead) need[t.fontHead] = 1; if (t.fontBody) need[t.fontBody] = 1;
    (C.fontsUsedIn ? C.fontsUsedIn(content) : []).forEach(function (n) { need[n] = 1; });
    loadFonts(Object.keys(need));
  }

  /* ---- Scroll reveal: fade + rise as things enter view ------------------ */
  var _revObs = null;
  function initRevealObserver() {
    if (_revObs || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("reveal-on");   // enables the hidden state in CSS
    _revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); _revObs.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  }
  function scanReveals(root) {
    if (!("IntersectionObserver" in window)) return;
    initRevealObserver();
    $all(".reveal", root || document).forEach(function (el) {
      if (el._rev) return; el._rev = true;
      try {
        var sibs = $all(".reveal", el.parentNode); var idx = sibs.indexOf(el);
        if (idx > 0) el.style.transitionDelay = Math.min(idx, 7) * 70 + "ms";
      } catch (e) {}
      _revObs.observe(el);
    });
  }
  function tagReveals() {
    $all("main .section, .hero-content").forEach(function (el) { el.classList.add("reveal"); });
  }

  /* ---- Footer newsletter signup ----------------------------------------- */
  function renderNewsletter(content) {
    var f = content.footer || {};
    var nl = f.newsletter || {};
    var inner = $(".footer-inner");
    if (!inner || !nl.enabled || $("[data-footer-news]")) return;
    var box = document.createElement("div");
    box.className = "footer-news"; box.setAttribute("data-footer-news", "");
    var copyEl = $(".footer-copy");
    if (nl.embed && nl.embed.trim()) {
      box.innerHTML = (nl.heading ? "<h3 class='footer-news-h'>" + esc(nl.heading) + "</h3>" : "") + nl.embed;
      inner.insertBefore(box, copyEl || null);
      runEmbedScripts(box);
      return;
    }
    var email = (content.contact && content.contact.email) || CFG.formSubmitEmail || "";
    box.innerHTML =
      "<h3 class='footer-news-h'>" + esc(nl.heading || "Newsletter") + "</h3>" +
      (nl.text ? "<p class='footer-news-t'>" + esc(nl.text) + "</p>" : "") +
      "<form class='news-form' data-news-form novalidate>" +
        "<input type='email' name='email' required placeholder='Your email address' aria-label='Your email address'>" +
        "<button class='btn btn-primary' type='submit'>" + esc(nl.buttonLabel || "Sign up") + "</button>" +
      "</form><p class='news-msg' data-news-msg hidden></p>";
    inner.insertBefore(box, copyEl || null);
    wireNewsletter(box, email, nl);
  }
  // Also record a signup to a Google Sheet via a Google Form (silent, fire-and-forget).
  function saveToGoogleForm(nl, val) {
    var action = nl && nl.googleFormAction, field = nl && nl.googleFormField;
    if (!action || !field) return;
    try {
      var gfd = new FormData();
      gfd.append(field, val);
      // Google Forms doesn't send CORS headers; no-cors still records the response.
      fetch(action, { method: "POST", mode: "no-cors", body: gfd }).catch(function () {});
    } catch (e) {}
  }
  function wireNewsletter(box, email, nl) {
    var form = box.querySelector("[data-news-form]");
    var msg = box.querySelector("[data-news-msg]");
    if (!form) return;
    function show(text, ok) { if (!msg) return; msg.hidden = false; msg.textContent = text; msg.className = "news-msg" + (ok ? " ok" : " err"); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector("input[name=email]");
      var val = (input.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { show("Please enter a valid email address.", false); return; }
      // Save to the Google Sheet first (works even if the email alert isn't set up).
      saveToGoogleForm(nl, val);
      trackEvent("newsletter_signup", {});
      var hasForm = !!email, hasSheet = !!(nl && nl.googleFormAction && nl.googleFormField);
      if (!hasForm && !hasSheet) { show("Newsletter isn’t set up yet.", false); return; }
      var btn = form.querySelector("button"); btn.disabled = true;
      if (!hasForm) {   // sheet only, no email alert configured
        form.style.display = "none"; show("Thanks — you’re on the list!", true); return;
      }
      var fd = new FormData();
      fd.append("email", val);
      fd.append("_subject", "New newsletter signup — Haus of Wintër");
      fd.append("_template", "table");
      fetch("https://formsubmit.co/ajax/" + encodeURIComponent(email), {
        method: "POST", headers: { "Accept": "application/json" }, body: fd
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && (res.success === true || res.success === "true")) {
          form.style.display = "none"; show("Thanks — you’re on the list!", true);
        } else { show("Sorry, that didn’t go through — please try again.", false); btn.disabled = false; }
      }).catch(function () { show("Sorry, that didn’t go through — please try again.", false); btn.disabled = false; });
    });
  }

  /* ---- Shared UI: mobile nav, back-to-top, footer year ------------------ */
  function initChrome() {
    var toggle = $("[data-nav-toggle]"), nav = $("[data-nav]");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      // Close the mobile menu when a link inside it is tapped.
      nav.addEventListener("click", function (e) {
        if (e.target.closest("a") && nav.classList.contains("is-open")) {
          nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    initPageTransitions();

    var toTop = $("[data-to-top]");
    if (toTop) {
      global.addEventListener("scroll", function () {
        toTop.classList.toggle("is-visible", global.scrollY > 600);
      }, { passive: true });
      toTop.addEventListener("click", function () {
        global.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
    var y = $("[data-year]"); if (y) y.textContent = new Date().getFullYear();
  }

  /* ---- Page transitions: quick fade-out before same-site navigations ----- */
  function initPageTransitions() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest("a"); if (!a) return;
      var href = a.getAttribute("href");
      if (!href || a.target === "_blank" || a.hasAttribute("download")) return;
      if (/^(#|mailto:|tel:|sms:|javascript:)/i.test(href)) return;
      // same-origin only
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return;   // in-page anchor
      e.preventDefault();
      document.documentElement.classList.add("is-leaving");
      setTimeout(function () { location.href = a.href; }, 200);
    });
    // Coming back via the back button / bfcache — clear the fade.
    window.addEventListener("pageshow", function () { document.documentElement.classList.remove("is-leaving"); });
  }

  /* ---- Per-page renderers ------------------------------------------------ */
  var renderers = {
    home: function (d) {
      var h = d.home || {};
      setText("[data-home-headline]", h.headline);
      setText("[data-home-subhead]", h.subhead);
      setText("[data-cta-primary]", h.primaryCtaLabel);
      setText("[data-cta-secondary]", h.secondaryCtaLabel);
      setHTML("[data-home-intro]", paras(h.intro));
      // logo scale
      var logo = $("[data-logo]");
      if (logo && h.logoScale) logo.style.setProperty("--logo-scale", h.logoScale);
      // title + description size, and position of the text block on the banner
      var hc = $(".hero-content");
      if (hc) {
        if (h.headlineScale) hc.style.setProperty("--headline-scale", h.headlineScale);
        hc.style.setProperty("--subhead-scale", h.subheadScale || 1);
        var ha = h.heroHAlign || "center";
        var va = h.heroVAlign || "center";
        var hmap = { left: "start", center: "center", right: "end" };
        var vmap = { top: "start", center: "center", bottom: "end" };
        hc.style.textAlign = ha;
        var heroSec = $(".hero");
        if (heroSec) {
          heroSec.style.alignItems = vmap[va] || "center";
          heroSec.style.justifyItems = hmap[ha] || "center";
        }
        var cta = $(".hero-cta");
        if (cta) cta.style.justifyContent = ha === "left" ? "flex-start" : ha === "right" ? "flex-end" : "center";
        var lead = hc.querySelector(".lead");
        if (lead) {
          lead.style.marginLeft = ha === "right" ? "auto" : "0";
          lead.style.marginRight = ha === "left" ? "auto" : "0";
          if (ha === "center") { lead.style.marginLeft = "auto"; lead.style.marginRight = "auto"; }
        }
      }
      // hero image OR video (with adjustable opacity behind the title)
      var hero = $("[data-hero]");
      if (hero) {
        hero.innerHTML = "";
        var op = (h.heroOpacity != null && h.heroOpacity !== "") ? h.heroOpacity : 0.7;
        hero.style.setProperty("--hero-opacity", op);
        if (h.heroMode === "video" && h.heroVideo) {
          var v = document.createElement("video");
          v.autoplay = v.muted = v.loop = v.playsInline = true;
          v.setAttribute("playsinline", "");
          v.src = C.videoUrl(h.heroVideo);
          hero.appendChild(v);
        } else {
          // fall back to the bundled starter photo when no banner image is set,
          // so the hero is never blank
          var heroSrc = h.heroImage
            ? C.imgUrl(h.heroImage, "f_auto,q_auto,w_1800,c_fill,g_auto")
            : "/assets/img/hero.jpg";
          var img = document.createElement("img");
          img.alt = "";
          img.decoding = "async";
          try { img.fetchPriority = "high"; } catch (e) {}
          img.src = heroSrc;
          hero.appendChild(img);
        }
      }
      // feature cards
      var cardsWrap = $("[data-home-cards]");
      if (cardsWrap && h.cards && h.cards.length) {
        cardsWrap.innerHTML = h.cards.filter(function (c) { return c && c.title; }).map(function (c) {
          return "<a class='card reveal' href='" + esc(c.url || "#") + "'><h3>" + esc(c.title) +
            "</h3><p class='muted'>" + esc(c.text || "") + "</p></a>";
        }).join("");
      }
    },
    about: function (d) {
      var a = d.about || {};
      setText("[data-about-heading]", a.heading);
      setHTML("[data-about-body]", paras(a.body));
      var pw = $("[data-about-photos]");
      if (pw && a.photos && a.photos.length) {
        pw.innerHTML = a.photos.filter(function (p) { return p.image; }).map(function (p) {
          return "<figure class='reveal'><img loading='lazy' alt='" + esc(p.caption || "Haus of Wintër dance") + "' src='" + esc(C.imgUrl(p.image, "f_auto,q_auto,w_800")) + "'>" +
            (p.caption ? "<figcaption>" + esc(p.caption) + "</figcaption>" : "") + "</figure>";
        }).join("");
      }
    },
    lessons: function (d) {
      var l = d.lessons || {};
      setText("[data-lessons-heading]", l.heading);
      setHTML("[data-lessons-intro]", paras(l.intro));
      setHTML("[data-lessons-body]", paras(l.body));
      var ph = $("[data-lessons-photo]");
      if (ph) ph.src = l.photo ? C.imgUrl(l.photo, "f_auto,q_auto,w_1000") : "/assets/img/about-teaching.jpg";
      var cta = $("[data-lessons-cta]");
      if (cta) { cta.textContent = l.ctaLabel || "Get in touch"; cta.setAttribute("href", l.ctaUrl || "/contact.html"); }
    },
    classes: function (d) {
      var c = d.classes || {};
      setText("[data-classes-heading]", c.heading);
      setHTML("[data-classes-intro]", paras(c.intro));
      setHTML("[data-classes-descriptions]", paras(c.descriptions));
      renderClassCalendar(c, $("[data-class-calendar]"));
      var slot = $("[data-booking-embed]");
      // migrate any old chimelle booking page to hausofwinter
      var embed = (c.bookingEmbed || "").replace(/bookwhen\.com\/chimelle\b/g, "bookwhen.com/hausofwinter");
      if (slot) slot.innerHTML = embed || "<p class='muted'>Booking widget not set yet.</p>";
      runEmbedScripts(slot);
    },
    shop: function (d) {
      var s = d.shop || {};
      setText("[data-shop-heading]", s.heading);
      setHTML("[data-shop-intro]", paras(s.intro));
      var slot = $("[data-store-embed]");
      if (!slot) return;
      var embed = (s.storeEmbed || "").trim();
      // If the pasted code is an Ecwid store, load it the robust way (Ecwid's
      // injected inline script fires before script.js is ready, so the raw paste
      // often renders nothing). We just need the numeric store id.
      var m = embed.match(/my-store-(\d{4,})/) || embed.match(/script\.js\?(\d{4,})/) || embed.match(/ecwid[^0-9]*(\d{5,})/i);
      if (m) { loadEcwidStore(slot, m[1]); }
      else if (embed) { slot.innerHTML = embed; runEmbedScripts(slot); }
      else { slot.innerHTML = "<p class='muted'>Store not set yet.</p>"; }
    },
    reviews: function (d) {
      var r = d.reviews || {};
      setText("[data-reviews-heading]", r.heading);
      var wrap = $("[data-reviews-list]");
      if (wrap) {
        var items = r.items || [];
        wrap.innerHTML = items.length ? items.map(function (it) {
          var stars = "★★★★★☆☆☆☆☆".slice(5 - (it.rating || 5), 10 - (it.rating || 5));
          return "<figure class='review reveal'><div class='stars' aria-label='" +
            (it.rating || 5) + " out of 5'>" + esc(stars) + "</div><blockquote>" +
            esc(it.text) + "</blockquote><figcaption>— " + esc(it.name) + "</figcaption></figure>";
        }).join("") : "<p class='muted'>Reviews coming soon.</p>";
      }
    },
    contact: function (d) {
      var c = d.contact || {};
      setText("[data-contact-heading]", c.heading);
      setHTML("[data-contact-intro]", paras(c.intro));
      var box = $("[data-contact-details]");
      if (box) {
        var rows = [];
        if (c.email) rows.push("<a href='mailto:" + esc(c.email) + "'>" + esc(c.email) + "</a>");
        if (c.phone) rows.push("<a href='tel:" + esc(c.phone.replace(/\s+/g, "")) + "'>" + esc(c.phone) + "</a>");
        if (c.whatsapp) rows.push("<a href='https://wa.me/" + esc(c.whatsapp.replace(/[^0-9]/g, "")) + "'>WhatsApp</a>");
        if (c.address) rows.push("<span class='muted'>" + esc(c.address) + "</span>");
        box.innerHTML = rows.join("<br>");
      }
      var soc = $("[data-contact-socials]");
      if (soc && c.socials) {
        soc.innerHTML = Object.keys(c.socials).filter(function (k) { return c.socials[k]; })
          .map(function (k) { return "<a href='" + esc(c.socials[k]) + "' rel='noopener' target='_blank'>" + k + "</a>"; })
          .join("");
      }
      // wire the FormSubmit action + thankyou redirect
      var form = $("[data-enquiry-form]");
      if (form && c.email) {
        form.setAttribute("action", "https://formsubmit.co/" + encodeURIComponent(c.email));
        var next = form.querySelector("[name=_next]");
        if (next) next.value = (CFG.baseUrl || "") + "/thankyou.html";
      }
    },
    faq: function (d) {
      var f = d.faq || {};
      setText("[data-faq-heading]", f.heading);
      var wrap = $("[data-faq-list]");
      if (wrap) {
        var items = f.items || [];
        wrap.innerHTML = items.length ? items.map(function (it) {
          return "<details class='faq-item reveal'><summary>" + esc(it.q) + "</summary>" +
            paras(it.a) + "</details>";
        }).join("") : "<p class='muted'>FAQ coming soon.</p>";
      }
      // location + map (from contact.address)
      var loc = $("[data-location]");
      if (loc) {
        var c = d.contact || {};
        var addr = c.address || "";
        var pin = encodeURIComponent(c.mapQuery || addr || "Nottingham"); // coords -> guaranteed marker
        var linkq = encodeURIComponent(addr || c.mapQuery || "Nottingham");
        loc.innerHTML = (addr ? "<p class='lead'>" + esc(addr) + "</p>" : "") +
          "<div class='map-embed'><iframe title='Map to Haus of Wintër' loading='lazy' " +
          "referrerpolicy='no-referrer-when-downgrade' src='https://maps.google.com/maps?q=" +
          pin + "&z=16&output=embed'></iframe></div>" +
          "<p class='small' style='margin-top:.6rem'><a href='https://www.google.com/maps/search/?api=1&query=" +
          linkq + "' target='_blank' rel='noopener'>Open in Google Maps →</a></p>";
      }
    },
    blog: function (d) {
      var b = d.blog || {};
      setText("[data-blog-heading]", b.heading);
      setText("[data-blog-intro]", b.intro);
      var wrap = $("[data-blog-list]");
      if (!wrap) return;
      var posts = (b.posts || []);
      var base = CFG.baseUrl || location.origin;
      wrap.innerHTML = posts.length ? posts.map(function (p, i) {
        var media = "";
        if (p.video) media = "<div class='blog-media'>" + videoEmbed(p.video) + "</div>";
        else if (p.image) media = "<img class='blog-img' loading='lazy' alt='" + esc(p.title || "Haus of Wintër") + "' src='" + esc(C.imgUrl(p.image, "f_auto,q_auto,w_1000")) + "'>";
        var slug = blogSlug(p.title, i);
        // Pretty per-post URL so social previews show this post's own image/title.
        var url = base + "/blog/" + slug;
        return "<article class='blog-post reveal' id='" + esc(slug) + "' data-slug='" + esc(slug) + "'>" +
          "<span class='blog-anchor' id='post-" + i + "'></span>" + media +
          "<div class='blog-body'><h2>" + esc(p.title) + "</h2>" +
          (p.date ? "<p class='blog-date muted small'>" + esc(p.date) + "</p>" : "") +
          paras(p.body) + shareRow(p.title || "Haus of Wintër", url) + "</div></article>";
      }).join("") : "<p class='muted'>No posts yet — check back soon.</p>";
      // Deep-link: /blog/<slug> (or #post-i) scrolls to and highlights that post.
      openBlogTarget(wrap);
      $all("[data-copy]", wrap).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var link = btn.getAttribute("data-copy");
          var done = function () { btn.classList.add("copied"); setTimeout(function () { btn.classList.remove("copied"); }, 1500); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, done);
          else { var t = document.createElement("textarea"); t.value = link; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(t); done(); }
        });
      });
    },
    gallery: function (d) { renderGallery(d); },
    videos: function (d) { renderVideosPage(d); }
  };

  /* ---- Gallery: categories from content JSON, images from Cloudinary ----- */
  function renderGallery(d) {
    var g = d.gallery || {}, cats = g.categories || {}, photos = g.photos || {};
    var nav = $("[data-gallery-nav]"), grid = $("[data-gallery-grid]");
    if (!grid) return;
    var local = g.localPhotos || {};
    var slugs = Object.keys(cats).filter(function (s) { return !cats[s].hidden; })
      .sort(function (a, b) { return (cats[a].order || 0) - (cats[b].order || 0); });
    if (nav) nav.innerHTML = slugs.map(function (s, i) {
      return "<button class='gtab" + (i === 0 ? " is-active" : "") + "' data-cat='" + esc(s) + "'>" + esc(cats[s].label || s) + "</button>";
    }).join("");
    function show(slug) {
      grid.setAttribute("aria-busy", "true");
      C.loadGallery(slug).then(function (res) {
        // Combine the bundled starter photos AND the Cloudinary uploads for this
        // category into one set, so uploads join the starters instead of replacing
        // them. Order / focal position / hidden all come from the content JSON,
        // keyed by the photo's id (a local path for starters, a public_id for uploads).
        var localIds = local[slug] || [];
        var cloudIds = res.map(function (r) { return r.public_id; });
        var seen = {};
        var list = localIds.concat(cloudIds).filter(function (id) {
          if (!id || seen[id]) return false; seen[id] = 1; return true;
        }).map(function (id) {
          var meta = photos[id] || {};
          return { id: id, order: meta.order, position: meta.position, hidden: meta.hidden, caption: meta.caption };
        }).filter(function (p) { return !p.hidden; })
          .sort(function (a, b) { var ao = a.order == null ? 9999 : a.order, bo = b.order == null ? 9999 : b.order; return ao - bo; });
        if (list.length) {
          grid.innerHTML = list.map(function (p) {
            var url = C.imgUrl(p.id, "f_auto,q_auto,w_900,c_fill,g_auto,ar_1:1");
            var full = C.imgUrl(p.id, "f_auto,q_auto,w_1600");
            var pos = p.position ? "object-position:" + esc(p.position) + ";" : "";
            return "<figure class='gcell reveal'><img draggable='false' loading='lazy' decoding='async' alt='" + esc(p.caption || ((cats[slug] && cats[slug].label ? cats[slug].label + " — " : "") + "Haus of Wintër")) + "' data-full='" + esc(full) + "' data-cap='" + esc(p.caption || "") + "' style='" + pos + "' src='" + esc(url) + "'></figure>";
          }).join("");
        } else {
          grid.innerHTML = "<p class='muted'>No photos in this category yet.</p>";
        }
        grid.setAttribute("aria-busy", "false");
        scanReveals(grid);
      });
    }
    if (nav) nav.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      $all(".gtab", nav).forEach(function (x) { x.classList.remove("is-active"); });
      b.classList.add("is-active");
      show(b.getAttribute("data-cat"));
    });
    // Click a photo -> open the full-size lightbox, scroll through the whole set
    grid.addEventListener("click", function (e) {
      var img = e.target.closest(".gcell img"); if (!img) return;
      var imgs = $all(".gcell img[data-full]", grid);
      var urls = imgs.map(function (x) { return x.getAttribute("data-full"); });
      var caps = imgs.map(function (x) { return x.getAttribute("data-cap") || ""; });
      var idx = imgs.indexOf(img);
      if (idx < 0) idx = 0;
      openLightbox(urls, idx, caps);
    });
    if (slugs.length) show(slugs[0]);
  }

  /* ---- Lightbox: full-size viewer with prev/next + keyboard --------------- */
  var _lb = null;
  function openLightbox(urls, index, caps) {
    urls = (urls || []).filter(Boolean);
    if (!urls.length) return;
    caps = caps || [];
    var i = Math.max(0, Math.min(index || 0, urls.length - 1));
    if (_lb) closeLightbox();
    var box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML =
      "<button class='lb-close' aria-label='Close'>&times;</button>" +
      "<button class='lb-nav lb-prev' aria-label='Previous'>&#8249;</button>" +
      "<figure class='lb-stage'><img class='lb-img' alt=''><figcaption class='lb-caption'></figcaption><figcaption class='lb-count'></figcaption></figure>" +
      "<button class='lb-nav lb-next' aria-label='Next'>&#8250;</button>";
    document.body.appendChild(box);
    document.documentElement.classList.add("lb-open");
    var imgEl = box.querySelector(".lb-img");
    var countEl = box.querySelector(".lb-count");
    var capEl = box.querySelector(".lb-caption");
    function render() {
      imgEl.classList.remove("is-in");
      imgEl.src = urls[i];
      imgEl.alt = caps[i] || "";
      if (capEl) { capEl.textContent = caps[i] || ""; capEl.style.display = caps[i] ? "" : "none"; }
      countEl.textContent = (i + 1) + " / " + urls.length;
      // toggle nav arrows when there is only one photo
      box.querySelector(".lb-prev").style.display = urls.length > 1 ? "" : "none";
      box.querySelector(".lb-next").style.display = urls.length > 1 ? "" : "none";
      requestAnimationFrame(function () { imgEl.classList.add("is-in"); });
    }
    function step(n) { i = (i + n + urls.length) % urls.length; render(); }
    box.querySelector(".lb-prev").addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
    box.querySelector(".lb-next").addEventListener("click", function (e) { e.stopPropagation(); step(1); });
    box.querySelector(".lb-close").addEventListener("click", closeLightbox);
    box.addEventListener("click", function (e) {
      // click on the dark backdrop (not the image or a button) closes
      if (e.target === box || e.target.classList.contains("lb-stage")) closeLightbox();
    });
    // swipe on touch devices
    var sx = null;
    box.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    function onKey(e) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    }
    document.addEventListener("keydown", onKey);
    _lb = { box: box, onKey: onKey };
    render();
  }
  function closeLightbox() {
    if (!_lb) return;
    document.removeEventListener("keydown", _lb.onKey);
    if (_lb.box.parentNode) _lb.box.parentNode.removeChild(_lb.box);
    document.documentElement.classList.remove("lb-open");
    _lb = null;
  }

  // Month calendar. If a Bookwhen iCal feedUrl is set, it shows the REAL scheduled
  // events (auto-updating, only what's booked in). Otherwise it uses the weekly pattern.
  function renderClassCalendar(classesObj, el) {
    if (!el) return;
    classesObj = classesObj || {};
    var weekly = classesObj.weekly || [];
    var feedUrl = (classesObj.feedUrl || "").trim();
    var byDayPattern = {};
    weekly.forEach(function (w) { (byDayPattern[w.day] = byDayPattern[w.day] || []).push(w); });
    var feedByDate = null;   // set once the feed is loaded
    var view = new Date(); view.setDate(1);
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    function scrollToBooking() { var b = $("#book") || $("[data-booking-embed]"); if (b) b.scrollIntoView({ behavior: "smooth", block: "start" }); }
    function keyOf(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }

    function eventsFor(date) {
      if (feedByDate) return feedByDate[keyOf(date)] || [];   // real Bookwhen events only
      var dow = date.getDay();
      return (byDayPattern[dow] || []).filter(function (e) {
        if (!e.everyOther) return true;
        var a = e.anchor ? new Date(e.anchor + "T00:00:00") : null;
        if (!a || isNaN(a.getTime())) return true;
        return Math.round((date - a) / (7 * 86400000)) % 2 === 0;
      }).map(function (e) { return { name: e.name, time: e.time, url: "" }; });
    }

    function draw() {
      var y = view.getFullYear(), m = view.getMonth();
      var startDow = (new Date(y, m, 1).getDay() + 6) % 7;
      var days = new Date(y, m + 1, 0).getDate();
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var cells = "";
      for (var i = 0; i < startDow; i++) cells += "<div class='cal-cell empty'></div>";
      for (var day = 1; day <= days; day++) {
        var date = new Date(y, m, day);
        var evs = eventsFor(date);
        var past = date < today, isToday = date.getTime() === today.getTime();
        var cls = "cal-cell" + (evs.length ? " has-class" : "") + (past ? " past" : "") + (isToday ? " today" : "");
        var interactive = (evs.length && !past) ? " data-book='1' role='button' tabindex='0'" : "";
        var evHtml = evs.map(function (e) { return "<span class='cal-ev'>" + esc(e.name) + (e.time ? " · " + esc(e.time) : "") + "</span>"; }).join("");
        cells += "<div class='" + cls + "'" + interactive + " data-key='" + keyOf(date) + "'><span class='cal-num'>" + day + "</span>" + evHtml + "</div>";
      }
      el.innerHTML =
        "<div class='cal-head'><button class='cal-nav' data-prev aria-label='Previous month'>‹</button>" +
        "<strong>" + months[m] + " " + y + "</strong>" +
        "<button class='cal-nav' data-next aria-label='Next month'>›</button></div>" +
        "<div class='cal-grid'>" + dows.map(function (d) { return "<div class='cal-dow'>" + d + "</div>"; }).join("") + cells + "</div>";
      el.querySelector("[data-prev]").onclick = function () { view.setMonth(view.getMonth() - 1); draw(); };
      el.querySelector("[data-next]").onclick = function () { view.setMonth(view.getMonth() + 1); draw(); };
      $all("[data-book]", el).forEach(function (cell) {
        function go() {
          var evs = eventsFor(new Date(view.getFullYear(), view.getMonth(), parseInt(cell.querySelector(".cal-num").textContent, 10)));
          var withUrl = evs.filter(function (e) { return e.url; })[0];
          if (withUrl) window.open(withUrl.url, "_blank", "noopener"); else scrollToBooking();
        }
        cell.addEventListener("click", go);
        cell.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    }

    if (feedUrl) {
      var cached = readFeedCache(feedUrl);
      if (cached && Object.keys(cached).length) { feedByDate = cached; draw(); }
      else { el.innerHTML = "<p class='muted'>Loading schedule…</p>"; }
      loadBookwhenFeed(feedUrl).then(function (map) {
        feedByDate = map; writeFeedCache(feedUrl, map); draw();
      }).catch(function () {
        // Live feed unreachable — fall back to the weekly pattern so the
        // calendar is never blank (feedByDate stays null => eventsFor uses weekly).
        if (!feedByDate) { feedByDate = null; draw(); }
      });
    } else {
      draw();
    }
  }

  /* ---- Bookwhen iCal feed: fetch + parse -------------------------------- */
  /* Bookwhen's feed server does not send CORS headers, so a direct browser
     fetch is blocked. We try, in order: (1) a same-origin Netlify proxy
     (/bw/* → feeds.bookwhen.com, set in _redirects — most reliable, no CORS),
     (2) the direct URL, (3) a few public CORS proxies as a last resort. The
     first source that returns real iCal with at least one event wins. */
  function feedCandidates(url) {
    url = url.replace(/^webcal:\/\//i, "https://");
    var list = [];
    var m = url.match(/^https?:\/\/feeds\.bookwhen\.com\/(.*)$/i);
    if (m) list.push(location.origin + "/bw/" + m[1]);   // same-origin proxy
    list.push(url);                                       // direct
    list.push("https://api.allorigins.win/raw?url=" + encodeURIComponent(url));
    list.push("https://corsproxy.io/?url=" + encodeURIComponent(url));
    list.push("https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(url));
    return list;
  }
  function loadBookwhenFeed(url) {
    var cands = feedCandidates(url);
    function tryAt(i) {
      if (i >= cands.length) return Promise.reject(new Error("all feed sources failed"));
      return fetch(cands[i], { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.text(); })
        .then(function (text) {
          if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not ical");
          var map = groupICS(parseICS(text));
          if (!map || !Object.keys(map).length) throw new Error("no events");
          return map;
        })
        .catch(function () { return tryAt(i + 1); });
    }
    return tryAt(0);
  }
  function readFeedCache(url) {
    try { var s = localStorage.getItem("hw_feed_" + url); if (!s) return null; return JSON.parse(s).map; } catch (e) { return null; }
  }
  function writeFeedCache(url, map) {
    try { localStorage.setItem("hw_feed_" + url, JSON.stringify({ t: Date.now(), map: map })); } catch (e) {}
  }
  function groupICS(events) {
    var map = {};
    events.forEach(function (ev) {
      if (!ev.start) return;
      var d = ev.start;
      var key = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
      (map[key] = map[key] || []).push({ name: ev.summary || "Class", time: fmtTime(ev), url: ev.url || "" });
    });
    return map;
  }
  function fmtTime(ev) {
    if (ev.allDay || !ev.start) return "";
    var d = ev.start, h = d.getHours(), mi = d.getMinutes();
    var ap = h < 12 ? "am" : "pm"; var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (mi ? ":" + (mi < 10 ? "0" + mi : mi) : "") + ap;
  }
  function parseICS(text) {
    text = (text || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");   // unfold
    var lines = text.split(/\r?\n/), events = [], cur = null;
    lines.forEach(function (line) {
      if (line === "BEGIN:VEVENT") cur = {};
      else if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; }
      else if (cur) {
        var i = line.indexOf(":"); if (i < 0) return;
        var key = line.slice(0, i), val = line.slice(i + 1), name = key.split(";")[0];
        if (name === "SUMMARY") cur.summary = unescapeICS(val);
        else if (name === "DTSTART") { var p = parseICSDate(val); if (p) { cur.start = p.date; cur.allDay = p.allDay; } }
        else if (name === "URL") cur.url = val;
        else if (name === "LOCATION") cur.location = unescapeICS(val);
      }
    });
    return events;
  }
  function parseICSDate(val) {
    var m = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?/);
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0);
    var date = m[7] === "Z" ? new Date(Date.UTC(y, mo, d, h, mi)) : new Date(y, mo, d, h, mi);
    return { date: date, allDay: !m[4] };
  }
  function unescapeICS(s) { return String(s || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }

  // Dedicated Videos page — videos only, never mixed with photos.
  // Each entry is either a plain URL/ID string (older saves) or { url, title }.
  function renderVideosPage(d) {
    var vids = (d.gallery && d.gallery.videos) || [];
    var grid = $("[data-videos-grid]"); if (!grid) return;
    var html = vids.map(function (v) {
      var src = (v && typeof v === "object") ? (v.url || "") : v;
      var title = (v && typeof v === "object") ? (v.title || "") : "";
      var embed = videoEmbed(src);
      if (!embed) return "";
      return "<div class='video-item reveal'>" + embed +
        (title ? "<p class='video-title'>" + esc(title) + "</p>" : "") + "</div>";
    }).filter(Boolean).join("");
    grid.innerHTML = html || "<p class='muted'>No videos yet — check back soon.</p>";
  }

  function frame(u) {
    return "<figure class='video-cell'><iframe src='" + u + "' frameborder='0' " +
      "allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture' " +
      "allowfullscreen></iframe></figure>";
  }
  function videoEmbed(src) {
    src = String(src || "").trim(); if (!src) return "";
    var yt = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    if (yt) return frame("https://www.youtube.com/embed/" + yt[1]);
    var vm = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return frame("https://player.vimeo.com/video/" + vm[1]);
    if (/tiktok\.com|instagram\.com/.test(src)) {
      return "<a class='video-link' href='" + esc(src) + "' target='_blank' rel='noopener'>▶ Watch on " +
        (/tiktok/.test(src) ? "TikTok" : "Instagram") + "</a>";
    }
    var url = /^https?:\/\//.test(src) ? src : C.videoUrl(src);
    return "<figure class='video-cell'><video controls playsinline preload='metadata' src='" + esc(url) + "'></video></figure>";
  }

  /* ---- Ecwid store: load reliably (avoids the inline-script timing race) -- */
  function loadEcwidStore(slot, storeId) {
    // Branded toolbar ABOVE the products — Bag / My account / Track orders,
    // styled to match the site and driven by Ecwid's JS API.
    slot.innerHTML =
      "<div class='shop-bar' data-shop-bar hidden>" +
        "<button type='button' class='shop-bar-btn shop-bar-bag' data-ec-page='cart'>" +
          "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z'/><path d='M3 6h18'/><path d='M16 10a4 4 0 0 1-8 0'/></svg>" +
          "Bag<span class='shop-bar-count' data-ec-count hidden>0</span></button>" +
        "<button type='button' class='shop-bar-btn' data-ec-page='account'>My account</button>" +
        "<button type='button' class='shop-bar-btn' data-ec-page='orders'>Track orders</button>" +
      "</div>" +
      "<div id='my-store-" + storeId + "'></div>";
    wireShopBar(slot);
    // Ecwid's documented way to init when the page is already loaded: queue the
    // widget config, then load script.js — it reads the queue when ready.
    global._xnext_initialization_scripts = [{
      widgetType: "ProductBrowser",
      id: "my-store-" + storeId,
      arg: ["id=my-store-" + storeId, "views=grid(20,3) list(60) table(60)", "categoryView=grid", "searchView=list"]
    }];
    if (global.Ecwid && global.Ecwid.init) { try { global.Ecwid.init(); return; } catch (e) {} }
    if (document.querySelector("script[data-ecwid='" + storeId + "']")) return;
    var sc = document.createElement("script");
    sc.type = "text/javascript"; sc.charset = "utf-8"; sc.async = true;
    sc.setAttribute("data-cfasync", "false");
    sc.setAttribute("data-ecwid", storeId);
    sc.src = "https://app.ecwid.com/script.js?" + storeId + "&data_platform=code";
    document.body.appendChild(sc);
  }
  function wireShopBar(slot) {
    var bar = slot.querySelector("[data-shop-bar]"); if (!bar) return;
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ec-page]"); if (!b) return;
      var page = b.getAttribute("data-ec-page");
      if (global.Ecwid && global.Ecwid.openPage) global.Ecwid.openPage(page);
    });
    var tries = 0;
    (function waitForApi() {
      if (global.Ecwid) {
        bar.hidden = false;   // store is loading — show the toolbar
        if (global.Ecwid.OnCartChanged) global.Ecwid.OnCartChanged.add(function (cart) {
          var c = bar.querySelector("[data-ec-count]");
          var n = (cart && cart.productsQuantity) || 0;
          if (c) { c.textContent = n; c.hidden = n === 0; }
        });
      } else if (tries++ < 150) { setTimeout(waitForApi, 100); }
    })();
  }

  /* ---- Make injected <script> tags in embeds actually run ---------------- */
  function runEmbedScripts(container) {
    if (!container) return;
    $all("script", container).forEach(function (old) {
      var s = document.createElement("script");
      for (var i = 0; i < old.attributes.length; i++) {
        s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      }
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  /* ---- Footer social icons ---------------------------------------------- */
  var SOCIAL_ICONS = {
    instagram: "<svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='2'><rect x='2' y='2' width='20' height='20' rx='5'/><circle cx='12' cy='12' r='4'/><circle cx='17.5' cy='6.5' r='1.2' fill='currentColor' stroke='none'/></svg>",
    tiktok: "<svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M16 3c.3 2 1.7 3.6 3.7 3.9v2.8c-1.4 0-2.7-.4-3.7-1.1v5.9A5.5 5.5 0 1 1 10.5 9v2.9a2.6 2.6 0 1 0 2.6 2.6V3H16z'/></svg>",
    facebook: "<svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M14 8.5h2.2V5.3C15.8 5.2 14.9 5 13.8 5 11.6 5 10 6.4 10 8.9V11H7.3v3H10v7h3v-7h2.4l.4-3H13V9.2c0-.5.3-.7.9-.7z'/></svg>",
    youtube: "<svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M23 12s0-3-.4-4.4a2.6 2.6 0 0 0-1.8-1.8C19.3 5.4 12 5.4 12 5.4s-7.3 0-8.8.4a2.6 2.6 0 0 0-1.8 1.8C1 9 1 12 1 12s0 3 .4 4.4a2.6 2.6 0 0 0 1.8 1.8c1.5.4 8.8.4 8.8.4s7.3 0 8.8-.4a2.6 2.6 0 0 0 1.8-1.8C23 15 23 12 23 12zM10 15.5v-7l6 3.5-6 3.5z'/></svg>"
  };
  /* ---- Blog post slugs + deep-linking ---- */
  // Must match the slug logic used by the Netlify edge function (blog-og.js),
  // so a shared /blog/<slug> URL resolves to the same post on the server.
  function blogSlug(title, i) {
    var base = String(title == null ? "" : title).toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return base || ("post-" + i);
  }
  // Find the post targeted by the URL (/blog/<slug> or #post-i), scroll to it.
  function openBlogTarget(wrap) {
    var slug = "";
    var m = location.pathname.match(/^\/blog\/([^\/]+)\/?$/);
    if (m) slug = decodeURIComponent(m[1]).toLowerCase();
    else if (location.hash) slug = location.hash.replace(/^#/, "");
    if (!slug) return;
    var el = wrap.querySelector('[data-slug="' + (window.CSS && CSS.escape ? CSS.escape(slug) : slug) + '"]')
      || document.getElementById(slug);
    if (!el) return;
    requestAnimationFrame(function () {
      try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { el.scrollIntoView(); }
      el.classList.add("blog-target");
      setTimeout(function () { el.classList.remove("blog-target"); }, 2400);
    });
  }

  /* ---- Blog share buttons ---- */
  var SHARE_ICON = {
    facebook: "<svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor'><path d='M14 8.5h2.2V5.3C15.8 5.2 14.9 5 13.8 5 11.6 5 10 6.4 10 8.9V11H7.3v3H10v7h3v-7h2.4l.4-3H13V9.2c0-.5.3-.7.9-.7z'/></svg>",
    x: "<svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor'><path d='M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.6L5.5 22H2.4l8-9.2L1 2h7l4.6 6.1L18.9 2zm-1.2 18h1.7L7.4 3.8H5.6L17.7 20z'/></svg>",
    whatsapp: "<svg viewBox='0 0 24 24' width='18' height='18' fill='currentColor'><path d='M20 3.9A10 10 0 0 0 3.5 15.8L2 22l6.3-1.6A10 10 0 1 0 20 3.9zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-3.7 1 1-3.6-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3A2.9 2.9 0 0 0 6.8 9c0 1.7 1.2 3.3 1.4 3.5s2.4 3.7 5.9 5c.8.3 1.5.5 2 .7.8.2 1.6.2 2.2.1.7-.1 1.4-.6 1.6-1.1s.2-1 .1-1.1z'/></svg>",
    link: "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1'/><path d='M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1'/></svg>"
  };
  function shareRow(title, url) {
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    return "<div class='blog-share'><span class='share-label'>Share</span>" +
      "<a href='https://www.facebook.com/sharer/sharer.php?u=" + u + "' target='_blank' rel='noopener' aria-label='Share on Facebook'>" + SHARE_ICON.facebook + "</a>" +
      "<a href='https://twitter.com/intent/tweet?url=" + u + "&text=" + t + "' target='_blank' rel='noopener' aria-label='Share on X'>" + SHARE_ICON.x + "</a>" +
      "<a href='https://wa.me/?text=" + t + "%20" + u + "' target='_blank' rel='noopener' aria-label='Share on WhatsApp'>" + SHARE_ICON.whatsapp + "</a>" +
      "<button type='button' class='share-copy' data-copy='" + esc(url) + "' aria-label='Copy link'>" + SHARE_ICON.link + "</button></div>";
  }

  function renderFooterSocials(content) {
    var box = $("[data-footer-socials]"); if (!box) return;
    var s = (content.contact && content.contact.socials) || {};
    box.innerHTML = Object.keys(SOCIAL_ICONS).filter(function (k) { return s[k]; })
      .map(function (k) {
        return "<a href='" + esc(s[k]) + "' target='_blank' rel='noopener' aria-label='" + k + "'>" + SOCIAL_ICONS[k] + "</a>";
      }).join("");
  }

  /* ---- Footer content: tagline, copyright, and editable buttons ---------- */
  function renderFooter(content) {
    var f = content.footer || {};
    setText("[data-footer-tagline]", f.tagline);
    setText("[data-footer-copyright]", f.copyright);
    var nav = $("[data-footer-nav]");
    if (nav && f.links && f.links.length) {
      nav.innerHTML = f.links.filter(function (l) { return l && l.label; }).map(function (l) {
        return "<a href='" + esc(l.url || "#") + "'>" + esc(l.label) + "</a>";
      }).join("");
    }
  }

  /* ---- Page visibility (hide a page while editing) ----------------------- */
  // A page can be hidden in /manage → Pages. Hidden pages drop out of the nav
  // and footer, and a visitor who opens one directly is sent home. The owner can
  // still preview a hidden page by adding ?preview=1 to the URL (or after
  // unlocking /manage in the same browser tab session).
  function pageKeyFromHref(href) {
    if (href == null) return null;
    href = String(href).replace(/^https?:\/\/[^/]+/i, "").split("#")[0].split("?")[0];
    if (href === "" || href === "/" || /\/index\.html$/i.test(href)) return "home";
    var m = href.match(/\/?([a-z0-9_-]+)\.html$/i);
    return m ? m[1].toLowerCase() : null;
  }
  function isPreviewMode() {
    try {
      if (/[?&]preview=1\b/.test(location.search)) return true;
      if (sessionStorage.getItem("hw_manage_ok") === "1") return true;
    } catch (e) {}
    return false;
  }
  function isHiddenPage(pages, key) {
    return !!(key && pages && pages[key] && pages[key].hidden);
  }
  function applyPageVisibility(pages) {
    pages = pages || {};
    $all("[data-nav] a, [data-footer-nav] a").forEach(function (a) {
      if (isHiddenPage(pages, pageKeyFromHref(a.getAttribute("href")))) a.style.display = "none";
      else a.style.display = "";
    });
    // Tidy each dropdown group.
    $all(".nav-group").forEach(function (g) {
      var parent = g.querySelector(".nav-parent");
      var subLinks = $all(".nav-sub a", g);
      var visibleSubs = subLinks.filter(function (a) { return a.style.display !== "none"; });
      var parentHidden = parent && parent.style.display === "none";
      if (parentHidden) {
        // The parent page is hidden: hide the whole dropdown (its menu name too).
        // Any still-visible child pages are promoted to normal top-level links so
        // they stay reachable.
        var navRoot = g.parentNode;
        visibleSubs.forEach(function (a) {
          if (a._promoted) return; a._promoted = true;
          var link = a.cloneNode(true);
          link.className = ""; link.style.display = "";
          navRoot.insertBefore(link, g);
        });
        g.style.display = "none";
        return;
      }
      // Parent visible: hide the group only if every link inside is hidden.
      var anyVisible = $all("a", g).some(function (a) { return a.style.display !== "none"; });
      g.style.display = anyVisible ? "" : "none";
    });
  }

  /* ---- Boot -------------------------------------------------------------- */
  // Analytics (Google Analytics 4). Reads HW_CONFIG.ga4Id. Cookie-consent aware:
  // GA is loaded only after the visitor accepts (or if they accepted before).
  function loadGA(id) {
    if (global.gtag) return;
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(sc);
    global.dataLayer = global.dataLayer || [];
    function gtag() { global.dataLayer.push(arguments); }
    global.gtag = gtag;
    gtag("js", new Date());
    gtag("config", id, { anonymize_ip: true });
  }
  function consentChoice() { try { return localStorage.getItem("hw_consent"); } catch (e) { return null; } }
  function initAnalytics() {
    var id = (CFG.ga4Id || "").trim();
    if (!/^G-[A-Z0-9]+$/i.test(id)) return;            // no id set → nothing loads
    var choice = consentChoice();
    if (choice === "granted") { loadGA(id); return; }  // already accepted
    if (choice === "denied") return;                   // already declined → no GA, no banner
    showConsentBanner(id);                             // undecided → ask first
  }
  function showConsentBanner(id) {
    if (!document.body) return;
    var bar = document.createElement("div");
    bar.className = "cookie-consent";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie notice");
    bar.innerHTML =
      "<p>We use a few cookies to see how people use the site — never anything personal. Happy to allow it?</p>" +
      "<div class='cookie-consent-btns'>" +
        "<button type='button' data-consent='deny' class='btn btn-ghost'>Decline</button>" +
        "<button type='button' data-consent='allow' class='btn btn-primary'>Accept</button>" +
      "</div>";
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-consent]");
      if (!b) return;
      var allow = b.getAttribute("data-consent") === "allow";
      try { localStorage.setItem("hw_consent", allow ? "granted" : "denied"); } catch (e2) {}
      bar.parentNode && bar.parentNode.removeChild(bar);
      if (allow) loadGA(id);
    });
  }

  // Fire a GA4 event (silent no-op until a ga4Id is set in config.js).
  function trackEvent(name, params) {
    try { if (typeof global.gtag === "function") global.gtag("event", name, params || {}); } catch (e) {}
  }
  // Track the actions that matter for a dance school: booking intent, shares,
  // social + contact clicks. (Enquiries = /thankyou.html pageview; newsletter
  // signups fire their own event below.)
  function initEventTracking() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("a, [data-book], button");
      if (!el) return;
      var a = e.target.closest("a");
      var href = (a && a.getAttribute("href")) || "";
      var label = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (/^tel:/i.test(href)) return trackEvent("contact_phone", { label: href.replace(/^tel:/i, "") });
      if (/^mailto:/i.test(href)) return trackEvent("contact_email", {});
      if (el.closest(".blog-share")) return trackEvent("blog_share", { method: el.getAttribute("aria-label") || label });
      if (el.matches("[data-cta-primary]")) return trackEvent("cta_book_class", { label: label });
      if (el.closest("[data-book]")) return trackEvent("book_slot_click", { label: label });
      if (/bookwhen\.com/i.test(href)) return trackEvent("book_click", { label: href });
      if (/instagram\.com|tiktok\.com/i.test(href)) return trackEvent("social_click", { network: /instagram/i.test(href) ? "instagram" : "tiktok" });
      if (el.matches("[data-cta-secondary]")) return trackEvent("cta_shop", { label: label });
      if (el.matches("[data-lessons-cta]")) return trackEvent("cta_lessons", { label: label });
    }, true);
  }

  function boot() {
    initAnalytics();
    initEventTracking();
    initChrome();
    var page = document.body.getAttribute("data-page");
    // Early pass from the cached content so hidden pages don't flash before the
    // network load finishes. Redirect first, then trim the nav.
    try {
      var cached = JSON.parse(localStorage.getItem("hw_content_cache_v1") || "null");
      if (cached) {
        var cp = cached.pages;
        if (cp) {
          if (page !== "home" && isHiddenPage(cp, page) && !isPreviewMode()) { location.replace("/"); return; }
          applyPageVisibility(cp);
        }
        if (cached.theme) applyTheme(cached);   // paint the saved theme before the network load
      }
    } catch (e) {}
    C.load().then(function (content) {
      global.HoWData = content; // expose for debugging
      applyTheme(content);
      var pages = content.pages || {};
      if (page !== "home" && isHiddenPage(pages, page) && !isPreviewMode()) { location.replace("/"); return; }
      applyPageVisibility(pages);
      renderFooterSocials(content);
      renderFooter(content);
      renderNewsletter(content);
      var fn = renderers[page];
      if (fn) try { fn(content); } catch (e) { console.error("[HoW] render error", e); }
      tagReveals();
      scanReveals(document);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})(window);

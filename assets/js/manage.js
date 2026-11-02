/* ============================================================================
   manage.js — /manage control panel logic
   - Passcode gate (client-side; deters casual access only — see README).
   - Loads current content JSON, binds it to the form, lets you edit every tab.
   - Save uploads the whole content JSON to Cloudinary as a RAW file via the
     UNSIGNED preset, tagged HW_CONFIG.contentTag. The live site reads newest.
   - Upload photos: unsigned IMAGE upload tagged galleryTagPrefix + category slug.
   - Reorder: drag to order, set focal position, hide (unsigned can't delete).
   ========================================================================== */
(function (global) {
  "use strict";
  var CFG = global.HW_CONFIG || {};
  var C = global.HoWContent;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var work = null;          // working copy of content
  var galleryCache = {};    // slug -> [public_id,...] loaded from Cloudinary

  /* ---------- path get/set for data-bind ---------- */
  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var ks = path.split("."), last = ks.pop();
    var t = ks.reduce(function (o, k) { o[k] = o[k] || {}; return o[k]; }, obj);
    t[last] = val;
  }

  /* ---------- passcode gate ---------- */
  function initGate() {
    var gate = $("[data-gate]"), app = $("[data-app]");
    var unlocked = sessionStorage.getItem("hw_manage_ok") === "1";
    if (unlocked) { startApp(gate, app); return; }
    gate.hidden = false;
    function tryUnlock() {
      var val = $("[data-gate-input]").value;
      if (val && val === CFG.managePasscode) {
        try { sessionStorage.setItem("hw_manage_ok", "1"); } catch (e) {}
        startApp(gate, app);
      } else {
        $("[data-gate-err]").textContent = "Wrong passcode.";
      }
    }
    $("[data-gate-go]").addEventListener("click", tryUnlock);
    $("[data-gate-input]").addEventListener("keydown", function (e) { if (e.key === "Enter") tryUnlock(); });
  }

  function startApp(gate, app) {
    gate.hidden = true; app.hidden = false;
    initTabs();
    C.load().then(function (content) {
      work = content;
      bindToForm();
      renderReviews();
      renderBlog();
      renderAboutPhotos();
      renderHomeCards();
      renderFaq();
      renderFooterLinks();
      renderWeekly();
      renderCategories();
      renderVideos();
      renderPages();
      renderAppearance();
      enhanceRichFields();
      populateCategorySelects();
      $("[data-status]").textContent = "Loaded. Ready to edit.";
    });
    $("[data-save]").addEventListener("click", save);
    $("[data-add-video]").addEventListener("click", addVideo);
    wireAppearance();
    $("[data-add-review]").addEventListener("click", addReview);
    $("[data-add-post]").addEventListener("click", addPost);
    $("[data-add-about-photo]").addEventListener("click", addAboutPhoto);
    $("[data-add-card]").addEventListener("click", addHomeCard);
    $("[data-add-faq]").addEventListener("click", addFaq);
    $("[data-add-flink]").addEventListener("click", addFooterLink);
    $("[data-add-weekly]").addEventListener("click", addWeekly);
    $("[data-add-category]").addEventListener("click", addCategory);
    $("[data-upload-go]").addEventListener("click", uploadPhotos);
    wireUploadButtons();
    $("[data-reorder-cat]").addEventListener("change", function (e) { renderReorder(e.target.value); });
  }

  /* ---------- tabs ---------- */
  function initTabs() {
    $("[data-tabs]").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tab]"); if (!b) return;
      var name = b.getAttribute("data-tab");
      $all("[data-tab]").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      $all("[data-panel]").forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-panel") === name); });
      if (name === "reorder") { populateCategorySelects(); var sel = $("[data-reorder-cat]"); if (sel.value) renderReorder(sel.value); }
    });
  }

  /* ---------- simple data-bind fields ---------- */
  function bindToForm() {
    $all("[data-bind]").forEach(function (el) {
      var v = getPath(work, el.getAttribute("data-bind"));
      if (el.type === "checkbox") { el.checked = !!v; return; }
      el.value = v == null ? "" : v;
    });
  }
  function collectForm() {
    $all("[data-bind]").forEach(function (el) {
      var path = el.getAttribute("data-bind");
      var v;
      if (el.type === "checkbox") v = el.checked;
      else { v = el.value; if (el.type === "number") v = v === "" ? null : parseFloat(v); }
      setPath(work, path, v);
    });
  }

  /* ---------- reviews editor ---------- */
  function renderReviews() {
    var wrap = $("[data-reviews-editor]");
    var items = (work.reviews && work.reviews.items) || [];
    wrap.innerHTML = items.map(function (it, i) {
      return '<div class="mg-list-item" data-review="' + i + '">' +
        '<div class="mg-field"><label>Name</label><input value="' + attr(it.name) + '" data-rv="name"></div>' +
        '<div class="mg-field"><label>Rating (1–5)</label><input type="number" min="1" max="5" value="' + (it.rating || 5) + '" data-rv="rating"></div>' +
        '<div class="mg-field"><label>Quote</label><textarea data-rv="text">' + txt(it.text) + '</textarea></div>' +
        '<button class="mg-btn small" data-del-review="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-review]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectReviews();
        work.reviews.items.splice(parseInt(b.getAttribute("data-del-review"), 10), 1);
        renderReviews();
      });
    });
  }
  function collectReviews() {
    work.reviews = work.reviews || { items: [] };
    work.reviews.items = $all("[data-review]").map(function (row) {
      return {
        name: row.querySelector('[data-rv="name"]').value,
        rating: parseInt(row.querySelector('[data-rv="rating"]').value, 10) || 5,
        text: row.querySelector('[data-rv="text"]').value
      };
    });
  }
  function addReview() { collectReviews(); work.reviews.items.push({ name: "", rating: 5, text: "" }); renderReviews(); }

  /* ---------- blog editor ---------- */
  function renderBlog() {
    var wrap = $("[data-blog-editor]"); if (!wrap) return;
    var posts = (work.blog && work.blog.posts) || [];
    wrap.innerHTML = posts.map(function (p, i) {
      return '<div class="mg-list-item" data-post="' + i + '">' +
        '<div class="mg-field"><label>Title</label><input value="' + attr(p.title) + '" data-bp="title"></div>' +
        '<div class="mg-field"><label>Date</label><input value="' + attr(p.date) + '" data-bp="date" placeholder="e.g. 3 Sept 2026"></div>' +
        '<div class="mg-field"><label>Image</label><div class="mg-row">' +
          '<input value="' + attr(p.image) + '" data-bp="image" placeholder="Upload below, or paste a Cloudinary ID / URL" style="flex:1">' +
          '<label class="mg-btn small" style="cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center">Upload image<input type="file" accept="image/*" data-bp-upload hidden></label>' +
        '</div><span class="mg-hint" data-bp-status></span></div>' +
        '<div class="mg-field"><label>Video (YouTube / Vimeo link or Cloudinary ID — optional)</label><input value="' + attr(p.video) + '" data-bp="video"></div>' +
        '<div class="mg-field"><label>Body (blank line = new paragraph)</label><textarea data-bp="body" rows="5" data-rich>' + txt(p.body) + '</textarea></div>' +
        '<button class="mg-btn small" data-del-post="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-post]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectBlog();
        work.blog.posts.splice(parseInt(b.getAttribute("data-del-post"), 10), 1);
        renderBlog();
      });
    });
    // per-post image upload straight to Cloudinary
    wrap.querySelectorAll("[data-bp-upload]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0]; if (!file) return;
        var row = inp.closest("[data-post]");
        var imgInput = row.querySelector('[data-bp="image"]');
        var status = row.querySelector("[data-bp-status]");
        status.textContent = "Uploading…";
        var fd = new FormData();
        fd.append("file", file);
        fd.append("upload_preset", CFG.cloudinaryUploadPreset);
        fd.append("tags", "hw_blog");
        fetch("https://api.cloudinary.com/v1_1/" + CFG.cloudinaryCloudName + "/image/upload", { method: "POST", body: fd })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.public_id) { imgInput.value = res.public_id; status.textContent = "Uploaded ✓ — now click Save changes"; }
            else { status.textContent = "Upload failed: " + (res.error && res.error.message || "check the preset"); }
          })
          .catch(function (e) { status.textContent = "Upload failed: " + e.message; });
      });
    });
    enhanceRichFields(wrap);
  }
  function collectBlog() {
    work.blog = work.blog || { posts: [] };
    work.blog.posts = $all("[data-post]").map(function (row) {
      return {
        title: row.querySelector('[data-bp="title"]').value,
        date: row.querySelector('[data-bp="date"]').value,
        image: row.querySelector('[data-bp="image"]').value,
        video: (row.querySelector('[data-bp="video"]') || {}).value || "",
        body: row.querySelector('[data-bp="body"]').value
      };
    });
  }
  function addPost() { collectBlog(); work.blog.posts.push({ title: "", date: "", image: "", video: "", body: "" }); renderBlog(); }

  /* ---------- about photos editor ---------- */
  function renderAboutPhotos() {
    var wrap = $("[data-about-photos-editor]"); if (!wrap) return;
    var items = (work.about && work.about.photos) || [];
    wrap.innerHTML = items.map(function (p, i) {
      return '<div class="mg-list-item" data-aphoto="' + i + '">' +
        '<div class="mg-field"><label>Image</label><div class="mg-row">' +
          '<input value="' + attr(p.image) + '" data-ap="image" placeholder="Upload below, or paste a Cloudinary ID / URL" style="flex:1">' +
          '<label class="mg-btn small" style="cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center">Upload image<input type="file" accept="image/*" data-ap-upload hidden></label>' +
        '</div><span class="mg-hint" data-ap-status></span></div>' +
        '<div class="mg-field"><label>Caption</label><input value="' + attr(p.caption) + '" data-ap="caption"></div>' +
        '<button class="mg-btn small" data-del-aphoto="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-aphoto]").forEach(function (b) {
      b.addEventListener("click", function () { collectAboutPhotos(); work.about.photos.splice(parseInt(b.getAttribute("data-del-aphoto"), 10), 1); renderAboutPhotos(); });
    });
    wrap.querySelectorAll("[data-ap-upload]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0]; if (!file) return;
        var row = inp.closest("[data-aphoto]");
        var imgInput = row.querySelector('[data-ap="image"]');
        var status = row.querySelector("[data-ap-status]");
        status.textContent = "Uploading…";
        var fd = new FormData();
        fd.append("file", file); fd.append("upload_preset", CFG.cloudinaryUploadPreset); fd.append("tags", "hw_about");
        fetch("https://api.cloudinary.com/v1_1/" + CFG.cloudinaryCloudName + "/image/upload", { method: "POST", body: fd })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.public_id) { imgInput.value = res.public_id; status.textContent = "Uploaded ✓ — now click Save changes"; }
            else status.textContent = "Upload failed: " + (res.error && res.error.message || "check the preset");
          })
          .catch(function (e) { status.textContent = "Upload failed: " + e.message; });
      });
    });
  }
  function collectAboutPhotos() {
    work.about = work.about || {};
    work.about.photos = $all("[data-aphoto]").map(function (row) {
      return { image: row.querySelector('[data-ap="image"]').value, caption: row.querySelector('[data-ap="caption"]').value };
    });
  }
  function addAboutPhoto() { collectAboutPhotos(); work.about.photos.push({ image: "", caption: "" }); renderAboutPhotos(); }

  /* ---------- home feature cards editor ---------- */
  function renderHomeCards() {
    var wrap = $("[data-cards-editor]"); if (!wrap) return;
    var items = (work.home && work.home.cards) || [];
    wrap.innerHTML = items.map(function (c, i) {
      return '<div class="mg-list-item" data-card="' + i + '">' +
        '<div class="mg-field"><label>Title</label><input value="' + attr(c.title) + '" data-hc="title"></div>' +
        '<div class="mg-field"><label>Description</label><input value="' + attr(c.text) + '" data-hc="text"></div>' +
        '<div class="mg-field"><label>Links to</label><input value="' + attr(c.url) + '" data-hc="url" placeholder="e.g. /classes.html"></div>' +
        '<button class="mg-btn small" data-del-card="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-card]").forEach(function (b) {
      b.addEventListener("click", function () { collectHomeCards(); work.home.cards.splice(parseInt(b.getAttribute("data-del-card"), 10), 1); renderHomeCards(); });
    });
  }
  function collectHomeCards() {
    work.home = work.home || {};
    work.home.cards = $all("[data-card]").map(function (row) {
      return {
        title: row.querySelector('[data-hc="title"]').value,
        text: row.querySelector('[data-hc="text"]').value,
        url: row.querySelector('[data-hc="url"]').value
      };
    });
  }
  function addHomeCard() { collectHomeCards(); work.home.cards.push({ title: "", text: "", url: "" }); renderHomeCards(); }

  /* ---------- FAQ editor ---------- */
  function renderFaq() {
    var wrap = $("[data-faq-editor]"); if (!wrap) return;
    var items = (work.faq && work.faq.items) || [];
    wrap.innerHTML = items.map(function (it, i) {
      return '<div class="mg-list-item" data-faq="' + i + '">' +
        '<div class="mg-field"><label>Question</label><input value="' + attr(it.q) + '" data-fq="q"></div>' +
        '<div class="mg-field"><label>Answer (blank line = new paragraph)</label><textarea data-fq="a" rows="4" data-rich>' + txt(it.a) + '</textarea></div>' +
        '<button class="mg-btn small" data-del-faq="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-faq]").forEach(function (b) {
      b.addEventListener("click", function () { collectFaq(); work.faq.items.splice(parseInt(b.getAttribute("data-del-faq"), 10), 1); renderFaq(); });
    });
    enhanceRichFields(wrap);
  }
  function collectFaq() {
    work.faq = work.faq || { items: [] };
    work.faq.items = $all("[data-faq]").map(function (row) {
      return { q: row.querySelector('[data-fq="q"]').value, a: row.querySelector('[data-fq="a"]').value };
    });
  }
  function addFaq() { collectFaq(); work.faq.items.push({ q: "", a: "" }); renderFaq(); }

  /* ---------- footer buttons editor ---------- */
  function renderFooterLinks() {
    var wrap = $("[data-footer-editor]"); if (!wrap) return;
    var items = (work.footer && work.footer.links) || [];
    wrap.innerHTML = items.map(function (l, i) {
      return '<div class="mg-list-item" data-flink="' + i + '"><div class="mg-row">' +
        '<div class="mg-field" style="flex:2;min-width:140px"><label>Button title</label><input value="' + attr(l.label) + '" data-fl="label"></div>' +
        '<div class="mg-field" style="flex:2;min-width:140px"><label>Links to</label><input value="' + attr(l.url) + '" data-fl="url" placeholder="e.g. /classes.html"></div>' +
        '</div><button class="mg-btn small" data-del-flink="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-flink]").forEach(function (b) {
      b.addEventListener("click", function () { collectFooterLinks(); work.footer.links.splice(parseInt(b.getAttribute("data-del-flink"), 10), 1); renderFooterLinks(); });
    });
  }
  function collectFooterLinks() {
    work.footer = work.footer || {};
    work.footer.links = $all("[data-flink]").map(function (row) {
      return { label: row.querySelector('[data-fl="label"]').value, url: row.querySelector('[data-fl="url"]').value };
    });
  }
  function addFooterLink() { collectFooterLinks(); work.footer.links.push({ label: "", url: "" }); renderFooterLinks(); }

  /* ---------- weekly classes editor (month calendar) ---------- */
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function renderWeekly() {
    var wrap = $("[data-weekly-editor]"); if (!wrap) return;
    var items = (work.classes && work.classes.weekly) || [];
    wrap.innerHTML = items.map(function (w, i) {
      return '<div class="mg-list-item" data-weekly="' + i + '"><div class="mg-row">' +
        '<div class="mg-field" style="flex:1;min-width:120px"><label>Day</label><select data-wk="day">' +
        DOW.map(function (d, di) { return '<option value="' + di + '"' + (di === Number(w.day) ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
        '<div class="mg-field" style="flex:2;min-width:140px"><label>Class name</label><input value="' + attr(w.name) + '" data-wk="name"></div>' +
        '<div class="mg-field" style="flex:1;min-width:120px"><label>Time</label><input value="' + attr(w.time) + '" data-wk="time"></div>' +
        '</div>' +
        '<label class="mg-row" style="gap:.4rem;margin:.2rem 0 .5rem;align-items:center"><input type="checkbox" data-wk="everyOther"' + (w.everyOther ? ' checked' : '') + '> Every other week</label>' +
        '<div class="mg-field" style="max-width:220px"><label>Starting date (for every-other weeks)</label><input type="date" value="' + attr(w.anchor || '') + '" data-wk="anchor"></div>' +
        '<button class="mg-btn small" data-del-weekly="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-weekly]").forEach(function (b) {
      b.addEventListener("click", function () { collectWeekly(); work.classes.weekly.splice(parseInt(b.getAttribute("data-del-weekly"), 10), 1); renderWeekly(); });
    });
  }
  function collectWeekly() {
    work.classes = work.classes || {};
    work.classes.weekly = $all("[data-weekly]").map(function (row) {
      return {
        day: parseInt(row.querySelector('[data-wk="day"]').value, 10),
        name: row.querySelector('[data-wk="name"]').value,
        time: row.querySelector('[data-wk="time"]').value,
        everyOther: row.querySelector('[data-wk="everyOther"]').checked,
        anchor: row.querySelector('[data-wk="anchor"]').value
      };
    });
  }
  function addWeekly() { collectWeekly(); work.classes.weekly.push({ day: 2, name: "", time: "" }); renderWeekly(); }

  /* ---------- categories editor ---------- */
  function renderCategories() {
    var wrap = $("[data-categories-editor]");
    var cats = (work.gallery && work.gallery.categories) || {};
    var slugs = Object.keys(cats).sort(function (a, b) { return (cats[a].order || 0) - (cats[b].order || 0); });
    wrap.innerHTML = slugs.map(function (slug) {
      var c = cats[slug];
      return '<div class="mg-list-item" data-cat-row="' + attr(slug) + '">' +
        '<div class="mg-row"><div class="mg-field" style="flex:1"><label>Slug (tag suffix)</label><input value="' + attr(slug) + '" data-cc="slug"></div>' +
        '<div class="mg-field" style="flex:2"><label>Display label</label><input value="' + attr(c.label) + '" data-cc="label"></div>' +
        '<div class="mg-field" style="width:90px"><label>Order</label><input type="number" value="' + (c.order || 0) + '" data-cc="order"></div></div>' +
        '<label class="mg-row"><input type="checkbox" data-cc="hidden"' + (c.hidden ? " checked" : "") + '> Hidden</label> ' +
        '<button class="mg-btn small" data-del-cat="' + attr(slug) + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-cat]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectCategories();
        delete work.gallery.categories[b.getAttribute("data-del-cat")];
        renderCategories(); populateCategorySelects();
      });
    });
  }
  function collectCategories() {
    work.gallery = work.gallery || { categories: {}, photos: {} };
    var next = {};
    $all("[data-cat-row]").forEach(function (row) {
      var slug = (row.querySelector('[data-cc="slug"]').value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (!slug) return;
      next[slug] = {
        label: row.querySelector('[data-cc="label"]').value || slug,
        order: parseInt(row.querySelector('[data-cc="order"]').value, 10) || 0,
        hidden: row.querySelector('[data-cc="hidden"]').checked
      };
    });
    work.gallery.categories = next;
  }
  /* ---------- featured videos (link + title) ---------- */
  // Each video is stored as { url, title }. Older saves stored plain strings,
  // so we normalise those to { url, title:"" } on load.
  function renderVideos() {
    var wrap = $("[data-videos-editor]"); if (!wrap) return;
    work.gallery = work.gallery || {};
    var items = (work.gallery.videos || []).map(function (v) {
      return (v && typeof v === "object") ? { url: v.url || "", title: v.title || "" } : { url: v || "", title: "" };
    });
    work.gallery.videos = items;
    wrap.innerHTML = items.map(function (v, i) {
      return '<div class="mg-list-item" data-video="' + i + '">' +
        '<div class="mg-field"><label>Title (shown under the video)</label><input value="' + attr(v.title) + '" data-vd="title" placeholder="e.g. Showcase 2024 — finale"></div>' +
        '<div class="mg-field"><label>Video link or ID</label><input value="' + attr(v.url) + '" data-vd="url" placeholder="YouTube / Vimeo / Instagram / TikTok link, or a Cloudinary video ID"></div>' +
        '<button class="mg-btn small" data-del-video="' + i + '">Remove</button></div>';
    }).join("");
    wrap.querySelectorAll("[data-del-video]").forEach(function (b) {
      b.addEventListener("click", function () {
        collectVideos();
        work.gallery.videos.splice(parseInt(b.getAttribute("data-del-video"), 10), 1);
        renderVideos();
      });
    });
  }
  function collectVideos() {
    work.gallery = work.gallery || {};
    var wrap = $("[data-videos-editor]");
    if (!wrap) return;
    work.gallery.videos = $all("[data-video]", wrap).map(function (row) {
      return {
        url: (row.querySelector('[data-vd="url"]').value || "").trim(),
        title: (row.querySelector('[data-vd="title"]').value || "").trim()
      };
    }).filter(function (v) { return v.url; });
  }
  function addVideo() { collectVideos(); work.gallery.videos.push({ url: "", title: "" }); renderVideos(); }

  /* ---------- pages: hide / show ---------- */
  var PAGES = [
    { key: "home", label: "Home" },
    { key: "about", label: "About" },
    { key: "classes", label: "Classes" },
    { key: "lessons", label: "1-to-1 Lessons" },
    { key: "gallery", label: "Gallery (photos)" },
    { key: "videos", label: "Videos" },
    { key: "shop", label: "Shop" },
    { key: "blog", label: "Blog" },
    { key: "reviews", label: "Reviews" },
    { key: "faq", label: "FAQ" },
    { key: "contact", label: "Contact" }
  ];
  function renderPages() {
    var wrap = $("[data-pages-editor]"); if (!wrap) return;
    work.pages = work.pages || {};
    wrap.innerHTML = PAGES.map(function (p) {
      var hidden = work.pages[p.key] && work.pages[p.key].hidden;
      return '<label class="mg-list-item mg-row" style="align-items:center;gap:.6rem" data-page-row="' + attr(p.key) + '">' +
        '<input type="checkbox" data-pg-hidden' + (hidden ? " checked" : "") + '> ' +
        '<span><strong>' + txt(p.label) + '</strong> <span class="mg-hint">— ' + (hidden ? "hidden from the site" : "visible") + '</span></span>' +
        '</label>';
    }).join("");
    wrap.querySelectorAll("[data-pg-hidden]").forEach(function (cb) {
      cb.addEventListener("change", function () { collectPages(); renderPages(); });
    });
  }
  function collectPages() {
    work.pages = work.pages || {};
    $all("[data-page-row]").forEach(function (row) {
      var key = row.getAttribute("data-page-row");
      work.pages[key] = { hidden: row.querySelector("[data-pg-hidden]").checked };
    });
  }

  function addCategory() {
    collectCategories();
    var n = Object.keys(work.gallery.categories).length;
    work.gallery.categories["new" + (n + 1)] = { label: "New category", order: n, hidden: false };
    renderCategories(); populateCategorySelects();
  }

  /* ---------- category selects (reorder + upload) ---------- */
  function populateCategorySelects() {
    if (!work) return;
    collectCategories();
    var cats = work.gallery.categories;
    var slugs = Object.keys(cats);
    // include "banner" as an upload-only convenience even if not a display category
    var uploadSlugs = slugs.slice();
    if (uploadSlugs.indexOf("banner") === -1) uploadSlugs.push("banner");
    fillSelect($("[data-reorder-cat]"), slugs, cats);
    fillSelect($("[data-upload-cat]"), uploadSlugs, cats);
  }
  function fillSelect(sel, slugs, cats) {
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = slugs.map(function (s) {
      var label = (cats[s] && cats[s].label) || s;
      return '<option value="' + attr(s) + '">' + txt(label) + " (" + s + ")</option>";
    }).join("");
    if (cur && slugs.indexOf(cur) !== -1) sel.value = cur;
  }

  /* ---------- reorder grid (drag + position + hide) ---------- */
  function _delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function _uniq(arr) { var s = {}, out = []; arr.forEach(function (x) { if (x && !s[x]) { s[x] = 1; out.push(x); } }); return out; }
  // The Cloudinary image-list endpoint is CDN-cached and often returns empty for
  // a moment. Retry a few times so the reorder grid isn't left blank.
  function loadGalleryRetry(slug, tries) {
    return C.loadGallery(slug).then(function (res) {
      if ((!res || !res.length) && tries > 1) { return _delay(700).then(function () { return loadGalleryRetry(slug, tries - 1); }); }
      return res || [];
    });
  }
  var _autosaveT = null, reorderShowDeleted = false, _reorder = { slug: null, ids: [] };
  function autosaveGallery() {
    if (_autosaveT) clearTimeout(_autosaveT);
    setSave("Saving…");
    _autosaveT = setTimeout(function () { _autosaveT = null; save(); }, 1000);
  }
  function _photoHidden(id) { var p = work.gallery.photos[id]; return !!(p && p.hidden); }
  function _byOrder(a, b) {
    var p = work.gallery.photos;
    var ao = p[a] && p[a].order != null ? p[a].order : 9999;
    var bo = p[b] && p[b].order != null ? p[b].order : 9999;
    return ao - bo;
  }
  function renderReorder(slug) {
    var grid = $("[data-reorder-grid]");
    grid.innerHTML = "<p class='mg-hint'>Loading photos…</p>";
    loadGalleryRetry(slug, 4).then(function (res) {
      work.gallery = work.gallery || {};
      work.gallery.photos = work.gallery.photos || {};
      work.gallery.localPhotos = work.gallery.localPhotos || {};
      var photos = work.gallery.photos;
      var localIds = work.gallery.localPhotos[slug] || [];
      var cloudIds = res.map(function (r) { return r.public_id; });
      galleryCache[slug] = _uniq((galleryCache[slug] || []).concat(cloudIds));
      var metaIds = Object.keys(photos).filter(function (id) {
        return photos[id] && photos[id].category === slug && localIds.indexOf(id) === -1;
      });
      _reorder = { slug: slug, ids: _uniq(localIds.concat(galleryCache[slug], metaIds)) };
      wireReorder(grid, slug);
      paintReorder();
    });
  }
  function paintReorder() {
    var grid = $("[data-reorder-grid]"); if (!grid || !_reorder.slug) return;
    var slug = _reorder.slug, photos = work.gallery.photos;
    var allIds = _reorder.ids.slice().sort(_byOrder);
    var deleted = allIds.filter(_photoHidden);
    var ids = reorderShowDeleted ? allIds : allIds.filter(function (id) { return !_photoHidden(id); });
    var head = '<div class="mg-reorder-head" style="grid-column:1/-1">' +
      '<span class="mg-hint">Drag, or use ◀ ▶ to reorder. Delete removes a photo; changes save automatically.</span>' +
      (deleted.length ? ' <button type="button" class="mg-btn small" data-toggle-deleted>' + (reorderShowDeleted ? "Hide deleted" : ("Show deleted (" + deleted.length + ")")) + '</button>' : '') +
      '</div>';
    if (!allIds.length) { grid.innerHTML = head + "<p class='mg-hint' style='grid-column:1/-1'>No photos in this category yet. Add some in the Upload photos tab.</p>"; return; }
    grid.innerHTML = head + ids.map(function (id) {
      var m = photos[id] || {}, pos = m.position || "center";
      return '<div class="mg-photo' + (m.hidden ? " hidden" : "") + '" draggable="true" data-pid="' + attr(id) + '" data-cat="' + attr(slug) + '">' +
        '<img draggable="false" loading="lazy" src="' + C.imgUrl(id, "f_auto,q_auto,w_300,c_fill,g_auto,ar_1:1") + '" alt="">' +
        '<div class="mg-photo-ctl">' +
          '<button type="button" class="mg-btn small mg-move" data-move="-1" aria-label="Move earlier">◀</button>' +
          '<button type="button" class="mg-btn small mg-move" data-move="1" aria-label="Move later">▶</button>' +
          '<select data-pos title="Focal point">' + POSITIONS_opts(pos) + '</select>' +
          '<button type="button" class="mg-btn small" data-del>' + (m.hidden ? "Restore" : "Delete") + '</button>' +
        '</div>' +
        '<input class="mg-cap" data-cap placeholder="Caption (optional)" value="' + attr(m.caption || "") + '">' +
      '</div>';
    }).join("");
  }
  function movePhoto(pid, dir) {
    var slug = _reorder.slug;
    var visible = _reorder.ids.slice().sort(_byOrder).filter(function (id) { return !_photoHidden(id); });
    var i = visible.indexOf(pid), j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    visible.forEach(function (id, k) { setPhotoMeta(id, slug, { order: k }); });
    setPhotoMeta(visible[i], slug, { order: j });
    setPhotoMeta(visible[j], slug, { order: i });
    paintReorder(); autosaveGallery();
  }
  function POSITIONS_opts(cur) {
    return ["center", "top", "bottom", "left", "right"].map(function (p) {
      return '<option value="' + p + '"' + (p === cur ? " selected" : "") + ">" + p + "</option>";
    }).join("");
  }
  function wireReorder(grid, slug) {
    if (grid._wired) return; grid._wired = true;
    var dragEl = null;
    grid.addEventListener("dragstart", function (e) {
      dragEl = e.target.closest(".mg-photo"); if (dragEl) dragEl.classList.add("dragging");
    });
    grid.addEventListener("dragend", function () {
      if (dragEl) dragEl.classList.remove("dragging"); dragEl = null;
      commitOrder(grid, _reorder.slug); autosaveGallery();
    });
    grid.addEventListener("dragover", function (e) {
      e.preventDefault(); if (!dragEl) return;
      var after = getAfter(grid, e.clientX, e.clientY);
      if (after == null) grid.appendChild(dragEl); else grid.insertBefore(dragEl, after);
    });
    grid.addEventListener("change", function (e) {
      if (e.target.matches("[data-pos]")) {
        var pid = e.target.closest(".mg-photo").getAttribute("data-pid");
        setPhotoMeta(pid, _reorder.slug, { position: e.target.value }); autosaveGallery();
      }
    });
    grid.addEventListener("input", function (e) {
      if (e.target.matches("[data-cap]")) {
        var pid = e.target.closest(".mg-photo").getAttribute("data-pid");
        setPhotoMeta(pid, _reorder.slug, { caption: e.target.value }); autosaveGallery();
      }
    });
    grid.addEventListener("click", function (e) {
      var slug = _reorder.slug;
      if (e.target.closest("[data-toggle-deleted]")) { reorderShowDeleted = !reorderShowDeleted; paintReorder(); return; }
      var mv = e.target.closest("[data-move]");
      if (mv) { movePhoto(mv.closest(".mg-photo").getAttribute("data-pid"), parseInt(mv.getAttribute("data-move"), 10)); return; }
      var del = e.target.closest("[data-del]");
      if (del) {
        var pid = del.closest(".mg-photo").getAttribute("data-pid");
        setPhotoMeta(pid, slug, { hidden: !_photoHidden(pid) });
        paintReorder(); autosaveGallery();
      }
    });
  }
  function getAfter(grid, x, y) {
    var els = $all(".mg-photo:not(.dragging)", grid);
    var closest = { offset: -Infinity, el: null };
    els.forEach(function (el) {
      var box = el.getBoundingClientRect();
      var offset = y - box.top - box.height / 2 + (x - box.left - box.width / 2) * 0.0001;
      if (offset < 0 && offset > closest.offset) closest = { offset: offset, el: el };
    });
    return closest.el;
  }
  function setPhotoMeta(pid, slug, patch) {
    work.gallery.photos = work.gallery.photos || {};
    var m = work.gallery.photos[pid] || { category: slug };
    for (var k in patch) m[k] = patch[k];
    m.category = slug;
    work.gallery.photos[pid] = m;
  }
  function commitOrder(grid, slug) {
    $all(".mg-photo", grid).forEach(function (cell, i) {
      setPhotoMeta(cell.getAttribute("data-pid"), slug, { order: i });
    });
  }

  /* ---------- upload photos (unsigned image upload) ---------- */
  // Shrink very large images before upload so they don't hit Cloudinary's size
  // limit (the usual reason "certain photos" wouldn't upload). Only re-encodes
  // files big enough to be at risk, and keeps EXIF orientation; falls back to the
  // original file if anything goes wrong (e.g. HEIC that the browser can't decode).
  function maybeShrink(file) {
    try {
      if (!/^image\//.test(file.type) || /heic|heif/i.test(file.type)) return Promise.resolve(file);
      if (file.size < 9 * 1024 * 1024) return Promise.resolve(file);
      if (typeof createImageBitmap !== "function") return Promise.resolve(file);
      return createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bmp) {
        var max = 2560, w = bmp.width, h = bmp.height, big = Math.max(w, h);
        if (big <= max) { if (bmp.close) bmp.close(); return file; }
        var s = max / big, cw = Math.round(w * s), ch = Math.round(h * s);
        var c = document.createElement("canvas"); c.width = cw; c.height = ch;
        c.getContext("2d").drawImage(bmp, 0, 0, cw, ch); if (bmp.close) bmp.close();
        return new Promise(function (resolve) {
          c.toBlob(function (blob) {
            if (blob && blob.size < file.size) resolve(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
            else resolve(file);
          }, "image/jpeg", 0.85);
        });
      }).catch(function () { return file; });
    } catch (e) { return Promise.resolve(file); }
  }
  function uploadOne(file, slug, attempt) {
    return maybeShrink(file).then(function (f) {
      var fd = new FormData();
      fd.append("file", f);
      fd.append("upload_preset", CFG.cloudinaryUploadPreset);
      fd.append("tags", CFG.galleryTagPrefix + slug);
      return fetch("https://api.cloudinary.com/v1_1/" + CFG.cloudinaryCloudName + "/image/upload", { method: "POST", body: fd })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
        .then(function (res) {
          if (res.body && res.body.public_id) return res.body;
          var msg = (res.body && res.body.error && res.body.error.message) || ("error " + res.status);
          // retry once on server/transient errors
          if (attempt < 2 && res.status >= 500) return _delay(900).then(function () { return uploadOne(file, slug, attempt + 1); });
          throw new Error(msg);
        })
        .catch(function (e) {
          if (attempt < 2 && /networkerror|failed to fetch|load failed/i.test(e.message || "")) {
            return _delay(900).then(function () { return uploadOne(file, slug, attempt + 1); });
          }
          throw e;
        });
    });
  }
  function uploadPhotos() {
    var input = $("[data-upload-input]");
    var files = Array.prototype.slice.call(input.files);
    var slug = $("[data-upload-cat]").value;
    if (!files.length) { setSave("Choose at least one image.", "err"); return; }
    if (!slug) { setSave("Pick a category.", "err"); return; }
    var preview = $("[data-upload-preview]");
    // Delete straight from the upload screen (toggles hidden, like the Reorder tab).
    if (preview && !preview._wired) {
      preview._wired = true;
      preview.addEventListener("click", function (e) {
        var b = e.target.closest("[data-hide]"); if (!b) return;
        var cell = b.closest(".mg-photo"); if (!cell) return;
        var pid = cell.getAttribute("data-pid"); if (!pid) return;
        var sg = cell.getAttribute("data-cat");
        var m = (work.gallery && work.gallery.photos && work.gallery.photos[pid]) || {};
        setPhotoMeta(pid, sg, { hidden: !m.hidden });
        cell.classList.toggle("hidden");
        b.textContent = cell.classList.contains("hidden") ? "Restore" : "Delete";
        setSave("Marked a photo " + (cell.classList.contains("hidden") ? "deleted" : "restored") + " — click Save changes to apply.", "ok");
      });
    }
    var total = files.length, done = 0, ok = 0, failed = [];
    var goBtn = $("[data-upload-go]"); if (goBtn) goBtn.disabled = true;
    setSave("Uploading 0/" + total + "…");
    // Sequential — parallel unsigned uploads get rate-limited, which is why some
    // photos silently failed.
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return uploadOne(file, slug, 1).then(function (res) {
          ok++; done++;
          galleryCache[slug] = _uniq((galleryCache[slug] || []).concat(res.public_id));
          setPhotoMeta(res.public_id, slug, {});   // remember it so reorder shows it even if the list lags
          var d = document.createElement("div"); d.className = "mg-photo";
          d.setAttribute("data-pid", res.public_id); d.setAttribute("data-cat", slug);
          d.innerHTML = '<img draggable="false" src="' + res.secure_url + '"><div class="mg-photo-ctl"><button type="button" class="mg-btn small" data-hide>Delete</button></div>';
          preview.appendChild(d);
          setSave("Uploading " + done + "/" + total + "…");
        }).catch(function (e) {
          done++; failed.push(txt(file.name) + " — " + txt(e.message || "failed"));
          var d = document.createElement("div"); d.className = "mg-photo hidden";
          d.innerHTML = '<div class="mg-photo-ctl" style="min-height:60px"><span class="mg-hint">✕ ' + txt(file.name) + "</span></div>";
          preview.appendChild(d);
          setSave("Uploading " + done + "/" + total + "…");
        });
      });
    });
    chain.then(function () {
      if (goBtn) goBtn.disabled = false;
      input.value = "";
      if (failed.length) {
        setSave("Uploaded " + ok + " of " + total + ". Didn’t upload: " + failed.join(" · ") + ". (Very large or HEIC photos can fail — try JPEG.)", "err");
      } else {
        setSave("Uploaded all " + total + " photo(s) to “" + slug + "”. Click Save changes to lock in their order.", "ok");
      }
      var rc = $("[data-reorder-cat]"); if (rc && rc.value === slug) renderReorder(slug);
    });
  }

  /* ---------- generic "upload straight into a field" buttons ---------- */
  function wireUploadButtons() {
    $all("[data-upload-target]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var file = inp.files && inp.files[0]; if (!file) return;
        var target = inp.getAttribute("data-upload-target");
        var field = $('[data-bind="' + target + '"]');
        var status = $('[data-upload-status="' + target + '"]');
        if (status) status.textContent = "Uploading…";
        var fd = new FormData();
        fd.append("file", file);
        fd.append("upload_preset", CFG.cloudinaryUploadPreset);
        fd.append("tags", "hw_banner");
        fetch("https://api.cloudinary.com/v1_1/" + CFG.cloudinaryCloudName + "/image/upload", { method: "POST", body: fd })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.public_id) { if (field) field.value = res.public_id; if (status) status.textContent = "Uploaded ✓ — now click Save changes"; }
            else if (status) status.textContent = "Upload failed: " + (res.error && res.error.message || "check the preset");
          })
          .catch(function (e) { if (status) status.textContent = "Upload failed: " + e.message; });
      });
    });
  }

  /* ---------- appearance: theme colours + fonts ---------- */
  function toHex6(v) {
    if (typeof v !== "string") return "#000000";
    var m = v.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return "#000000";
    var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return "#" + s.toLowerCase();
  }
  function fillFontSelect(sel, cur) {
    if (!sel) return;
    var names = Object.keys(C.FONTS || {});
    sel.innerHTML = names.map(function (n) { return '<option value="' + attr(n) + '">' + txt(n) + "</option>"; }).join("");
    if (cur && names.indexOf(cur) !== -1) sel.value = cur;
  }
  function renderAppearance() {
    work.theme = work.theme || {};
    var t = work.theme;
    var d = (C.PRESETS && C.PRESETS.dark) || {};
    ["bg", "sectionBg", "ink", "brand", "brand2", "fontHead", "fontBody"].forEach(function (k) { if (t[k] == null) t[k] = d[k]; });
    // per-area colours fall back so old saves still show sensible pickers
    if (t.cardBg == null) t.cardBg = t.sectionBg;
    if (t.footerBg == null) t.footerBg = t.sectionBg;
    if (t.headerBg == null) t.headerBg = t.footerBg;
    if (t.headingMode == null) t.headingMode = d.headingMode || "gradient";
    if (t.headingColor == null) t.headingColor = t.brand;
    $all("[data-theme]").forEach(function (el) {
      var key = el.getAttribute("data-theme");
      if (el.tagName === "SELECT") { fillFontSelect(el, t[key]); }
      else if (el.type === "color") { el.value = toHex6(t[key]); }
    });
    var solid = t.headingMode === "solid";
    var cb = $("[data-theme-heading-solid]"); if (cb) cb.checked = solid;
    var wrap = $("[data-heading-color-wrap]"); if (wrap) wrap.style.display = solid ? "" : "none";
  }
  function collectAppearance() {
    work.theme = work.theme || {};
    var t = work.theme;
    $all("[data-theme]").forEach(function (el) { t[el.getAttribute("data-theme")] = el.value; });
    var cb = $("[data-theme-heading-solid]");
    t.headingMode = (cb && cb.checked) ? "solid" : "gradient";
  }
  function applyPreset(name) {
    var p = C.PRESETS && C.PRESETS[name]; if (!p) return;
    collectAppearance();
    work.theme = {};
    for (var k in p) work.theme[k] = p[k];
    renderAppearance();
    setSave("“" + name + "” theme loaded — tweak if you like, then Save changes.", "ok");
  }
  function wireAppearance() {
    $all("[data-theme-preset]").forEach(function (b) {
      b.addEventListener("click", function () { applyPreset(b.getAttribute("data-theme-preset")); });
    });
    var cb = $("[data-theme-heading-solid]");
    if (cb) cb.addEventListener("change", function () {
      var wrap = $("[data-heading-color-wrap]"); if (wrap) wrap.style.display = cb.checked ? "" : "none";
    });
  }

  /* ---------- rich-text toolbar (style selected words) ---------- */
  function enhanceRichFields(root) {
    $all("[data-rich]", root || document).forEach(function (ta) {
      if (ta._richDone) return; ta._richDone = true;
      var bar = document.createElement("div");
      bar.className = "mg-richbar";
      bar.innerHTML =
        '<button type="button" class="mg-btn small" data-rt="b" title="Bold"><b>B</b></button>' +
        '<button type="button" class="mg-btn small" data-rt="i" title="Italic"><i>I</i></button>' +
        '<label class="mg-btn small" style="cursor:pointer" title="Colour">Colour<input type="color" data-rt-color hidden></label>' +
        '<button type="button" class="mg-btn small" data-rt="s-up" title="Bigger">A+</button>' +
        '<button type="button" class="mg-btn small" data-rt="s-down" title="Smaller">A−</button>' +
        '<select class="mg-btn small" data-rt-font title="Font for the selected words"><option value="">Font…</option>' +
        Object.keys(C.FONTS || {}).map(function (n) { return '<option value="' + attr(n) + '">' + txt(n) + "</option>"; }).join("") + "</select>" +
        '<button type="button" class="mg-btn small" data-rt="clear" title="Remove styling">Clear</button>' +
        '<button type="button" class="mg-btn small" data-rt="preview">Preview</button>';
      ta.parentNode.insertBefore(bar, ta);
      var prev = document.createElement("div");
      prev.className = "mg-richprev prose"; prev.hidden = true;
      ta.parentNode.insertBefore(prev, ta.nextSibling);
      function wrapSel(pre, post) {
        var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
        var sel = v.slice(s, e) || "text";
        ta.value = v.slice(0, s) + pre + sel + post + v.slice(e);
        ta.focus();
        ta.selectionStart = s + pre.length; ta.selectionEnd = s + pre.length + sel.length;
        if (!prev.hidden) prev.innerHTML = C.rich(ta.value);
      }
      bar.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-rt]"); if (!b) return;
        var k = b.getAttribute("data-rt");
        if (k === "b") wrapSel("[[b]]", "[[/b]]");
        else if (k === "i") wrapSel("[[i]]", "[[/i]]");
        else if (k === "s-up") wrapSel("[[s:1.3]]", "[[/s]]");
        else if (k === "s-down") wrapSel("[[s:0.85]]", "[[/s]]");
        else if (k === "clear") { ta.value = ta.value.replace(/\[\[\/?[a-z](?::[^\]]*)?\]\]/g, ""); if (!prev.hidden) prev.innerHTML = C.rich(ta.value); }
        else if (k === "preview") { prev.hidden = !prev.hidden; if (!prev.hidden) prev.innerHTML = C.rich(ta.value); }
      });
      var col = bar.querySelector("[data-rt-color]");
      if (col) col.addEventListener("input", function () { wrapSel("[[c:" + col.value + "]]", "[[/c]]"); });
      var fs = bar.querySelector("[data-rt-font]");
      if (fs) fs.addEventListener("change", function () { if (fs.value) { wrapSel("[[f:" + fs.value + "]]", "[[/f]]"); fs.value = ""; } });
    });
  }

  /* ---------- save content JSON to Cloudinary (raw, unsigned) ---------- */
  function save() {
    collectForm(); collectReviews(); collectBlog(); collectAboutPhotos(); collectHomeCards(); collectFaq(); collectFooterLinks(); collectWeekly(); collectCategories(); collectVideos(); collectPages(); collectAppearance();
    work._version = (work._version || 1) + 1;
    work._savedAt = new Date().toISOString();
    var json = JSON.stringify(work);
    var blob = new Blob([json], { type: "application/json" });
    var fd = new FormData();
    fd.append("file", blob, "content.json");
    fd.append("upload_preset", CFG.cloudinaryUploadPreset);
    fd.append("tags", CFG.contentTag);
    fd.append("public_id", "content_" + Date.now());
    setSave("Saving…");
    fetch("https://api.cloudinary.com/v1_1/" + CFG.cloudinaryCloudName + "/raw/upload", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.public_id) { try { C.saveCache(work); } catch (e) {} setSave("Saved ✓  Live site updates within ~1 min.", "ok"); }
        else setSave("Save failed: " + (res.error && res.error.message || "check preset (must be unsigned + allow raw)."), "err");
      })
      .catch(function (e) { setSave("Save failed: " + e.message, "err"); });
  }

  /* ---------- helpers ---------- */
  function setSave(msg, cls) {
    var el = $("[data-save-status]");
    el.textContent = msg; el.className = "mg-status" + (cls ? " " + cls : "");
  }
  function attr(s) { return String(s == null ? "" : s).replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
  function txt(s) { return String(s == null ? "" : s).replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initGate);
  else initGate();
})(window);

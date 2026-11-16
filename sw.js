// Shows notifications on phones, and keeps the big text-reader files (Tesseract) on the device
// so scanning is fast after the first time. The app's own files are never cached here, so updates show straight away.
self.addEventListener("install", () => self.skipWaiting());
const LIB = "yanju-libs-v1";
self.addEventListener("activate", e => e.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("yanju-libs-") && k !== LIB).map(k => caches.delete(k))))
])));
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  // Only version-pinned library files and fonts from the CDNs. Everything else goes straight to the network.
  if (!(u.hostname === "cdn.jsdelivr.net" || u.hostname === "fonts.gstatic.com")) return;
  e.respondWith(caches.open(LIB).then(async c => {
    const hit = await c.match(r); if (hit) return hit;
    const res = await fetch(r);
    if (res && (res.ok || res.type === "opaque")) c.put(r, res.clone()).catch(() => {});
    return res;
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./#dashboard");
  }));
});
// A reminder sent by the reminder server (works even when the app is closed).
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "Subscription reminder", { body: d.body || "Open the app to review your subscriptions.", tag: d.tag }));
});

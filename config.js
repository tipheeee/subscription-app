// Change the app name here. It updates everywhere on the site.
window.APP_CONFIG = {
  name: "Yanju",
  // Sign people out automatically after this many minutes away from the app. Use 0 to turn it off.
  sessionTimeoutMinutes: 30,
  tagline: "Your heads up before every charge.",
  defaultCurrency: "NGN",
  // Free and Premium limits (see plans.js).
  plans: { freeSubscriptions: 2, freeHistoryDays: 60, premiumPriceNGN: 1000, businessPriceNGN: 3000, reportPackNGN: 1500, reportPackSize: 3, whatsappCap: { premium: 30, business: 100 }, trialDays: 7 },
  // Payments server address (see SETUP-PAYMENTS.md). Leave as "" until it is set up: the Pay buttons then say payments are not switched on.
  payApi: "https://yanju-payments.olaoluwaoluwatoyin0.workers.dev",
  // Sign-in and customer database (Supabase). Both values below are public and safe to keep here.
  supabaseUrl: "https://utiumcvozfohydmqalwo.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0aXVtY3ZvemZvaHlkbXFhbHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1OTk5MTMsImV4cCI6MjExMDE3NTkxM30.emzJF93JqB6ZeV6WNW2QsvYvjh25XWfi3A9jI3yknMk",
  // Alternatives server address. Leave as "" to hide results until it is set up.
  altApi: "https://yanju-alternatives.olaoluwaoluwatoyin0.workers.dev/",
  // Reminder server address. Leave as "" to keep reminders on this device only.
  pushApi: "https://yanju-reminders.olaoluwaoluwatoyin0.workers.dev/"
};

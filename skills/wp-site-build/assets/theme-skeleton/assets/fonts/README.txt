Self-hosted fonts go here. Generate them with the skill's script:

  node scripts/fetch-fonts.mjs "https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..800&display=swap" wp-content/themes/my-theme/assets/fonts

It writes fonts.css and the .woff2 files. functions.php enqueues fonts.css on
the site and in the editor; no visitor request goes to Google.

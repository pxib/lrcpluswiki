lrcplus.wiki

media player wiki

idk

## Editing the user manual

Edit shared English, Japanese, Korean, and Cantonese articles in
[`pxib/lrcplus/docs/manual`](https://github.com/pxib/lrcplus/tree/release/docs/manual).
Keep article and heading IDs stable. The wiki's Pages workflow reads the app's
`release` branch and imports those articles by ID before checking and publishing
the site. It checks for app updates every six hours. To publish sooner, run
**Deploy wiki to GitHub Pages** on `main` from the Actions tab.

Edit the wiki home page, article index, wiki-only articles, and community pages
in this repository. The importer also retains the wiki's installation link and
the additional sections listed in `EXTRA_SECTIONS` in `tools/import-app-manual.py`.
The Simplified Chinese, Traditional Chinese, Czech, and Vietnamese translations
continue to use this repository's localization workflow.

To preview a build locally with Python 3.9+ and Node.js, run this from the wiki
checkout. Replace `../lrcplus` with the path to your app checkout.

```sh
preview=$(mktemp -d)
cp -a docs/manual/. "$preview/"
python3 tools/import-app-manual.py ../lrcplus "$preview"
node tools/check-pages.cjs "$preview"
```

Open `index.html` in the preview folder to check the rendered articles and links.

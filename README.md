# LRCPlus wiki

The static wiki lives in `docs/manual`. GitHub Actions publishes the contents of
that folder directly to **https://pxib.github.io/lrcpluswiki/** on pushes to `main`.
No build or package installation is required.

## Enable GitHub Pages

1. Commit and push the website files and `.github/workflows/pages.yml` to `main`.
2. Open [Settings → Pages](https://github.com/pxib/lrcpluswiki/settings/pages).
   Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open [Actions](https://github.com/pxib/lrcpluswiki/actions), select
   **Deploy wiki to GitHub Pages**, and choose **Run workflow** if the push has
   already happened. Later pushes deploy automatically.
4. Once the deployment succeeds, open https://pxib.github.io/lrcpluswiki/.

The deployed root contains `index.html`, the other language editions, account
pages, and their assets. Do not add `/docs/manual/` to the public URL. Configure
Supabase confirmation/recovery URLs against this public root as described in
[the community setup guide](docs/manual/COMMUNITY-SETUP.md).

Run `node tools/check-pages.cjs` locally to check the resources that will be
published. The same check runs before deployment. Manual documentation is in
[docs/manual/README.md](docs/manual/README.md).

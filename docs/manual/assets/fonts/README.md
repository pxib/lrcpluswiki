# Manual fonts

## Traditional Chinese: LXGW WenKai TC

`LXGWWenKaiTC-400-*.woff2` (Regular) and `LXGWWenKaiTC-700-*.woff2` (Bold)
are the unmodified Google Fonts WOFF2 subsets of **LXGW WenKai TC**. The
Traditional Chinese manual, account, and user pages load `traditional-fonts.css`;
its family rules apply only to `zh-Hant`. Article text, headings, navigation,
and controls use this family, while code examples and source editors retain
their monospace fonts. Other editions keep their existing fonts.

All 230 subsets (9,370,536 bytes total) are bundled for offline use. The
upstream `unicode-range` declarations let browsers request only the subsets
needed by the current text, including live discussions. `font-display: swap`
keeps text readable while fonts load. No Google Fonts requests occur at runtime.

The original Google Fonts CSS, with versioned source URLs, is pinned in
`tools/font-sources/LXGWWenKaiTC-google.css`. The corresponding SHA-256
checksums are in `LXGWWenKaiTC-files.json` in the same directory. To recreate
or verify the bundled CSS and files from the repository root:

```console
node tools/build-traditional-fonts.cjs --download
node tools/build-traditional-fonts.cjs --check
node tools/build-locales.cjs
node tools/check-pages.cjs
```

The download flag retrieves only missing files. Normal generation and checking
work offline. Changing the pinned CSS requires reviewing the new upstream
files, license, and checksums. The font files remain unchanged and retain their
upstream names and metadata; filenames here use the weight and a source-URL hash.

Copyright 2024 The LXGW WenKai Project Authors
([upstream](https://github.com/lxgw/LxgwWenkaiTC)). Licensed under the SIL Open
Font License 1.1; the original notice and license are in `OFL-LXGWWenKaiTC.txt`.
The source is the [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/lxgwwenkaitc).

## Cantonese: Cactus and Chocolate

`CactusClassicalSerif-Regular-*.woff2` supplies article and section headings.
`ChocolateClassicalSans-Regular-*.woff2` supplies body text and navigation.

The original WOFF 1 sources are preserved in `tools/font-sources/`, outside
the published manual. The bundled WOFF2 files are generated subsets with the
same outlines and complete mapped character coverage (35,979 characters for
Chocolate and 58,064 for Cactus). Copyright and license name records remain
in each subset. The existing `OFL.txt` applies to the sources and subsets.

`../../cantonese-fonts.css` loads only in the two Cantonese pages. It tries
installed families first, then uses disjoint `unicode-range` rules to load
only the needed subsets. The common subsets cover supported characters in
all current manual HTML, interface scripts, and styles; together they total
382,644 bytes, compared with 23,714,176 bytes for the original full files
(about 98.4% less font data for the static manual). Rare characters in live
discussions load additional subsets of up to 1,024 mapped characters each.
All 92 subsets are bundled, so this works offline too. No Google Fonts
requests are made. Characters outside the original fonts use system fallbacks.

## Rebuilding and checking

From the repository root, using Python 3.10+:

```console
python -m pip install -r tools/font-requirements.txt
python tools/build-fonts.py
python tools/build-fonts.py --check
node tools/check-pages.cjs
```

Rebuild after changing manual text, localized interface strings, or source
fonts. Commit the generated WOFF2 files and `cantonese-fonts.css` together.
The checker validates every subset's CSS range against its character map,
rejects overlapping ranges, verifies full source coverage, and checks that
the common subsets cover the current manual text. Building needs no network
once the two Python dependencies are installed. Normal reading and deployment
use the committed outputs and require no Python tooling.

Both families contain Regular only. Browsers synthesize bold and italic where
requested by the existing manual styles.

Upstream projects:

- [Cactus Classical Serif](https://github.com/MoonlitOwen/CactusSerif)
- [Chocolate Classical Sans](https://github.com/MoonlitOwen/ChocolateSans)

Both fonts use the SIL Open Font License 1.1; see `OFL.txt`. The Chocolate
installation carries a 2025 copyright notice; the Google Fonts distribution
also credits 2024. The upstream Cactus license spells its copyright project
name “Caactus”; that notice is reproduced as supplied.

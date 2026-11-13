# Cantonese manual fonts

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

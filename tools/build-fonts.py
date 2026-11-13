"""Build offline WOFF2 subsets. Requires fonttools[woff] (FontTools + Brotli)."""
from pathlib import Path
import re
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
MANUAL = ROOT / 'docs/manual'
SOURCES = ROOT / 'tools/font-sources'
OUTPUT = MANUAL / 'assets/fonts'
START = '/* BEGIN GENERATED CANTONESE FONTS */'
END = '/* END GENERATED CANTONESE FONTS */'
FAMILIES = [('Chocolate Classical Sans', 'ChocolateClassicalSans-Regular'),
            ('Cactus Classical Serif', 'CactusClassicalSerif-Regular')]


def ranges(points):
    """Compact contiguous codepoints into CSS unicode-range values."""
    result = []
    for point in sorted(points):
        if result and point == result[-1][1] + 1:
            result[-1][1] = point
        else:
            result.append([point, point])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in result)


def common_characters():
    # Include every edition and generated interface string, as Cantonese pages
    # also contain technical Latin text and names from other languages.
    text = ''.join(p.read_text(encoding='utf-8') for p in sorted(MANUAL.iterdir())
                   if p.suffix in ('.html', '.js', '.css'))
    return set(map(ord, text)) | set(range(32, 127))


def check():
    css = (MANUAL / 'cantonese-fonts.css').read_text(encoding='utf-8')
    common = common_characters()
    for family, stem in FAMILIES:
        with TTFont(SOURCES / f'{stem}.woff') as source:
            expected = set(source.getBestCmap())
        seen = set()
        paths = list(OUTPUT.glob(f'{stem}-*.woff2'))
        for path in paths:
            match = re.search(re.escape(path.name) + r"'\).*?unicode-range:([^}]+)", css)
            assert match, f'{path.name} missing from CSS'
            points = set()
            for item in match[1].split(','):
                limits = item.removeprefix('U+').split('-')
                points.update(range(int(limits[0], 16), int(limits[-1], 16) + 1))
            assert not points & seen, f'{path.name} has overlapping ranges'
            seen |= points
            with TTFont(path) as font:
                assert font.flavor == 'woff2', path.name
                assert points <= set(font.getBestCmap()), f'{path.name} is missing glyphs'
                if path.name.endswith('-common.woff2'):
                    assert common & expected <= points, 'Rebuild fonts for new manual text'
        assert expected == seen, f'{family} character coverage differs from source'
        print(f'{family}: verified {len(paths)} subsets and all {len(expected):,} mapped characters')


def main():
    common = common_characters()
    css = []
    generated = set()
    for family, stem in FAMILIES:
        source = SOURCES / f'{stem}.woff'
        with TTFont(source) as font:
            supported = set(font.getBestCmap())
        groups = [('common', supported & common)]
        # Retain the complete original character coverage for live discussions.
        # Small, disjoint fallback ranges load only when those characters occur.
        remaining = sorted(supported - common)
        groups += [(f'extra-{i // 1024:02d}', set(remaining[i:i + 1024]))
                   for i in range(0, len(remaining), 1024)]
        for name, points in groups:
            options = subset.Options()
            options.flavor = 'woff2'
            options.recalc_timestamp = False
            # Preserve copyright/license records and original family names.
            options.name_IDs = ['*']
            options.name_legacy = True
            options.name_languages = ['*']
            options.drop_tables += ['meta']
            with TTFont(source, recalcTimestamp=False) as font:
                builder = subset.Subsetter(options=options)
                builder.populate(unicodes=points)
                builder.subset(font)
                font.flavor = 'woff2'
                filename = f'{stem}-{name}.woff2'
                generated.add(filename)
                font.save(OUTPUT / filename)
                # Ensure no original mapped character is lost in conversion.
            with TTFont(OUTPUT / filename) as output:
                assert points <= set(output.getBestCmap()), filename
            css.append(f"@font-face{{font-family:'{family}';src:local('{family}'),"
                       f"url('assets/fonts/{filename}') format('woff2');"
                       'font-weight:400;font-style:normal;font-display:swap;'
                       f'unicode-range:{ranges(points)}}}')
        size = sum((OUTPUT / f'{stem}-{name}.woff2').stat().st_size for name, _ in groups)
        print(f'{family}: {len(supported):,} characters, {len(groups)} subsets, '
              f'{size:,} bytes total; common subset: '
              f'{(OUTPUT / (stem + "-common.woff2")).stat().st_size:,} bytes')
    # Remove only obsolete generated subsets inside the known output directory.
    for _, stem in FAMILIES:
        for path in OUTPUT.glob(f'{stem}-*.woff2'):
            if path.name not in generated:
                path.unlink()
    (MANUAL / 'cantonese-fonts.css').write_text(
        START + '\n' + '\n'.join(css) + '\n' + END + '\n', encoding='utf-8')
    check()


if __name__ == '__main__':
    check() if '--check' in sys.argv else main()

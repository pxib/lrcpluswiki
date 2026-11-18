from pathlib import Path
import runpy
import unittest


import_sidebar_links = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / 'tools' / 'import-app-manual.py')
)['import_sidebar_links']


class ManualSidebarTest(unittest.TestCase):
    def test_adds_app_links_in_order_and_keeps_wiki_navigation(self):
        app = (
            '<aside><nav><a href="#playback">Playback</a>'
            '<a href="#practice">練習</a><a href="#sleep-timer">スリープタイマー</a>'
            '<a href="#missing">Missing page</a><h2>Lyrics</h2>'
            '<a href="#readings">Readings</a></nav></aside>'
        )
        wiki = (
            '<aside><nav><a href="#installation">Installation</a>'
            '<a href="#playback">Music and playback</a><h2>Lyrics</h2>'
            '<a href="#pronunciation">Pronunciation</a>'
            '<a href="#readings">Readings</a></nav>'
            '<nav><a href="ja.html">Japanese</a></nav></aside>'
        )
        imported = {'playback', 'practice', 'sleep-timer', 'readings'}
        built = import_sidebar_links(app, wiki, imported)
        self.assertEqual(built, wiki.replace(
            'Music and playback</a>',
            'Music and playback</a>\n      <a href="#practice">練習</a>'
            '\n      <a href="#sleep-timer">スリープタイマー</a>',
        ))
        self.assertEqual(import_sidebar_links(app, built, imported), built)


if __name__ == '__main__':
    unittest.main()

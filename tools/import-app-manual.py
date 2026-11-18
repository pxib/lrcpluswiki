"""Build the shared articles into a staging copy of the online wiki."""

import argparse
from hashlib import sha256
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit, urlunsplit


EDITIONS = ('index.html', 'ja.html', 'ko.html', 'yue.html')
WIKI_ARTICLES = {'main', 'article-index'}
EXTRA_SECTIONS = {
    'playback': {'playback-library-search', 'playback-saved-playlists'},
    'finding-lyrics': {'finding-lyrics-history'},
    'readings': {'readings-kana-guide'},
    'plugin-ytdlp-import': {'plugin-ytdlp-import-lyrics', 'plugin-ytdlp-import-queue'},
}
HEADINGS = re.compile(r'<h2\b[^>]*\bid="([^"]+)"[^>]*>', re.I)
RESOURCE = re.compile(r'''(\s(?:href|src)\s*=\s*)(["'])(.*?)\2''', re.I)


class Articles(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.offsets = [0, *(match.end() for match in re.finditer('\n', text))]
        self.articles = {}
        self.current = None
        self.template_depth = 0
        self.feed(text)
        self.close()
        if self.current is not None:
            raise ValueError('Unclosed article')

    def source_position(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag == 'template':
            self.template_depth += 1
        if tag != 'article' or self.template_depth:
            return
        attrs = dict(attrs)
        article_id, title = attrs.get('id'), attrs.get('data-title')
        if self.current or not article_id or not title or article_id in self.articles:
            raise ValueError(f'Invalid or duplicate article: {article_id}')
        self.current = article_id, title, self.source_position()

    def handle_endtag(self, tag):
        if tag == 'template':
            self.template_depth -= 1
        if tag == 'article' and not self.template_depth and self.current:
            article_id, title, start = self.current
            self.articles[article_id] = (title, start, self.source_position())
            self.current = None


def import_edition(app, wiki, fix_resources):
    app_articles = Articles(app).articles
    wiki_articles = Articles(wiki).articles
    if not WIKI_ARTICLES <= app_articles.keys() or not WIKI_ARTICLES <= wiki_articles.keys():
        raise ValueError('Both editions must have a main page and article index')

    replacements, new_articles, new_links = [], [], []
    for article_id, (title, start, end) in app_articles.items():
        if article_id in WIKI_ARTICLES:
            continue
        article = fix_resources(app[start:end].rstrip())
        if article_id in wiki_articles:
            _, wiki_start, wiki_end = wiki_articles[article_id]
            wiki_article = wiki[wiki_start:wiki_end]
            if article_id == 'getting-started':
                # Keep the wiki's link to its installation guide ahead of the first section.
                install = re.search(r'<p>(?:(?!</p>).)*href="#installation".*?</p>', wiki_article, re.S)
                first_heading = HEADINGS.search(article)
                if install and first_heading and 'href="#installation"' not in article:
                    start_heading = first_heading.start()
                    article = article[:start_heading] + install[0] + '\n' + article[start_heading:]
            app_headings = {match[1] for match in HEADINGS.finditer(article)}
            wiki_headings = list(HEADINGS.finditer(wiki_article))
            for heading, next_heading in zip(wiki_headings, [*wiki_headings[1:], None]):
                if heading[1] in EXTRA_SECTIONS.get(article_id, ()) and heading[1] not in app_headings:
                    boundary = next_heading.start() if next_heading else len(wiki_article)
                    article += '\n' + wiki_article[heading.start():boundary].rstrip()
            replacements.append((wiki_start, wiki_end, article + '\n'))
        else:
            new_articles.append(article + '\n</article>\n')
            new_links.append(f'<li><a href="#{escape(article_id)}">{escape(title)}</a></li>')

    _, index_start, index_end = wiki_articles['article-index']
    index = wiki[index_start:index_end]
    if new_articles:
        if '</ul>' not in index:
            raise ValueError('Missing article list in wiki index')
        index = index.replace('</ul>', ''.join(new_links) + '</ul>', 1)
        replacements.append((index_start, index_end, index))
        replacements.append((index_start, index_start, ''.join(new_articles)))
    for start, end, article in sorted(replacements, reverse=True):
        wiki = wiki[:start] + article + wiki[end:]
    return wiki


def build(app_root, wiki_manual):
    app_manual = app_root / 'docs' / 'manual'
    outputs = {}

    def fix_resources(article):
        def rewrite(match):
            url = urlsplit(match[3])
            if url.scheme or url.netloc or not url.path:
                return match[0]
            source = (app_manual / unquote(url.path)).resolve()
            if not source.is_relative_to(app_root) or not source.is_file():
                raise ValueError(f'Missing app manual resource: {match[3]}')
            target = 'assets/app-manual/' + source.relative_to(app_root).as_posix()
            outputs[target] = source.read_bytes()
            published_url = urlunsplit(('', '', quote(target), url.query, url.fragment))
            return f'{match[1]}{match[2]}{published_url}{match[2]}'

        return RESOURCE.sub(rewrite, article)

    for name in EDITIONS:
        try:
            outputs[name] = import_edition(
                (app_manual / name).read_text(encoding='utf-8'),
                (wiki_manual / name).read_text(encoding='utf-8'),
                fix_resources,
            ).encode('utf-8')
        except ValueError as error:
            raise ValueError(f'{name}: {error}') from error

    digest = sha256()
    for name, data in sorted(outputs.items()):
        digest.update(name.encode('utf-8') + b'\0' + sha256(data).digest())
        target = wiki_manual / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return digest.hexdigest()


if __name__ == '__main__':
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument('app_checkout', type=Path)
    command.add_argument('staged_wiki_manual', type=Path)
    args = command.parse_args()
    print(build(args.app_checkout.resolve(), args.staged_wiki_manual.resolve()))

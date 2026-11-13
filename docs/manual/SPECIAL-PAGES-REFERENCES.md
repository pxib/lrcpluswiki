# Special pages design references

The special-page UI is a local adaptation of **Vector legacy (2010)** and MediaWiki's account tools. It is not a MediaWiki installation or a reconstruction of a particular historical Wikipedia screenshot.

References inspected on 2026-11-13:

- [Vector documentation](https://www.mediawiki.org/wiki/Skin:Vector) identifies the legacy skin separately from Vector 2022.
- [Vector legacy screen layout source](https://github.com/wikimedia/mediawiki-skins-Vector/blob/master/resources/skins.vector.styles.legacy/layouts/screen.less) specifies the 10em sidebar, 11em desktop content offset at 982px, 5em header, joined tab/content border, and full-width content. The existing shared page frame already follows these rules.
- [MediaWiki account form source](https://github.com/wikimedia/mediawiki/blob/master/resources/src/mediawiki.special.userlogin.common.styles/userlogin.less) uses a constrained login form and full-width submit controls. Blue primary account buttons are retained; changing every button to a small gray control would not follow this reference.
- [Related account-link styles](https://github.com/wikimedia/mediawiki/blob/master/resources/src/mediawiki.special.userlogin.common.styles/skinStyles.less) center related links within the form column.
- [Help:Preferences](https://www.mediawiki.org/wiki/Help:Preferences) describes a user-profile section and horizontal tabs for other settings. Our two functional groups are User profile (including email changes) and Password and security (including other-device sign-out).
- [Help:Special pages](https://www.mediawiki.org/wiki/Help:Special_pages) describes a grouped directory linked from the sidebar, human-readable headings without a Special: prefix, and restricted tools. The local directory lists existing account tools and moderation, with the staff requirement stated explicitly. The A–Z article index is a regular manual page and remains in normal navigation only.

The source links above point to the inspected current sources, including the explicitly maintained legacy Vector layout. Attempts to retrieve MediaWiki 1.35 form source and live Wikipedia special pages were unsuccessful; no exact 1.35 visual match is claimed.

Local adaptations:

- Utility pages have a shorter manual navigation menu. Return-to-manual is a normal link above the page heading, leaving one Special page namespace tab.
- Preferences keeps separate submit buttons because each existing account operation has its own validation and authentication requirements. Tabs support arrow keys, Home, End, and ordinary Tab navigation.
- Moderation has no exact MediaWiki-core counterpart here. Its filter fieldset and compact report list follow the utility-page idiom; usernames link to the public user pages. Existing incremental loading and permission checks are retained.
- English, Japanese, Korean, and Cantonese share the same structure. Theme colors, narrow-screen reflow, and offline account notices remain supported.

Validation: the existing community suite checks account, settings, moderation, permissions, and offline behavior. `tests/special-pages.cjs` checks directory routing, language/return links, and preferences keyboard behavior. Browser rendering could not be checked because the Browser execution tool was unavailable in this session.

# Changelog

Notable changes to canopy-page. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `settings.json` contract is what consuming projects plan their upgrades around, so changes
to it — its fields, its validation, and what the checks reject — are what this file is about.

## [Unreleased]

### Fixed

- **A site file where the build writes a file of its own is refused.** `check` and `build` now
  name any site file that would land on a path the build writes: canopy's `tokens.css` and
  `styles.css`, the math stylesheet and fonts, `search-index.json`, a page's `.html`, a stream
  section's generated index, a section's `feed.xml`, and `sitemap.xml` (with `siteUrl`). Before,
  only `assets/stylesheet-1.css` was checked, and the rest replaced each other silently — a
  `styles` entry named `tokens.css` dropped canopy's design tokens. Rename the file the error
  names.
- **A site's own `robots.txt` is kept.** With `siteUrl`, the build used to overwrite it; it is now
  published as written, and the build writes one only for a site that has none.
- An `exclude` entry naming a dot-file (`.source-index.json`) is no longer warned about as
  matching nothing: such files are never published, so the entry is redundant, not wrong.
- A table wider than the screen scrolls within itself instead of pushing the page sideways.

### Added

- Every page opens with a "Skip to content" link for keyboard readers.
- `check` warns when `home` or `logo` is set but shows on no page — every page has a `header`
  region and none places the slot that would show it.

### Changed

- **The documentation is the site.** <https://iyulab.github.io/canopy-page> is canopy-page's one
  complete reference — every command and option, every settings field, every `check` finding,
  and the theming contract — built from `docs/` in the repository (previously `examples/site`).
  `docs/USAGE.md` is gone; everything it said is on the site. The error-messages page is now
  [What check reports](https://iyulab.github.io/canopy-page/reference/check.html), and its old
  address (`reference/error%20messages.html`) no longer exists. The npm package's homepage is the
  site.

## [0.22.0] — 2026-10-04

### Added

- **Stream sections.** `"profile": "stream"`, on a section or on the whole site, reads pages as
  dated posts, newest first by `date:` — one column, a lead from `description:`, the date and
  reading time, the contents open before the body — with an index listing them, written for the
  section when it has none. A stream section publishes a feed by default once `siteUrl` is set;
  `"feed": false` turns it off. A stream section takes no `order` or `items`.
- **Regions.** `regions` — on the site, or per section (`""` turns one off) — fills `head`,
  `header`, `beforeArticle`, `afterArticle` and `footer` with HTML fragments from the site.
  `header` and `footer` replace canopy-page's own with your markup; `<canopy-slot>` places the
  site title, home and back links, breadcrumb, language links, search and the theme toggle
  inside it, and `page:<key>` a page's own frontmatter text. Fragments are not published.
- `strings.readingTime` (`"{n} min read"`) and `strings.language`.
- `check` reports a missing fragment, a slot the build would refuse (including a self-closing
  one), a fragment link to nothing published, a page whose frontmatter cannot fill a page slot,
  undated pages in a stream section, and a site file at `assets/stylesheet-1.css`, where
  canopy-page writes its own stylesheet.

### Changed

- **Root-absolute links and `siteUrl`'s path.** When `siteUrl` places the site under a path
  (`https://example.com/blog`), a root-absolute link inside it (`/blog/a.html`) is checked as
  this site's own page and is an error when nothing is there; a link outside it (`/pricing`) is
  the host's and is no longer reported, unless this site publishes that path at its own root.
- The site title link carries `class="canopy-site-title"`. A site with no profile or regions
  looks the same; the only differences in its HTML are `data-canopy-profile` on `<html>` and
  that class.
- Upgraded to canopy 0.20.0.

## [0.21.0] — 2026-10-03

### Changed

- **Breaking: `tokens` is renamed `styles`, and takes a list.** `"styles": "brand.css"` or
  `"styles": ["brand.css", "layout.css"]`, linked in that order. Migration: rename the key — the
  value carries over unchanged. A settings file still naming `tokens` gets an error saying so.
- **A `styles` file is published, like `icon` and `logo`.** It used to be read at build time and
  left off the site; it is now published where it stands and linked there, so a relative `url()`
  inside it — a font, a background image — resolves exactly as written. A path that is missing or
  excluded is a `check` error.
- **A site's CSS wins at any specificity.** canopy's CSS (from canopy 0.19.0) and canopy-page's
  own search/outline/lightbox CSS now sit in cascade layers, and `styles` are linked after both,
  unlayered — so a `styles` rule restyles any region, not only the design tokens. canopy-page's
  own CSS is carried as its own stylesheet rather than inside canopy's token file.

### Added

- `check` reports a `styles` path that is not a published file (missing, or excluded).

### Fixed

- The search box reserves room for its `Ctrl+K` badge on wide screens, so typed text no longer
  runs under it. The reservation existed but was overridden by the input's own padding.
- **A site's dark-mode colours apply.** The documented dark override lost to canopy's own dark
  palette, so dark mode always showed the default accent. It now wins, and the documented form is
  corrected to follow the theme toggle as well: state dark values under
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and under
  `:root[data-theme="dark"] { … }` (see the README's `styles` section). A `styles` file using the
  old single dark block should change that block's selector to
  `:root:not([data-theme="light"])` and repeat its values under `:root[data-theme="dark"]`.

## [0.20.0] — 2026-10-03

### Added

- **`knownBroken`** — a baseline for adopting a site that is already broken. Each entry
  `{ "path": "<page | dir/* | dir/**>", "reason": "…" }` (reason required) lets the pages it names
  publish with their broken links and images reported as one warning per entry, naming the reason,
  instead of stopping the build. A broken reference on any other page is still an error. An entry
  that matches no page, or whose pages have nothing broken left, is reported for removal, so the
  baseline only shrinks. Previously a site with any broken reference could not be built at all
  until every one was fixed.

## [0.19.0] — 2026-10-03

### Added

- **An index page can list its series**, from canopy 0.18.0: `listing: true` in a page's
  frontmatter ends it with the pages beneath it, in sidebar order, each with its name, `date:` and
  own `description:`. Nothing to configure in `settings.json`.

### Changed

- Depends on `@iyulab/canopy` `^0.18.0`.

## [0.18.0] — 2026-10-03

### Added

- **`feed` on a section.** `"feed": true` publishes `<path>/feed.xml`, an Atom feed of the
  section's dated pages (frontmatter `date:`), newest first, linked from the section's pages for
  autodiscovery. Needs `siteUrl` — rejected without it, since a feed's links are absolute.
- **Dated pages**, from canopy 0.17.0: a page's `date:` is shown under its heading and stated in
  `<head>` (`article:published_time`, `article:modified_time` from `updated:`, schema.org
  `Article`). Undated pages are unchanged.
- **`check` warns about dates**: a `date:` or `updated:` that is not a date, and a page in a feed
  section with no `date:` (the section's index page excepted), which the feed would leave out.

### Changed

- Depends on `@iyulab/canopy` `^0.17.0`.
- A sitemap `<lastmod>` from `updated:` follows canopy's rule for what is a date. A value that
  merely starts like a date (`2026-09-28 sometime`) or names an impossible day no longer counts;
  the page falls back to its git date, and `check` names the value.

## [0.17.0] — 2026-09-28

### Changed

- **Requires `@iyulab/canopy` 0.16.0** (its `--nav` `derive`/`unplaced` and exported link
  functions).
- **Section leftovers are placed by canopy, not by a copy of its rules.** Whatever a section
  does not list is now derived by canopy itself (its `--nav` `derive`), and pages no section
  covers are appended by canopy (`unplaced: "append"`) — the navigation derivation canopy-page
  used to restate is gone. The sidebar a settings file produces is unchanged, with one
  exception: pages outside every section, appended after the sections and reported as orphans,
  are now ordered by page title like any derived navigation rather than by file name.
- **`check` resolves links with canopy's own functions.** Where a markdown link points —
  what counts as external, percent-decoding, `..` against the linking page — is now decided by
  the functions the renderer itself calls, instead of a restated copy that had already lagged a
  canopy release once. One visible consequence: a link written with a backslash
  (`guide\install.md`) is now reported, because the renderer never treated `\` as a directory
  separator and publishes that link broken; the check used to accept it.

### Removed

- **`isExternalUrl` is no longer re-exported** from canopy-page's library entry point. It is
  canopy's rule; import it from `@iyulab/canopy`.

## [0.16.0] — 2026-09-28

### Changed

- **Requires `@iyulab/canopy` 0.15.0.** A site with no `sections` now gets canopy's corrected
  derived navigation: the root `index.md` is the first sidebar entry and opens the prev/next
  reading order, instead of sorting after every folder and ending it.
- **`check` and `build` read one file list, and it is canopy's.** The files a site publishes are
  now listed by `canopy list` — the renderer's own walk — rather than by a second copy of its
  exclusion rules kept here. The copy had already drifted: canopy stopped publishing hidden
  *files* (`.env`, `.gitignore`) while `check` still counted them. Loading a site now starts one
  short-lived canopy process. Unused-`exclude` warnings are unchanged.

### Fixed

- **`canopy-page --help` and `canopy-page --version` succeed.** Both printed the usage text
  followed by `Expected a command before "--help"` and exited 1. `--help`/`-h` (also after a
  command, as in `canopy-page build --help`) prints the usage to stdout and `--version` prints
  the installed version, each exiting 0.

## [0.15.0] — 2026-09-17

### Added

- **`sitemap.xml` entries now carry `<lastmod>`.** A page's own frontmatter `updated:` date wins
  when it names one; otherwise it is the last git commit date of that page's source markdown.
  A page with no source file (canopy's synthetic root `index.html`) or with an untracked source
  is written without the element rather than with a guessed date. On a shallow clone — where an
  untouched page would falsely report the clone's boundary date, indistinguishable from every
  other untouched page — `<lastmod>` is withheld from the whole sitemap, and the build warns why.

## [0.14.0] — 2026-09-17

### Added

- **`siteUrl` now reaches the pages, not just the sitemap.** It is passed to canopy as
  `--site-url`, so every page carries `<link rel="canonical">` and `og:url` naming its one
  address — by exactly the string the sitemap lists it under, since both now come from canopy's
  own `pageUrl()` rule rather than two copies of it. A page's frontmatter `description:` fills
  its own `<meta name="description">` (the site's stays the fallback), and the Open Graph basics
  ride on every page with or without `siteUrl`. Body links stay relative either way.
- **`previewImage`** — the image link previews show (`og:image`) for any page whose frontmatter
  has no `image:` of its own. Validated like `icon`/`logo` (a published file), and rejected
  without `siteUrl`, since the tag has to be absolute.
- **`alternates`** — the site's other language editions, `hreflang` → that edition's own site
  URL (`x-default` allowed). Each page lists its counterpart at the same path under every
  edition, its own first, as `hreflang` links in `<head>` and as `xhtml:link` entries in
  `sitemap.xml`. Rejected without `siteUrl`.
- **`check` warns about pages with no `description:` of their own once `siteUrl` is set** — one
  warning naming them all, never an error. A public site's pages otherwise present one
  identical summary in every search result, and `siteUrl` is the setting that says the site is
  public.

### Changed

- **Sidebar redesign, via canopy 0.13.0** — rows with padding, a hover surface and a focus
  ring; the group chevron moves to the row's trailing edge so labels at one depth share a left
  edge; nested lists carry a guide line. Two new tokens, `--sidebar-hover-bg` and `--sp-1`. A
  `tokens` file that styled `.canopy-nav-group > summary::before` should target `::after`.

## [0.13.0] — 2026-08-22

### Added

- **Upgraded to canopy 0.12.0** — an external-link icon on `home` when it points outside the
  site, a scroll-edge shadow on code blocks wider than the viewport, and the on-page outline now
  shows its own label instead of only an `aria-label`. See
  [canopy's own changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#0120--2026-08-22)
  for details.
- **A `Ctrl K`/`⌘K` badge on the search box**, so the keyboard shortcut that already worked has
  something telling a reader it exists. Hidden once the box has focus, and on narrow viewports
  where the box collapses to an icon and a shortcut is unlikely to matter anyway.
- **`check` warns about a filename that needs percent-encoding in its own URL** — a stray space
  or other ASCII character outside a URL's unreserved set, most often. The page still publishes
  correctly (a static host serves the encoded URL fine), so this is a warning, not an error;
  ignore it if the encoding is intended. Blind to non-ASCII on purpose: a Korean, Japanese, or
  any other non-English filename needs encoding too, but that's the language, not a mistake.

## [0.12.0] — 2026-08-22

### Added

- **Content images open full-size in a lightbox on click**, closing on a background click,
  <kbd>Esc</kbd>, or its close button. An image already wrapped in a link to its own file — a
  common workaround for the lack of a zoom before this — still opens the lightbox first; a
  middle click or a modifier-held click on it still follows the link, for a reader who wants the
  file itself.

## [0.11.2] — 2026-08-18

### Changed

- **Upgraded to canopy 0.11.2** — `**` emphasis now closes correctly when a CJK character
  follows it with no space (a Chinese, Japanese, or Korean particle or full-width punctuation
  mark sitting flush against the closing marker), instead of surviving into the rendered page as
  literal asterisks. See
  [canopy's own changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#0112--2026-08-18)
  for details.

## [0.11.1] — 2026-08-17

### Changed

- **Upgraded to canopy 0.11.1** — the sidebar's current-page highlight now fills the row instead
  of just the label text, and the mobile topbar no longer stacks three separate rows of chrome
  (breadcrumb dropped, search collapses to its icon and expands while focus stays inside the
  search form) before a reader reaches the page. See
  [canopy's own changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#0111--2026-08-17)
  for the full list.

## [0.11.0] — 2026-08-17

### Added

- **`strings.breadcrumb`**, overriding the accessible label of the topbar's new ancestor-trail
  nav (canopy 0.11.0). Rides the same validated `strings` object every other reader-chrome
  override already does.

### Changed

- **Upgraded to canopy 0.11.0** — collapsible sidebar groups and the breadcrumb trail (above),
  a stronger sidebar current-page tint, a placeholder and icon on the search input, styled
  topbar links, and the on-page outline now following the article instead of preceding it. See
  [canopy's own changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#0110--2026-08-17)
  for the full list.

### Fixed

- **The mobile nav no longer opens on every page load.** canopy's shell ships the site
  navigation as `<details open>` unconditionally — the one default that works with no script at
  all — but on a narrow viewport, that meant a reader landed on a full navigation (rendered as a
  full-screen overlay by canopy's own mobile styling) in front of the article they followed a
  link to read, every single page. canopy-page's script now closes it by default on a narrow
  viewport and remembers a reader's own choice to leave it open for the rest of that browser
  session. A wide viewport, and a build with no script attached, are unaffected.

## [0.10.0] — 2026-08-11

### Added

- **New `watch` command.** `canopy-page watch [site-dir] [-o out] [--port n]` builds once, then
  rebuilds on every source change and serves the result on `http://localhost:<port>/` (default
  `8080`, refused if already taken rather than silently moved). A failed rebuild is reported on
  the console and leaves the last successful build being served — the process itself never exits
  on a broken save.

## [0.9.0] — 2026-08-11

### Added

- **`check` warns when a section's sidebar heading falls back to a raw directory name.** A
  section with no `label` and no index page was already published this way — the fallback
  itself is sound — but silently: the directory name it falls back to is a filesystem detail,
  not a name an author chose, and there was previously no way to find out a sidebar's top-level
  heading was about to read that way instead. `check`/`build` now report it as a warning (the
  build still succeeds) naming the section and the label it fell back to.

### Changed

- **Upgraded to canopy 0.10.0**, the release the heading custom-id syntax, the sidebar
  active-page tint, and page-content typography build on.

## [0.8.0] — 2026-08-11

### Added

- **`strings` gains `indexTitle`, `backlinks`, and `searchFailed`.** The `strings` field
  covered the reader chrome's search/theme-toggle/navigation text, but three more reader-facing
  literals stayed hardcoded English regardless of `lang` and `strings`: the auto-generated
  contents page's title/heading (`indexTitle`), a page's "Linked references" section heading
  (`backlinks`), and the client search's failure message (`searchFailed`). All three follow the
  same pattern as the existing five keys — optional override, English default when unset.
- **`$schema` support.** A settings file can now name
  [`settings.schema.json`](https://iyulab.github.io/canopy-page/settings.schema.json), hosted
  at that fixed URL, so an editor offers completion and inline validation for every field —
  canopy-page itself already read and ignored this key, unvalidated.

### Changed

- **Upgraded to canopy 0.9.0**, the release `indexTitle` and `backlinks` build on.

## [0.7.0] — 2026-08-09

### Added

- **A `strings` field** overriding the reader chrome's own built-in text — search, the theme
  toggle, and the navigation landmarks. `lang` only ever changed what `<html lang>` declares;
  this text is canopy's own UI, not vault content, so it stayed English regardless. No built-in
  translation table, the same reasoning `home.label` already follows. Threaded to canopy as a
  JSON `--strings` flag.
- **`check` warns about a root-absolute reference that resolves today but would only be correct
  if the site is served from the domain root**, whenever `siteUrl` already declares a non-root
  mount path — reusing the one signal a settings file already carries about where the site is
  served from, rather than requiring a new field.

### Changed

- **`home.url` no longer requires an absolute http(s) URL.** A relative one (a sibling of the
  published site, at the same origin) is now resolved against each page's depth, the same as
  every other internal link canopy writes — useful when the site is mounted at a sub-path whose
  absolute origin differs between environments.
- **Upgraded to canopy 0.8.0**, the release the relative `home.url` and `strings` support build on.

### Fixed

- **A `siteUrl` missing its host (`"http://"` alone, for instance) no longer crashes `check`.**
  Only the scheme was validated, so `new URL()` threw on the rest and took the whole check run
  down with it; a `siteUrl` that fails to parse is now treated as absent for the sub-path warning,
  leaving `sitemapXml` to report the malformed value on its own terms.

## [0.6.0] — 2026-08-09

### Added

- **A `rehypePlugins` field**, naming installed rehype plugin packages to run on every page —
  canopy's fixed extension point (after sanitize, before syntax highlighting) for markdown that
  needs more than CommonMark and GFM, a diagram fence rendered to SVG being the case this exists
  for. This site's own [guide to diagrams](https://iyulab.github.io/canopy-page/guide/writing/diagrams.html)
  demonstrates it end to end, with [declart](https://github.com/iyulab/declart) rendered at build
  time through `rehype-declart`.

### Changed

- **Upgraded to canopy 0.7.0**, the release `rehypePlugins` builds on. See
  [canopy's changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#070--2026-08-09)
  for the plugin's fixed position and how it interacts with sanitizing and highlighting.

## [0.5.0] — 2026-08-09

### Added

- **Search, wired up.** Every build now carries a search box in the top bar, a `Ctrl+K` /
  `Cmd+K` shortcut to jump to it, and an on-page outline that highlights the section currently
  in view while scrolling — all with no `settings.json` field to turn on, and all inert if a
  reader's browser has scripts disabled.
- **A dark/light toggle**, riding in the same script bundle. Remembers a reader's choice across
  visits; without a stored choice, follows the system preference exactly as before.

### Changed

- **Upgraded to canopy 0.6.0.** The current page's sidebar entry is now highlighted, a reader
  landing partway down a page can flip `data-theme` by hand, mobile navigation opens as a
  full-screen panel instead of pushing the page down, an unlabeled or unrecognized code fence
  highlights as plain text instead of falling back unstyled, and every page gains previous/next
  links to its neighbors in the sidebar order — all on the next build, no `settings.json` field
  changed. See
  [canopy's changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#060--2026-08-09)
  for the underlying markup and CSS selector changes.

## [0.4.0] — 2026-08-08

### Changed

- **Upgraded to canopy 0.4.0.** A site's on-page outline now stays pinned to the viewport while
  scrolling, matching the sidebar, and every page fits a narrow screen without scrolling
  horizontally — both fixes apply automatically on the next build, no `settings.json` field
  changed. Canopy also gained `--search-index`, which canopy-page does not call yet — a site
  built with this version carries no search index or search UI. See
  [canopy's changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#040--2026-08-08)
  for the full set of changes.

## [0.3.0] — 2026-08-08

### Changed

- **Upgraded to canopy 0.3.0.** A site that sets `title`, `logo`, or `home` now gets a full-width
  top bar above the sidebar/main layout on its next build, rather than that content living in the
  sidebar's own header — no `settings.json` field changed, the new layout applies automatically.
  See [canopy's changelog](https://github.com/iyulab/canopy/blob/main/CHANGELOG.md#030--2026-08-08)
  for the underlying markup and CSS selector changes, relevant to a site with custom CSS layered
  over the default stylesheet.

## [0.2.0] — 2026-08-07

### Added

- `tokens`: a CSS file of design-token overrides, relative to the settings file. It is appended
  after the renderer's own tokens rather than replacing them, so a file naming one custom
  property keeps every other default. It is configuration rather than content, so it is excluded
  from the published site automatically — the same file does not ship twice
- `logo` and `home`: a site can now say what makes a documentation set read as part of the
  product it belongs to. `logo` is an image shown beside the site title and must be a published
  file, the opposite direction from `tokens`. `home` is a link back to the surrounding site —
  `{ url, label }`, both required together, since naming half of it is not a valid setting. There
  is no default `label`, because link text has to be written in the site's own language
- `siteUrl`: an absolute URL naming where the built site will stand. Every link the renderer
  writes is relative, which is what lets a site be served from any sub-path — and exactly why a
  sitemap, whose entries must be absolute, needs this stated separately. Setting it makes `build`
  write `sitemap.xml` and a `robots.txt` pointing at it; leaving it unset writes neither

## [0.1.0] — 2026-08-07

First release. Development before it is recorded here in one block rather than reconstructed as
versions that never shipped.

### Added

- `settings.json`: one file beside the markdown holding everything a site needs to build. Every
  field is an override, so `{}` is valid and a folder of markdown builds with navigation derived
  from its folder tree. Fields: `title`, `description`, `lang`, `icon`, `exclude`, `sections`
- Strict, positional validation. An unknown key is rejected rather than ignored, since a mistyped
  one that is quietly dropped presents as a tool disobeying its configuration, and every message
  names the position it is about (`sections[0].items[1]`). Paths are normalized and refused if
  they leave the site, at the setting that named them rather than later at a missing file
- `sections`: ordered regions of one site — a guide, a release log — with `label`, `order`
  (`asc`/`desc`), or an explicit `items` list. Entries are page paths or nested groups, written
  with or without an extension; `dir/*` and `dir/**` expand to the pages there that are not
  placed already, so `["guide/install", "guide/*"]` reads as "this page first, then the rest".
  Pages no section mentions are placed inside their own section and reported, rather than left
  unreachable
- `canopy-page build [site-dir] [-o out]`: checks the site, then publishes it in one pass, so
  links and backlinks resolve across the whole of it
- `canopy-page check [site-dir]`: the same checks without building — a settings reference
  matching no page, a page placed twice, a link pointing at nothing published, an image that is
  not there, a wikilink matching no page (which renders as plain text rather than as a broken
  link, so the message says so). Findings name the page and line. Non-zero exit on any error,
  which is its whole contract with a pipeline
- Warnings, which are reported without stopping a build: a root-absolute reference
  (`/assets/logo.png`) with nothing published at that path, and an `exclude` pattern that matched
  nothing. Where a root-absolute path resolves depends on what the site is served from, so it
  cannot be called an error — but a site served from its own root is the ordinary case, and the
  `public/`-style folder other generators map onto the root does not exist here, so such
  references silently 404. An exclusion written from the wrong place — `_archive` for what is
  really `docs/_archive` — leaves the folder published while the file reads as though it does not.
  Extension patterns are left alone: `*.tmp` in a site with no scratch files states a rule about
  what may never ship, not a claim that something is there
- `canopy-page init [site-dir]`: a settings file naming the site after its folder, and a home
  page when there is nothing to publish yet. It never replaces an existing settings file, and
  writes no page into a folder that already holds markdown

### Notes

- A page is shown under the name canopy gives it — its frontmatter `title`, else the heading it
  opens with, else its filename — and a section whose directory holds an index page is named by
  that page. No `label` is written for those, because writing one would override the document's
  own name with a directory name every time. `label` remains for the cases the documents cannot
  answer, and still wins when written
- A reference target is percent-decoded before it is resolved, so `a%20b/note.md` and
  `<a b/note.md>` are checked as the one document they address. Editors write the first form on
  their own for any path containing a space — and this checker's own advice for a destination
  that stops at a space is to write the space as `%20`, which it would otherwise have rejected.
  Decoding is per segment, so `%2F` stays a character inside a name; a malformed escape leaves
  the reference alone, which is what the renderer does with it
- Canopy is driven through its command line rather than its library API: it is the same door
  every other consumer uses, and a door only stays wide enough if the people who could have gone
  around it do not
- References inside fenced or inline code are not checked — a fenced example of a broken link is
  documentation, not a broken link
- The settings file is never published. A file of the same name deeper in the site is content,
  and ships
- The exclusion dialect is four shapes and no more: a directory, that directory and everything
  beneath it, an extension at any depth, and one exact path. A pattern outside it — `images/*.md`
  — is refused at validation rather than left to match nothing, which is the answer an unknown key
  gets and for the same reason
- A link whose destination stops at a space is reported as that. An unbracketed destination ends
  at the first space, so `[x](../a b/c.md)` links `../a`, and naming the truncated target alone
  would describe something the author never wrote
- A section's heading links its own index page, so naming that page in `items` is not a second
  placement. A page the settings genuinely list twice still is
- A reference ending in `/` names a directory, and is answered by the index page that directory is
  entered by

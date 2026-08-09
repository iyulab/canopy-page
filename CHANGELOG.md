# Changelog

Notable changes to canopy-page. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `settings.json` contract is what consuming projects plan their upgrades around, so changes
to it — its fields, its validation, and what the checks reject — are what this file is about.

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

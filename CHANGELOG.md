# Changelog

Notable changes to canopy-page. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `settings.json` contract is what consuming projects plan their upgrades around, so changes
to it — its fields, its validation, and what the checks reject — are what this file is about.

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

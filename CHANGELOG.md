# Changelog

Notable changes to canopy-page. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `settings.json` contract is what consuming projects plan their upgrades around, so changes
to it — its fields, its validation, and what the checks reject — are what this file is about.

## [Unreleased]

Found by running the checks over documentation sets large enough to have gone wrong in ordinary
ways: hundreds of pages, directory names with spaces, screenshots beside the pages that use them,
and references written by an editor rather than by hand.

### Added

- A root-absolute reference (`/assets/logo.png`) with nothing published at that path is now a
  warning. Where such a path resolves depends on what the site is served from, so it stays a
  warning — but a site served from its own root is the ordinary case, and a `public/`-style folder
  that other generators map onto the root does not exist here, so these references silently 404.
  A site whose images are all written that way reported nothing broken and shipped with none of
  them resolving
- An `exclude` pattern that matched nothing is now a warning. A pattern is relative to the settings
  file, and one written from the wrong place — `_archive` for what is really `docs/_archive` —
  left the folder published while the file read as though it did not. Extension patterns are left
  alone: `*.tmp` in a site with no scratch files states a rule, not a claim

### Changed

- An `exclude` pattern outside the dialect that is implemented — `images/*.md`, `guide/*` — is
  refused at validation instead of matching nothing, which is the answer an unknown key already
  gets and for the same reason
- A link whose destination stops at a space says so, instead of reporting the truncated path.
  An unbracketed destination ends at the first space, so `[x](../a b/c.md)` links `../a` and the
  message named a target the author never wrote
- Naming a section's own index page in its `items` is no longer "placed more than once". The
  section heading links that page, and a glob already reached the same conclusion by skipping it;
  an explicit mention is the same request spelled out. A page the settings genuinely list twice is
  still reported
- A reference ending in `/` names a directory and is answered by that directory's index page,
  rather than reported as a missing file
- Pages no section covers are listed one per line. On a real site that list runs to dozens, and
  joined onto one line it was a wall nobody read to the end of
- `check` closes with the number of warnings when there are any, since "nothing broken" under a
  screen of warnings reads as a contradiction

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

---
description: "Every canopy-page command and option: init, check, build and watch, what each prints, and the exit code it leaves with."
---
# Commands

```
canopy-page <command> [site-dir] [options]
```

| Command | What it does |
|---|---|
| `canopy-page init [site-dir]` | Start a site: write a settings file, and a home page if the folder holds no markdown yet |
| `canopy-page check [site-dir]` | Check the settings and every reference; build nothing |
| `canopy-page build [site-dir] [-o out]` | Run the same checks, then publish the site to `out` |
| `canopy-page watch [site-dir] [-o out] [--port n]` | Build, then rebuild on every change and serve the result locally |
| `canopy-page --help` · `--version` | Print the usage text, or the installed version |

`[site-dir]` is the folder holding `settings.json`, and defaults to the current directory. Every
path a settings file names is relative to that folder, never to where the command runs from.

## Options

| Option | For | Meaning |
|---|---|---|
| `-o <dir>`, `--out <dir>` | `build`, `watch` | Where the site is written. Defaults to `./site` |
| `--port <n>` | `watch` | The port the site is served on, `1`–`65535`. Defaults to `8080` |
| `-h`, `--help` | any | Print the usage text and leave with `0` |
| `--version` | any | Print `canopy-page <version>` and leave with `0` |

`--help` and `--version` are answered wherever they appear — `canopy-page build --help` prints
the usage text rather than building. When both are given, `--help` wins.

An option is accepted only by the commands that use it. `check --out dist` is refused rather than
ignored: whoever wrote it expects a site to appear somewhere, and `check` writes none. The same
goes for `--port` on anything but `watch`. An unknown option, an unknown command, an option where
the command belongs, or a second folder after the first are all refused with the usage text and
the reason, and exit code `1`. Running `canopy-page` with no command at all prints the usage text
and leaves with `1`.

## `init`

```sh
npx canopy-page init docs/site
```

Creates the folder if it does not exist, and writes a `settings.json` holding nothing but a
`title` taken from the folder's name — `product-help` becomes `Product help`. Every field is an
override, so nothing else needs saying until the site needs it; see [the settings
file](settings.md).

If the folder holds no markdown yet, `init` also writes an `index.md` home page so there is
something to build. A folder that already holds markdown gets no page: an existing set of
documents is being adopted, not started.

```
canopy-page: wrote /work/docs/site/settings.json
canopy-page: wrote /work/docs/site/index.md
canopy-page: run `canopy-page build` to publish it
```

`init` never replaces a settings file that is already there. Running it twice is usually a
mistake about which folder you are in, so it stops with an error and exit code `1` instead.

The written file carries no `$schema` line. Add one (see [`$schema`](settings.md#top-level-fields))
to have an editor complete and validate the file as you type.

## `check`

```sh
npx canopy-page check docs/site
```

Reads the settings file and every page, and reports what a reader would otherwise meet as a 404
or a missing image — without rendering anything, which is what keeps it fast enough to run first
in a pipeline. Each finding is printed as `error: …` or `warning: …`, naming the file and line it
is about; [What check reports](check.md) lists every one of them.

When nothing is broken it ends with a summary, which counts the warnings so that "nothing broken"
is never read as "nothing to look at":

```
canopy-page: 32 page(s) checked, nothing broken, 2 warning(s)
```

Leaves with `0` when nothing is broken — warnings or not — and `1` when anything is. See
[Exit codes](exit-codes.md) for what a pipeline does with that.

## `build`

```sh
npx canopy-page build docs/site -o dist/help
```

Runs exactly the checks `check` runs, on the same view of the site, and **writes nothing at all**
if any of them fails. A broken link cannot reach the published output by way of the build
skipping a check `check` would have caught.

Then it hands the whole site to [canopy](https://github.com/iyulab/canopy) in one pass, which
writes the pages, their assets, the search index and the scripts into the output folder:

```
canopy: 32 page(s), 5 asset(s) -> /work/dist/help
canopy-page: sitemap.xml with 32 page(s)
```

The second line appears when `siteUrl` is set: only then does `build` write `sitemap.xml` and a
`robots.txt` pointing at it (see [Where the site stands](settings.md#where-the-site-stands)). On a
shallow git clone it also warns that a page's last commit date cannot be trusted, and writes the
sitemap without `<lastmod>` rather than with a wrong one.

The output is a plain static site; [Deploying the output](../guide/deploying.md) shows where it
can go.

## `watch`

```sh
npx canopy-page watch docs/site
```

Builds once, serves the output at `http://localhost:8080/`, and rebuilds on every change to the
site folder:

```
canopy-page: watching docs/site, serving http://localhost:8080/
canopy-page: rebuilt
```

Reload the browser tab to see a rebuild; nothing is injected into the pages to do it for you. A
change to anything in the site folder triggers a rebuild — except the output folder, hidden
folders like `.git`, and `node_modules`.

A rebuild that fails reports why, prints `canopy-page: rebuild failed — serving the last
successful build`, and keeps serving that build: one broken save never stops the session. Only
the first build failing stops it, since there is nothing yet to serve.

The port is claimed before the first build runs. When it is already taken, `watch` stops at once
with `Port 8080 is already in use — pick another with --port.` rather than quietly choosing
another one. `Ctrl+C` stops it.

The server is a preview for one author on one machine: a folder is answered by its
`index.html`, hidden files are never served, and it is not meant to face the internet.

## When the site cannot be read

Every command but `init` starts by reading `settings.json`. A folder without one stops with
`error: no settings.json in <folder>`, and a settings file that is not valid stops with the
file's path and the position of what is wrong in it — `sections[0].items[1]`, say. Both leave
with `1`, before any page is read.


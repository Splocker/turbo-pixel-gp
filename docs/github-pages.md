# Playing on GitHub Pages

The game is published to GitHub Pages so anyone can play it from a link:

**https://splocker.github.io/turbo-pixel-gp/**

## Why not embed it in the README?

GitHub strips scripts, iframes and canvases out of README files for security,
so a game can't run inside the README itself. The README links to the
Pages site instead.

## How it works

The workflow in [.github/workflows/pages.yml](../.github/workflows/pages.yml)
runs on every push to `master` (and can be started manually from the
Actions tab). It:

1. Checks out the repository.
2. Copies only the files the browser needs (`index.html` and `js/`) into a
   `_site` folder, so tests and tooling are not published.
3. Uploads `_site` and deploys it to GitHub Pages.

The game has no build step and loads its scripts with relative paths, so the
same files that work when opening `index.html` locally work unchanged on Pages.
High scores and settings are saved in the player's browser (`localStorage`),
so they persist per player on the hosted site.

## One-time setup

Pages must be switched on once for the repository:

1. Go to **Settings → Pages** on GitHub.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

After that, every push to `master` redeploys the game automatically.

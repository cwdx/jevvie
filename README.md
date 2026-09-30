# Jevvie

The code behind [Jevvie](https://chriswijnia.com/lab/jevvie), the small companion in the corner of
[chriswijnia.com](https://chriswijnia.com), after Office's assistant. A page offers its actions as
[WebMCP](https://github.com/webmachinelearning/webmcp) tools; [TypeSafe AI](https://docs.typesafe.ai/api)'s Jev (System
One) turns a visitor's request into one of them, one typed Choice at a time; and the character hops to the button and
does it. Agents in the browser can drive the same actions over WebMCP.

The site's own code that builds on these packages (its Vue component and its registry of actions) is published, as it
runs, at [chriswijnia.com/lab/jevvie/source](https://chriswijnia.com/lab/jevvie/source).

| Package | What it is | Licence |
| --- | --- | --- |
| [`packages/jevvie`](packages/jevvie) | The choices (which action a request means, which value of its argument, whether a tip fits, when to ask back), a three.js voxel character and a 1-bit vgpu trail; the site brings its tools, tips, copy and colours | MIT |
| [`packages/jev`](packages/jev) | A small Jev client: the Vercel AI Gateway first, TypeSafe directly as the fallback, answers checked, cost reported | MIT |

```sh
npm install
npm test          # the packages' unit tests (no Jev calls)
npm run typecheck
```

This repository is a mirror: it is copied from the site's monorepo on every change there, so pull requests are read
but applied upstream.

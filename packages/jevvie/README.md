# @cw/jevvie

Jevvie: a small companion for a website, after Office's assistant. A page offers its actions as
[WebMCP](https://github.com/webmachinelearning/webmcp) tools; [TypeSafe AI](https://docs.typesafe.ai/api)'s Jev (System
One) turns a visitor's request into one of them, one typed Choice at a time; and a character hops to the button and
does it.

- **The choices** (`@cw/jevvie`, no dependencies): each step as a Jev Choice's options. Which action a request
  means (`toolCriteria`, with *help* and *none* among them), then which value of its one argument (`argCriteria`, a long
  list cut to the values sharing most words with the request, or free text by `queryFrom(request, action, ignore)`,
  where `ignore` takes your own section words); whether a tip fits the page (`tipCriteria`, where staying quiet is
  always an option); which suggestions a page can run now (`suggestionsFor`); and when a request wants any value at all
  (`wantsAny`). `suggestionsFor` and `tipCriteria` scope by path prefix, and `/` means the home page only. Use Jev's
  probabilities, not only its pick: `ranked` lists an `Answer`'s likely options, and `unsure` is true when the top one
  is under half with a close second, so you can ask which one was meant.
- **What you bring**: your tools (`ToolInfo[]`), usually your WebMCP registry; tips and suggestions (`Tip[]`,
  `Suggestion[]`); all copy, and the Jev call with its instructions, which stay on your server; `CharacterColors`; and the
  trail's RGB.
- **The character** (`@cw/jevvie/character`, three.js as a peer): a voxel bar with eyes, drawn small at hard pixels.
  Its shape comes from a catalogue (plain shapes, variants, a chess set, a space set, emoji, page), and it can wear a
  clip, a pencil, a pin, a flag or antennas. It blinks, breathes, follows the pointer, and has moods (happy, love,
  laugh, wink, think, confused, surprised, cry, angry, sulk, sleep), each with its sign (♥, ?, !, …, zZ) and tricks (spin, jump, wave, look, stretch, tap); it renders only while
  something moves, and holds still under reduced motion. `mountCharacter(canvas, { colors, reduced, shape, wear })`.
- **The trail** (`@cw/jevvie/trail`, vgpu as a peer): dots along its path on a full-window canvas, 1-bit dithered
  and gone within a second. `mountTrail(canvas, rgb)`; `null` where the browser has no WebGPU.

The component around it (the balloon, the menu, the hops) is left to you, since it is your look; the site's own is at
[chriswijnia.com/lab/jevvie/source](https://chriswijnia.com/lab/jevvie/source).

It lives on [chriswijnia.com/lab/jevvie](https://chriswijnia.com/lab/jevvie).

MIT.

# AI Usage

<!--
Document how you used AI tools across your portfolio.
Fill in the sections for each project. If you did NOT use any AI tools for a
project, write "No AI tools were used." under that project.
Be honest and specific.
-->

## Project 1

### Which tools did you use?

- Claude (Claude Code running inside VS Code, model Claude Fable 5.1)

### What did you use them for?

- Brainstorming and stress-testing the concept (what the piece should make a non-technical visitor understand, how fingerprinting works, which sub-techniques exist such as canvas, WebGL and font fingerprinting)
- Collecting references (net art about surveillance and obfuscation, 1970–90 science-fiction film aesthetics, the ZXX typeface, passport machine-readable zones)
- A questionnaire that pinned down open design decisions before building
- Writing and debugging the p5.js code
- Finding public-domain OCR-A and OCR-B font files

### How did you use them?

- Started with my idea in one message: use browser fingerprinting as the subject, p5.js as the vehicle, typography as the medium, with a literal fingerprint, a cyber aesthetic and 3D. Asked for a brainstorm and sources.
- Refined the concept over several rounds: the visitor is assigned a number and can smudge or retype it, but it always comes back. I asked for an ID card, mouse-driven 3D tilt, THX 1138 and Brazil as aesthetic references, a fingerprint on the card, cables feeding the card and an eye that follows the mouse.
- Answered a two-round questionnaire (palette, mouse mapping, correction timing, device scope, typeface, fingerprint style, signal collection, footer text, eye style).
- Tested each build in my own browser and reported back: the private window showed a different number (the canvas signal was the only one that changed, so it was taken out of the number), the card was too big, the layout should look like a real ID.
- Added ideas while it was being built: cables should come up from the floor, the visitor should be able to cut a cable so that its value is lost, the room should be a stylised white sci-fi room, and the eye should hang from the ceiling on a claw-like arm.
- The code was written by Claude from these decisions, in three layers: typography interaction, card layout, cables and eye.

### What was your own contribution?

- The concept: making browser fingerprinting visible to non-technical people through typography that reacts to input, and the decision that the number must reset itself so that the interaction carries the message.
- The subject matter choices: a literal fingerprint on the card, an ID card as the format, the eye on its ceiling mount, the cables as the visual link between the signals and the number, and cutting a cable as the way to lose a signal.
- Aesthetic direction: dropping the hacker-terminal look in favour of a 1970–90 science-fiction, corporate-clinical white void; OCR-A as the typeface.
- Rejections: the FingerprintJS dependency (own signal collection instead), the Suisse font that was in the template, and the green terminal aesthetic.
- Testing on real browsers, which found the canvas-noise problem and led to the final footer text.

### Reflection

- <!-- draft, please rewrite in your own words --> Claude was fastest at turning decisions into working code and at finding references, but every decision that made the piece mine came from the questions I had to answer first. The private-window test showed that the concept needed real-world checking that only I could do.

## Project 2

### Which tools did you use?

-

### What did you use them for?

-

### How did you use them?

-

### What was your own contribution?

-

### Reflection

-

# Hivemind website updates — September 11, 2026

Preview: http://localhost:5173/work/ · Homepage animation: http://localhost:5173/

## Content and editing map

- `src/lib/content.ts`: interest form URL, social links, seven technical subteams, eight leaders and semester goals.
- `src/lib/hivemind.ts`: planned workflow examples, architecture explanations, subteam build areas and research priorities.
- `src/lib/components/HivemindOverview.svelte`: overview layout, cloud/device example switch, Hermes explanation, expandable details and beginner invitation.
- `src/lib/components/Leadership.svelte`: roster on Project. The repeated Join roster was removed.
- `src/lib/sections/Join.svelte`: interest form, Discord, existing office hours and mailing list cards, and the corrected kickoff link.
- `src/lib/components/ui/AnimatedTextCycle.svelte`: reusable Svelte text cycle. `Hub.svelte` sets the four words and 2,200 ms interval.
- `src/lib/components/ui/TextColor.svelte`: gentle sequential color emphasis on Learn / Build / Belong. Respects reduced motion.
- `src/lib/components/SocialIcon.svelte`: X uses the supplied transparent PNG unchanged, with an alpha mask matching the existing icon size/theme.
- `src/app.css`: existing shared design tokens and Tailwind entry point.

## Stack decision

The user approved matching the supplied React animation in the existing Svelte 5 / TypeScript / Tailwind 4 app. Reusable UI components belong in `src/lib/components/ui`, imported through `$lib/components/ui`. This is the Svelte equivalent of the supplied React component folder; React, shadcn React and Framer Motion are unnecessary for this implementation. Svelte transitions and Spring provide the motion without a second UI framework. No additional packages were installed.

## Confirmed product framing

Hivemind implementation has not started. The page describes the intended open-source experience, not shipped features. The physical voice wristband and software architecture are both core parts of the project. The software will be open source, with cloud execution and a planned web application; a mobile application remains under consideration. People can also run the software without a wristband. Personal memory is distinct from explicitly chosen shared team spaces. The Fall and Spring numbers are targets, not results.

The four-page Cloud Agent brief and user-provided project details inform the design. The two pasted Hermes articles inform questions about usability, memory, oversight and cost; their unverified anecdotes, command examples, comparative rankings and cost claims are not republished as facts. Hermes capabilities are described narrowly from its official repository: https://github.com/NousResearch/hermes-agent. Hivemind's proposed contribution is the connected experience around an agent engine, not an assertion that Hermes lacks memory or delegation.

The club confirmed lead pairing, workshops, speaker events, a 450+ member Discord community, non-coding roles, thoughtful AI-assisted coding and no prior AI experience requirement.

## Link behavior

Prominent Join actions open the supplied Google interest form in a new tab. Section navigation still opens `/join`. The form card discloses required Google sign-in. The form and X profile were opened and verified without submitting information or signing in. Office-hours, mailing-list and event placeholders predate this change and were not repurposed as interest-form actions.

## Robot

The previously verified six-second Spline gesture, final holding correction, full-body circle, head movement and five-second team cycle are preserved. Only roster text and the anchor location changed: `#subteams` is now on the always-rendered section wrapper, so it exists in the static production HTML and on mobile. See `ROBOT-MOTION.md` for motion details.

## Verification

Svelte/TypeScript check: zero errors and warnings. Static production build passes. Browser checks cover desktop light/dark layouts, mobile layout at 390 px, homepage word cycling at 320 px without horizontal overflow, both example modes, all three disclosures, form destinations, eight leaders, X footer link and the robot’s held Cloud card. Existing Spline optional-decoder/chunk-size build warnings remain.

## Context and visual refinement

The current hero leads with “One assistant. From wrist to world.” The user confirmed that permitted conversations, task activity and connected sources should inform useful background organization and cross-device context. The comparison now explicitly distinguishes Hermes’s existing engine (including automatic memory) from Hivemind’s intended integrated personal-assistant experience. This is a design goal, not measured superiority. Current Hermes memory reference: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/.

Cloud terminology describes Hivemind as the software architecture connecting execution, memory and nodes. The web application is planned, and only the mobile application is tentative. Hardware development is given equal prominence beside that architecture.

- `src/app.html`: first visits default dark regardless of OS preference; valid stored light/dark choices are preserved before first paint.
- `src/app.css`: added red surface, border and highlight tokens for both themes.
- `ui/SignalWaves.svelte`: native Svelte/WebGL adaptation of the supplied flowing-lines shader, local to the Hivemind hero. Theme red, transparent output, capped quality/frame rate, offscreen/hidden pausing, static reduced-motion frame, context loss handling and CSS fallback.
- `ui/CharacterField.svelte`: sparse slow characters in Who Fits, adapted from the supplied background only. No scrambled title or flashing accents. Uses canvas instead of hundreds of per-frame DOM updates.
- `Section.svelte`: opt-in illumination and background snippet, used on Why Now, Who Fits, Events and Join. Premise/Contact retain the default appearance and existing effects.
- `PressFeature.svelte`: homepage editorial feature linking to the September 3 Daily Cardinal article, with a paraphrased headline, publication and date. The author name is not rewritten to remove its hyphen. No article imagery or invented endorsement.
- Events date stamps, Join surfaces, leadership initials and Hivemind comparison now use restrained red accents. Existing content, homepage graph/text cycle, carousel and robot motion are retained.

Stanford’s public page was viewed, but client assets could not be inspected. Its optional source-dependent background recreation was skipped. No Stanford assets or implementation were copied.

Additional validation: first-visit/stored/invalid theme cases exercised against the actual prepaint script; saved light/dark themes verified across browser reloads. Both new canvases render; WebGL confirmed on desktop and mobile. Home, Project, Who Fits, Why Now, Events and Join all checked at 320 px without horizontal overflow; Project additionally at 390 px. Article URL, mode switch and expandable details verified. No new dependencies required.

## September 11 refinement

Why Now now opens with “AI that acts. A future you can build.” The Hivemind overview pairs wristband and software descriptions, then explains Capture, Connect and Coordinate as engineering goals. This replaces a repeated benefits row to control density. The Hermes comparison acknowledges existing automatic memory, tools and delegation, and argues for the integrated experience without claiming measured superiority or inventing exclusivity.

The five requested pages share a red motion palette:

- Why Now uses the new `ui/TopoField.svelte` behind the existing orbital carousel.
- Project retains `ui/SignalWaves.svelte` in the hero and uses contours in its comparison.
- Who Fits has larger, predominantly red falling characters.
- Events and Join use `ui/RedBeams.svelte`.

The supplied beam and topographic examples were adapted to native Svelte. No React or new dependencies were added. All effects are decorative, local to their sections, transparent, theme aware, and capped for mobile. They stop animating offscreen, in hidden tabs and with reduced motion. Contours include source attribution and a CSS fallback. Solid content cards and soft background veils protect text contrast.

Kickoff is Wednesday, September 16, 2026, with time and location TBD. Both Events and Join use that date. The repeated beginner support and leadership sections were removed only from Join. Project keeps both. Visible dashes and hyphenated wording were removed throughout content and metadata; URLs and code syntax remain intact.

Final validation for this refinement: `npm run check` reports zero errors and warnings; `npm run build` succeeds. Chrome checks cover all five pages at 320 px without overflow or raw template text, 390 px layouts, desktop light and dark themes, the wristband workflow switch and expanded architecture text. A Svelte/TypeScript and built HTML copy audit found no visible dashes; the correct kickoff, Project leadership, form URL, X link and logo assets are preserved. The final Project preview is left open in Chrome.


## September 11 followup: beams, aurora and researched proposals

The Events array is now chronological: September 9 to 10, September 15, then the September 16 kickoff. The first workflow tab in Picture the possibility is now Software Architecture. The underlying web application example and wristband mode remain intact.

Why Now replaces its contours with `ui/DiagonalBeams.svelte`, a native Svelte adaptation of the supplied diagonal canvas beam effect. Join replaces its vertical beams with `ui/AuroraWaves.svelte`, using the supplied three sine wave blend and Gaussian glow. Both use the existing red theme tokens, transparent backgrounds, protected text, mobile frame and resolution limits, static reduced motion frames, hidden and offscreen pausing, and resource cleanup. No new packages were needed. Other sections retain their effects.

Beam recycling uses the visible rotated rectangle, avoiding long empty intervals; resize preserves progress. Aurora wraps the shared sine phase to avoid precision loss on long visits.

Two repeated engineering points became Continue and Control. Continue proposes verified action receipts and recovery for supported operations across devices. Control proposes purpose and expiry permissions for managed context, derivatives, caches and waiting tasks. A new expandable comparison provides technical boundaries and direct source links. The copy acknowledges Hermes task persistence and existing provider provenance and deletion. These are proposed system integrations, with no claim of global novelty, impossibility in Hermes or measured superiority. `HIVEMIND-RESEARCH.md` records the primary source audit, current baseline limitations, build scope and acceptance tests.

Validation: Svelte check reports zero errors and warnings; the static production build succeeds. All nine generated HTML pages pass a visible dash and raw template marker audit. Assertions verify event order, both new backgrounds, both proposals, the renamed tab and Project leadership retained while Join leadership stays removed. Chrome inspection covers desktop dark and light themes, mobile at 320 and 390 pixels, real canvas and WebGL rendering, both workflow buttons and the expanded research disclosure. No horizontal overflow was found on the changed routes. Existing optional Spline decoder and chunk size build notices remain.


## September 11 contact integration and final navigation changes

Why Now now uses a static red glow over its theme background. Both animated background components were removed from that section. The carousel itself remains, and its controls are no longer faded by the decorative mask. Office hours consistently says coming soon while its central Cal.com URL setting is empty. Join has four cards after removal of the mailing list, and its office hours card is noninteractive with Booking opens soon.

When the intro actually plays, completing or skipping it now navigates to the homepage before revealing the page. Returning sessions can continue to open individual section URLs. Chrome verified both finish and skip from a fresh Project URL and subsequent direct section navigation.

The Contact form adds Professor, Student, Business and Other roles. It now submits to a deployed Google Apps Script receiver and only reports success after a confirmed write. The responses sheet has restricted access.

Live verification on September 11: a clearly labeled test submitted from Chrome displayed Message sent and appeared in the sheet with the matching request ID, Student role, message, timestamp and New status. The test row contents were then cleared. The sheet has ten organized columns, a frozen red header, filter, role and status dropdowns, wrapped messages and follow up fields. See CONTACT-INTEGRATION.md for deployment and maintenance.

Validation: seven receiver tests pass, Svelte check has zero errors or warnings, and the final production build succeeds with the existing Spline notices. Chrome verification covers required field errors, the live form acknowledgment, contact and Join layouts at 320 pixels with no horizontal overflow, and the static Why Now background in dark and light modes. Desktop dark mode was restored, and the homepage is open in Chrome.

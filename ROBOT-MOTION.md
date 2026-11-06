# Subteam robot presentation

Updated September 10, 2026. Preview: http://localhost:5173/work/#subteams

## Agreed behavior

- Preserve the source Spline arm animation at its original six-second timing.
- Follow it with a 1.4-second smooth correction into a palms-up presentation pose under the existing information card.
- Start the card fade during the final 450ms of settling. Keep all seven buttons visible throughout.
- Begin five-second team rotation only after the hands settle. Pause rotation while hovered, keyboard-focused, hidden, or offscreen.
- Show the entire robot inside an exact seven-point circle, with Wearable at twelve o'clock.
- Turn the head toward the actual selected button position, with a small, slow idle movement. Hold the body and arms still.
- Play the opening once per component visit; do not replay on scroll-away/return or a desktop/mobile/desktop resize.
- Keep the existing mobile list below 780px. Respect reduced motion by applying the final pose immediately and disabling idle motion and autoplay.

## Files and adjustment points

- `src/lib/components/SubteamOrbit.svelte`: circle geometry, fixed-size information card, interaction, visibility, and autoplay.
- `src/lib/animation/subteamRobot.ts`: source transition timing, camera fit, support-pose solution, head tracking, and renderer lifecycle.
- `static/hivemind-bot.splinecode`: original source asset, unchanged.

`OPENING`, `CORRECTION`, and `TIMING` control the gesture. `DWELL` controls automatic team changes. The stage is at most 760px square; ring radius is half its width minus 44px. The 258px card reserves the tallest of its seven descriptions. The robot retains a constant pixel scale across the supported desktop stage widths so both palms remain aligned with this card.

The hand pose uses the original mesh's palm center and outward normal, including Spline's hidden pivot matrices and mirrored negative scales. It solves the arm position toward points 10px inside each lower corner, with the palm surface approximately 3px below the card. Wrist orientation keeps the palm normal pointing upward.

## Runtime integration

Verified against installed `@splinetool/runtime` 2.0.37. The original arm transitions loop forward and backward; they are not skeletal animation clips. Public transition factories reproduce their first forward pass. Their `seek()` method excludes delay, so the controller subtracts each authored delay explicitly.

The controller uses existing private scene/camera access to fit the camera and commit rig transforms. Recheck this integration when upgrading Spline or replacing the scene. The startup renderer is stopped after Spline's queued startup task, preventing an independent render loop from continuing offscreen.

Development builds expose projected geometry and pose diagnostics in `data-robot-debug`; this instrumentation is omitted from production builds.

## Verification

- `npm run check`: zero errors and zero warnings.
- `npm run build`: successful. Existing Spline optional decoder asset and bundle-size warnings remain.
- Browser checks at 1280px and 780px: full body visible, exact circle centers, level palms, stable card.
- At stage widths 760px and 702px, palm support points were within 0.1px horizontally of the intended targets and approximately 3.1px below the card.
- Arm transforms were identical across samples while the head rotation changed.
- Selection stayed on the clicked team for a 6.1-second interaction-pause check. Observed automatic changes were approximately five seconds apart.
- At 390px: all seven list items present, no robot canvas, no horizontal overflow. Returning to desktop restored the held pose without replaying the opening.
- Reduced-motion behavior reviewed in code; no operating-system preference was changed for verification.

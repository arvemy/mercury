# Color scheme

Mantine follows the system color scheme until `mantine-color-scheme-value` in localStorage contains a saved choice.

## Sub-features

The live browser runner opens a light browser context, confirms the HTML `data-mantine-color-scheme` is `light`, saves a `dark` preference, reloads, and confirms `dark`.

## How to get to it

Open `/`. Components use `useMantineColorScheme` to save or clear the native preference.

## Drive and inspect

Run `.agents/skills/verify-mercury/scripts/run.sh` with the required live credentials. Compare `browser/00-home-light.png` and `browser/00-home-dark.png`, their ARIA snapshots, and the passing runner assertions.

## Limits

The test writes Mantine's native storage key to exercise startup behavior. The starter has no separate color-scheme control. If a control is added, drive that control and verify persistence through a reload.

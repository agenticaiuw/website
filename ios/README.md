# The Hub for iOS

The hub's tasks and meetings on your iPhone. Your tasks go in a Reminders list called "The Hub" and your meetings go in a calendar called "The Hub". Check a task off in Reminders and it's marked done in the hub the next time the app syncs.

Sign in with the same emailed code as the website.

## Build

Needs Xcode 16 or later and [XcodeGen](https://github.com/yonaskolb/XcodeGen) if you change `project.yml`.

```sh
xcodegen            # only after editing project.yml
open TheHub.xcodeproj
```

To put it on your phone, plug it in, pick it as the run destination and press Run. If Xcode can't sign it, pick your own team under Signing & Capabilities.

The app talks to `/api/app/*` in `hub/src/routes/app-api.ts`.

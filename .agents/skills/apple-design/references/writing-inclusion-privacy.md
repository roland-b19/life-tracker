# Writing, inclusion, right-to-left, privacy

When to read this: before writing any UI text (labels, buttons, empty states, errors, settings, permission strings), when reviewing copy or imagery for inclusion, when adding or testing RTL (Arabic/Hebrew) or other locales, and before requesting any permission, handling sensitive data (for example health or money data) or designing sign-in.

## Writing

Rules:
- Define the app's voice (who you talk to, how it should feel) and keep a list of common terms; use the same word for the same thing everywhere.
- Match tone to context: direct and serious for errors or payments, light for achievements.
- Be clear: remove every unnecessary word; read it aloud. Use plain language; avoid jargon and gendered terms (accessibility and localization both benefit).
- Put the most important information first on each screen. If a screen carries several ideas, split it over several screens.
- Be action-oriented: active voice; buttons and links start with a verb. Prefer "Send" over "Let's do it!". Never "Click here"; use a descriptive link text ("Learn more about ...") which also matters for screen readers.
- Pick a capitalization style per element type and apply it consistently (title case reads formal, sentence case casual), for example title case for all alerts or sentence case for all headlines.
- Multi-step flows: start with "Get Started" (or similar), use one consistent pair for moving on ("Continue" or "Next", not both), end with "Done".
- Use possessive pronouns (my, your) sparingly: "Favorites", not "Your Favorites". If used, be consistent and do not switch perspective. Never use "we" (unclear who): write "Unable to load content", not "We're having trouble loading this content." (page updated December 16, 2025).
- Adapt text per device without changing meaning: do not say "click" on touch devices, say "tap". Small screens (iPhone, Watch) need brevity; TVs are shared and shown from a distance, so be brief and mind the audience.
- Empty states: give a clear next step (button or link); show voice but useful content; they are temporary, so never put crucial information in them.
- Errors: prevent them first. Otherwise show the message next to the problem, do not blame, say how to fix it ("Choose a password with at least 8 characters", not "That password is too short"). Skip "oops!" and "uh-oh". If language cannot fix a frequent error, redesign the interaction.
- Choose the delivery channel by urgency and importance (notification, alert, action sheet), and match the tone.
- Settings: label practically; add an explanation only when needed and describe what happens when the setting is on (the off state is implied). To point to a setting, give a direct link or button instead of describing its location.
- Text fields: label every field; use hint/placeholder text for format ("name@example.com") or description; show errors next to the field and instruct ("Use only letters for your name"), never robotic ("Invalid name").

Avoid:
- Cute or clever labels, "we", blame, jargon, vague error text.

## Inclusion

Rules:
- Examine assumptions about people's age, gender identity, race and ethnicity, sexuality, physical and cognitive attributes, permanent/temporary/situational disability, language and culture, religion, education, political or philosophical views, social and economic context. Inoffensive is not the same as inclusive.
- Tone: be clear, direct, respectful; an academic tone can exclude. Address people as "you/your", not "the user" or "the player". Reserve "we/our" for the software or company.
- Define any technical term before using it and make the definition easy to find; prefer plain language (it also translates better). Replace colloquialisms (culture-specific, may carry exclusionary origins). Think hard before using humor (subjective, hard to translate, can irritate with repetition).
- Be approachable: clear, standard interface and built-in ways to learn (skippable onboarding), no prerequisite skills.
- Gender: avoid unnecessary gender references ("Subscribers can post recipes to your shared folder", not "his or her"). Prefer customizable avatars, emoji, glyphs. For generic people use nongendered imagery (SF Symbols `figure`, `person` glyphs). Ask for gender only if truly required (health, legal) and then offer options such as nonbinary, self-identify, decline to state; optionally let people state pronouns.
- Show a range of people (body types, ages, abilities, backgrounds) and avoid stereotyped roles. Show relatable settings; avoid displays of affluence that feel out of touch.
- Avoid assumptions (family structure, security questions based on shared experiences like a first car or college subject). Prefer universal questions: favorite activity, first friend's name, a quality that describes you.
- Accessibility: support VoiceOver, Display Accommodations, closed captioning, Switch Control, Speak Screen. Disability is a spectrum and can be temporary or situational. Do not use disability as a negative metaphor; write people-first and ask how a person or community self-identifies. Favor simple, consistent interactions and perceivability by sight, hearing and touch.
- Languages: internationalize (handle other languages and regions: date, time, currency formats) then localize. Plain language, no gender, no stereotypes and universal imagery make localization easier. Use SF Symbols (language-specific glyphs, LTR and RTL variants).
- Color carries culture-specific meaning (for example white means grief in some places, purity in others); verify per locale when color communicates something.

## Right to left

System UI frameworks mirror automatically; standard components and layouts usually need no work. Apply these when customizing.

Rules:
- Text alignment: mirror alignment to the interface direction when the system does not. Align paragraphs (3 or more lines) by their own language, not the interface direction; keep 1 to 2 line blocks following the context direction. Use one alignment for all items in a list, including items in another script.
- Numbers: Hebrew uses Western Arabic numerals; Arabic may use Western or Eastern Arabic numerals, varying by country and even within one. For number-centric apps decide per locale; otherwise use system number formatting. Never reverse the digits inside a number (541, phone and card numbers). Reverse the order of numerals along a flipped progress, counting or ordered sequence, but never flip the glyphs.
- Controls that show progress from one value to another (sliders, progress bars, ratings) flip, including start/end glyphs or images. Navigation and ordered-access controls flip: Back points right in RTL; next/previous flip. A control that refers to an actual direction or screen area ("to the right") keeps its direction.
- Mixed scripts: Arabic and Hebrew have no uppercase and look small next to all-caps Latin; increase the RTL font by about 2 pt to balance.
- Images: do not flip photos, illustrations or artwork (meaning may change; copyright risk). Make a new version if strongly direction-bound. Reverse the position of images whose order is meaningful (chronological, alphabetical, favorites).
- Icons: SF Symbols supplies RTL variants and localized (Arabic, Hebrew) symbols; custom symbols can declare directionality. Flip icons that depict text or reading direction (left-aligned text bars become right-aligned) and icons showing forward/backward motion (a speaker's sound waves). Consider localized versions of icons that contain letters (signature, rich text, I-beam); if letters are unrelated to reading or writing, redesign without text.
- Do not flip: logos (legal risk), universal marks (checkmark), real-world object icons (clock), right-handed tools. Keep a prohibition slash consistent across directions; flip a badge only if it mirrors real UI or the flip keeps meaning and balance (for example a cart badge corner); for handed tools keep the tool orientation and flip the base if needed.

## Privacy

Rules:
- Ask only for data the feature needs, only after the person shows interest, with requests as specific as possible. Be transparent about collection and use; honor Hide My Email and Mail Privacy Protection; know your App Tracking Transparency obligations.
- Process on device when possible (Neural Engine, CreateML) to avoid server round trips. Use system protections: for example CloudKit (iOS 15+) provides encryption and key management for extra data types (strings, numbers, dates).
- Provide privacy practices (App Store Connect privacy details) when submitting or updating an app; they appear on the product page.
- Permission is required for: personal data (location, health, financial, contacts, identifying info); user content (email, messages, calendar, contacts, gameplay, Apple Music activity, HomeKit, audio/video/photos); protected resources (Bluetooth, home automation, Wi-Fi, local network); camera and microphone; ARKit data in a visionOS Full Space (hand tracking, plane estimation, image anchoring, world tracking); the advertising identifier (tracking). The user can change the choice later in Settings > Privacy.
- Request in context, when the person first uses the feature that needs it. Request at launch only if the app cannot function without it and the need is obvious (navigation app and location). Use the system location button as the trigger for location.
- Purpose string (usage description): one brief, complete, specific sentence; sentence case; active voice; ends with a period. Good: "The app records during the night to detect snoring sounds." Bad: passive and vague ("Microphone access is needed for a better experience.") or imperative without justification ("Turn on microphone access.").
- Pre-alert screens (before system permission alerts, including camera, mic, location, contacts, calendar, tracking): one button only, titled "Continue" or "Next" (never "Allow"), which opens the system alert. No close/cancel/skip option unless legal consent requires it. Do not offer other actions that bypass the alert.
- Tracking: if tracking from launch, show the system alert before collecting any tracking data. Never put a misleading custom screen before the alert: no incentives, no screen that imitates the request, no image of the alert, no annotating the screen behind the alert (App Store rejection, App Review Guideline 5.1.1 (iv)). Legal-consent screens before or after the ATT alert are allowed.
- [iOS] [iPadOS] [watchOS] Location button (`LocationButton` SwiftUI, `CLLocationButton`): grants one-time access when tapped, after a first-time explanatory alert. With no authorization status it acts like Allow Once; it does not change a previous While Using the App status. You may customize: system title (such as "Current Location" or "Share My Current Location"), filled or outlined glyph, background color, title/glyph color, corner radius. Nothing else. Ensure text fits without truncation at all accessibility sizes and translations. If the system detects consistent problems (low contrast, too much translucency), the button stops granting location.
- Authentication: do not rely on passwords alone; prefer passkeys, plus two-factor for passwords; use biometrics (Face ID, Optic ID, Touch ID, Local Authentication) to protect apps that stay logged in. Prefer system features (passkeys, Sign in with Apple, Password AutoFill); do not invent custom authentication schemes.
- Store secrets in the keychain; never in plain-text files, even with file permissions.
- [macOS] Sign with a valid Developer ID when distributing outside the store. Use App Sandbox (required for the Mac App Store). Do not assume who is signed in (fast user switching).
- [visionOS] ARKit data only reaches apps in a Full Space; features like Plane Estimation, Scene Reconstruction, Image Anchoring and Hand Tracking need permission. Where the user looks is private (system draws hover effects). Back camera is blank; front camera feeds Personas only with permission; remove or replace camera features of ported iOS apps with an import option.

Avoid:
- Permission prompts at launch without need; pre-alert screens with two buttons or "Allow" labels; custom auth schemes; plaintext secrets.

Sources: writing, inclusion, right-to-left, privacy
(URLs: https://developer.apple.com/design/human-interface-guidelines/<slug>)

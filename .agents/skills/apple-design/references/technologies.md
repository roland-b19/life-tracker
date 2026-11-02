# Apple technologies: integration design rules

When to read this: you are adding or designing a feature that touches an Apple system technology. Deep sections: HealthKit (Apple Health), Sign in with Apple, iCloud, Generative AI, Machine learning (AI feature UX), Siri, Maps, Apple Pay, Apple In-App Purchase, Mac Catalyst. Everything else is short, under "Other technologies (brief)" at the end. Platform tags apply only where a rule is platform-specific.

Hints (note, from the author's own knowledge, not from the HIG; each applies only if you build that feature): HealthKit exists only in iOS/iPadOS/watchOS apps (not web or macOS); Sign in with Apple is available on every platform including web (per the HIG) and can sit alongside any other login; iCloud/CloudKit is one sync option for Apple-only data, not a fit for server-side multi-user data on a non-Apple backend; Apple Pay is for taking payment for goods/services you sell and In-App Purchase for selling digital content or subscriptions, so neither is needed to merely record spending, and do not use both for the same thing; AI summaries/suggestions fall under Generative AI + Machine learning; quick-entry actions can be exposed via Siri/App Intents.

---

## HealthKit

Rules:
- Ask for health access only if the app really offers health/fitness functionality. Otherwise never request private health data.
- Request permission in context, at the moment the data is needed (for example when the person logs weight), never right after launch. Permissions can be changed any time, so ask again whenever you need access (`requestAuthorization(toShare:read:completion:)`).
- Use the system permission sheet. Add a few short sentences explaining why you need the data and what the person gains. Do not build custom screens that imitate or replace that sheet.
- Health sharing is managed only in system Settings > Privacy. Do not add in-app screens that change what flows to/from Health.
- Provide a privacy policy URL at App Store submission; it must be clear and linked from the store page.
- After permission, keep showing people how their data is used.
- [iOS, iPadOS, watchOS] HealthKit exists only there. It is not supported on macOS, tvOS, visionOS (and Mac Catalyst apps that depend on it may not suit the Mac).

Activity rings (`HKActivityRingView`):
- Use only for Move, Exercise, Stand progress. Never repurpose, restyle, or imitate the ring look for other data; never show Move/Exercise/Stand in another ring-like element.
- One person per ring set, and make clear whose it is (label, photo, avatar). Never show multiple people's data in rings.
- Never alter ring or background colors, filters, or opacity; blend them into the surroundings (for example inside a circle via the enclosing view corner radius, not a mask). Keep an outer margin at least equal to the gap between rings.

Apple Health icon and wording:
- Use only the Apple-supplied Health icon next to the words "Apple Health", at least as large as other app icons nearby; not a button; no masking, recoloring, borders, shadows, or placement inside text; clear space 1/10 of its height; no Health app screenshots.
- Write "Apple Health" or "Apple Health app" (two words, capital A and H; all caps only if the UI style is all caps). Never write "HealthKit" in user-facing text; say "works with the Apple Health app" / "uses data from the Apple Health app". Use the system translation of "Health".

Numbers:
- Health icon clear space: 1/10 of icon height.

Avoid: asking at launch for everything; custom permission screens; ring look-alikes for custom metrics (use a different chart style); implying data goes anywhere other than what was disclosed.

---

## Sign in with Apple

Rules (flow):
- Ask people to sign in only in exchange for value, and say what they get (personalization, extra features, sync). Delay sign-in as long as possible; let people explore first.
- If an account is required, explain why, finish account setup, then offer Sign in with Apple and other methods together.
- Support linking an existing account: suggest linking when the shared email matches an existing account, or show a linking suggestion in account settings after username/password sign-in.
- Commerce: ask for account creation after purchase (for example on the order confirmation page, especially after Apple Pay). Skip fields already collected.
- Welcome the person right after sign-in completes; do not block with extra non-required questions.
- Show the current method in settings/account UI ("Using Sign in with Apple").
- Available on every platform including non-Apple platforms and web.

Rules (data):
- Minimize data requests at account setup. Say whether each extra item is required (legal/contractual: terms acceptance, region, birth date, real-identity laws) or optional (and what it improves).
- Never ask for a password (unless the person stopped using Sign in with Apple with you).
- If the person shared a private relay address, do not ask for a personal email. Let them see the relay address in your app, point them to Settings > Apple Account > Password & Security > Apps using Apple Account, or identify them by order number / phone collected at purchase.
- Ask for optional data later, in context. Never lock features behind optional data.
- Be transparent: greet with the shared name/email and display what you received.

Rules (buttons):
- Show the button prominently: no smaller than other sign-in buttons, no scrolling needed to see it.
- Prefer system APIs: `ASAuthorizationAppleIDButton` (iOS, macOS, tvOS), `WKInterfaceAuthorizationAppleIDButton` (watchOS), JS/HTML for web. You get approved look, proportions, localization, corner-radius config (iOS, macOS, web), VoiceOver label.
- Titles: Sign in with Apple, Sign up with Apple, Continue with Apple (iOS/macOS/tvOS/web; pick one and stay consistent). watchOS has a single "Sign in" title.
- Styles: white (all platforms; for dark backgrounds), white with outline (iOS, macOS, web; for white/light backgrounds with low contrast; not on dark or saturated backgrounds), black (all platforms; for light backgrounds; never on black/dark). The watchOS black button is system dark gray, not pure black.
- Corner radius may be changed to square, default rounded, or capsule to match your other buttons (iOS, macOS, web).
- Custom buttons (iOS, macOS, web) are reviewed by App Review and must stay recognizable: allowed titles only Sign in/Sign up/Continue with Apple; logo and title both black or both white; use only Apple logo art (uncropped, no vertical padding) matched to button height, title vertically centered; logo-only is 1:1 with no extra horizontal padding. You may change title font, uppercase, background (black/white, subtle texture), corner radius, stroke/shadow.

Numbers:
- Minimum button size 140 x 30 pt (280 x 60 px @2x); minimum margin = 1/10 of button height.
- Default and recommended iOS button height: 44 pt. PNG logo art only for 44 pt tall (or 44x44 for logo-only); use SVG/PDF for other sizes.
- Title font size = 43% of button height (button height = 233% of font size, rounded to nearest integer).
- Minimum margin between title and trailing edge: 8% of button width.
- Title capitalization: first word and "Apple" capitalized, rest lowercase, unless the UI is all uppercase.

Avoid: forcing sign-in before value; password fields after Apple sign-in; replacing the relay email; a smaller or hidden Apple button.

---

## iCloud

Rules:
- Work with iCloud automatically when the person has it on in Settings. If a choice is warranted, show one simple first-launch option: iCloud for all data or none; do not ask per document.
- Make storage transparent: people should assume they always see the latest version, wherever it lives.
- Keep content current when possible, balancing storage and bandwidth. For very large documents let people control downloads; show that a newer version exists, and give subtle feedback if a download takes more than a few seconds.
- Respect the paid, finite storage: store what people create and understand; do not store app resources or regenerable content. iCloud backups include every app's Documents folder, so be selective about what goes there.
- When iCloud is off or Airplane Mode is on, do not raise an alert; optionally a quiet note that changes will not appear on other devices until iCloud returns.
- Store app state and settings in iCloud (for example last page read, to continue on another device), but only settings people want applied on every device.
- Deleting a document removes it from iCloud and all devices: warn and confirm first.
- Resolve version conflicts automatically when possible. Otherwise show an unobtrusive prompt that makes versions easy to tell apart and choose between, as early as possible.
- Include iCloud content in app search results.
- Games: consider saving progress in iCloud; the GameSave framework syncs saves and has built-in alerts for offline/conflict cases (added June 2025). CloudKit is the developer reference for app data.

Avoid: per-file "keep in iCloud?" questions; "iCloud unavailable" alerts; storing caches or downloadable assets.

---

## Generative AI

Rules (responsibility and control):
- Design for responsible AI: outputs vary even for the same input and you cannot predict all requests, so plan for inclusiveness, care, and privacy from the start.
- Keep people in control: honor in-scope requests with clear expected output, handle sensitive content carefully, let people dismiss, revert, or retry generated content, and clearly mark where AI is used.
- Inclusion: models favor common data and can stereotype. When generating images or descriptions of people, ask for the needed attributes instead of inferring gender, culture, or relationship type. Test with diverse people.
- Offer generative features only where they give clear value (time saved, better communication, creativity).
- Always provide a good experience when the feature is unavailable or the person opts out: give a non-AI fallback where possible (Genmoji vs regular emoji; notification summaries vs reading the notifications). Foundation Models requires a compatible device with Apple Intelligence on; availability also varies with network and battery.

Rules (transparency and privacy):
- Say where AI is used; never pass AI output as human-authored. Follow regional disclosure laws.
- Set expectations: capabilities and limits up front, a short tutorial, curated suggestions for open prompts, tips for good results, explanation of why results can be poor.
- Prefer on-device models (private, fast, offline). Use server models for more compute or larger context, weighing privacy first: process locally as much as possible, send the minimum, tell people their data may leave the device, show what is shared, and say what is stored or used for training.
- Ask permission before using personal data or usage data; use the minimum; always offer an opt-out; get explicit permission for sensitive data used for model improvement or storage. Model output may leak sensitive information. Stricter rules apply for kids' apps. Understand third parties' privacy practices.
- Disclose concisely and specifically how personal info is used and stored and whether it trains the model.

Rules (models, inputs, outputs):
- Evaluate model capabilities early. Choose datasets that are diverse, licensed, and of known provenance; test for bias and misinformation.
- Guide inputs with predefined example prompts.
- Reduce hallucinations: scope narrowly, avoid requesting facts unless verified current data is available, say content may contain errors, and avoid AI output where an error could harm.
- Before irreversible or consequential actions (deleting photos, purchases on someone's behalf) get confirmation; do not automate destructive steps. Follow model usage policies (see Acceptable Use Requirements for the Foundation Models Framework) and local regulation.
- Make refine/revert easy: controls such as Edit, Undo, Retry, Adjust next to generated content; acknowledge when a correction took effect.
- When output is blocked, coach the person (example requests; Image Playground says "Unable to use that description").
- Test misuse (out-of-scope, vague, sensitive, adversarial prompts); reduce copyright risk via curated inputs and instructing the model not to mimic works or styles.
- Latency: non-generative models (ARKit body tracking, Vision) are real-time suitable; generative ones are slow, so design a loading state or generate in the background. Prefer specific progress text ("Summarizing key themes from your notes") over "Processing..."; on failure, explain in plain language with a next step.
- Consider offering several meaningfully different results to pick from (Image Playground).
- Improve over time: update blocked-word lists independently of releases, retest prompts when the base model changes, offer unobtrusive voluntary feedback (thumbs up/down plus optional detail), keep the model swappable and separate from the UX.

Numbers: none specified.

Avoid: pretending AI output is human; unconfirmed destructive or purchase actions; vague spinners; mandatory feedback; features that only work with AI and have no fallback when they could.

---

## Machine learning

(Companion to Generative AI. Use for suggestions, recommendations, classification, predictions, smart defaults.)

Rules (plan the ML role):
- Classify each ML feature along five axes and design accordingly:
  - Critical vs complementary (feature central to the app: people expect accuracy; secondary: more forgiving).
  - Private vs public data (more sensitive data means worse consequences when wrong, for example a wrong "see a doctor" suggestion in health; always protect privacy).
  - Proactive vs reactive (proactive output is unrequested, so tolerance for errors is lower, extra data may be needed to avoid irrelevance).
  - Visible vs invisible (invisible features cannot show reliability or collect feedback easily).
  - Dynamic vs static (dynamic improves with use and needs calibration/feedback; static improves only with app updates).
- Model behavior takes long to change; keep data and metrics flexible.

Explicit feedback:
- Ask only when necessary; prefer implicit feedback. Always voluntary.
- Label options by consequence ("Suggest less pop music", "Suggest more thrillers", "Mute politics for a week"), not vague "Dislike". Icons may support the text but never replace it. Offer several options, progressively more specific.
- Act immediately and persist the change (hide it everywhere in the app). Use feedback to tune when/where results appear.
- Favoriting and social reactions are implicit feedback, not explicit.

Implicit feedback:
- Secure it; tell people how information is gathered and shared and let them restrict it.
- Do not let it shrink exploration (avoid filter bubbles); combine several signals; withhold private suggestions on shared devices; prioritize recent behavior; update at a cadence matching the mental model; beware confirmation bias.

Calibration:
- Use only when the feature cannot work without it. Secure the data, collect the minimum, explain value by what the feature does (not how it works), ask once and early (exception: calibrating to an object, such as a new baseball field).
- Make calibration quick (few items, infer the rest) with an explicit goal and progress (Face ID tick marks); help immediately if progress stalls; confirm success; allow cancel any time; let people edit or remove calibration data later.

Mistakes:
- Anticipate, help people handle, and learn from mistakes. Scale remedies to consequence (wrong keyboard suggestion vs a route that misses a flight); make frequent mistakes easy to fix; take extra care with proactive features; a wrong attribution magnifies the error.
- Patterns: limitations, corrections, attribution, confidence, feedback.

Corrections:
- Use familiar controls and show the steps the automation took (Photos highlights the crop controls it used so people can refine or undo).
- Reflect corrections instantly and persist them; allow correcting a correction. Weigh feature benefit against correction effort. Never use corrections to paper over low quality. Learn from corrections only if it improves quality.
- Prefer guided corrections (list of alternatives, for example speech-to-text candidates) over freeform ones (Photos manual crop); combining both is fine.

Multiple options:
- Contexts: suggested (proactive, For You), requested (reactive, QuickType), corrections (Auto-Crop).
- Prefer diverse options (Maps offers no-toll, scenic, highway routes). Avoid too many; show them on one screen without scrolling. Put the most likely first (use confidence, time, location), preselect it when sensible. Make options easy to tell apart with a short description of each difference; group into categories if there are many. Learn from selections.

Confidence:
- Only convey confidence if you verified that values correlate with result quality. Translate it into familiar concepts: attributions ("Because you listen to pop music" instead of "97% match"), ordering, semantic categories ("high chance"/"low chance"), or actionable advice ("This is a good time to buy"). Show numbers/intervals only where people expect them (weather, sports, polls).
- Change presentation by threshold (Photos face recognition asks for confirmation at lower confidence). For proactive features, set a floor below which nothing is shown.

Attribution:
- Explain the basis of a result without explaining the model. Use it to help distinguish options, soften mistakes, and build mental models.
- Not too specific (feels like surveillance) and not too general (feels impersonal). Keep factual and objective: "Because you've read nonfiction", not "Because you love nonfiction"; never imply judgment of emotions or beliefs. Avoid statistical jargon, except for inherently statistical results.

Limitations:
- Set expectations before use (marketing or in-context) when rare-but-serious; use attributions when minor.
- Show how to get best results: placeholder hints (Photos search "Photos, People, Places..."), live guidance (Memoji suggests better lighting), alternative paths instead of empty results.
- Explain why results were poor (Memoji: not good in the dark). Tell people when a limitation is fixed.

Avoid: showing raw confidence numbers; relying on corrections for bad models; implicit feedback only; requiring feedback.

---

## Siri

Rules:
- Siri sees nothing of an app by default. Expose actions (intents) and content (entities) with the App Intents framework; they then appear in Siri, Spotlight, Shortcuts, and Apple Intelligence features.
- For common domains (email, music, photos, and similar) map features to app schemas (preset templates the system understands) for deeper natural-language and contextual behavior. Outside those domains, use App Shortcuts to expose custom actions.
- Share context: annotate on-screen views/content with app entities so Siri understands references to what is visible; donate entities to the on-device Spotlight index; donate performed actions as intents so Siri can anticipate and surface them.
- Prioritize the app's most popular actions and where they occur (hands-free, specific device) when choosing what to expose.
- Use familiar vocabulary for intents and entities (track vs song vs podcast).
- Index only relevant content (recent searches, favorites, bookmarks, wishlist). Email/messaging may justify the whole catalog.
- No ads, marketing, or in-app-purchase pitches in anything Siri delivers.
- Use a custom response only when built-in ones are insufficient. Custom snippets via optional schema properties may not always show, since some contexts are non-visual.
- Response dialogue: clear and descriptive ("Which soup?" not "Which one?"); as short as possible (no humor, no filler; people hear it repeatedly); deliver both audible and visual forms so Siri can choose, and make the spoken version stand alone; avoid gendered pronouns ("Who should I send it to?"); when options are too many to read, ask an open-ended narrowing question ("What kind of shoes are you interested in?"); keep it device-independent; do not mention your app name (the system attributes it); no offensive language and respect parental controls (Siri may speak aloud near others).
- Errors: specific ("Sorry, we're out of chicken noodle soup" beats "Sorry, we can't complete your order").
- Editorial: call it "Siri", never she/he/her. Never impersonate Siri, reproduce its functions, fake Apple responses, or use reserved phrases like "Call 911" or "Hey Siri". Localize "Hey Siri" by translating only "Hey" (es "Oye Siri", fr "Dis Siri", it "Ehi Siri", pt_BR "E aí Siri"); the source lists every locale.
- June 2026 revision: "Siri AI" (Apple Intelligence-powered Siri on supported devices). The old "Add to Siri" guidance was removed in 2023 in favor of App Shortcuts.

Numbers: none.

Avoid: advertising in responses; repeating the app name; visual-only responses; dumping the whole catalog into Spotlight.

---

## Maps

Rules:
- Keep the map interactive (zoom, pan, rotate); avoid non-interactive elements that cover it.
- Emphasis style: default (fully saturated, matches the Maps app) or muted (desaturated, so rich custom content stands out) (`MKStandardMapConfiguration.EmphasisStyle`).
- Offer search plus category filters. Show distinct selection styling (outline, color change). Cluster nearby points with one pin that expands on zoom.
- Apple logo and legal link: keep visible (temporary overlap is OK, permanent is not), pad them from edges and custom controls, keep them fixed to the map (not moving with your UI); if a custom element moves (bottom card), anchor them 10 pt above its lowest resting position.
- Annotations: match your app style. Default marker is red with a white pin glyph; retint it, or set the glyph to a string (any characters, 2 to 3 characters for legibility) or an image (`MKAnnotationView`). To mix Apple features (POIs, territories, physical features) with your own, make them independently selectable (`MKMapFeatureOptions`).
- Overlays: "above roads" (default; above roads, below buildings and trees) or "above labels" (hides roads and labels beneath; to abstract or hide irrelevant areas) (`MKOverlayLevel`).
- Keep custom controls clearly contrasted with the map (thin stroke, light shadow, blend modes).
- Place cards (rich place info: hours, phone, address): in-map via `mapItemDetailSelectionAccessory`, `mapFeatureSelectionAccessory`, etc. Styles: automatic, callout (full = large, detailed; compact = concise; automatic by map size), caption ("Open in Apple Maps" link), sheet. Full callout is a popover on iPadOS and macOS, a sheet on iOS. Pick a style fitting the map (compact for small maps with many annotations), set a minimum width to prevent text overflow, avoid duplicating info already on screen, keep the selected location visible via an offset that points at it.
- Place card outside a map (lists, store locators): you must include a map inside the card (`mapItemDetailSheet(item:displaysMap:)`). Use cues such as place name, address, or pin icon to signal that the card is openable.
- Indoor maps (venues): add detail progressively with zoom; color plus icons for area types; floor picker with short floor numbers; dimmed surroundings; routing to transit/parking or hand-off to Apple Maps; keep part of the venue visible when scrolling; match your app style (Indoor Mapping Data Format).
- [watchOS] Maps are static snapshots, not interactive; tapping opens Maps. Up to five annotations. The map element must fit the screen without scrolling and show the smallest region covering the points of interest (`WKInterfaceMap`).
- Web: MapKit JS and Maps Embed API (single-place place card).

Numbers:
- Logo/legal link padding: 7 pt on the sides, 10 pt above and below. Not shown on maps smaller than 200 x 100 px.
- Icon string: 2 to 3 characters. watchOS annotations: max 5.

---

## Apple Pay

Use Apple Pay for physical goods, services (memberships, hotels, tickets), donations, and subscriptions to services; use In-App Purchase for digital goods.

Rules (offering):
- Offer on every supported device/browser and hide it elsewhere. Apple Pay must be the primary (not necessarily only) option, in the same flow, not a separate step.
- Use Apple Pay buttons only to start payment or (Set Up Apple Pay button) setup. If you use a custom button, it must not show "Apple Pay" or the logo, and you must show the Apple Pay mark or mention Apple Pay in text on the same page. The mark only signals acceptance; never make it a button.
- Never hide an Apple Pay button or make it look disabled. If a choice is missing (size, color), react after the tap with a clear message.

Rules (checkout):
- Keep checkout cohesive and branded; avoid new pages or windows (they look like a handoff to another site).
- Assume people want Apple Pay: first option, larger, or separated by a line.
- Product-detail Apple Pay button buys the single item only (not the cart contents); if the cart already holds it, remove it after purchase. Express checkout shows the sheet immediately for the whole cart with one shipping method and destination.
- Allow coupons/promo codes on the payment sheet (important in express checkout); show an applied code.
- Collect required options (size, color) before the button; if missing, highlight and jump to the field. Collect optional data (gift message, delivery notes) before or after, since the sheet cannot take it. Collect multiple shipping methods or destinations before the sheet (the sheet holds one). For pickup, choose the location first; the sheet displays its address.
- Prefer fresh Apple Pay contact/shipping/payment data over stored data. Do not require an account before purchase; offer registration on the confirmation page, prefilled.
- Show a confirmation page after payment (shipping timing, status); if you mention Apple Pay there use "Paid with Apple Pay" or "1234 (Apple Pay)".
- Do not add spinners; the sheet owns loading and progress state.

Rules (payment sheet content):
- Request and show only essential info (for example no shipping address for an emailed gift card).
- Shipping method choice: clear description, cost, optional date range (`PKDateComponentsRange`; supports time zones/calendars); for pickup, allow choosing a time window.
- Line items explain extra charges, discounts, pending costs, donations, recurring/future payments. Do not itemize the products. Keep each short, ideally one line.
- Show "Pay [Business_Name]" with the total, using the name on card statements. Marketplaces: "Pay [End_Merchant (via Your_Business)]".
- If the final total is unknown (ride fare, tip), when regulations allow, disclose and show an "Amount Pending" subtotal; if preauthorizing a fixed amount, show it accurately.
- Subscriptions: explain billing frequency and terms before the sheet; line items for frequency, discounts, upfront fees, trial price (including $0), regular price, and billing start date; total line shows what is charged now; show the sheet again only if a change increases cost. The billing-agreement field is a plain-language summary, not formal terms; leave it blank when unsure.
- Donations (approved nonprofits only): a "Donation $50.00" style line item; offer presets (for example $25, $50, $100) plus Other Amount.

Rules (errors):
- You can validate when the sheet appears, on field change, and after authentication. Before authorization you only see card type and a redacted shipping address, so validate what you can early and always report failures after.
- Do not force your business logic: ignore extra data (Zip+4 to 5-digit), accept phone number formats.
- Report errors with the right status code (`PKPaymentError` on iOS/watchOS, status codes on web) plus a custom message. Name the field and the expectation ("Zip code doesn't match city", "Shipping not available for this state"), not "Address is invalid".
- Error messages: noun phrases, sentence case, no final period, at most 128 characters.
- On cancel or timeout the sheet dismisses; you must cancel the in-progress payment; people retry via the button.

Rules (buttons):
- Always generate buttons with `PKPaymentButton` (type: `PKPaymentButtonType`, style: `PKPaymentButtonStyle`; iOS, macOS), `WKInterfacePaymentButton` (watchOS), or the web API. Do not build look-alikes. You get localization, scaling, VoiceOver, corner radius.
- Types: plain Apple Pay, Buy, Check Out, Continue, Book, Donate, Subscribe, Reload, Add Money, Top Up, Order, Rent, Support, Contribute, Tip, and a no-call-to-action plain button (also a fallback when the chosen type is unsupported on that OS version or the translated title does not fit). Pick by flow vocabulary. System may show the default card image on the button.
- Set Up Apple Pay button: shown where the device supports Apple Pay but is not set up (Settings, profile, interstitial). No automatic fallback replacement.
- Styles: automatic (follows system appearance), black (light, high contrast backgrounds only), white with outline (light backgrounds lacking contrast; not on dark or saturated), white (dark backgrounds).
- Size/position: no smaller than other payment buttons; visible without scrolling. Side by side with Add to Cart: Apple Pay on the right; stacked: Apple Pay above. Default rounded corners; square or capsule allowed.
- Apple Pay mark (not a button): Apple art only, change height only (not smaller than other payment marks), no trademark symbol, no effects or animation or rotation, keep the border, do not share its border with another graphic.
- Text: "Apple Pay" two words, capital A and P, never plural/possessive/translated; never use the Apple logo as the word Apple. In a payment list use the mark unless every option is text-only.
- Not supported on tvOS. Works on iOS, iPadOS, macOS, visionOS, watchOS, and web.

Numbers:
- Button minimum size: plain Apple Pay 100 x 30 pt; Book, Buy, Check Out, Donate, Set Up, Subscribe 140 x 30 pt; minimum margin 1/10 of button height.
- Mark clear space: 1/10 of its height.
- Website icon for payment authorization (Handoff, Wallet subscriptions): 60 x 60 pt (120 px @2x, 180 px @3x).
- Error message length: 128 characters max.


---

## Apple In-App Purchase

Digital goods only: premium content/features, subscriptions for digital content. Physical goods and real-world services use Apple Pay. Sept 2026: renamed Apple In-App Purchase.

Four types:
- Consumable (lives, gems; deplete and can be rebought).
- Non-consumable (premium features; permanent).
- Auto-renewable subscription (renews until canceled).
- Non-renewing subscription (limited time, rebought to extend, for example battle pass).
- Very large, frequently changing multi-creator catalogs: Advanced Commerce API.

Rules (store):
- Let people try the app first; offer limited free access for subscriptions.
- Make the store feel like part of the app (style, transactions). Short product names that do not truncate or wrap; plain descriptions.
- Always show the total billing price for every item, whatever type.
- Hide the store, or explain why it is unavailable, when payments are not allowed (parental restrictions; `canMakePayments`).
- Use the default system confirmation sheet; do not modify or replicate it.

Rules (Family Sharing):
- Up to five additional family members can share auto-renewable subscriptions and non-consumables across all devices.
- Mention it where people learn about the offer (name items "Family"/"Shareable", mention in sign-up). Explain benefits and how to participate. Tailor wording for purchasers and family members ("Your family subscription includes...").

Rules (help and refunds):
- Offer in-app purchase help and a route into the system refund flow (`beginRefundRequest(for:in:)`). Show help before the refund (missing purchases, FAQ, support contact) without creating a barrier: the refund button must not need scrolling or another screen.
- Title the action "Refund" or "Request a Refund". Show recent purchases with image, name, description, original date. Alternative fixes (immediate fulfillment, goodwill item) are fine if the refund stays available. Do not describe or predict Apple's refund policy; link to Apple's support page.

Rules (auto-renewable subscriptions):
- Show benefits during onboarding with a strong call to action and a clear terms summary. Offer a range of content, service levels, durations. Consider freemium, metered paywall, or free trial. Prompt at relevant moments (nearing free limit) and let people subscribe at any time (including Settings).
- Prompt for a new subscription only for non-subscribers (else people think theirs lapsed); if the same subscription exists in other apps or web, offer sign-in so people do not pay twice.
- Sign-up screen must include: subscription name, duration, what is provided each period; localized billing amount per territory/currency; a way for existing subscribers to sign in or restore purchases; links to Terms of Service and Privacy Policy (also in App Store metadata). Make total billing amounts most prominent; breakdowns (per-month equivalents) subordinate. For intro offers list intro price, duration, and standard price after. Describe free trials explicitly, including that payment starts automatically at the end and its amount.
- Ask only for necessary info at signup. [tvOS] let people finish sign-up on another device via a code.
- Offer codes ([iOS, iPadOS]): one-time (App Store Connect; redeem via URL, in-app, or App Store) and custom (for example NEWYEAR; alphanumeric ASCII; URL or in-app only). In-app redemption needs only a button starting the system flow (`presentOfferCodeRedeemSheet(from:options:)`, `offerCodeRedemption(options:isPresented:onCompletion:)`) on the paywall, onboarding, or settings; welcome the new subscriber.
- Management: show a subscription summary including next renewal date (`Product.SubscriptionInfo`); use the system management UI (`showManageSubscriptions(in:)`); on cancel attempt, remind of benefits, suggest another plan or a discount, and later send win-back offers (Retention Messaging API, win-back offers). Always keep cancel easy to find; never bury it.

Avoid: custom confirmation sheets; hidden cancel; prices omitted; subscribe prompts for existing subscribers.

---

## Mac Catalyst

When to use: build a Mac version of an iPad app. Not available on iOS, tvOS, visionOS, watchOS. Good candidates already support drag and drop, keyboard navigation and shortcuts, multitasking (Split View, Slide Over, Picture in Picture), and multiple scenes (become multiple windows). Poor fits depend on gyroscope, accelerometer, rear camera, HealthKit, ARKit, or on marking, handwriting, navigation as the primary function.

Rules:
- You automatically get: pointer interaction and keyboard focus, window management, toolbars, rich text interaction, file management, menu bar menus, app settings in system Settings; system views gain Mac look (split view, file browser, activity view, form sheet, context actions, color picker).
- Idiom choice. Default is "Scale Interface to Match iPad" (iPad idiom): views and text scale to 77% (17 pt text becomes 13 pt); slightly less crisp. Mac idiom: everything at 100%, sharper, more Mac-like controls, better performance/power for graphics-heavy apps, but you must audit layout, text and images.
  - When adopting the Mac idiom: use a separate asset catalog, text styles instead of fixed font sizes, no fixed view or layout sizes; text may look too large without adjustment; limit appearance customizations to those that exist on both iPadOS and macOS.
- Go beyond a stretched iPad layout:
  - Navigation: replace a tab bar with a split view with sidebar (preferred; consistent across iPad/Mac) or a segmented control (fine for flat hierarchies). List top-level items in the View menu. Give Next/Previous buttons besides swipe for pages.
  - Input: iPadOS gestures translate (tap to click/right click; touch-and-hold to click-and-hold; pan to click-drag; pinch and rotate on trackpad). The system sends pinch/rotate to the view under the pointer.
  - Icon: make a macOS version of the app icon (see foundations/app icon rules).
  - Layout: use multiple columns, regular width and height size classes and reflow side by side on resize, inspectors beside content instead of popovers, move controls into the window toolbar (and list their commands in the menu bar), top-down flow with key actions near the top, relocate buttons from bottom/side edges (reach ergonomics do not apply on a Mac).
  - Menus: users expect every command in the menu bar (use `UIKeyCommand`, `UIMenuBuilder`, `UICommand`). Pop-up and pull-down menus convert automatically; context menus convert too and Mac users expect them on every object.

Numbers:
- iPad idiom scale: 77% (17 pt becomes 13 pt). Mac idiom: 100%.
- Gesture mapping: tap/pan/hold to mouse; pinch/rotate to trackpad.

---

## Other technologies (brief)

- Wallet: add passes with `PKAddPassesViewController`/`addPasses` and the `PKAddPassButton` ("Add to Apple Wallet"); add related passes as a group; ask before deleting a pass; never re-ask after a decline; set expiration/relevantDate/voided. Pass images (pt): logo 50-160 x 50, icon 38 x 38, strip 375 x 144, thumbnail 60-90 x 90. Order tracking (iOS 17+, `PKPaymentOrderDetails`, `AddOrderToWalletButton`): logo/product images 300 x 300 px opaque; give contact methods, tracking link, pickup barcode. ID verification (iOS 16+, `PKIdentityButton`): ask only at point of need, request `age(atLeast:)` not birth date, state retention. Not on tvOS.
- Tap to Pay on iPhone: [iOS only] needs a PSP, entitlement, ProximityReader; only an admin accepts terms. Call `prepare(using:)` at launch and each foreground; keep the option selectable during setup with progress. Label "Tap to Pay on iPhone" or "Tap to Pay" (SF Symbol `wave.3.right.circle`, never the Apple logo), payments only; non-payment reads use "Look Up", "Store Card", "Verify", "Refund". Fix the final amount (tips) before the Tap screen; offer fallbacks (cash, payment link, another card).
- SharePlay: real-time activity plus an asynchronous fallback (share a link); start from a SharePlay-symbol button, share sheet, or FaceTime; "SharePlay" is a noun/verb only. Not on watchOS. [visionOS] start from a window; up to 5 spatial Personas; seats at least 1 m apart, defined up front; per-person volume and subtitles; fade template transitions.
- iMessage apps and stickers: [iOS, iPadOS] one primary experience; essentials in compact view, text entry only expanded. Stickers need a localized alt description, must read rotated on any background; @3x px small 300, regular 408, large 618 (do not mix); max 500 KB; PNG, APNG, GIF, JPEG. App Store icon 1024 x 1024.
- CareKit: [iOS, iPadOS] task styles simple, instructions, log, checklist, grid; charts bar, scatter, line (distinct colors, legend, time units); contacts simple, detailed. Privacy policy URL; minimal, coalesced notifications; never color alone.
- ResearchKit: [iOS, iPadOS] onboarding order: intro, eligibility, informed consent (Learn More, optional quiz, signature, emailed PDF), permissions (critical only). Surveys: state count and duration, one question per screen, show progress, short. Keep a profile screen and a dashboard reachable.
- HomeKit: all platforms. Defer to the Home app; use `performAccessorySetup`; never show "service"/"characteristic" in UI (scene, not action set). Names: alphanumerics, spaces, apostrophes; no emoji or brand names. Ask before writing to the HomeKit database. Write "HomeKit" and "Apple Home"; never translate.
- CarPlay: [iOS only] system templates; no iPhone interaction while active; works with phone locked; errors only in CarPlay; audio starts on user action only. Displays px 800x480, 960x540, 1280x720, 1920x720; key items in the upper half; icon 120 (@2x) / 180 (@3x) px.
- App Clips: [iOS, iPadOS] linear UI, no splash, web views, ads, or account wall; small; notifications only for 8 hours after launch. Card image 1800 x 1200 px (no transparency, no text), title at most 30 chars, subtitle at most 56, verb View/Play/Open. App Clip Codes: Apple art only, printed at least 3/4 in (1.9 cm), digital at least 256 x 256 px, NFC variant tag at least 35 mm.
- Augmented reality: [iOS, iPadOS] offer only on ARKit devices (hide, never error); full-screen view; system coaching view for setup/relocalization; place objects immediately; one-finger drag moves, two-finger rotates; never scale to fake distance; friendly wording, not "plane" or "tracking"; image detection best at 100 or fewer reference images.
- Game Center: access point on menu screens only, keep controls away, consider pausing on overlay. Use exact terms Game Center, Achievements, Leaderboards, Challenges, Add Friends. Achievement title/description max 2 lines. Challenges 1-5 minutes, track latest score. Activity art 1920 x 1080 pt, crop 1465 x 767 pt; tvOS dashboard image 600 x 180 pt.
- ID Verifier: [iOS 17+, iPhone only] Display Only vs Data Transfer (needs extra entitlement); ask only for needed data; button "Verify Age" or "Verify Identity", no communication symbol.
- NFC: [iOS, iPadOS] say "scan" and "hold near", never "tap"/"touch"/"NFC"/"tag". Scan-sheet text: one sentence-case sentence with a period ("Hold your iPhone near the [object] to learn more about it."). Support both background and in-app reading.
- Live Photos: apply edits to every frame or offer conversion to a still; never split frames and audio; offer sharing as a still; show download progress; badge in a consistent corner, never a play button. [visionOS] view only.
- Photo editing: no custom top toolbar (the modal has one); edits save as new files; confirm Cancel; allow previewing; use the app icon. Only iOS, iPadOS, macOS.
- AirPlay: prefer the system player; full HLS resolution ladder; support streaming and mirroring and remote commands; keep playing in the background; do not interrupt other apps. Icon and name non-interactive only; "AirPlay" is one word and a noun. Not on watchOS.
- Always On: [iOS (iPhone 14 Pro and later), watchOS] redact sensitive data (balances, health), dim nonessential content, keep layout stable, ease motion to rest.
- ShazamKit: ask for the microphone with a reason, stop recording once the sample suffices, and let people opt in before saving recognized songs to their iCloud library.

Sources: healthkit, sign-in-with-apple, icloud, generative-ai, machine-learning, siri, maps, apple-pay, apple-in-app-purchase, wallet, tap-to-pay-on-iphone, mac-catalyst, shareplay, imessage-apps-and-stickers, carekit, researchkit, homekit, app-clips, augmented-reality, carplay, game-center, id-verifier, nfc, live-photos, photo-editing, airplay, always-on, shazamkit (voiceover skipped, covered elsewhere). URL: https://developer.apple.com/design/human-interface-guidelines/<slug>

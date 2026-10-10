# PROGRESS — GT App demo with Right Order

Prototype for the FieldAssist APM take-home ("The Seasonal Demand Challenge"). This file is the source of truth for what is built. A new chat can continue from it alone.

Which document wins:

- **What is built and how to call it:** this file.
- **Foundation scope (Stages 1–5):** `../strategy/01_CLAUDE_CODE_FOUNDATION_PROMPT.md`. Everything a later stage needs from it is copied below.
- **The feature ("Right Order"), its data and its copy rules:** `../strategy/04_FINAL_DECISION_LOCK.md` (§F logic, §J data, §L test matrix, §Q product spec). It overrides `02_RESEARCH_AND_STRATEGY.md` and `03_CLAUDE_CODE_FINAL_IMPLEMENTATION_PROMPT.md` where they differ. The parts of 04 that already affect the base are listed in §4.
- The four assignment files and `../strategy/` are read-only.

## 1. Status

| Stage | Scope | State |
|---|---|---|
| 1 | Skeleton, tokens, data files + generator v0, `data.js`, `store.js`, `dates.js`, demo bar, Login, Landing, Reset demo | **Done** (9 Oct) |
| 2 | Outlet list + Outlet details | **Done** (9 Oct). Checked with the smoke test (282 checks pass on both URLs) and screenshots at 360, 390 and 430 wide |
| 3 | Order booking + cart + `schemes.js` + `pricing.js` + engine v0 wired via `store.subscribe` + tests | **Done** (9 Oct). Checked with the unit tests (22 pass), the smoke test (461 checks pass on both URLs) and screenshots at 360, 390 and 430 wide |
| 4 | Order review + submit + history merge + Reset | **Done** (9 Oct). Checked with the unit tests (22 pass), the smoke test (556 checks pass on both URLs) and screenshots at 360, 390 and 430 wide. After the review fixes: 30 unit tests and 565 smoke checks pass |
| 5 | README (run, test, deploy to GitHub Pages) + 390px pass on every screen + console-error check | **Done** (10 Oct). See "How Stage 5 was checked" below |

**The base and the feature ("Right Order") are both built.** The feature follows `../strategy/03_CLAUDE_CODE_FINAL_IMPLEMENTATION_PROMPT.md` as amended by `../strategy/04_FINAL_DECISION_LOCK.md` (04 wins).

### The feature: Right Order (built 10 Oct)

| Stage (03, as amended) | Scope | State |
|---|---|---|
| A | Generator v0.5: overlays, `payment`, `cluster`, event `series`, `cluster_benchmarks.json`, `demoGuide`, persona tuning | **Done.** 40 generator checks pass; a re-run gives byte-identical files (§9) |
| B | Engine: `js/engine/recommendationEngine.js`, `cover.js`, `params.js` | **Done** (§7.7) |
| C | Feature UI: landing badges, outlet card with stock check, order strip with hints and See why, review check with reasons, Demo guide | **Done** (§10) |
| D | Tests | **Done.** `node --test` from `prototype/` runs 78 tests: engine 44 (schemes, pricing, the data view, every step of the engine on fixtures, property checks over 9 outlets × 300 seeded carts), store 11, personas 23 (the matrix rows the engine alone decides, on the real data). No backtest (04 D6) |
| E | Polish, QA, README, deploy | **Done.** README rewritten for the feature; checks below; published to GitHub Pages from the public repository `Aniket4501/fieldassist-right-order` (the contents of `prototype/` at the root): `https://aniket4501.github.io/fieldassist-right-order/` |

How the feature was checked (10 Oct, on the final code):

- **Unit tests:** 78 pass, 0 fail (`node --test`).
- **Acceptance, 04 §L:** all 26 rows pass in a real browser with real taps, plus the closing move of 04 §K (submit the main outlet's suggestion, its badge reads Covered, the reopened card is quiet) and a clean console; run with the app at the server root and again at `/prototype/`. Every expected value is worked out at run time from the data and the engine, never typed in. The matrix is below.
- **Hosted site:** the same acceptance script passes all 26 rows, the closing move and the console check against the published URL (10 Oct, after the deploy). The first Pages build failed: without a `.nojekyll` file GitHub ran the folder through Jekyll, which stopped on the `{{` in this file; the file was added and the second build served the site.
- **Layout:** two scripted sweeps, 758 base states and 1,146 feature states (every screen and state for all nine outlets at 360×740, 390×844 and 430×932, including the stock check, the See why sheet, the review check with reasons and 999 cases on every line): no sideways page scroll, no control under 48×48 or without a name, no overlapping controls, no text under 12 px, no clipped text, no console error, no failed request. What the sweeps list is by design or a false match: chips scrolled out of their own row, the words "Over credit" in the review footer, and the word "low" ("Running low at the distributor", "Low · 2–4 cases") matching a risk-appetite value.
- **Odd data:** with damaged copies of the data files served to the browser (an outlet without credit, cooler, cluster, glass or notes; no peer table; no calendar; no order history; no route plan; no distributor stock; no schemes; products without prices) every screen still renders and nothing is logged as an error. An outlet with no history and no peer data reads "Check data".
- **Rules:** searches over `js/`, `css/` and `index.html` find no device clock, randomness, locale formatting, `innerHTML`, absolute path, external URL, or outlet id, SKU, product name or channel name typed into code.
- **Speed:** one `recommend()` call averages about 1 ms; 20 quick taps on a stepper recompute and lay out in at most 6.3 ms each (median 2.8 ms), with nothing moving under the finger. The longest painted frame in a second run of 20 taps was 18.7 ms, in headless Chrome at 3× pixel density.
- **Reviews:** the engine was reviewed line by line against 04 §F by a second builder (11 fixes, listed in the test file's history); the built screens were then checked four ways (acceptance, visual and copy, code, layout) and the findings fixed: the order strip went from about 290 px to about 165 px, "Minimum" is disabled when its set is empty, the outlet card no longer leaves a gap when a count removes a line, the new-owner outlet names "similar shops".

Acceptance matrix (04 §L), final run:

| # | Input | Result |
|---|---|---|
| 1 | Open the main outlet, empty cart | Pass: badge Stock-up talk, headline "Add ~17 cases · lasts till Wed 6 May", four key lines missing |
| 2 | Start order with suggestion | Pass: cart = suggested, key hints "Lasts till Wed 6 May", scheme bar "9/10 → 1 free" |
| 3 | Minimum | Pass: cart = minimum, hints "Lasts till Wed 6 May if sales are normal" |
| 4 | A key line below its low | Pass: "Short · runs out ~Sun 3 May" |
| 5 | The two pooled colas at 9 | Pass: one-tap offer "+1 Cola 250 ml PET → 1 free (₹476)" |
| 6 | Pooled colas at 10 | Pass: "1 free ✓ · next at 20", offer gone |
| 7 | A key line at 30 | Pass: "Over · ~6 weeks of stock"; Submit waits for a reason |
| 8 | Count the key product's stock at 5 | Pass: recommendation 6 → 3, range narrower, confidence Medium → High |
| 9 | Submit, reopen | Pass: badge Covered; the reopened card is quiet, "Covered till Wed 6 May" |
| 10 | Canteen, cart = its 21 Apr order | Pass: three lines Over ("still in stock when closed 9 May"), badge Go light, closure headline |
| 11 | Dhaba, cart = its 18 Apr order | Pass: water reads "Short · runs out ~Tue 5 May"; the reason names the long weekend and last year's ×1.7 |
| 12 | New owner, empty cart | Pass: Low confidence, "Few orders here · leans on similar shops", "start with 9 cases, and we top up next visit" |
| 13 | Glass at 10 crates | Pass: "Over · only 4 crates against empties", review note "deposit for more" |
| 14 | Add the can that is out | Pass: "Unavailable · try Cola 250 ml PET", review warns while it is kept |
| 15 | Credit-stretched outlet over ₹2,400 | Pass: "Fits ₹2,400 — first: Cola 250 ml PET (runs out first). Collect ₹1,600 to add the rest"; no scheme (Bronze) |
| 16 | Cautious kirana, pooled colas at 8 | Pass: "2 more cases get a free one, but leaves 8+ weeks of stock — not suggested" |
| 17 | Monthly stall, empty cart | Pass: "Visit gap 29 days — covers 2 weeks. Ask for a top-up" |
| 18 | A product never bought there | Pass: "No sales history here", no status |
| 19 | 999 cases | Pass: "Over · 8+ weeks of stock", values format, layout holds at 360, 390, 430 |
| 20 | Switch outlet mid-cart | Pass: each outlet keeps its own cart and hints |
| 21 | Empty cart → Review | Pass: Submit disabled, "Add at least one line" |
| 22 | Monthly scheme limit used | Pass: "Monthly scheme limit reached", no offer |
| 23 | `distributor_stock.json` served with the focus cola out | Pass: Unavailable with a substitute at all nine outlets |
| 24 | Reset demo | Pass: back to login, storage cleared, badges restored |
| 25 | 20 rapid taps | Pass: recompute and layout at most 6.3 ms a tap (median 2.8 ms); the tapped button does not move |
| 26 | Unknown outlet id; no route plan | Pass: "Outlet not found"; fallback horizon, no crash |

Not done, or not verified:

- Not tested on a real iPhone or Android phone, or with a screen reader; all browser checks ran in headless Chrome.
- The visual check after the last fixes was by eye on about 20 screenshots, not a second independent visual review.
- The browser scripts (acceptance, sweeps) are not in the repo (§2).


How Stage 1 was checked (9 Oct, after the last change):

- A headless-Chrome smoke test at 390×844 (also 360 and 430 wide, and a 1280 desktop view): 83 checks pass with the app served at the server root, and the same 83 pass with it served from a `/prototype/` subfolder (the GitHub Pages layout). It covers login validation, sign-in, the demo bar, the route list against the data files, placeholders, reload persistence, the "Visited" chip, both Reset demo paths, redirects, no console errors or failed requests, no horizontal scroll, and every interactive element at least 48×48.
- Generator: 21 hard checks pass; two runs give byte-identical files.
- Searches under `js/`: no clock reads, no `Math.random`, no locale formatting, no `innerHTML`, no absolute paths, no external URLs, nothing outlet-, SKU- or date-specific typed into HTML, CSS or JS.
- Before that, four independent reviews (spec compliance, runtime robustness, code and contract, visual design) found 0 critical and 2 major issues; both majors and 22 smaller ones were fixed. What was left open is in §13.

How Stage 2 was checked (9 Oct):

- The same smoke test, extended: 282 checks pass with the app at the server root and the same 282 from `/prototype/`. New checks, all computed from the data files: the outlet list (rows, count line, chips from the data in tier order, search by name, area and id, filters combining, empty state and clear, search and filters kept across a visit to an outlet and cleared by Reset demo), outlet details for seven outlets that differ (identity, empty slot, last order date and value, the nine bars against the order history, next visit, schemes and eligibility, Rep notes closed with no amounts and complete when opened, no owner-behaviour label, glass, unlinked history), an unknown id, where Back points after coming from the route, from the list and back from the order screen, scroll restore on the landing and the list, a demo order shown as "Booked today", and the layout checks (no sideways scroll, 48×48 hit areas) on every new state.
- Screenshots of every new screen and state were read at 390 wide for six outlets, and at 360 and 430.
- Searches under `js/`: still no clock reads, `Math.random`, locale formatting, `innerHTML`, or outlet ids and skus typed into code.

How Stage 3 was checked (9 Oct):

- Unit tests: `node --test tests/engine.test.mjs` from `prototype/`, 22 tests pass (schemes, pricing, the v0 baseline, bad inputs, and a sweep over the real data). Use this form or plain `node --test`: on Node 25 the directory form `node --test tests/` fails with "Cannot find module".
- The same smoke test, extended: 461 checks pass with the app at the server root and the same 461 from `/prototype/`. New checks, all computed from the data files and from what the script entered: for seven outlets that differ, the tabs against the product master, the Usual items against the last 8 weeks of orders, every category's rows (name, units per case, price), the scheme chips against tier eligibility, the line hints against the baseline rule worked out again in the script, the booking panel (placeholder label, next visit, days) and the empty footer; one tap on + adds exactly one case and that product's price; the hint and the panel change with the status; the row node is not rebuilt, the + button keeps focus and nothing moves; a cart change takes well under 16 ms; the pooled scheme gives its free case at exactly `buyCases` across two products and nothing one case below; an outlet whose tier is not eligible shows no chip and gets no free case; the percentage scheme's discount appears at `minCases`; the cart survives a reload and a visit to another outlet, and each outlet keeps its own; search across categories, by flavour, the empty state and its clear button; 999 cases of every product (no cut-off text, totals add up); Review and back; an unknown outlet id; no sideways scroll and 48×48 hit areas at 360, 390 and 430 on every tab with the long cart.
- Screenshots (`s3-*.png`) were read for four outlets (the Diamond kirana, the canteen, the monthly stall, the new owner): empty cart, a cart with both schemes triggered, search, no match, 999 cases, at 390 and at 360 and 430.
- Searches under `js/`: still no clock reads, `Math.random`, locale formatting, `innerHTML`, or outlet ids and skus typed into code.

How Stage 4 was checked (9 Oct):

- Unit tests: `node --test tests/engine.test.mjs`, 22 pass. The engine modules were used as built; nothing in them changed.
- The same smoke test, extended: 556 checks pass with the app at the server root and the same 556 from `/prototype/`. The placeholder checks for `#/review/:id` are replaced by checks of the real screen. New checks, all computed in the script from the data files and from what it entered: the whole loop through the real screens for one outlet (landing, outlet details, order, review, submit, landing); on review, one line per cart product with name, pack facts, cases and line value, the free case on the line the scheme rule picks, the scheme benefits (only the schemes the cart earns, with free cases and product, or percentage and rupees), every total, the amount to pay as the key number, the credit banner against limit minus outstanding, the empty `review-check` slot directly above the submit bar; a tap on + updates the line and every total with the same row node, focus kept and nothing moving; a line taken to 0 disappears and leaves the saved cart; the banner switches from "fits" to the warning with the amount over and back, and never disables Submit; the overdue amount and days in the same banner in ordinary text at the outlet that has one; an empty cart ("Add at least one line", Submit disabled, a button to the order screen); after submit the toast, Visited on that row only, "1 visited", the stored order (lines with `freeCases`, value = amount to pay, a recommendation snapshot computed for that cart), the outlet's last order "Booked today" and this week's bar, an empty cart for that outlet, another outlet's saved cart intact; a triple click on Submit stores one order; a second order the same day gets its own id; an unknown outlet id; 999 cases of every product on review (totals add up, no text cut off); Reset demo leaves no order and no cart; no sideways scroll and 48×48 hit areas at 360, 390 and 430 on every review state.
- Screenshots (`s4-*.png`) were read at 390 for the Diamond kirana (empty cart, a cart with both schemes) and the outlet with an overdue amount (over its credit), the landing after submit with the toast, the monthly stall at 430 and 999 cases of everything at 360.
- Searches in `js/screens/review.js`: no clock reads, `Math.random`, locale formatting, `innerHTML`, or outlet ids and skus typed into code.

After the Stage 2 to 4 reviews (9 Oct):

- Four independent reviews (spec, runtime, code, visual) of Stages 2 to 4 found 1 critical and 4 major issues; all five and most of the smaller ones were fixed. The fixes: a new screen ignores taps for 500 ms (a double tap on Review used to submit the order unseen); a line taken to 0 on review stays in place; the amount to pay and an "Over credit" flag sit in the review footer; scheme chips moved beside the stepper so more product rows fit; the credit banner counts orders booked today and warns when a payment is overdue; a saved cart line for a product that is gone is dropped; orders dated after the demo date are ignored; the unreachable placeholder renderer was removed. What changed in the contracts is written into §7; what was left open is in §13.
- Unit tests: `node --test tests/engine.test.mjs`, 30 pass (8 added for the rules the reviews found untested or wrong).
- Smoke test: 565 checks pass with the app at the server root and the same 565 from `/prototype/`. The script now waits out the 500 ms tap guard before each tap. New checks: a double tap on Review (60, 250 and 440 ms apart) stops on the review screen and stores nothing; a double tap on Submit stores one order and stays on the landing; a line taken to 0 stays in place and no row moves; the review footer shows cases, the amount to pay and "Over credit"; a second order the same day lowers the available credit in the banner.
- Screenshots (`fx-*.png`) were read at 390 and 360 for the order screen (empty, with a cart, scheme used up), review (first viewport, a line at 0, over credit, all lines at 0, overdue), outlet details and the outlet list.

How Stage 5 was checked (10 Oct, after the last change):

- **390 px pass on every screen:** a scripted sweep of 758 screen states: every screen and state, for all nine outlets, at 360×740, 390×844 and 430×932 (login with and without an error, landing fresh and after 1 and 9 orders with the toast, the demo menu, the reset sheet, the outlet list with every filter and search, outlet details with Rep notes closed and open, order booking on every tab with 1, 10 and 999 cases, review with a normal cart, over credit, a line at 0, every line at 0 and empty, unknown outlet ids, the load-error screen). It found no sideways page scroll, no link, button, input or tab under 48×48 or without a name, no overlapping controls, no text under 12 px, no clipped text, and no owner-behaviour label or persona key in any screen's text. The only items it lists are by design: filter chips scrolled out of their own row, the words "Over credit" in the review footer, and the reset sheet measured while it slides in (it ends flush with the bottom edge at all three widths).
- **Console-error check:** in those 758 states there was no console error or warning, page error, failed request or request to another host, other than the errors the app logs on purpose when a data file is blocked.
- **Unit tests:** `node --test tests/engine.test.mjs`, 32 pass. **Smoke test:** 565 checks pass with the app at the server root and the same 565 from `/prototype/`. **Targeted checks** of the last edits: 23 pass (Rep notes and the review banner show the same available credit before and after orders booked today; the wording when every review line is at 0; keyboard focus on the stepper; the scheme-limit chip at 390 and 360). Rule searches under `js/` are clean; the generator's 21 checks pass and a re-run gives byte-identical data.
- **Independent review after the fixes:** three reviewers (the fixes in a browser, the code, drop-in readiness for the feature) found no critical issue. The one finding rated major was re-checked by a fourth and rated minor: Rep notes showed a different available credit from the review banner after an order booked the same day. It is fixed.
- **Changes made in this stage:** `README.md`, `.gitignore`; one rule for available credit (`data.availableCredit()`), read by the review banner and Rep notes; orders dated after the demo date are left out of the data view in one place; the "Usual items" tab lists the engine's candidates (one window, `CANDIDATE_DAYS`); the scheme-limit chip uses the wording of 04 §L row 22; the stepper keeps keyboard focus when a button disables itself; the review screen's words when every line is at 0. Two unit tests were added (32 in total).
- **Not done:** the README's deploy commands were not run (checked against the help text of git 2.50 and gh 2.86 only). An earlier, wider review run (six reviewers, including a visual one) stopped when the connection dropped; its screen sweep was complete and is the sweep above, re-run on the final code, but its visual review did not report. The post-fix screens were looked at by eye in 9 screenshots only.

## 2. How to work on this

- Build **one stage at a time**. After it: update this file (status, file map, contracts, known issues), then stop and report in at most 5 lines: what was built, how to open it, what to check, what the next stage is. End with the exact message to start the next stage in a new chat.
- The five base stages and the five feature stages are done. What is left is in §13 and in the "not done" lines of §1.
- Build only what the stage says. Suggest extras; don't add them unless asked.
- Edit files in place. Don't regenerate whole files for small changes.
- If a stage turns out bigger than planned, stop and propose splitting it.
- Run locally: `cd prototype && python3 -m http.server 8000`, then open `http://localhost:8000/`. Opening `index.html` from the file system does not work (modules and `fetch` need a server).
- Regenerate data: `node prototype/tools/generate-data.mjs`. It is deterministic and prints a validation table. Never hand-edit `data/*.json`; change `tools/personas.config.json` and re-run.
- Browser check used so far: `playwright-core` driving the installed Chrome (`chromium.launch({ channel: 'chrome' })`) with a 390×844 mobile context. It is installed outside the project and is not a dependency.
- The browser scripts are **not in this repo**: the acceptance script for the 26 rows of 04 §L, the layout sweep and the older base smoke test were written in a temporary folder on the build machine and can disappear. The base smoke test also still asserts the removed placeholder wording, so it no longer passes as it is. The unit tests in `tests/` are in the repo and need no browser.

### Adding a screen (Stage 2 onwards)

1. Create `js/screens/<name>.js` exporting `render(container, params)`. Build the view with `h()` and the components in `js/components/ui.js`; start with `appHeader({ title, subtitle, backHref })`, then a `div.screen`.
2. In `js/app.js`, import the module and add a `ROUTES.<name>` entry with `screen` set to it. Every entry must have a screen; there is no placeholder any more.
3. Read data with `getData()` and state with `getStore()`. For a screen that belongs to one outlet, dispatch `{ type: 'outlet/select', outletId }` on render: that is what brings back the outlet's saved cart and stock check.
4. If the screen subscribes to the store or adds document or window listeners, return a cleanup function from `render` that removes them. The router calls it before every navigation.
5. Unknown ids must not crash: `data.outletsById[id]` is `undefined` for an unknown id; show an empty state.

## 3. Hard rules

Copied from the foundation prompt, §1:

- **Static front end only.** Plain HTML + CSS + vanilla JS **ES modules**, no build step, no backend, no API keys, no external runtime calls except optional Google Fonts. Must deploy as-is to GitHub Pages (relative paths only: `data/...`, never `/data/...`). Local run: `python3 -m http.server` from `prototype/`.
- **Mobile-first at 390px.** Max content width 430px, centred on desktop with a neutral backdrop. Touch targets ≥ 48px. Base font 16px, key numbers ≥ 20px, tabular numerals.
- **All content comes from `data/*.json`.** Nothing outlet-specific is typed into HTML or JS. No per-outlet screens or `if (outlet.id === ...)` anywhere.
- **Fixed demo date** from `data/config.json` (`demoDate`). Never call `new Date()` for business logic; use `js/dates.js` helpers that take the demo date. Show the demo date in a slim top bar on every screen after login.
- **Visible "Reset demo"** (top bar overflow + Landing) clears everything in localStorage under the `gtdemo:` prefix and reloads.
- **Separation of concerns:** data loading (`js/data.js`) · state (`js/store.js`) · business logic (`js/engine/`) · UI (`js/screens/`, `js/components/`). Engine files must be **pure** (no DOM, no localStorage, no Date.now) so they can be unit-tested with Node.
- **Determinism:** same inputs → same outputs. Any randomness only in the data generator, with a fixed seed.
- **No fake AI.** No "AI is thinking…" spinners, no invented confidence numbers. Anything shown must be computed from data.
- Keep it small: ~20 files total. Edit in place; don't regenerate whole files. Comment every feature insertion point with `// FEATURE-SLOT: <name>`.

Copied from `Base_App_Prompt.md`, "Rules for the whole build":

- **Static front end only:** no backend, no database, no API keys. It must deploy as static files to GitHub Pages, Netlify or Vercel.
- **Designed for a 390px-wide phone screen**, with touch-sized targets.
- **Looks polished and modern.** Apply the design guidelines consistently on every screen: a clear visual hierarchy, generous spacing, one type scale, consistent components and considered empty and error states. Define colours, type and spacing once (for example as CSS variables) so the whole app can be restyled in one place. Keep the base's scope simple, not its look.
- **All data comes from files in the `data` folder.** Screens read from these files, never from values typed into the markup. Load them with relative paths (`data/...`, not `/data/...`) so the app still works when hosted in a subfolder, as on GitHub Pages.
- **A fixed demo date** read from the data and shown on screen. All date logic uses it, not the device clock.
- **A visible "Reset demo" control** that clears anything stored during the session (for example, submitted orders in localStorage).
- **Ready for the feature:** keep the cart in one state object with a way to subscribe to every change (add, remove, quantity edit). Leave clearly marked places **in the code** (empty containers with comments, nothing visible on screen) for extra content on the Landing page, in Outlet details, inside Order booking, and in Order review before submit. Keep data loading, cart logic and screen code in separate files.

Copied from `Base_App_Prompt.md`, "Keep the build small and recoverable":

- Use the personas for the sample outlets and keep the number of rows small. Design the order history files so they can hold at least last year's full season.
- Build only what the plan says. Suggest extras, but don't add them unless asked.
- For small changes, edit the file in place. Don't regenerate whole files.
- If a stage turns out bigger than planned, stop and propose splitting it.
- Keep this file complete enough that a new chat can carry on from it alone.
- If the conversation is running low on space, stop at a clean point, update this file, and say so.

Working rules that follow from the above:

- No `new Date()` without arguments, no `Date.now()`, no `Math.random()` and no `toLocale*` or `Intl` formatting anywhere under `js/`. Dates are ISO strings (`YYYY-MM-DD`) handled by `js/dates.js`; numbers and money by `js/format.js`.
- Browser code imports only `.js` files (Python's server does not serve `.mjs` with a module MIME type). `.mjs` is for Node tools and tests.
- Text from data goes into the DOM as text (the `h()` helper does this), never through `innerHTML`.

## 4. Decisions

From the foundation prompt (§2):

- Region: **Pune West, Maharashtra** (Warje, Kothrud, Bavdhan, Pashan). LY = 2025, TY = 2026.
- Demo date: **Tuesday 28 April 2026** (configurable in `data/config.json`). Distributor delivers **next day**; the distributor stock report is weekly, last **Mon 27 Apr 2026**.
- Rep: pre-seller "Sagar Jadhav", rep ID `R-PW-07`, beat "Pune West – Tue beat".
- **Generic product names** only ("Cola 250 ml PET"); no real brand names or logos. App label: "GT App" + a small "Demo" tag. The label is a literal in `ui.js` and `login.js`, since the schema has no app-name field.
- Currency ₹ with Indian digit grouping (₹12,450). Quantities in **cases** (units per case shown on the product row).

Made while building Stage 1:

- Everything lives inside `prototype/`, including `tools/` and `tests/`.
- `prototype/package.json` exists only to say `"type": "module"`, so Node 18+ loads `js/*.js` as ES modules for tools and tests. It has no dependencies and no scripts.
- Outlet ids are `OT-101` … `OT-109`, with the names from strategy §11.
- Every outlet's `area` is one of Warje, Kothrud, Bavdhan, Pashan. The dhaba's highway location is in its `address` and `locationContext`.
- Today's route order = the order of outlets in `data/outlets.json` (= persona order in `tools/personas.config.json`).
- Visit cadence: weekly = every 7 days, 3×/month = every 10 days, 2×/month = every 14 days, monthly = every 28 days, all anchored on the demo date; a Sunday moves to Monday. This gives the next visits in the strategy: 5 May (OT-101/102/105), 8 May (OT-103/104/108), 12 May (OT-106/107), 26 May (OT-109).
- "Cases" in history views means **booked** cases (`line.cases`), excluding free cases. Order value = Σ cases × `ptrCase` (price to retailer, before scheme discounts).
- A submitted demo order is merged into history with `deliveredCases: null` (delivery is tomorrow) and `demo: true`.
- Unbuilt routes showed a plain "not built yet" placeholder while the stages were being built. Every route has a screen since Stage 4 and the placeholder code is removed.
- "All outlets" sits in the summary card above the route list, so it is visible without scrolling at 390×844.

From `strategy/04_FINAL_DECISION_LOCK.md` (9 Oct) — the parts that touch the base:

- **OT-109** is a cash buyer with credit limit ₹3,000 and nothing outstanding (D11): `payment: "cash"` in `outlets.json`.
- **Generator v0.5 builds on this generator** (D6): keep the seasonal-multiplier model and add deterministic per-persona overlays. No daily inventory simulation, no `tools/_truth`, no backtest, no background outlets.
- **`cluster_benchmarks.json`** is a derived assumption table of peer curves by cluster × pack group (shape in §8). The engine reads it for the seasonal step-up.
- **In-transit orders count as stock** (D5). The data view exposes a submitted demo order as `demo: true` with `deliveredCases: null`; the engine counts it as stock on its way and never as sales history.
- **Never show owner-behaviour labels** anywhere (04 §Q.6). This is stricter than the foundation prompt, which allowed them inside the collapsed Rep notes. Overdue amounts appear only in Rep notes and the review banner.
- **Submit is disabled for an empty cart**, with "Add at least one line" (04 §L row 21). The store already ignores an order with no lines.
- Max cover per order is 14 days (D4), with a visit-gap flag. As built, the limit is on the visit gap: the delivery lead day is not counted against it, so an outlet visited every 14 days (window 15 days) is covered in full and is not flagged; only OT-109 (29 days) is capped.

## 5. Design system (foundation prompt §3)

Feel: calm, sunlight-readable, field tool not dashboard. Light theme only. Colour, type size, spacing and radius always come from variables in `css/tokens.css`.

- Colours: `--ink #0F1B2D` (text), `--ink-2 #4A5568`, `--line #E3E8EF`, `--bg #F5F7FA`, `--card #FFFFFF`, `--primary #0B5FFF` (actions), `--chill #0E9FB8` (cold/season accent), `--ok #12805C`, `--warn #B25E09`, `--risk #C2341B`, `--muted-bg #EEF2F7`. **Never carry meaning by colour alone**: always pair with an icon or a word.
- Derived tokens, as built:
  - surfaces and states: `--backdrop`, `--on-primary`, `--primary-hover`, `--primary-pressed`, `--risk-pressed`, `--card-pressed`, `--line-strong`, `--scrim`
  - a light tint per tone for chips and banners: `--primary-bg`, `--chill-bg`, `--ok-bg`, `--warn-bg`, `--risk-bg` (fixed hex values)
  - a text-safe shade per tone, 4.5:1 or better on its tint: `--primary-ink`, `--chill-ink`, `--ok-ink`, `--warn-ink`, `--risk-ink`. `--chill` itself is 3.1:1 on white, so it is for borders, icons and tints only.
  - demo bar: `--bar-bg`, `--on-bar`, `--on-bar-2`, `--bar-tint`, `--bar-pressed`
  - sizes: `--control-h` 48px, `--control-h-lg` 56px, `--bar-h` 48px, `--header-h` 56px, `--row-min` 72px, `--app-max` 430px, `--icon` 20px, `--menu-min` 208px, `--border` 1px, `--border-strong` 2px, `--focus-ring` 3px, `--safe-top`, `--safe-bottom`
  - motion: `--ease`, `--dur` 160ms
- Type: system UI stack (`-apple-system, Roboto, "Segoe UI", Inter, sans-serif`); scale 12 / 14 / 16 / 20 / 24 / 32 (`--fs-*`); weights 400 / 600 / 700; `font-variant-numeric: tabular-nums` on all numbers (class `num`).
- Spacing: 4-pt scale (`--sp-4` … `--sp-32`). Radius 12 (cards and controls), 999 (chips). One elevation level.
- Components: top demo bar, app header with back, card, list row, chip (channel/segment/cooler), stepper (− qty +, 48px buttons), sticky bottom action bar (primary button full width), bottom sheet, toast, empty state, inline banner (info/ok/warn/risk), text field, icon button.
- Inline SVG icons only (no icon fonts, no large images).
- **The retailer may see the screen**: rep-only information (overdue amount, credit notes) sits in a collapsed "Rep notes" row by default, never in large red text at the top.
- Layout: the app column is at most 430px wide, centred on `--backdrop`; no horizontal scroll at 360–430px; every interactive element is at least 48×48px. Disabled controls are not faded with opacity.
- A few layout literals remain in `app.css` on purpose: the tag's line-height, the sheet's `86dvh` max height, a 1px icon nudge, letter-spacing in `em`, outline offsets.

## 6. File map

All paths are inside `prototype/`. 33 files exist after the feature build, plus 9 data files.

| File | Purpose | Stage | State |
|---|---|---|---|
| `index.html` | Shell: `#demo-bar-root`, `<main id="screen">`, `#overlay-root`; static loading state; loads `css/*` and `js/app.js` | 1 | Built |
| `css/tokens.css` | Design tokens (CSS variables) | 1 | Built |
| `css/app.css` | Base, layout, components, screens | 1 | Built |
| `css/ro-order.css`, `css/ro-review.css`, `css/ro-outlet.css` | Styles for the Right Order parts of the order screen, the review screen, and the outlet card, landing badges and demo guide. Loaded after `app.css` (they override `.product__side` and `.hint`) | Feature | Built |
| `js/app.js` | Boot (load data → init store → router), hash router, the tap guard after a screen change, demo bar mount with the Demo guide menu item, reset side-effect | 1 | Built |
| `js/dates.js` | Pure ISO-date helpers; no device clock | 1 | Built |
| `js/format.js` | Pure formatters: ₹ with Indian grouping, numbers, case labels | 1 | Built |
| `js/data.js` | `loadAll()`, pure `buildData()`, indexes, selectors, demo-order merge | 1 | Built |
| `js/store.js` | State: `getState / dispatch / subscribe`, pure reducer, `gtdemo:` persistence; holds the stock count and the reasons of a visit | 1 | Built |
| `js/components/ui.js` | `h()` helper, inline SVG icons, all shared components | 1 | Built |
| `js/screens/login.js` | Login | 1 | Built |
| `js/screens/home.js` | Landing, with a Right Order badge per outlet and the stock-up line | 1 | Built |
| `js/screens/outlets.js` | Outlet list | 2 | Built |
| `js/screens/outlet.js` | Outlet details with the Right Order card and the stock check; exports `coldChain()` | 2 | Built |
| `js/screens/order.js` | Order booking with the Right Order strip, a hint under every stepper and the See why sheet; exports `openCart()`, `priceOrder()`, `packFacts()`, `lineNote()` for the review screen | 3 | Built |
| `js/screens/review.js` | Order review with the Right order check, reasons, the credit banner and submit | 4 | Built |
| `js/engine/recommendationEngine.js` | `recommend(ctx)`: the Right Order result (statuses, hints, scheme, credit, badge, pitch) | Feature | Built |
| `js/engine/cover.js` | The arithmetic for one outlet: window, calendar, run-rate, step-up, stock, the three numbers, caps | Feature | Built |
| `js/engine/params.js` | `PARAMS`: every coefficient of the engine | Feature | Built |
| `js/engine/schemes.js` | `evaluateSchemes(...)`, `cartLines()`, `productIndex()` | 3 | Built |
| `js/engine/pricing.js` | `priceCart(...)`: cart totals | 3 | Built |
| `tests/engine.test.mjs` | `node --test tests/engine.test.mjs`: schemes, pricing, data view, every step of the engine on fixtures, and property checks over 9 outlets × 300 seeded carts | 3 | Built |
| `tests/store.test.mjs` | `node --test tests/store.test.mjs`: cart, stock count, reasons | Feature | Built |
| `tests/personas.test.mjs` | `node --test tests/personas.test.mjs`: the rows of 04 §L that the engine alone decides, on the real data files, with every expectation worked out from the data | Feature | Built |
| `tools/personas.config.json` | All generator inputs: master data + persona parameters | 1 | Built |
| `tools/generate-data.mjs` | Seeded generator; writes `data/*.json` | 1 | Built |
| `data/*.json` | 9 generated files (see §8) | 1 | Built |
| `package.json` | `"type": "module"` for Node; no dependencies | 1 | Built |
| `PROGRESS.md` | This file | 1 | Built |
| `README.md` | Run, the flow to try, known limits, data, tests, deploy to GitHub Pages, layout | 5 | Built. The feature's last stage rewrites it (03 Stage E) |
| `.gitignore` | `.DS_Store` only | 5 | Built |
| `.nojekyll` | Empty. Tells GitHub Pages to serve the files as they are. Without it the Pages build runs Jekyll and fails on the `{{` in this file's code blocks (it did, on the first deploy) | Feature | Built |

## 7. Module contracts (as built)

These signatures are the contract between files. Change one only together with every caller, and update this section.

### 7.1 `js/dates.js` (pure)

Dates are ISO strings `YYYY-MM-DD` (calendar dates, no time zones). Arithmetic is on UTC day numbers; nothing reads the clock; results are the same in every time zone. ISO strings compare correctly with `<` and `>`.

```js
isValidISO(iso) → boolean
toDayNumber(iso) → number              // whole days since 1970-01-01
fromDayNumber(n) → iso
addDays(iso, n) → iso
diffDays(from, to) → number            // to − from in days; positive when `to` is later
weekday(iso) → 0..6                    // 0 = Sunday … 6 = Saturday
isoWeek(iso) → 'YYYY-Www'              // ISO-8601 week key with ISO week-year, e.g. '2026-W18'; '2025-12-29' → '2026-W01'
isoWeekStart(iso) → iso                // Monday of the ISO week containing iso
isoWeekToStart(weekKey) → iso          // Monday of 'YYYY-Www'
monthKey(iso) → 'YYYY-MM'
isBetween(iso, start, end) → boolean   // inclusive
formatDate(iso, style = 'short') → string
    // 'short' → 'Tue 28 Apr' · 'long' → 'Tue 28 Apr 2026' · 'dm' → '28 Apr' · 'full' → 'Tuesday, 28 April 2026' · 'day' → 'Tuesday'
relativeDay(iso, demoDate) → string    // 'Today' · 'Tomorrow' · 'Yesterday' · 'in 7 days' · '7 days ago'
```

Invalid input never throws: `formatDate` and `relativeDay` return `''`; `isoWeek`, `addDays`, `monthKey`, `isoWeekToStart` and `fromDayNumber` return `null`; `toDayNumber`, `diffDays` and `weekday` return `NaN`. Guard a possibly-null date (for example `nextVisit`) before formatting it.

### 7.2 `js/format.js` (pure)

```js
inr(amount) → '₹12,450'        // Indian digit grouping (1234567 → '₹12,34,567'), rounded to whole rupees; negative → '−₹500'
num(n, decimals = 0) → '1,23,456'
casesLabel(n) → '1 case' | '5 cases'      // one decimal only when n is not whole
plural(n, one, many) → string             // plural(2, 'outlet', 'outlets') → '2 outlets'
```

A missing, blank or non-numeric value gives `'—'`, never a zero.

### 7.3 `js/data.js`

No DOM, no localStorage, no clock. Only `loadAll()` touches the network.

```js
DATA_FILES   // { config: 'config.json', outlets: 'outlets.json', products: 'products.json', orders: 'orders_history.json',
             //   routePlan: 'route_plan.json', schemes: 'schemes.json', distributorStock: 'distributor_stock.json',
             //   calendar: 'calendar.json', clusterBenchmarks: 'cluster_benchmarks.json' }
async loadAll(base = 'data/') → data     // fetches all 9 in parallel with relative URLs and { cache: 'no-cache' }, prints validation
                                         // problems in one console.warn, builds and caches the view. Rejects with an Error that
                                         // names the file only when a file cannot be fetched or parsed.
validateRaw(raw) → string[]              // pure; warnings for missing required fields, unknown outlet ids or skus, bad dates
buildData(raw, submittedOrders = []) → data   // pure; raw = { config, outlets, products, orders, routePlan, schemes, distributorStock, calendar, clusterBenchmarks }
getData() → data                         // the current view; throws if loadAll() has not resolved
setSubmittedOrders(submittedOrders) → data    // rebuilds the current view with demo orders merged in, and returns it
```

The `data` view (engine code receives exactly this object as `ctx.data`):

```js
{
  config, demoDate,                      // demoDate === config.demoDate, or null when it is missing or invalid
  outlets, products, schemes, calendar, distributorStock, clusterBenchmarks, routePlan,
  outletsById, productsBySku,            // keyed by id / sku
  ordersByOutlet,                        // { [outletId]: Order[] } ascending by date, demo orders merged in

  // selectors — unknown ids return null / [] / {} / 0 / false, never throw
  ordersFor(outletId) → Order[]
  lastOrder(outletId) → { id, date, lines, cases, value, demo } | null   // the latest order dated on or before demoDate
  orderSummary(outletId, { weeks = 8 } = {}) → {
      weeks: [{ isoWeek, start, cases, value, orders, current }],
          // weeks + 1 entries, oldest first: the N completed ISO weeks before demoDate's week, then demoDate's own week
          // with current: true (all others false)
      totalCases, totalValue, orderCount, topSkus: [{ sku, cases }], avgCasesPerWeek }
          // all five cover the N completed weeks only; the current week's numbers live in its own entry
  weeklyCases(outletId, sku?) → { [isoWeek]: cases }                // all history; all SKUs when sku is omitted
  casesBetween(outletId, from, to, sku?) → number                   // booked cases with from ≤ date ≤ to
  nextVisit(outletId) → iso | null                                  // first route-plan date after demoDate
  todaysRoute() → outlet[]                                          // outlets whose plan contains demoDate, in outlets.json order
  visitedToday(outletId) → boolean                                  // a demo order dated demoDate exists for the outlet
  availableCredit(outletId) → { known, bookedToday, available }
      // the one rule for available credit: limit − outstanding − bookedToday, never below 0. bookedToday = the stored
      // `value` (amount to pay) of the outlet's submitted demo orders dated demoDate. known is false and available is
      // null when the limit or the outstanding amount is missing. The review banner and Rep notes both read this.
  schemesActiveOn(date, outlet) → Array<scheme & { eligible: boolean, reasonIfNot: string | null }>
      // schemes with validFrom ≤ date ≤ validTo; eligible = outlet.segment is in eligibleSegments;
      // reasonIfNot is built from data, e.g. 'Only for Diamond, Gold and Silver outlets. This outlet is Bronze'
  orderCases(order) → number                                        // Σ line.cases
  orderValue(order) → number                                        // Σ line.cases × product.ptrCase
}
```

`Order` = `{ id, outletId, date, lines: [{ sku, cases, freeCases, deliveredCases }], demo? }`.

Things a caller must know:

- `weeks` counts **completed** ISO weeks. With the default 8 on the demo date the entries are 2026-W10 … W17 plus W18 (current). `weeks` is clamped to 1–520; anything invalid means 8. A demo order dated the demo date changes only the current entry and `lastOrder`.
- `outletsById`, `productsBySku` and `ordersByOutlet` are prototype-less objects. Reading an unknown key gives `undefined`; do not call `.hasOwnProperty` on them. Outlet ids are strings.
- **An order dated after the demo date is not in the view at all.** `buildData()` leaves it out in one place, so `ordersFor`, `lastOrder`, `orderSummary`, `weeklyCases` and `casesBetween` never see it (the generator writes history up to the day before the demo date; this matters when `demoDate` is changed by hand).
- `lastOrder().value` and `orderValue()` are always recomputed at PTR. The `value` and `recommendationSnapshot` stored on a submitted order are not carried onto the merged order; the stored `value` is used only for `availableCredit().bookedToday`.
- A merged demo order has `demo: true` and `deliveredCases: null` on every line. Its lines may have been stored as an array or as a `{ sku: cases }` map; both are normalised. A demo order with an invalid date, or for an outlet id that is not in the data, is ignored by the view.
- A line with an unknown sku counts toward cases and adds 0 to value.

### 7.4 `js/store.js`

```js
PREFIX = 'gtdemo:'
initialState() → state
reduce(state, action, ctx) → state       // pure; ctx = { demoDate, saved? }, where saved = { cart, visit } is passed on outlet/select
createStore({ storage, demoDate, schemaVersion } = {}) → { getState, dispatch, subscribe }
    // storage has the localStorage interface; default window.localStorage, falling back to memory when it is missing or throws.
    // The store hydrates itself from storage when it is created.
initStore({ demoDate, schemaVersion, storage } = {}) → store     // createStore + the app singleton
getStore() → store                                               // throws if initStore() has not run
clearDemoStorage(storage?)                                       // removes every key starting with 'gtdemo:' and nothing else
```

`subscribe(fn)` returns an unsubscribe function. `fn(state, action)` is called **synchronously** after every dispatch. A dispatch made from inside a subscriber is queued and applied when the current notification finishes, before the outer `dispatch()` returns.

State (shape fixed by the foundation prompt, §5):

```js
{ session: { loggedIn, repName },
  currentOutletId,
  cart: { outletId, lines: { [sku]: cases } },
  visit: { outletId, startedAt /* demo date */, stockOnHand: { [sku]: cases | null }, reasons: { [sku]: reasonCode } },   // the stock count and the reasons of this visit
  submittedOrders: [ { id, outletId, date, lines: [{ sku, cases, freeCases }], value, recommendationSnapshot } ] }
```

Actions:

| Action | Effect |
|---|---|
| `{ type: 'session/login', repName }` | `session = { loggedIn: true, repName }` |
| `{ type: 'session/logout' }` | `session = { loggedIn: false, repName: null }` |
| `{ type: 'outlet/select', outletId }` | Sets `currentOutletId`; swaps in that outlet's saved cart and visit, or fresh ones (`visit.startedAt = demoDate`). No `outletId` deselects. |
| `{ type: 'cart/setQty', sku, cases }` | Whole number 0–999; 0 or less removes the line. A non-number is ignored with a warning. |
| `{ type: 'cart/add', sku, delta }` | Adds `delta` (may be negative), same clamping |
| `{ type: 'cart/remove', sku }` | Removes the line |
| `{ type: 'cart/clear' }` | Empties the lines |
| `{ type: 'cart/replace', lines }` | Replaces all lines with `{ [sku]: cases }` (for "Start order with suggestion") |
| `{ type: 'visit/setStock', sku, cases }` | `cases` is a number or `null` |
| `{ type: 'visit/setReason', sku, reason }` | `reason` is a short string (trimmed, at most 40 characters); `null` or a non-string clears it. Codes in use: `retailer_asked`, `event`, `other` (a line that is over), `has_stock`, `cash_tight`, `wants_less`, `buys_elsewhere` (short or missing) |
| `{ type: 'order/submit', order }` | Appends to `submittedOrders` and empties that outlet's cart. Fills in whatever the order lacks: `id`, `outletId` (current outlet), `date` (demo date), `lines` (from the open cart, `freeCases: 0`), `value` (null) and `recommendationSnapshot` (null). Ignored with a warning when no line has cases above 0. The reducer cannot price an order, so the review screen must pass `value` and the lines with their `freeCases`. Any extra field on the order is kept: the review screen adds `reasons` (`{ sku: code }`, only those that apply) and `stockOnHand` (a copy of the visit's). A submit clears that outlet's reasons and keeps its stock count. |
| `{ type: 'demo/reset' }` | Back to `initialState()` and clears `gtdemo:` storage; `app.js` then reloads the page |

Cart and visit actions are ignored (with a `console.warn`) when no outlet is selected.

Persistence:

- Keys: `gtdemo:meta` (`{ schemaVersion, demoDate }`), `gtdemo:session`, `gtdemo:submittedOrders`, `gtdemo:cart:<outletId>`, `gtdemo:visit:<outletId>`.
- `gtdemo:meta` is written on the first persist, never at start. A fresh or just-reset demo holds no `gtdemo:` key at all.
- At start, a meta that differs from the current `schemaVersion` or `demoDate` clears every `gtdemo:` key; so do `gtdemo:` keys with no meta. Stale carts never survive a data change.
- Only `session` and `submittedOrders` are restored at start. `currentOutletId`, cart and visit come back when a screen dispatches `outlet/select`.
- Storage errors and corrupt JSON are swallowed; the app keeps working in memory.

Demo order ids: `D-<outletId>-<YYYYMMDD>-<n>`, where `n` counts that outlet's submitted orders.

### 7.5 `js/components/ui.js` (DOM only; no data or store imports)

```js
h(tag, props?, ...children) → HTMLElement
    // props: class (string or array, falsy entries dropped), id, text, href, type, value, placeholder, name, for, role, title,
    //        hidden, disabled, dataset: {…}, attrs: {…}, style: {…} (custom properties allowed), on<Event> handlers
    // children: Node | string | number | null | false | arrays of these; strings become text nodes
icon(name, { size = 20, title } = {}) → SVGElement      // aria-hidden unless title is given; an unknown name draws 'info'
    // names: back, chevron-right, more, reset, calendar, store, route, check, info, warn, risk, snow, search, plus, minus,
    //        close, user, lock, cart, truck, chevron-down, arrow-up, arrow-down, tag
button(label, { variant = 'primary', icon, iconEnd, href, onClick, type = 'button', block = false, disabled = false, ariaLabel } = {})
    → <button> or <a>                                    // variants: primary | secondary | ghost | danger
iconButton(iconName, label, { href, onClick, variant = 'plain', disabled = false, size = 24 } = {})
    → 48×48 icon-only <button> or <a>; label is the accessible name   // variants: plain | outline | on-bar
chip(label, { tone = 'neutral', icon } = {}) → HTMLElement   // tones: neutral | primary | chill | ok | warn | risk;
                                                             // ok, warn, risk and chill get a default icon
demoTag(label = 'Demo') → HTMLElement
filterChip(label, { pressed = false, onClick } = {}) → <button aria-pressed>
    // selectable chip, 48px hit area; the chosen chip is filled and shows a tick; .setPressed(bool), read-only .pressed
filterChips({ label, options, value = null, onChange } = {}) → HTMLElement (role="group", aria-label = label)
    // one row of filterChip, one choice at a time; options: [{ value, label }]; a long row scrolls sideways inside itself
    // (it runs to the screen edges, so place it directly inside a .screen); .setValue(v) does not fire onChange; read-only .value
tabs({ label, options, value, onChange, controls } = {}) → HTMLElement (role="tablist", aria-label = label)
    // one row of role="tab" buttons, one selected (aria-selected, roving tabindex, Left/Right arrows); options: [{ value, label }];
    // controls = id of the element the tabs switch (aria-controls); a long row scrolls sideways inside itself (it runs to the
    // screen edges, so place it inside a .screen); the class 'tabs--paused' on the row greys the selected tab;
    // .setValue(v) does not fire onChange; read-only .value
card(props, ...children) → HTMLElement                   // props may be null; class is appended to 'card'; 'row-list' for a list of rows
listRow({ title, subtitle, meta, leading, trailing, href, onClick, ariaLabel } = {}) → <a>, <button> or <div>
    // meta, leading and trailing take a Node, a string or an array
demoBar({ dateLabel, onReset, appName = 'GT App', tagLabel = 'Demo', menuItems = [] } = {}) → HTMLElement
    // menuItems: [{ label, icon, onSelect }], shown above Reset demo. FEATURE-SLOT: demo-menu
appHeader({ title, subtitle, backHref, backLabel = 'Back', trailing } = {}) → HTMLElement
actionBar(...children) → HTMLElement                     // sticky bottom action bar
textField({ label, name, type = 'text', value = '', placeholder, autocomplete = 'off', icon, inputmode, hideLabel = false } = {})
    → HTMLElement with .input (the <input>, id 'f-<name>') and .setInvalid(invalid, messageId?);
    // hideLabel keeps the label for screen readers only
stepper({ value = 0, min = 0, max = 999, label = 'Quantity', onChange } = {})
    → HTMLElement with .setValue(n) (does not fire onChange) and read-only .value;
    // when − or + disables itself (at min or max) while focused, focus moves to the other button
disclosure({ title, hint, icon, content, open = false, onToggle } = {}) → HTMLElement
    // a card whose header is a button (aria-expanded, aria-controls) showing or hiding a role="region"; closed by default;
    // hint is the line under the title and stays visible when closed; the button also says Show / Hide;
    // .setOpen(bool) does not fire onToggle; read-only .open
factList(items) → <dl>                                   // items: [{ label, value }]; value: Node, string, number or array;
                                                         // falsy items and items with no value are left out
barRow(bars, { label } = {}) → HTMLElement (role="img", aria-label = label)
    // tiny bar row with no axis; bars: [{ value, text?, caption?, align?, outlined? }]: text is printed above the bar
    // (default the value), caption under it (align 'start' | 'center' | 'end' says which way a long caption runs),
    // outlined draws a dashed outline in its own wider column (a period that is not finished); a value of 0 draws a stub;
    // heights are relative to the largest value in the row
banner({ tone = 'info', title, text, role = 'note', action } = {}) → HTMLElement   // info | ok | warn | risk; always icon + words
emptyState({ icon = 'info', title, text, action, level = 2 } = {}) → HTMLElement   // level = heading level, 1 to 3; action: Node or array
toast(message, { tone = 'neutral', ms = 2600 } = {}) → { close }                   // one toast at a time
openSheet({ title, content, actions, onClose } = {}) → { close, element }
    // bottom sheet in #overlay-root; backdrop tap, the close button, Esc and a route change close it; focus is trapped and restored
confirmSheet({ title, text, confirmLabel = 'OK', cancelLabel = 'Cancel', tone = 'risk' } = {}) → Promise<boolean>
    // the confirm button ignores taps for the first 500 ms, so a double tap on the opener cannot confirm by accident
confirmResetDemo() → Promise<boolean>                    // the one place the Reset-demo wording lives
```

Demo bar menu behaviour: an outside tap only closes the menu (the tap is swallowed); Tab and Esc close it; choosing an item returns focus to the toggle first.

CSS helpers added with these (in `app.css`, for any screen): `.panel` (card content with padding), `.stat` with `.stat__value` (24px; `.stat__value--20` for 20px) and `.stat__label` (a key number and its label), `.meta-line` (a quiet line of detail with an optional icon), `.visually-hidden` (for screen readers only).

### 7.6 `js/app.js`, routing and screens

- Boot: the static loading state in `index.html` stays until data loads → `loadAll()` → `initStore({ demoDate, schemaVersion })` → `setSubmittedOrders(state.submittedOrders)` → start the router.
- Load errors show an error screen that names the problem and the local-server command, and write one `console.error`. This covers a file that cannot be fetched or parsed, and a missing or invalid `config.demoDate`. If the module never runs (file opened directly), the static help line appears after 6 seconds.
- The store subscription in `app.js` keeps the data view in step (`setSubmittedOrders` after `order/submit`) and performs the reset side-effect: on `demo/reset`, set the hash to `#/login` and reload.
- Reset demo anywhere = `if (await confirmResetDemo()) getStore().dispatch({ type: 'demo/reset' })`.
- Routes live in the `ROUTES` table: `#/login` (public), `#/home`, `#/outlets`, `#/outlet/:id`, `#/order/:id`, `#/review/:id`. Not signed in → `#/login`. Signed in on `#/login`, an empty or unknown hash, or a route that needs an id and has none → `#/home`. Redirects use `location.replace`, so Back never passes through `#/login`.
- `params` is `{ id, from }`. `from` is the hash of the screen the user was on before this one (for example `'#/outlets'`), or `null` on a first load. A repaint of the same hash keeps the `from` it had.
- Scroll: the router sets it (`history.scrollRestoration = 'manual'`). Routes marked `keepScroll` in `ROUTES` (`home`, `outlets`) remember their scroll position when the user leaves and get it back on every return, by a link or by browser Back. Every other navigation starts at the top. The memory lives in the page, so a reload or Reset demo clears it.
- Every route in `ROUTES` has a screen module. The "not built yet" placeholder renderer is removed.
- Tap guard: for 500 ms (`SETTLE_MS`) after the screen changes to another hash, a capture-phase listener on `#screen` swallows every click, so the second tap of a double tap cannot press what has just appeared under the finger (Review then Submit, Submit then a route row, Back twice). It does not apply to the first paint, to a repaint of the same hash, or to the demo bar and sheets (they are outside `#screen`). A browser test must wait 500 ms after a navigation before it taps.
- Each screen module exports `render(container, params)` and may return a cleanup function. The router calls the previous cleanup before every navigation.
- The demo bar is mounted once in `#demo-bar-root` and is hidden on the login screen.

Stage 2 screens:

```js
// js/screens/outlets.js
render(container) → void
// js/screens/outlet.js
render(container, { id, from }) → void
coldChain(cooler) → { label, icon, tone, detail }
    // cold-chain state in words from outlet.cooler. label: 'Bottler cooler' | '2 bottler coolers' | 'Own fridge' | 'Ice box' |
    // 'No cooler' | 'Cooler not known'; detail adds the litres ('2 bottler coolers · 300 L each'); icon and tone are for chip()
```

- Outlet list: the search text and the two filter choices live in a module variable in `outlets.js` (`null` = "All"), not in storage. They survive a visit to an outlet and are cleared by a reload, so by Reset demo. Typing rebuilds only the count line and the rows. The segment tier order is the constant `SEGMENT_ORDER`; a segment not in it sorts last.
- Outlet details: dispatches `outlet/select` on render (not for an unknown id). Back points to `from` when it is `#/home` or `#/outlets`, and that choice is remembered per outlet in a module variable, so coming back from `#/order/:id` or `#/review/:id` does not change it. A direct load points Back at today's route. The outlet name is an `h2` in the body (the header's `h1` is "Outlet details") and section titles are `h3`.
- Outlet details does not subscribe to the store: nothing it shows can change while it is open. It is rebuilt on every navigation, so a submitted order shows on the next visit.
- "Last N weeks" takes N from the number of completed weeks `orderSummary` returns. A scheme's terms sentence is built in `schemeTerms()` from `type`, `buyCases`, `freeCases`, `pctOff`, `minCases`, `pooled` and `capPerMonth`; an unknown `type` shows the name, products and end date without a terms line.

Stage 3 screen:

```js
// js/screens/order.js
render(container, { id }) → cleanup function (undefined for an unknown id)
openCart(store, data, outlet) → void        // dispatches outlet/select, then cart/remove for every saved sku that is not in the product master
priceOrder(data, outlet, cart) → { schemeResults, totals }
    // evaluateSchemes (with all of the outlet's orders; the engine keeps this month's, up to the demo date) + priceCart.
    // The one place a screen prices an order: order booking and review both call it.
packFacts(product) → Node[]                 // '28 per case', '₹476 a case'
lineNote(line) → string                     // '+1 case free · ₹136 off' for a priced cart line, or ''
// not exported, but the two functions the feature replaces:
renderBookingPanel(slot, result) → void     // result = recommend() output; fills div#slot-booking-panel
renderLineHint(slot, line) → void           // line = the result line for the row's sku, or null (then the slot is emptied)
```

- Order booking calls `openCart()` on render (not for an unknown id), then subscribes to the store and returns the unsubscribe as its cleanup. Back points to `#/outlet/<id>`; Review goes to `#/review/<id>` and works with an empty cart.
- One row object per product is built once (`productRow()` → `{ el, update(view) }`). Changing the tab or the search only moves row nodes into a new list; a cart change never rebuilds a row. `sync()` runs on every store notification and does nothing unless `state.cart` or `state.visit` is a new object (so a `visit/setStock` reruns `recommend()` too): it calls `priceOrder()` and `recommend`, then updates each row whose values changed, the footer and the booking panel. A row redraws its hint whenever any field of its recommendation line changes.
- Tabs: "Usual items" (the products `recommend()` returns a line for with an empty cart: in v0, those booked in the `CANDIDATE_DAYS` = 56 days before the demo date; the words "the last 8 weeks" are built from the same constant), then one per `product.category` in product-master order, capitalised; a product with no category goes under "Other". When the real engine changes its candidates, this tab follows with no edit. The opening tab is Usual items when it is not empty. The tab is not remembered between visits to the screen.
- Search looks in name, flavour and sku of all products while it has text; the tabs are greyed then, the list's `aria-label` reads "Search results" instead of "Products", and a tap on any tab clears the search.
- A scheme chip is shown for each scheme from `data.schemesActiveOn(demoDate, outlet)` that is eligible and lists the product. Its words come from `schemeOffer()` ("Buy 10, get 1 free", "8% off from 5 cases"). When a scheme's monthly cap is already used (`capReached` with no trigger in the cart) the chip reads "Monthly scheme limit reached" (the wording of 04 §L row 22). The chips sit in the left column under the pack facts, beside the stepper; a chip that does not fit runs to a second line and is never cut short.
- A row in the order has a bar on its left edge, an "In order" line with a tick, its value after scheme discount (`line.netValue`), and "+1 case free" or "₹136 off" when a scheme applies to it. The footer shows total cases, a "+N cases free" chip, the net order value and, when there is one, "After ₹N scheme discount".
- Status words used in both slots: Not added, Below, On target, Above, None needed, Not available, each with an icon. The booking panel counts lines per status ("10 not added · 1 below"), which is what changes on a tap in v0.

Stage 4 screen:

```js
// js/screens/review.js
render(container, { id }) → cleanup function (undefined for an unknown id)
```

- Order review calls `openCart()` on render (not for an unknown id), then subscribes to the store and returns the unsubscribe as its cleanup. Back and the "Add items" button both point to `#/order/<id>`.
- `sync()` runs on every store notification and does nothing unless `state.cart` is a new object: it calls `priceOrder()` from `order.js`, then updates in place. One row object per cart line (`lineRow()` → `{ el, update(line) }`) is built once and kept. A line that reaches 0 **stays in its place** showing 0, "Removed from the order" and ₹0, and is left out of the totals and the saved cart; a tap on + brings it back. No row moves or disappears while the screen is open, so a double tap on − cannot land on the next product. The rows at 0 are gone the next time the screen opens. Rows are put in product-master order only when a row is added.
- Lines reuse the order screen's `.product*` styles: name, units per case and price, a stepper (0–999), "Line value" with the value after scheme discount (`line.netValue`), and on its own line under it "+1 case free" or "₹136 off" when a scheme applies.
- Scheme benefits: one item per scheme result that is eligible and gives something for this cart, worded by `benefitText()`: "1 case of <product> free." (from `freeCases` and `freeSku`) or "8% off. ₹136 less to pay." (from `discountPct` and `discountValue`). The section is hidden when no scheme applies.
- Totals: Total cases (a number), Free cases ("+1 case" or "None"), Order value at price to retailer (`grossValue`), Scheme discount (only when above 0), and "To pay" (`netValue`, 24px).
- Footer: the sticky bar reuses the order screen's `.order-bar`: total cases on the left, "To pay" and the amount (24px) on the right, Submit under them. When the order is over the available credit a warn chip "Over credit" (icon and words, no amount) sits beside the cases, so neither the amount nor the warning is below the fold.
- Credit banner (`creditCheck(credit, toPay, room)` → `{ over, tone, title, text }` for `banner()`, where `room` = `data.availableCredit(outlet.id)`): available = limit − outstanding − what the outlet booked today in the demo, never below 0 (the rule lives in `data.js`, §7.3). When something was booked today the text reads "Available credit ₹N after today’s orders." This goes one step past the foundation prompt's formula so that a second order at the same outlet does not show the same credit as the first; **confirm with the owner** (to go back to the literal formula, drop `bookedToday` in `availableCredit()`). To pay ≤ available → tone ok, "Order fits the available credit", with the available amount and what is left; when the outlet has an overdue amount the same case is tone warn with the title "Fits the credit. Payment is overdue." Otherwise tone warn, "₹N more than the available credit", with the available amount, the amount to pay and "You can still submit." An overdue amount adds "Overdue ₹N for D days." to the same text. A missing limit or outstanding gives an info banner "Credit limit not known". The banner never disables Submit.
- Empty cart: "Add at least one line" (an `h3`) with "This order has no products yet."; the benefits, totals and banner are hidden, and Submit is disabled. When the rep has taken every line to 0 on this screen, the rows stay above the card and its text reads "Every line is at 0. Tap + on a line, or add items."
- Rep notes on outlet details read the same `data.availableCredit()`: "Available" always equals the figure in the review banner, and a "Booked today ₹N" row appears above it once an order was booked for the outlet today.
- Submit: prices the cart again, runs `recommend()` for it, dispatches `{ type: 'order/submit', order: { outletId, lines: [{ sku, cases, freeCases }], value: totals.netValue, recommendationSnapshot: result } }`, shows the toast "Order saved · N cases · ₹N" (tone ok) and sets the hash to `#/home`. A `submitted` flag set before the dispatch makes a second tap do nothing and stops the screen repainting as empty on its way out. Nothing else is needed for the rest of the app to show the order: `app.js` calls `setSubmittedOrders` on `order/submit`.
- Decision: "last order value" on outlet details stays the value at price to retailer, for demo orders too. Its label reads "N cases · before scheme discount", so it does not look like a mismatch with the amount to pay; a demo order shows its date and the "Booked today" chip, without the word "Today" a second time. The amount to pay is kept on the stored order as `value`.

### 7.7 `js/engine/` (pure: no DOM, no storage, no clock; never throw)

```js
// js/engine/schemes.js (imports ../dates.js)
evaluateSchemes(cart, outlet, schemes, products, date, monthToDateOrders) → Array<{
    schemeId, name, type, skus, pooled, eligible, reasonIfNot, qualifyingCases, threshold, triggers, freeCases,
    casesToNextTrigger, capPerMonth, triggersUsedThisMonth, capReached, freeSku, discountPct, discountValue }>
    // one result per scheme valid on `date`, in file order; [] for an invalid date or missing schemes
cartLines(cart) → { [sku]: cases }          // prototype-less; takes the store's cart object or a lines map
productIndex(products) → { [sku]: product } // prototype-less; takes the products array or a map

// js/engine/pricing.js (imports ./schemes.js)
priceCart(cart, products, schemeResults) → {
    lines: [{ sku, cases, ptrCase, value, freeCases, discount, netValue }],
    cases, freeCases, grossValue, discount, netValue }

// js/engine/recommendationEngine.js (imports ../dates.js, ../format.js, ./schemes.js, ./pricing.js, ./params.js, ./cover.js)
recommend({ outlet, cart, visit, data, demoDate }) → the Right Order result (engineVersion 'v1-cover'); full shape below
CANDIDATE_DAYS   // 84: a product is a candidate when it was booked in the last 12 weeks

// js/engine/cover.js (imports ../dates.js, ./params.js): the arithmetic for one outlet
windowFor(outlet, data, demoDate) → { nextVisit, planned, lead, nextDelivery, horizonDays, days, capped, coversTill }
historyFor(outlet, data, demoDate) → { history, transit, weekly, orderingWeeks, firstDate }   // demo orders are transit, not history
calendarFor(outlet, data, demoDate, weekly) → { closures, short, material, effects, factor(date), normalDays(from, days) }
seasonPhase(data, demoDate) → 'ramp' | 'peak' | 'tail' | 'off'
numbersFor({ product, outlet, data, demoDate, win, hist, cal, phase, checked }) → the quantities for one product (rate, stepUp, mu, buffer, stock, recommended, low, high, caps, flags …)
runOutDate(numbers, cal, demoDate, cases) → iso | null
statusOf(numbers, cartCases) → 'unavailable' | 'missing' | 'none_needed' | 'short' | 'over' | 'right'

// js/engine/params.js: PARAMS, every coefficient in one object
```

`evaluateSchemes`:

- `cart` and `products` may be the store's cart object or a lines map, and the products array or a map.
- `eligible` = the outlet's segment is in `eligibleSegments`. `reasonIfNot` uses the wording of `data.schemesActiveOn` ("Only for Gold and Silver outlets. This outlet is Bronze"; the two modules each build it, change both together), or "Outlet segment not known". An ineligible outlet still gets `threshold`, `qualifyingCases`, `capPerMonth` and `discountPct`, with zero benefits.
- `buy_x_get_y`: `threshold` = `buyCases`; pooled triggers = floor(total over the scheme skus ÷ `buyCases`), not pooled = the sum of the per-sku floors. `triggersUsedThisMonth` is counted per order from `monthToDateOrders` and capped at `capPerMonth`; the cart's `triggers` are limited to what the cap leaves. `freeCases` = triggers × the scheme's `freeCases`. `freeSku` is the scheme sku in the cart with the lowest PTR (ties: larger quantity, then scheme order), or null with no trigger; a product whose `ptrCase` is missing, null, blank or not a number has no price and is chosen only when no priced product is in the cart. `capReached` = used + triggers ≥ cap. `capPerMonth` null means no cap; 0 is a real cap.
- `pct_off_min_qty`: `threshold` = `minCases`, `discountPct` = `pctOff`. Pooled: every scheme line is discounted once the total reaches the minimum. Not pooled: only the skus that reach it alone. `discountValue` is in whole rupees, rounded half up, never above the value of the discounted lines. `triggers` is 1 or 0.
- `casesToNextTrigger` is null both for an ineligible outlet and when the cap is reached: read `eligible` and `capReached` to pick the wording. For a percentage scheme it is 0 once the minimum is met.
- `monthToDateOrders` is filtered again inside: only orders with a valid date in the month of `date` and not after `date`, not another outlet's, and inside the scheme's validity count. Passing all of an outlet's orders is safe.
- A scheme with invalid `validFrom` or `validTo` is skipped. An unknown `type`, or a `buyCases` / `minCases` that is not positive, gives `threshold: null` and zero benefits. A sku listed twice in a scheme counts once.
- Quantities: numbers and numeric strings above 0 and up to 1,000,000 count; anything else is dropped. Fractions are not rounded (the store only holds whole cases).

`priceCart`:

- Always price with the scheme results computed from the same cart in the same pass; stale results are not re-checked.
- `value` = cases × `ptrCase` (0 for an unknown sku). `freeCases` sit on the scheme's `freeSku` line. A percentage scheme's discount is split over its discounted lines in proportion to value, in whole rupees; the shares add up exactly to `discountValue` and are never negative. `netValue` = `value` − `discount`; totals are the sums.
- Lines come out in product-master order when `products` is an array (cart skus not in the master last), in cart order when it is a map.

`recommend` (the Right Order engine, `v1-cover`; logic = `../strategy/04_FINAL_DECISION_LOCK.md` §F, written 10 Oct):

```js
recommend({ outlet, cart, visit, data, demoDate }) → {
  engineVersion: 'v1-cover',
  state: 'active' | 'quiet' | 'insufficient_data' | 'not_applicable',   // quiet = every key line is right, not needed or unavailable
  headline: string | null,      // ≤ 60 chars: "Add ~11 cases · lasts till Wed 6 May" | "Top up ~3 cases · …" | "Covered till Wed 6 May" | "<closure name> from 9 May · order for 8 days"
  horizon: { nextVisit: iso | null, days },                       // days to the next visit (the foundation's field)
  window: { days, horizonDays, capped, nextDelivery, coversTill, flag },   // H = horizonDays, W = days = min(H, 14); flag: "Visit gap 29 days — covers 2 weeks. Ask for a top-up"
  outletBadge: 'stockup' | 'covered' | 'golight' | 'checkdata' | null,
  lines: [{ sku, isKey, recommendedCases, rangeLow, rangeHigh, cartCases,
            status: 'unavailable' | 'missing' | 'none_needed' | 'short' | 'over' | 'right',
            hint,               // ≤ 48 chars, the words under the stepper ("Short · runs out ~Sat 2 May", "Lasts till Wed 6 May", "Over · ~4 weeks of stock", …)
            reasonShort,        // ≤ 50 chars
            confidence: 'high' | 'medium' | 'low', confidenceText,   // "Medium · 1–5"
            lastsTill,          // the day the stock on hand plus this cart line runs out, or null
            flags,              // supply_out, supply_low, supply_rationed, glass_cap, visit_gap, closure, event, in_transit, stock_checked, peer, ignored_weeks
            substitute: { sku, name } | null,
            stock: { cases, counted, inTransit, estimate }, weeklyRate,
            why: { facts: [{ label, value }], talkingPoints: string[], steps: [{ label, value }] } }],
  nudges: [{ type: 'scheme' | 'supply' | 'event' | 'stock_check', sku?, text, action?: { sku, setCases } }],
  quickSets: { suggested: { [sku]: cases }, minimum: { [sku]: cases } },   // do not depend on the cart
  pitch: string,                // ≤ 150 chars
  credit: { known, available, bookedToday, cartValue, fits: true | false | null, priority: [sku], unlockByCollecting, text },
  scheme: null | { schemeId, name, eligible, reasonIfNot, pooledCases, threshold, toNext, freeCases, capReached, limitReached, text,
                   nudge: null | { text, action: { sku, addCases, setCases } }, honestNote: null | string },
  explain: { inputs: { outletId, demoDate, nextVisit, nextDelivery, days, windowDays, engineVersion }, steps: [{ label, value }] } }
```

How it decides (04 §F), and the readings made where §F leaves room:

- **Window.** H = (next visit + `config.distributor.deliveryLeadDays`) − demo date; with no planned visit the gap is 30 ÷ visits per month. W = min(H, 14). When H > 14 the window is capped and `window.flag` says so.
- **Candidates** = products booked in the last 12 weeks, plus a focus product the peer level gives a rate for (only an outlet with fewer than 4 clean weeks). A returnable product needs `outlet.glass`. **Key** = the top 4 by expected demand. A cart product with no line is not a candidate: the screen shows "No sales history here".
- **Run-rate** = average weekly booked cases over the last 4 seven-day buckets before the demo date. A bucket that overlaps a `calendar.supplyHistory` entry for the product, and the bucket after it, are left out. With fewer than 4 clean buckets and a peer level (`clusterBenchmarks.level[cluster][sku]` × the curve now): `(n·own + 6·peer) / (n + 6)`.
- **Step-up** = the peer curve (`clusterBenchmarks[outlet.cluster][single|takehome]`, read at the same ISO weeks last year: date − 364 days) averaged over the next W days ÷ averaged over the last 28 days. It is averaged with the outlet's own last year only when that window is clean for the product: no supply-out, no closure, no short event whose week clearly differed. The outlet's own ratio is read over its whole pack group (one product's orders are too few), over at least 14 days. Clipped to 0.3–2.0.
- **Calendar.** A closure day counts as zero demand. A short event (≤ 14 days, not a closure) from the demo date on multiplies its days by the outlet's own last-year ratio for the event with the same `series` (that week ÷ its neighbouring ordering weeks, capped at 2.0), only when that ratio differs from 1 by at least 30%.
- **Buffer** = 0.84 × CV × weekly rate × √(W ÷ 7) for single-serve in ramp or peak (`config.season`); none for take-home, the tail or off-season. CV comes from the product's own orders in the last 12 weeks when there are at least 4, else from `clusterBenchmarks.cv`; clipped to 0.25–0.8.
- **Stock** = counted by the rep (`visit.stockOnHand[sku]`, then the uncertainty is 0), else an estimate: the last delivery (delivered + free cases) less the run-rate since its delivery day, never below 0, with an uncertainty of 35% (at least half a case). Cases in transit (orders submitted in the demo, cases + free cases) are added on top.
- **Numbers** (round half up): `rec = max(0, round(μ + buffer − stock))`; `low = min(rec, max(0, round(μ − stock − u)))`; `high = max(rec + 1, round(μ over W + 7 days + u − stock))`.
- **Caps**, applied to all three; when one binds the ceiling is the cap: distributor status `out` → 0 and `unavailable`, with a substitute read from the product master (same category and serve, available, same flavour first, nearest pack size); a returnable product → the outlet's `glass.emptiesOnHand`; a capped window → the ceiling is the 14-day quantity.
- **Status**, first match: unavailable, missing (cart 0, rec > 0), none needed (cart 0, rec 0), short (cart < low), over (cart > high), right.
- **Confidence** from 3 checks: stock counted, at least 8 weeks with an order, H ≤ 14. None failed = high, one = medium, more = low.
- **Scheme** = the first buy-and-get scheme from `evaluateSchemes()` that covers a line. Within 2 cases of the next trigger, eligible and under the monthly limit: a nudge when the pooled cart plus the gap stays within the sum of the pooled lines' ceilings (placed on the line with the most room; the free case is valued at the PTR of the product `evaluateSchemes` would give free), else an honest note. "Monthly scheme limit reached" only for `capReached && triggers === 0`.
- **Credit** = `data.availableCredit()` against the amount to pay (`priceCart().netValue`). `priority` lists the cart's products by the day their stock alone runs out, earliest first. `text` is set only when the order does not fit.
- **Badge.** go light when a closure starts inside the window plus 6 days, or the season is in its tail, until an order is booked today and every key line is settled; else covered when every key line is right, not needed or unavailable; else stock-up talk when a key line is missing or short and the outlet needs at least one week of its sales; else covered (a top-up: the badge stays covered, `state` is active and the headline reads "Top up ~N cases").
- **Words.** `headline`, `pitch`, `hint`, `reasonShort`, the See why facts, talking points and steps are all built in the engine from the numbers, so they can be tested in Node. The pitch speaks about the recommendation, not the cart, and does not change as lines are edited.

Where the engine reads 04 §F in its own way (each is a choice, listed so it can be challenged):

1. The 14-day limit is on the visit gap; the delivery lead day is not counted. §F says H > 14.
2. Go light is shown even when nothing is needed, until an order is booked today. §F lists covered and go light without an order between them.
3. A focus product the outlet never bought is a candidate only while the outlet has fewer than 4 clean weeks and the peer table gives it a rate. §F says "∪ focus SKUs eligible at the outlet"; without this, a never-bought product would read "Over" for a trial order.
4. The outlet's own last-year step-up is read over its pack group and at least 14 days, and is kept inside 0.3–2.0 before it is averaged with the peer curve.
5. A short event counts only when last year's ratio differs from 1 by 30% or more, and is floored at 0.3; an event longer than 14 days is treated as season, not as an event.
6. "Enough history" counts weeks that have an order (all products), not clean weeks.
7. Variability comes from the sizes of the product's own orders over 12 weeks (at least 4 orders), else from the peer table.
8. The buffer uses the square root of the window's normal days, so closure days shrink it; it applies in ramp and peak (§Q.2 says peak).
9. The stock estimate subtracts sales at the run-rate without the step-up, floors the on-hand part at 0, and then adds what is in transit.
10. The closure is not a separate cap: its days count as zero demand in the window and in the ceiling.
11. "Minimum" holds only lines whose low is above 0; a line with low 0 and a recommendation above 0 stays "missing" after Minimum.
12. A returnable product at an outlet with no `glass` record has no cap if the outlet ever booked it, and is not a candidate if it never did.

## 8. Data schema v1 (foundation prompt §4 — extend later, don't break)

Field names are a contract the engine relies on. Files live in `data/`. The generator checks that outlets, products, schemes, orders and order lines carry exactly these fields.

`config.json`
```json
{ "schemaVersion": 1, "demoDate": "2026-04-28", "region": "Pune West, Maharashtra",
  "rep": { "id": "R-PW-07", "name": "Sagar Jadhav", "role": "Pre-seller", "beatName": "Pune West – Tue beat" },
  "distributor": { "name": "Shivneri Beverages (Distributor)", "deliveryLeadDays": 1, "stockReportAsOf": "2026-04-27" },
  "season": { "name": "Summer 2026", "rampStart": "2026-03-01", "peakStart": "2026-04-13", "tailStart": "2026-05-18", "seasonEnd": "2026-06-10" } }
```

- `outlets.json` — array of: `id, name, area, address, channel, shopType, segment (Diamond|Gold|Silver|Bronze|Iron), visitsPerMonth, locationContext, cooler {type: bottler|own|none|icebox, count, litres}, credit {limit, outstanding, overdue, overdueSinceDays}, glass {cratesHeld, emptiesOnHand} | null, owner {orderingStyle: planner|reactive|cautious|event-driven|cash-capped, riskAppetite: low|med|high, presentUsually: bool}, registeredOn, predecessorId | null, personaKey, notes [{date, text}], payment (credit|cash), cluster (kirana_cooler|kirana_nocooler|impulse|eat_drink|education)`. `payment` and `cluster` were added with generator v0.5; `cluster` picks the outlet's peer curve, and no screen shows it.
- `products.json` — array of: `sku, name, flavour, category (sparkling|juice|water|energy), packMl, packType (PET|glass|can|tetra), unitsPerCase, mrpUnit, ptrCase, marginPct, shelfLifeDays, serve (single|takehome), returnable, focus`. 12 SKUs: the 11 from `Sample_Data.md` §4 with generic names, plus `SP-OR250`. Focus SKUs: `SP-CL250`, `SP-CL200G`, `JD-MG150`.
- `orders_history.json` — array of `{ id, outletId, date, lines: [{ sku, cases, freeCases, deliveredCases }] }` from **2025-01-01 to 2026-04-27** (at most one order per visit; some visits have no order). Ids are `H-<outletId>-<YYYYMMDD>`. Sorted by date, then outlet.
- `route_plan.json` — `{ "<outletId>": ["2026-04-07", "2026-04-14", ...] }`: scheduled visit dates, Apr–May 2026. Today's route = outlets whose list contains `demoDate`. Next visit = first date after `demoDate`.
- `schemes.json` — array of `{ id, name, skus[], type: "buy_x_get_y" | "pct_off_min_qty", buyCases, freeCases, pctOff, minCases, pooled: bool, eligibleSegments[], validFrom, validTo, capPerMonth, settlementNote }`. S-005: buy 10 → 1 free, pooled across CL250/LL250/CL200G, Diamond/Gold/Silver, cap 4 per month, 1 Mar–31 May 2026. S-006: 8% off at ≥ 5 cases of JD-MG150/JD-MG600, all tiers, 1 Apr–30 Jun 2026. Last year's scheme (S-001, same terms as S-005) lives only in the generator config, to compute free cases in 2025 orders.
- `distributor_stock.json` — `{ asOf, items: [{ sku, status: ok|low|out|rationed, note }] }`. As of 27 Apr 2026: `SP-CL300C` out (can shortage), `SP-CL200G` rationed (full crates only against empties), `WT-1L` low.
- `calendar.json` — `{ events: [{ id, name, type: holiday|long_weekend|exam|vacation|closure|wedding_season|cricket, start, end, appliesTo: "all" | [outletIds] | {channels: []}, series }], supplyHistory: [{ sku, status: out|rationed, start, end }], weeklyMaxTempC: { "2025-W14": 37, ... } }`. 15 events, 4 supply-history entries (all 2025), temperatures for 2025-W01 … 2026-W22. ISO week keys; TY weeks after the demo date are a forecast. `series` (added with v0.5) is the same for the same event in different years (`maharashtra-day`, `ipl`, `wedding-season`, `diwali`, `college-exams`, `college-closure`, `school-vacation`); the engine uses it to find last year's event.
- `cluster_benchmarks.json` — a **derived assumption table**, not measured data (04 §J): `{ note, year: 2025, <cluster>: { single: { "2025-W01": index, … "2025-W52": index }, takehome: { … } }, cv: { <cluster>: { single, takehome } }, level: { <cluster>: { <sku>: weekly cases at index 1.0 } } }` for the five clusters kirana_cooler, kirana_nocooler, impulse, eat_drink, education. The index is weekly demand against the January–February average. Single-serve May index: kirana_cooler 1.90, kirana_nocooler 1.30, impulse 2.90, eat_drink 1.60; take-home carries about 60% of that uplift; education is flat (1.00 to 1.09), because closures and exams come from `calendar.json`, not from the curve. Built by the generator from the `clusterCurves` block of the config.

## 9. Personas and generator v0.5

`tools/generate-data.mjs` (Node ≥ 18, no dependencies) reads `tools/personas.config.json` and writes all 9 data files. All numbers are in the config; generator parameters never appear in `data/`. It is the v0 seasonal-multiplier model plus deterministic overlays (04 D6). There is no daily inventory simulation, no `tools/_truth` and no backtest.

| id | personaKey | Outlet | Tier · visits · next visit | Cluster | Cold chain | Credit (limit / outstanding) |
|---|---|---|---|---|---|---|
| OT-101 | late-waker | Shree Datta Kirana, Warje | Gold · weekly · Tue 5 May | kirana_cooler | Bottler cooler 300 L | ₹12,000 / ₹3,000 current |
| OT-102 | planner-flagship | Mahalaxmi Super Bazaar, Bavdhan | Diamond · weekly · Tue 5 May | kirana_cooler | 2 × bottler cooler 300 L | ₹20,000 / 0 |
| OT-103 | burned-cautious | Ganesh Provision, Pashan | Silver · 3×/month · Fri 8 May | kirana_cooler | Bottler cooler 150 L | ₹8,000 / 0 |
| OT-104 | highway-dhaba | Hotel Malhar Dhaba, Warje | Silver · 3×/month · Fri 8 May | eat_drink | Bottler cooler 300 L | ₹10,000 / 0 |
| OT-105 | campus-canteen | Campus Bites, Pashan | Gold · weekly · Tue 5 May | education | Bottler cooler 300 L | ₹10,000 / 0 |
| OT-106 | new-owner | Sai Shraddha Kirana, Warje | Bronze · 2×/month · Tue 12 May | kirana_nocooler | None | ₹5,000 / 0 |
| OT-107 | credit-stretched | Om Namah Kirana, Pashan | Bronze · 2×/month · Tue 12 May | kirana_nocooler | None | ₹4,000 / ₹1,600 overdue 75 days |
| OT-108 | wedding-glass | Shree Mithai & Chaat, Warje | Silver · 3×/month · Fri 8 May | eat_drink | Bottler cooler 150 L; 4 crates, 4 empties | ₹9,000 / 0 |
| OT-109 | heat-impulse | Chandani Chowk Paan & Cold Drinks, Kothrud | Iron · monthly · Tue 26 May | impulse | Own fridge | ₹3,000 / 0 (cash buyer) |

All nine are on today's route. The five demo outlets (04 §K) are OT-101, OT-105, OT-104, OT-106 and OT-108.

How the order model works:

- Visits every `cadenceDays`, anchored on the demo date. A visit can be missed (`missedVisits` windows) or end with no order (`orderProb`). An order always covers one cadence.
- Cases per SKU = `baseWeekly × mix × cadence/7 × season × year factor × event factor × boost`, with lognormal noise per line and stochastic rounding. `season = 1 + (summerPeak − 1) × summer shape + (festivePeak − 1) × festive shape`, read at the visit date minus `orderLagDays`. An explicit `monthly` array can replace the formula.
- Event factor: for calendar events that apply to the outlet and that the persona lists in `eventEffects`, `1 + (effect − 1) × share of the cover interval the event overlaps`.
- `boosts` are date-window multipliers by SKU or serve type. `maxOrderValue` caps an order (OT-107).
- Free cases follow the pooled buy-10-get-1 scheme with the monthly cap and tier eligibility. Delivered cases are 0 when the SKU was out on the delivery date, and capped at crates held when glass was rationed.
- One mulberry32 stream per persona (seed `20260428` combined with a hash of the persona key), with a fixed number of draws per visit and per SKU, so tuning one persona never changes another.

Overlays added in v0.5, all applied after the order model so the random streams are not moved:

- `fixedOrders [{ date, factor | lines, serve?, skus?, note }]`: a guaranteed order on a visit date, either the drawn order times a factor or explicit lines. A guaranteed order on a visit that drew none takes its noise from a side stream.
- `noOrderDuring ["closure"]`: no order while a closure event applies (OT-105).
- `model.catchUpShare`: a line cut by a supply-out or by glass rationing is added to the same SKU on the outlet's next order.
- `clusterCurves`: the block `cluster_benchmarks.json` is built from (§8).
- `demoGuide`: one "what to try" sentence per outlet, written into `data/config.json` as `demoGuide: [{ outletId, try }]` for the Demo guide sheet. Each sentence was checked against the engine.

**What is pinned, and why.** The last-4-week orders of OT-101, OT-102, OT-104, OT-105, OT-107 and OT-108 (18 orders) are explicit `fixedOrders` lines, not model draws, so that the demo behaviours in 04 §L hold exactly on the demo date: the scheme edge at 9 of 10 cases, the dhaba's usual water order reading Short, the canteen's pre-exam order reading Over, the glass recommendation capped at the 4 empties, the credit-stretched outlet's suggestion exceeding its credit. OT-103, OT-106 and OT-109 are model-drawn. There is a visible step at 31 March where pinned orders begin (for example OT-102: a drawn 12-case order, then pinned orders of 15 to 16). This is demo data built to show behaviour; it proves nothing about impact (04 §J).

Validation table from the last run (10 Oct, after tuning):

```
outlet  persona           orders  LY Jan-Feb /wk  LY May index  TY last 4 wk /wk  last order  cases    value  next visit
OT-101  late-waker            63             5.8          2.37              13.0  2026-04-21     14   ₹6,260  2026-05-05
OT-102  planner-flagship      65             7.6          2.11              18.0  2026-04-21     26  ₹13,248  2026-05-05
OT-103  burned-cautious       41             2.4          1.24               3.5  2026-04-18      7   ₹4,125  2026-05-08
OT-104  highway-dhaba         41             7.0          2.45               8.5  2026-04-18     15   ₹6,547  2026-05-08
OT-105  campus-canteen        57             7.1          0.25              14.8  2026-04-21     21   ₹8,907  2026-05-05
OT-106  new-owner              5             0.0           n/a               4.3  2026-04-14      9   ₹4,752  2026-05-12
OT-107  credit-stretched      29             2.1          1.37               3.0  2026-04-14      6   ₹3,058  2026-05-12
OT-108  wedding-glass         41             5.6          1.26               6.3  2026-04-18     11   ₹3,844  2026-05-08
OT-109  heat-impulse          17             1.7          2.45               3.3  2026-03-31     13   ₹5,208  2026-05-26
Totals: 359 orders, 1,784 lines. Average value per case ₹460. Lines per order 4.97. All 40 hard checks passed.
```

The 40 checks are the 21 structural checks of v0 plus one signature check per persona behaviour, with thresholds in `config.validation`: OT-102's order of 21 Apr is 1.79× its previous four; OT-105's is 1.75×; OT-104's Maharashtra Day week of 2025 is 1.69× its neighbours; OT-105's 2025 exam weeks are 0.54× the neighbours the engine reads; no OT-105 order inside the closure; OT-101's April 2026 orders hold 7, 6 and 8 pooled scheme cases (none at 10 or more); OT-101's own last-year step-up is 1.33; OT-107's Cola 250 ml share is 45.9%; OT-103's take-home swing; every cut line re-ordered; the cluster curves' May indexes; `payment`, `cluster`, `series` and `demoGuide` present. The generator writes `data/` before it runs the checks: after a failed run, re-run a passing config.

Limits of this data:

- Recent orders at six outlets are pinned (above).
- OT-102 reads "covered" by a thin margin: its top-up totals 16 cases against 18 cases a week of sales; at 18 it would read stock-up talk.
- OT-104 reads Short on its usual order only because its last water order was half the one before (the visit note says so). With visits every 10 days the engine sees two orders in four weeks.
- OT-108 orders 6 crates of glass a visit while holding 4 empties, so that the recommendation reaches the cap.
- OT-105's Maharashtra Day week of 2025 is also its exam week, so the engine applies both ratios on 1 to 3 May.
- OT-103 and OT-109 have thin volumes (key rates 0.5 to 1.3 cases a week); their recommendations are 0 to 3 cases.
- No outlet buys the energy drink; Mango 600 ml sells only at OT-105; cans only at OT-108 (and one case at OT-101).
- `calendar.supplyHistory` has no 2026 entry, so "ignored weeks" in See why only ever names last year's supply-outs.
- Average value per case (₹460) is near the bottom of the 450 to 650 band.

## 10. FEATURE-SLOTs

Every insertion point is marked in code with `// FEATURE-SLOT: <name>`. Slots render nothing until the feature fills them.

| Slot | Where | Stage that creates it | State |
|---|---|---|---|
| `landing` | `js/screens/home.js` `view()`: `div#slot-landing` between the summary card and the route list | 1 | Filled: "N outlets need a stock-up talk today" |
| `route-row-badge` | `js/screens/home.js` `routeRow()`: `span[data-slot="route-row-badge"][data-outlet-id]` at the end of the row's meta line | 1 | Filled: a chip with icon and word from `outletBadge` (Stock-up talk, Covered, Go light, Check data) |
| `demo-menu` | `js/components/ui.js` `demoBar()`: the `menuItems` option | 1 | Filled by `app.js`: a "Demo guide" item when `config.demoGuide` has entries |
| in-visit inputs | `js/store.js`: `visit.stockOnHand` with `visit/setStock`, and `visit.reasons` with `visit/setReason` | 1 | In use |
| `outlet-details` | `js/screens/outlet.js` `render()`: `div#slot-outlet-details[data-slot="outlet-details"][data-outlet-id]` directly under the identity block, above "Last order" | 2 | Filled: the Right Order card and the stock check |
| `booking-panel` | `js/screens/order.js`: `div#slot-booking-panel[data-slot="booking-panel"][data-outlet-id]`, the first thing under the header, above search, tabs and the list; filled by `renderBookingPanel(slot, result)` | 3 | Filled: the Right Order strip (pitch, Suggested / Minimum, missing-item chips, scheme bar) |
| `line-hint` | `js/screens/order.js` `productRow()`: `div[data-slot="line-hint"][data-sku]` under each stepper; filled by `renderLineHint(slot, line)` | 3 | Filled: icon and `line.hint`; a tap opens See why; "No sales history here" for a cart product with no line |
| `engine-v1` | `js/engine/recommendationEngine.js` `recommend()`: replaced by the Right Order engine (§7.7) | 3 | Filled |
| `review-check` | `js/screens/review.js` `render()`: `div#slot-review-check[data-slot="review-check"][data-outlet-id]`, now directly under the "Order lines" section | 4 | Filled: the Right order check, the reasons and the scheme and supply lines |

### How the feature fills the slots (as built, 10 Oct)

- **Landing (`home.js`).** `view()` calls `recommend({ outlet, cart: null, visit: null, data, demoDate })` once per route outlet and shows `outletBadge` as a chip with an icon and a word; the slot above the list counts the stock-up talks. The view is rebuilt after every submit, so a badge follows the data. A badge ignores a saved cart or stock count of another outlet (the store exposes only the open outlet's).
- **Outlet details (`outlet.js`).** `rightOrderCard()` builds the card once, subscribes to the store, reruns `recommend()` when `state.cart` or `state.visit` is a new object, and `render()` returns the unsubscribe. Active: headline, up to 3 key lines that are missing or short ("+N name · lasts till day" with `reasonShort`), the window flag, "Start order with suggestion" (`cart/replace` with the non-candidate cart lines plus `quickSets.suggested`, then `#/order/<id>`), "Check stock (N items)". Quiet: one row with the headline. The stock check has one row per key line with chips 0 to 4, 5+ (a stepper for the exact count) and "Skip" (clears the count), dispatching `visit/setStock`.
- **Order booking (`order.js`).** `renderBookingPanel(slot, result, ctx)` builds the strip once and updates it in place; `renderLineHint(slot, line, cases, onWhy)` draws one button per row; `openWhy()` opens the See why sheet (`openSheet`) with the reason, the six facts, up to three talking points and the steps. Suggested and Minimum dispatch `cart/replace` and keep any cart line that is not a candidate; which one is chosen is derived by comparing the cart with `quickSets`, never stored.
- **Order review (`review.js`).** `sync()` calls `recommend()` on every cart or visit change. The check card lists key lines that are over, then short, then missing; a line that is over needs one of three reasons before Submit is enabled; short and missing lines take an optional one of four. The credit banner reads `result.credit`. The submitted order carries `reasons` and `stockOnHand` beside its lines, value and `recommendationSnapshot`.
- **Top bar (`app.js`).** The "Demo guide" menu item opens a sheet with one row per `config.demoGuide` entry, each a link to its outlet.

The landing rebuilds its whole view when the session or the submitted orders change (and only then). Fill `landing` and `route-row-badge` inside `home.js` `view()`, at the two comments; content placed from outside is lost on the next rebuild. A route row shows the outlet name, then "area · channel" as text, then one line of chips: the badge slot and "Visited" when visited. The channel is text, not a chip (the foundation prompt asks for a chip), so every row is one chip line tall and four to five rows show in the first viewport. The chevron is always the trailing element.

## 11. Spec the base stages were built to (all built; kept for reference)

Everything in this section is built. §7 says how it was built; where the two differ, §7 is right.

### Screens (foundation prompt §7) — basic scope, polished look

Hash router (`#/login`, `#/home`, `#/outlets`, `#/outlet/:id`, `#/order/:id`, `#/review/:id`). Each screen module exports `render(container, params)` and cleans up its subscriptions.

1. **Login** — username + password, any non-empty accepted. Product name, demo date. *(Built.)*
2. **Landing** — greeting with rep name, demo date, today's route (ordered list: outlet name, area, channel chip, "Visited ✓" once an order is submitted today), "All outlets" button, Reset demo. `<!-- FEATURE-SLOT: landing -->` container (empty). *(Built.)*
3. **Outlet list** — search by name/area/ID, filter chips (channel, segment), rows with name, channel, segment, cooler icon.
4. **Outlet details** — attributes (channel, shop type, segment, cooler, location context), last order date & value, last-8-weeks summary (cases/week, tiny inline bar row with no axis — must be readable without a legend), next scheduled visit, applicable active schemes (with eligibility), collapsed "Rep notes" (credit/overdue, visit notes). Sticky "Book order". `<!-- FEATURE-SLOT: outlet-details -->`.
5. **Order booking** — search + category tabs (Sparkling / Juice / Water / Energy) + "Usual items" tab (SKUs bought in last 8 weeks) first; product rows with pack, units/case, PTR/case, scheme chip, stepper. Sticky footer: cases, value, free cases, "Review". `<!-- FEATURE-SLOT: booking-panel -->` (above the list) and `<!-- FEATURE-SLOT: line-hint -->` (inside each product row, under the stepper) — render the v0 recommendation here in a minimal neutral style so we can see it update live on every stepper tap.
6. **Order review** — lines, qty edit, scheme benefits, totals, credit check banner (order value vs available credit = limit − outstanding), Submit. `<!-- FEATURE-SLOT: review-check -->`. On submit: save to `submittedOrders` (with a snapshot of the recommendation result), toast, go to Landing (button to Outlet list).

Submitted demo orders must be merged into the outlet's history views (last order, summary) so the app reacts to what the panel does. `data.js` already does this through `setSubmittedOrders`.

Notes for these stages, from the Stage 1 reviews and the decision lock:

- Stage 2: draw the current-week entry of `orderSummary` differently from the completed weeks (it is empty until an order is submitted today). As built: on outlet details the header title is the screen name and the outlet name is an `h2` in the body; on order booking and review the outlet name is the header subtitle. Do not show owner-behaviour labels anywhere (04 §Q.6). Consider restoring the landing's scroll position when coming back from an outlet.
- Stage 3: the stepper already clamps at 999; check the row layout at that value.
- Stage 4: disable Submit for an empty cart and say "Add at least one line" (04 §L row 21). Submit only for an outlet that exists. Pass `value` and the lines with `freeCases` in the `order/submit` action. Decide whether "last order value" shows the PTR value (today) or the stored net value.

### Recommendation interface (foundation prompt §6) — Stage 3

Create `js/engine/recommendationEngine.js` exporting a **pure** function and the result contract below. The UI must only ever talk to this interface.

```js
/**
 * @param {{ outlet, cart, visit, data, demoDate }} ctx   // data = the view from data.js
 * @returns {{
 *   engineVersion: string,
 *   state: 'active'|'quiet'|'insufficient_data'|'not_applicable',
 *   headline: string|null,                  // ≤ 60 chars, the one thing to say
 *   horizon: { nextVisit: string|null, days: number } | null,
 *   lines: Array<{ sku, recommendedCases, rangeLow, rangeHigh, cartCases,
 *                  status: 'missing'|'short'|'right'|'over'|'none_needed'|'unavailable',
 *                  lastsTill: string|null,     // date the stock (on hand + cart) lasts till
 *                  reasonShort: string,        // ≤ 50 chars
 *                  confidence: 'high'|'medium'|'low',
 *                  flags: string[] }>,
 *   nudges: Array<{ type: 'scheme'|'credit'|'supply'|'event'|'stock_check', sku?, text, action?: { sku, setCases } }>,
 *   explain: { inputs: object, steps: Array<{label, value}> }   // for "See why"
 * }}
 */
export function recommend(ctx) { ... }
```

Implement **only a clearly labelled placeholder `v0-baseline`** for now: for each SKU the outlet bought in the last 8 weeks, `recommendedCases = round(avg weekly cases over last 4 weeks × weeks until next visit)`; `status` compares cart vs recommendation (cart 0 & rec>0 → missing; cart<low → short; low..high → right; >high → over; rec 0 & cart 0 → none_needed); confidence 'low'; reasonShort "Based on last 4 weeks"; `explain.steps` lists the arithmetic. Put the real engine work behind `// FEATURE-SLOT: engine-v1`.

Also create `js/engine/schemes.js` with a pure `evaluateSchemes(cart, outlet, schemes, products, date, monthToDateOrders)` (month-to-date orders are needed for the per-month trigger cap) → per-scheme `{ qualifyingCases, threshold, triggers, freeCases, casesToNextTrigger, eligible, reasonIfNot }` (handles pooled, cap per month, tier eligibility), and `js/engine/pricing.js` → cart totals (value at PTR, free cases, discounts).

Add `tests/engine.test.mjs` (run with `node --test tests/engine.test.mjs`) with small fixtures: empty cart, cart above/below, ineligible tier, pooled scheme 9 → 10 cases, cap reached. Tests build their `data` with the pure `buildData(raw)` from JSON read off disk. Pass a fake storage object to `createStore` in tests: Node 25 has a `localStorage` global that prints a warning when used without a file.

The real engine later adds outputs listed in 04 §Q.2 (`outletBadge`, `window`, `quickSets`, `pitch`, `credit`, `scheme`). Keep the v0 result shape extensible.

### Stage 5

README (run, test, deploy to GitHub Pages) + quick 390px pass on every screen + console-error check. Add a `.gitignore` with `.DS_Store` before the first commit. *(Built. The deploy itself is not done: it belongs to the feature's last stage, 03 Stage E, which names the repository and pushes the contents of `prototype/`.)*

## 12. Assumptions to confirm

1. `WT-1L` is classed `serve: "single"` (bought chilled on the go, heat-driven; the strategy lists it among the single-serve-only stall's SKUs), although the sample's "600 ml and below" rule would make it take-home. This matters now that the buffer depends on pack type (04 D3).
2. S-006 (8% off at 5+ cases) is treated as **pooled** across `JD-MG150` and `JD-MG600`, like S-005. The scheme text does not say.
3. `OT-106.predecessorId` is `"OT-X231"`, a code that is not in the data. The app treats an unresolvable predecessor as "history not linked".
4. Outstanding balances not given in the strategy are 0 (OT-103, 104, 105, 106, 108, 109), so only OT-101 (₹3,000 current) and OT-107 (₹1,600 overdue) carry a balance.
5. The two visit notes per outlet in `tools/personas.config.json` are provisional wording for review.
6. "Ganesh Provision" (OT-103, from strategy §11) is close to the sample's "Ganesh Provision Centre", which is also a cautious Silver kirana. Consider renaming it in `tools/personas.config.json`.

Answered: OT-109's credit limit and its 28-day gap — see 04 D4 and D11 (applied in §4).

## 13. Known issues

Right Order (feature):

- **Landing badges ignore a stock count and a saved cart.** They are worked out with an empty cart and no count, because the store exposes only the open outlet's visit. After a stock count that makes an outlet covered, its landing badge still reads as before until an order is booked.
- **A top-up can be large.** An outlet that needs just under one week of its sales (OT-102: 16 cases against 18 a week) reads "Covered" on the landing while its card says "Top up ~16 cases". The line between top-up and stock-up talk is one week of sales (04 §F).
- **Minimum can leave a line missing.** A line whose low is 0 is not in the Minimum set, so it still reads "Add N" after Minimum.
- **The cash buyer's suggestion is over its limit.** OT-109's suggested order comes to about ₹200 more than its ₹3,000 limit, and the review banner uses the word "credit" for a cash buyer.
- **OT-107's suggestion is over its available credit by design**, so the credit check speaks without a contrived cart.
- **Two events on the same days** (OT-105: exams and the long weekend) multiply.
- **See why is not live.** The sheet shows the numbers from when it was opened; it is modal, so the cart cannot change under it.
- **A product row grows by one line when its quantity goes from 0 to 1** (the base's "In order" line), so the rows below move down.
- **The stock check** keeps the tapped chip in place by scrolling the page; near the top of the page the chip can shift when a line leaves the card.
- **Not seen in a browser with real data:** state `not_applicable`, and `insufficient_data` (seen with injected data only).
- **Deviations from 04 §F** are listed at the end of §7.7.

Base:

- **Two tabs at once:** each tab keeps its own list of submitted orders, so with the app open in two tabs an order can be lost or two demo orders can share an id. Accepted for now; there is no cross-tab sync.
- **Reset confirm guard:** the red "Reset demo" button in the sheet ignores taps for its first 500 ms and gives no visual cue while it does.
- **Demo menu:** scrolling the page with the menu open does not close it; a tap, Esc, Tab, a menu item or a route change does.
- **Load-error screen:** it shows the local-server hint for every load error, including an invalid `demoDate`.
- **Tap guard:** a new screen ignores taps for its first 500 ms and gives no visual cue while it does (as the Reset confirm button). A keyboard Enter on a link or button in that time is ignored too. Measured on 10 Oct: a second tap up to 480 ms after the first is dropped on Review, Submit order, Book order, header Back and a route row; a second tap at 520 ms or later acts, so a slow double tap on Review can still press Submit. Taps on the demo bar, the reset sheet and the search fields are not affected.
- **Order review:** a line taken to 0 stays on screen until the rep leaves; it is not in the saved cart. The credit figure counts orders booked today in this demo, which is one step past the foundation prompt's formula (§7.6, to confirm). After submit, browser Back from the landing returns to the review screen, now empty. The saved toast can sit over a route row for its 2.6 seconds. The discount and the free cases come from this prototype's scheme engine; nothing is settled with a distributor system. The "Credit limit not known" banner has not been seen with the real data (every outlet has a limit); "No credit available" shows after two large orders at one outlet.
- **Outlet details, schemes:** the "Schemes today" card still says "Eligible · Up to 4 times a month" after the monthly limit is used, while the order screen says "Monthly scheme limit reached". Both are true.
- **A product's price is read in three places** (`priceOf()` in `schemes.js`, `priceCart()` in `pricing.js`, `orderValue()` in `data.js`) and only the first treats `true`, blank and non-numeric text as "no price". The real data has numeric prices everywhere, so nothing shows; one shared helper would close it.
- **No unit test for the screen-level rules:** the tap guard, the review line kept at 0, `creditCheck()` wording and `openCart()` live in DOM modules and are covered by the browser smoke test only.
- **Malformed data:** a `buyCases` of 0 or a `minCases` typed as a string still prints its chip ("Buy 0, get 1 free") while the engine gives no benefit; a fractional `ptrCase` stores a fractional order value. The generator's field checks keep such values out of `data/`.
- **Order booking:** the first tap on + makes the row taller by one line ("In order"), so the rows below it move down; the tapped row and the page do not move. The opening tab and the search text are not remembered when the user leaves the screen. A cart product that is not a usual item is only visible in its category tab or by search (the footer still counts it). Cases can only be changed with + and −; there is no typing a number. At 360 wide the tab row is slightly wider than the screen and scrolls sideways with no hint other than the cut-off last tab. The "Monthly scheme limit reached" chip shows only after demo orders use the cap (no outlet has used it in the data); it was seen in a browser after one 40-case order, and it runs to two lines at 390 wide.
- **Test command:** `node --test tests/` (a directory) fails on Node 25; use `node --test tests/engine.test.mjs` or plain `node --test` from `prototype/`. The README quotes the file form.
- **Browser scripts not in the repo:** the 26-row acceptance script, the layout sweep and the base smoke test live in a temporary folder on the build machine (§2). Moving them into the repo needs their paths made relative and a note on installing `playwright-core`; not done because it was not asked for.
- **Deploy commands not run:** the README's git and gh commands were checked against the tools' help text only. Publishing `prototype/` as it is also publishes this file, `tools/` and `tests/`.
- **Generator and the demo date:** changing `demoDate` in `tools/personas.config.json` makes the generator stop with an error, because the visit notes carry fixed dates. Changing it in `data/config.json` by hand works in the app (the route and every date follow it).
- **Outlet list:** a filter chip row gives no visual hint that it scrolls sideways other than the cut-off last chip. Chips in a result row wrap to a second line when the channel name is long, so row heights vary (the spec asks for the channel on the row, so it stays). The segment tier order is the constant `SEGMENT_ORDER` in `outlets.js`; add a `segmentOrder` array to `config.json` with generator v0.5 if wanted.
- **Outlet details:** the cooler litres are read as "per cooler" when the count is above one ("300 L each"), following `Sample_Data.md` ("2 × bottler visi-cooler, 300 L"). The visit plan is shown as "N visits a month", not as a weekday or interval. A linked predecessor (a `predecessorId` that is an outlet in the data) shows nothing extra. The last order shows the PTR value, also for a demo order (Stage 4 decision); the amount to pay is on the stored order only.
- **Scroll restore:** the remembered position is used on every return to the landing or the list, also after an order is submitted; it is not saved across a reload.
- **Not used on a screen yet:** the risk banner. The info banner is used on review for an unknown credit limit, which the real data never has.
- **Not tested:** real iOS Safari or Android Chrome, safe-area insets on a notched phone, a screen reader.
- **Data:** the v0 limits listed at the end of §9.
- **Repo hygiene:** the folder is not a git repository yet. `.DS_Store` files exist in the project folders; `.gitignore` keeps them out of a commit.

# Right Order — GT App demo

**Live demo:** https://aniket4501.github.io/fieldassist-right-order/ (opens on a phone or in a desktop browser; sign in with any username and password).

A static demo of a field-sales app for a soft-drinks rep in Pune West, with one feature built on top of the basic order flow: **Right Order**. For each product an outlet sells, the app says how many cases to add so the shop lasts till the next delivery, how few still last, and how many is too much. It reacts to every change in the cart.

Three things to know before you read the screens:

- **The data is synthetic.** Outlets, products, prices, schemes and order history are made by a seeded script from documented persona parameters. Nothing comes from a real company.
- **It demonstrates behaviour, not impact.** The app shows that the logic responds correctly to each outlet and each cart. It does not show that the feature works commercially, and it quotes no accuracy figure.
- **The date is fixed.** The app runs as if it is Tuesday 28 April 2026. It never reads the device clock.

## Run it locally

```
cd prototype
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Stop the server with Ctrl+C. Any free port works.

- Opening `index.html` straight from the file system does not work. The page stays on "Loading…" and then tells you to start a server.
- The app is built for a phone. In Chrome, open DevTools, turn on the device toolbar and pick a width near 390. On a wide window the app sits in a centred column at most 430 wide.
- Any username and password signs in, as long as both are filled.
- **Reset demo** (on the landing screen, and in the menu at the right of the top bar) signs you out and clears every order, cart, stock count and reason made in the demo. The data files are not touched. These are kept in the browser's localStorage, so they survive a reload until you reset.

There are no dependencies and no build step. You need a modern browser (checked in Chrome), Python 3 or any other static file server, and Node 18 or later only for the data generator and the tests.

## The flow to try

1. Sign in. The landing screen shows today's route with a badge on each outlet: **Stock-up talk**, **Covered**, **Go light** or **Check data**.
2. Open the first outlet. The **Right Order** card at the top says what to add and till when it lasts, for example "+3 Cola 250 ml PET · lasts till Wed 6 May". **Check stock** lets you count what is in the shop; the numbers change at once.
3. Tap **Start order with suggestion**. On the order screen every line now reads "Lasts till …" under its stepper.
4. Change the cart. Take a line down and it turns **Short** with the day it runs out. Push a line up and it turns **Over** with the weeks of stock. **Minimum** sets the least that still lasts if sales are normal. Tap any hint to see why.
5. Put the two 250 ml colas one case short of the scheme: the strip offers the extra case only when it would not sit on the shelf. Otherwise it says so.
6. Tap **Review**. The **Right order check** lists what is short, over or missing. A line that is over needs a reason before you can submit. The credit banner says whether the order fits.
7. Tap **Submit order**. Back on the landing screen the outlet reads **Covered**. Open it again: the card is quiet, because the order on its way counts as stock.
8. The top bar menu has a **Demo guide** with one thing to try at each outlet.

## How the recommendation works

The engine is one pure function, `recommend()` in `js/engine/recommendationEngine.js`. It runs on the device in about a millisecond and gives the same answer for the same data every time. Every coefficient is in `js/engine/params.js`.

1. **How long the order must last.** From today to the next delivery (the next planned visit plus one day). An order covers at most 14 days of visit gap; beyond that the app says so and suggests a top-up visit.
2. **What sells now.** The outlet's own orders over the last 4 weeks, product by product. Weeks when the distributor was out of a product are left out.
3. **What changes in the coming days.** A seasonal step-up from how similar shops' sales move at this time of year (an assumption table, see below), averaged with the outlet's own last year when that was clean. Closure days count as zero. A recurring event, such as a long weekend, uses the outlet's own ratio from last year.
4. **What is already in the shop.** The stock the rep counts, or an estimate from the last delivery. An order booked today counts as stock on its way.
5. **Three numbers per product.** The recommendation, a low (still lasts if sales are normal) and a high (one more week of cover). Small packs get a little extra in the hot weeks; big packs get none, so nothing sits after the season. A cart line below the low is Short, above the high is Over, otherwise it is right.
6. **Guardrails.** It never recommends what the distributor cannot deliver, and names a substitute. Glass bottles are capped at the empties on hand. The scheme is mentioned only when the extra case would not sit. Credit is checked on the review screen.

What it does not do: it does not read the rep's sales target, it does not block an order, and it does not claim an accuracy percentage.

## The data

Every name, number and date on screen comes from the nine files in `data/`, plus the cart you build. Nothing about a particular outlet or product is typed into the code.

- `orders_history.json`, `outlets.json`, `route_plan.json`, `distributor_stock.json`, `calendar.json`: **synthetic**, generated for nine outlet personas.
- `cluster_benchmarks.json`: **an assumption table**, not measured data: seasonal curves for five kinds of outlet and two pack groups, calibrated to the assignment's sample and to published research. In production the same curves would be computed from real order history.
- `products.json`, `schemes.json`: generic products and scheme terms shaped like the assignment's sample.

The files are generated. Change `tools/personas.config.json`, which holds every input, and run:

```
cd prototype
node tools/generate-data.mjs
```

The generator is deterministic: the same config gives byte-identical files. It prints a table with one row per outlet and a list of checks, and stops with an error if a check fails.

Two things to try, to see the app follow the data:

- **A product runs out at the distributor.** In `data/distributor_stock.json` set the status of `SP-CL250` to `"out"` and reload. At every outlet that sells it the line reads Unavailable and names a substitute. Run the generator afterwards to put the file back.
- **Demo date.** Change `demoDate` in `data/config.json` to `2026-05-05` and reload. The date changes on every screen, the route drops to the outlets planned for that day, and every recommendation is worked out again for the new date. Run the generator afterwards to put the file back.

## Tests

```
cd prototype
node --test tests/engine.test.mjs
node --test tests/store.test.mjs
node --test tests/personas.test.mjs
```

No dependencies. Plain `node --test` from `prototype/` runs all three. Do not use `node --test tests/`: it fails on recent Node versions.

- **Engine tests:** the scheme and pricing rules, each step of the recommendation on hand-made fixtures, and property checks over every outlet with 300 seeded random carts each: it never throws, low ≤ recommended ≤ high, the recommendation never rises when the counted stock rises, a product that is out is never recommended, texts stay within their limits, and the same input gives the same output.
- **Store tests:** the cart, the stock count and the reasons.
- **Persona tests:** the demo behaviours on the real data files: for example the scheme offer at 9 of 10 cases, the usual order that turns Short before a long weekend, the canteen's order that turns Over before it closes, glass capped at the empties, a product that is out. Every expected value is worked out from the data, never typed in.

The screens were checked in a headless browser with scripts that are not part of this folder.

## Deploy to GitHub Pages

Publish the contents of this folder (`prototype/`) as the site root. Publish only this folder: the files beside it in the parent folder are not part of the app.

GitHub Pages needs a public repository on a free account. Everything you push becomes public, including `PROGRESS.md`, `tools/` and `tests/`.

```
cd prototype
git init -b main
git add .
git commit -m "Right Order demo"
gh repo create <repo-name> --public --source=. --push
gh api -X POST "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"
```

This is how the live demo above was published (repository `fieldassist-right-order`). To publish a change later: commit it and `git push`; the site rebuilds in a minute or two.

Type `{owner}` and `{repo}` as written: the gh CLI fills them in. Without the gh CLI: create an empty repository on github.com, then run `git remote add origin <its URL>` and `git push -u origin main`. In place of the last command you can use the web UI: Settings, Pages, "Deploy from a branch", branch `main`, folder `/ (root)`, Save.

The site appears at `https://<your-username>.github.io/<repo-name>/` after a minute or two. All paths in the app are relative, so it also works from a subfolder of another site.

After publishing, check: the login screen loads and shows the demo date; the landing shows badges; one order can be booked and submitted and its outlet then reads Covered; a reload keeps the order; the browser console has no errors; Reset demo returns to the login screen.

## Known limits

- A new screen ignores taps for its first half second. This stops a double tap from pressing a button that has just appeared under the finger, such as Submit after Review.
- Cases change only with **+** and **−** and the quick actions. There is no typing a number.
- A badge on the landing screen is worked out with an empty cart and no stock count. A count made at an outlet changes that outlet's card and order screen, not its landing badge.
- With the app open in two browser tabs at once, an order booked in one tab can be lost.
- It was checked in headless Chrome at 360, 390 and 430 wide. It has not been tested on a real iPhone or Android phone, or with a screen reader.

The full list is in `PROGRESS.md`, section 13.

## Project layout

```
index.html                 Page shell; loads the styles and js/app.js
css/tokens.css             Colours, type sizes, spacing, radius (CSS variables)
css/app.css                Layout, components and base screen styles
css/ro-*.css               Styles for the Right Order parts of the screens
js/app.js                  Start-up, routing, top demo bar, demo guide, reset
js/data.js                 Loads data/*.json and builds the view the screens read
js/store.js                App state (session, cart, stock count, reasons, submitted orders), saved in localStorage
js/dates.js                Date helpers that work from the demo date
js/format.js               Rupee, number and case formatting
js/components/ui.js        Shared UI parts: buttons, chips, cards, stepper, sheet, toast
js/screens/                One file per screen: login, home, outlets, outlet, order, review
js/engine/recommendationEngine.js   recommend(): statuses, hints, scheme, credit, badge, pitch
js/engine/cover.js         The arithmetic: window, calendar, run-rate, step-up, stock, the three numbers
js/engine/params.js        Every coefficient of the engine
js/engine/schemes.js       Scheme rules: free cases and percentage discounts
js/engine/pricing.js       Cart totals
data/                      Nine generated JSON files; the only source of content
tools/personas.config.json All inputs to the generator
tools/generate-data.mjs    The data generator
tests/                     Unit tests for the engine and the store
package.json               Only tells Node the .js files are ES modules; no dependencies
.gitignore                 Keeps macOS .DS_Store files out of the repository
PROGRESS.md                Build log: rules, decisions, module contracts, known issues
```

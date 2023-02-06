const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const sound = require("sound-play");

// entry point for buyict opportunities
const entryUrl = "https://www.buyict.gov.au/sp?id=opportunities";

/**
 * open new page
 * e.g.
 *
 * const {page, browser} = newPage(url);
 * await page.evaluate()
 * browser.close();
 * @param url
 * @returns { page, browser}
 */
async function newPage(url) {
  // Launch a headless browser
  const browser = await chromium.launch();

  // Open a new page
  const page = await browser.newPage({
    bypassCSP: true, // This is needed to enable JavaScript execution on GitHub.
  });

  // Navigate to the provided URL
  const response = await page.goto(url, { timeout: 0 });
  console.log("Response status: ", response.status());

  // Wait for the page to fully load
  await page.waitForLoadState("networkidle");

  return { page, browser };
}

let jobs = [];

async function indexLinksOnPage(page, currentPage = 1) {
  console.log(`indexing page ${currentPage}...`);
  const links = await page.evaluate(() => {
    // get links from page
    return Array.from(
      document.querySelectorAll("main a.dta-au-card-clickable")
    ).map((a) => {
      // get only "open to all" opps
      const pill = a.querySelector(".dta-pill");
      return {
        title: a.querySelector("strong").innerText,
        href: a.href,
        type: pill.innerText,
        innerText: a.innerText,
      };
    });
  });
  jobs = [...jobs, ...links];
  // without refreshing page, go to next page
  const nextPageLocator = page
    .locator(`.pagination a`)
    .filter({ hasText: currentPage + 1 });

  const count = await nextPageLocator.count();
  if (count > 0) {
    // has next page
    try {
      await nextPageLocator.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await indexLinksOnPage(page, currentPage + 1);
    } catch (error) {
      console.log("ERROR");
      console.log(error);
    }
  }
}

/**
 * Go through a page and index all job links listed on that page.
 * @returns
 */
async function indexJobLinks() {
  const { page, browser } = await newPage(entryUrl);
  // Get the list of links on the page
  await indexLinksOnPage(page);

  // Close the browser
  await browser.close();
}

// index job details
// using a new browser each time this is called, so it can be a stand-alone function to index single job link
async function indexJobDetails(url) {
  console.log(`indexing job details: ${url}`);
  const { page, browser } = await newPage(url);
  // get details
  const details = await page.evaluate(() => {
    // get overview details
    const overview = Array.from(
      document.querySelectorAll(
        '[ng-repeat^="details in c.data.rfqMainDetails"]'
      )
    ).map((row) => {
      return {
        label: row.querySelector(".col-md-4").innerText,
        value: row.querySelector(".col-md-8").innerText,
      };
    });

    // requirements
    const requirementDesc = document.querySelector(
      '[ng-bind-html="c.sce.trustAsHtml(c.data.description)"]'
    ).innerHTML;

    const requirementData = Array.from(
      document.querySelectorAll(
        '[ng-repeat="requirementDetail in c.data.requirements"]'
      )
    ).map((row) => {
      return {
        label: row.querySelector(".col-md-4").innerText,
        value: row.querySelector(".col-md-8").innerText,
      };
    });

    // Criteria
    const essentialCriteria = Array.from(
      document.querySelectorAll(
        '[sn-atf-area="Review criteria essential"] [ng-repeat="criteria in data.criteria_essential"]'
      )
    ).map((row) => {
      return {
        desc: row.querySelector(".col-md-9").innerText,
        weight: row.querySelector('[ng-if="criteria.weighting"]')?.innerText,
      };
    });

    const desirableCriteria = Array.from(
      document.querySelectorAll(
        '[sn-atf-area="Review criteria desirable"] [ng-repeat="criteria in data.criteria_essential"]'
      )
    ).map((row) => {
      return {
        desc: row.querySelector(".col-md-9").innerText,
        weight: row.querySelector('[ng-if="criteria.weighting"]')?.innerText,
      };
    });

    const submit = Array.from(
      document.querySelectorAll('[ng-repeat="respReq in c.data.response_reqs"]')
    ).map((li) => li.innerText);

    return {
      overview,
      requirements: {
        description: requirementDesc,
        data: requirementData,
      },
      criteria: {
        essential: essentialCriteria,
        desirable: desirableCriteria,
      },
      submit,
    };
  });
  // get matching selection criteria

  // close browser
  browser.close();
  return details;
}

// Crawl the URL
indexJobLinks().then(async () => {
  for (let i = 0; i < jobs.length; i++) {
    console.log(`Indexing job details [${i + 1}/${jobs.length}]`);
    const job = jobs[i];
    const details = await indexJobDetails(job.href);
    jobs[i]["details"] = details;
  }

  fs.writeFileSync(
    `./data/data.json`,
    JSON.stringify({
      date: new Date(),
      jobs,
    })
  );

  sound.play(path.resolve(__dirname, "done.wav"));
  console.log("================== ✅ DONE ======================");
  process.exit();
});

const chromium = require("chrome-aws-lambda");
const moment = require("moment");
const {
  createMultipleArticles,
  filterByArticleLinks,
} = require("./db/articles");

const fetchArticles = async (event, context) => {
  const extension = event["extension"];
  const articlesUrl = `https://gamespot.com/games/${extension}`;
  let browser = null;

  try {
    browser = await chromium.puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);

    await Promise.all([
      page.goto(articlesUrl),
      page.waitForSelector("div.promo-strip__item"),
      page.waitForSelector("article.media-article"),
      page.waitForNavigation(),
    ]);

    const mainArticles = await page.$$eval("div.promo-strip__item", (el) => {
      return el.map((e) => {
        const articleLink = e.querySelector("a").href;
        const imageSrc = e.querySelector("figure img").src;
        const title = e.querySelector("a div.media-body h3").innerText;
        const subtitle = e.querySelector("a div.media-body p").innerText;
        return { imageSrc, articleLink, title, subtitle };
      });
    });

    const otherArticles = await page.$$eval("article.media-article", (el) => {
      return el.map((e) => {
        const articleLink = e.querySelector("a").href;
        const imageSrc = e.querySelector("figure img").src;
        const title = e.querySelector("a div.media-body h3").innerText;
        const subtitle = e.querySelector("a div.media-body p").innerText;
        const publicationDate = e
          .querySelector("a div.media-body time")
          .getAttribute("datetime");
        return { imageSrc, articleLink, title, subtitle, publicationDate };
      });
    });

    const articles = mainArticles
      .map((article) => {
        const publicationDate = moment().toDate().toISOString();
        return {
          ...article,
          publicationDate,
        };
      })
      .concat(
        otherArticles
          .filter((article) => {
            return moment(article.publicationDate, "YYYY-MM-DD").isAfter(
              moment().subtract(30, "days")
            );
          })
          .map((article) => {
            const publicationDate = moment(
              article.publicationDate,
              "YYYY-MM-DD"
            )
              .toDate()
              .toISOString();
            return {
              ...article,
              publicationDate,
            };
          })
      );

    await browser.close();
    const articlesLinks = articles.map((article) => article.articleLink);
    const currentArticles = await filterByArticleLinks(articlesLinks);
    const newArticles = articles.filter((article) => {
      return !currentArticles.Items.some(
        (currentArticle) => currentArticle.article_link === article.articleLink
      );
    });

    if (newArticles.length > 0) {
      const result = await createMultipleArticles(newArticles);
      return result;
    } else {
      console.log("No new articles");
      return { msg: "No articles found" };
    }
  } catch (error) {
    console.log(error);
    await browser?.close();
    return { msg: "Error fetching articles", error };
  }
};

exports.handler = fetchArticles;

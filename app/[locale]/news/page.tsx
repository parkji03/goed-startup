import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { fetchUtahNews, type NewsArticle } from "@/lib/news";
import { Heading } from "@/components/ui/heading";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 43200;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/news`;
  const title = "Latest Utah startup news";
  const description =
    "Funding rounds, venture activity, hiring, and startup news across Utah and Silicon Slopes — refreshed every 12 hours.";
  return {
    title,
    description,
    alternates: {
      canonical: path || "/news",
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          absoluteUrl(`${l === routing.defaultLocale ? "" : `/${l}`}/news`),
        ]),
      ),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}${path || "/news"}`,
      locale,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function NewsPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  let articles: NewsArticle[] = [];
  let error: string | null = null;
  try {
    articles = await fetchUtahNews();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load news";
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <header className="max-w-3xl space-y-3">
        <Heading level={1} className="text-4xl tracking-tight sm:text-5xl">
          Latest Utah News
        </Heading>
        <p className="text-muted-fg">
          Funding rounds, venture activity, and startup news across Utah. Refreshed every 12 hours.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-muted-fg">
          No articles available right now. Check back shortly.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArticleCard({ article, locale }: { article: NewsArticle; locale: string }) {
  const published = new Date(article.pubDate.replace(" ", "T") + "Z");
  const dateLabel = Number.isNaN(published.getTime())
    ? article.pubDate
    : published.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-bg transition-colors hover:border-fg/20">
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col outline-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {article.imageUrl && (
          // Remote thumbnails come from arbitrary news sites — bypass next/image's
          // domain allowlist with a plain <img>.
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            className="aspect-[16/9] w-full bg-secondary object-cover"
          />
        )}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-fg">
            {article.sourceIcon && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={article.sourceIcon} alt="" className="size-4 rounded" />
            )}
            <span className="font-medium">{article.sourceName}</span>
            <span aria-hidden>·</span>
            <time dateTime={article.pubDate}>{dateLabel}</time>
          </div>
          <h2 className="font-semibold text-base leading-snug text-fg group-hover:text-fg">
            {article.title}
          </h2>
          {article.description && (
            <p className="line-clamp-3 text-muted-fg text-sm">{article.description}</p>
          )}
        </div>
      </a>
    </li>
  );
}

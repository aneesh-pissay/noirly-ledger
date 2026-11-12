import type { ArticleMedia, CategoryId, DocArticle, DocCategory, MediaManifest } from "@/src/docs/types";
import media from "@/src/docs/media.json";
import { docsVideoBaseUrl } from "@/src/docs/video-host";
import { gettingStarted } from "@/src/docs/content/getting-started";
import { accounts } from "@/src/docs/content/accounts";
import { transactions } from "@/src/docs/content/transactions";
import { budgets } from "@/src/docs/content/budgets";
import { bills } from "@/src/docs/content/bills";
import { goals } from "@/src/docs/content/goals";
import { teams } from "@/src/docs/content/teams";
import { reports } from "@/src/docs/content/reports";
import { automations } from "@/src/docs/content/automations";
import { settings } from "@/src/docs/content/settings";
import { help } from "@/src/docs/content/help";

/** Sidebar order. */
export const CATEGORIES: DocCategory[] = [
  { id: "getting-started", title: "Getting started", blurb: "What Ledger is, signing in, workspaces and finding your way around." },
  { id: "accounts", title: "Accounts & money", blurb: "Accounts, balances, transfers, net worth and currencies." },
  { id: "transactions", title: "Transactions", blurb: "Record, search, split, import and attach receipts to every rupee." },
  { id: "budgets", title: "Budgets", blurb: "Category budgets, envelopes, zero-based plans, rollovers and forecasts." },
  { id: "bills", title: "Bills & subscriptions", blurb: "Recurring items, due dates, reminders, subscriptions and card bills." },
  { id: "goals", title: "Goals & debt", blurb: "Savings goals, sinking funds, loans and payoff plans." },
  { id: "teams", title: "Teams & shared money", blurb: "Team workspaces, pools, expense approvals, reimbursements and policies." },
  { id: "reports", title: "Reports & insights", blurb: "Dashboards, reports, trends, exports and insights." },
  { id: "automations", title: "Automations & integrations", blurb: "Rules, workflows, reminders, Flow, calendars, email and the API." },
  { id: "settings", title: "Security & data", blurb: "Settings, audit history, backups, retention and sensitive data." },
  { id: "help", title: "Help", blurb: "Fixes for common problems and answers to common questions." },
];

const BY_CATEGORY: Record<CategoryId, DocArticle[]> = {
  "getting-started": gettingStarted,
  "accounts": accounts,
  "transactions": transactions,
  "budgets": budgets,
  "bills": bills,
  "goals": goals,
  "teams": teams,
  "reports": reports,
  "automations": automations,
  "settings": settings,
  "help": help,
};

/** Every article, in reading order. */
export const ARTICLES: DocArticle[] = CATEGORIES.flatMap((category) => BY_CATEGORY[category.id]);

const INDEX = new Map(ARTICLES.map((article) => [article.id, article]));

export function getArticle(id: string): DocArticle | undefined {
  return INDEX.get(id);
}

export function getCategory(id: string): DocCategory | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

export function articlesIn(category: CategoryId): DocArticle[] {
  return BY_CATEGORY[category];
}

export function articleHref(article: Pick<DocArticle, "id" | "category">): string {
  return `/docs/${article.category}/${article.id}`;
}

export function categoryHref(category: CategoryId): string {
  return `/docs/${category}`;
}

/** The articles either side in reading order. */
export function neighbours(id: string): { previous?: DocArticle; next?: DocArticle } {
  const at = ARTICLES.findIndex((article) => article.id === id);
  return { previous: ARTICLES[at - 1], next: ARTICLES[at + 1] };
}

export function relatedArticles(article: DocArticle): DocArticle[] {
  return (article.related ?? []).map((id) => INDEX.get(id)).filter((a): a is DocArticle => Boolean(a));
}

const MEDIA = media as MediaManifest;

/** Where the tutorial MP4s play from (see video-host.ts). Posters and captions stay in /public. */
export const VIDEO_BASE_URL = docsVideoBaseUrl();
export const VIDEOS_ENABLED = Boolean(VIDEO_BASE_URL);

/** What the pipeline captured, exactly as recorded in media.json. */
export function capturedMediaFor(id: string): ArticleMedia | undefined {
  return MEDIA[id];
}

/** The article's media as the Docs should show it: video only when a host is configured. */
export function mediaFor(id: string): ArticleMedia | undefined {
  const captured = MEDIA[id];
  if (!captured?.video) return captured;
  if (!VIDEOS_ENABLED) {
    const shown = { ...captured };
    delete shown.video;
    return shown;
  }
  return { ...captured, video: { ...captured.video, src: `${VIDEO_BASE_URL}/${id}.mp4` } };
}

/** A video was rendered for this article but isn't being served yet. */
export function videoPending(id: string): boolean {
  return !VIDEOS_ENABLED && Boolean(MEDIA[id]?.video || ("scenario" in (getArticle(id)?.video ?? {})));
}

/** The sidebar tree, small enough to hand to a client component. */
export type NavCategory = {
  id: CategoryId;
  title: string;
  href: string;
  articles: { id: string; title: string; summary: string; href: string }[];
};

export function navTree(): NavCategory[] {
  return CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    href: categoryHref(category.id),
    articles: BY_CATEGORY[category.id].map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      href: articleHref(article),
    })),
  }));
}

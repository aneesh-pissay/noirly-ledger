import type { DocArticle } from "@/src/docs/types";

export const help: DocArticle[] = [
  {
    id: "troubleshooting",
    category: "help",
    kind: "guide",
    title: "Troubleshooting",
    summary: "Fixes for the problems people run into most.",
    introduction: "Start here when something doesn't add up. Each feature's page has its own troubleshooting too.",
    troubleshooting: [
      { problem: "An account balance doesn't match my bank", solution: "Check the opening balance and date, then reconcile against the statement to find missing or duplicate transactions." },
      { problem: "A card payment counts as spending twice", solution: "Record paying the card as a Transfer from the bank to the card, not an expense." },
      { problem: "A budget ignores some spending", solution: "Check the category (or subcategory) and that the transactions fall in the budget's period." },
      { problem: "A team expense doesn't reduce the pool", solution: "Pool spending counts only once the expense is approved." },
      { problem: "An import read the columns wrongly", solution: "Undo it from Recent imports, then choose Another bank (pick the columns)." },
      { problem: "I can't submit an expense", solution: "A spending policy blocks it; the form says why." },
      { problem: "A section is missing from the sidebar", solution: "The workspace's purpose hides it; change What this workspace is for, or ask an owner." },
      { problem: "Sign-in popup doesn't open", solution: "Allow popups for Ledger in your browser." },
    ],
    faqs: [
      { question: "Can Ledger pay bills for me?", answer: "No. Ledger records payments; UPI links hand off to your payment app." },
      { question: "Is there a light theme?", answer: "Yes: the theme switch in the header, with a choice of accent colours." },
      { question: "Where's the privacy policy?", answer: "At `/privacy`, linked from the landing page." },
      { question: "Does it work on my phone?", answer: "The web app works on phones; there's also the NoirlyLedger Android app." },
    ],
    related: ["accounts", "statement-import", "budgets", "expenses"],
    sources: ["app/(marketing)/privacy/page.tsx", "src/components/ThemeControls.tsx"],
    keywords: ["help", "problem", "not working", "faq", "support"],
    video: { unavailable: "A collection of fixes rather than one workflow; each feature's page has its walkthrough." },
  },
];

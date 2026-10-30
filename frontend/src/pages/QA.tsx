import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

// Import the canonical repo-level Q&A doc as raw text. Using import.meta.glob
// (rather than a static import) keeps the special "&" in the filename out of an
// import specifier. Vite's server.fs.allow is widened to the repo root so this
// file outside ./src can be read. This is the single source of truth — editing
// docs/Q&A.md updates this page.
const docs = import.meta.glob("../../../docs/Q&A.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const content = Object.values(docs)[0] ?? "Q&A document not found.";

export default function QAPage() {
  return (
    <div className="min-h-screen bg-muted/40 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Q&amp;A / Project Docs
            </h1>
            <p className="text-muted-foreground mt-1">
              Living record of design decisions. Source: <code>docs/Q&amp;A.md</code>.
            </p>
          </div>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
        </header>

        <main className="rounded-lg border bg-background p-6 text-sm leading-relaxed text-foreground">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => (
                <h1 className="mt-6 mb-3 text-2xl font-bold first:mt-0" {...props} />
              ),
              h2: (props) => (
                <h2 className="mt-6 mb-2 text-xl font-semibold" {...props} />
              ),
              h3: (props) => (
                <h3 className="mt-4 mb-1 text-base font-semibold" {...props} />
              ),
              p: (props) => <p className="my-2" {...props} />,
              ul: (props) => (
                <ul className="my-2 ml-5 list-disc space-y-1" {...props} />
              ),
              ol: (props) => (
                <ol className="my-2 ml-5 list-decimal space-y-1" {...props} />
              ),
              li: (props) => <li className="pl-1" {...props} />,
              a: (props) => (
                <a className="text-primary underline" {...props} />
              ),
              code: (props) => (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                  {...props}
                />
              ),
              blockquote: (props) => (
                <blockquote
                  className="my-3 border-l-2 border-border pl-4 text-muted-foreground"
                  {...props}
                />
              ),
              hr: () => <hr className="my-6 border-border" />,
              table: (props) => (
                <div className="my-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm" {...props} />
                </div>
              ),
              th: (props) => (
                <th
                  className="border border-border bg-muted/50 px-3 py-1.5 text-left font-semibold"
                  {...props}
                />
              ),
              td: (props) => (
                <td className="border border-border px-3 py-1.5 align-top" {...props} />
              ),
            }}
          >
            {content}
          </Markdown>
        </main>
      </div>
    </div>
  );
}

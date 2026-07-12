import { ArticleForm } from "@/components/article-form";

export default function NewArticlePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">New Article</h1>
      <ArticleForm />
    </div>
  );
}

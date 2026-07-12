import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CategoriesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Category management is coming soon. Categories can already be assigned
        to articles from the article editor.
      </CardContent>
    </Card>
  );
}

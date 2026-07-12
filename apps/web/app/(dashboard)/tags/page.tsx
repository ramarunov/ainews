import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TagsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Tag management is coming soon. Tags can already be assigned to
        articles from the article editor.
      </CardContent>
    </Card>
  );
}

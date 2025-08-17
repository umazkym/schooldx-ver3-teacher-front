import React, { Suspense } from "react";
import ContentSelectionComponent from "./ContentSelectionComponent";

export const dynamic = "force-dynamic";

export default function ContentSelectionPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ContentSelectionComponent />
    </Suspense>
  );
}
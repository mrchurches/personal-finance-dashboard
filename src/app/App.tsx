import type { ReactElement } from "react";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DemoBanner } from "@/components/DemoBanner";

export function App(): ReactElement {
  return (
    <>
      <DemoBanner />
      <DashboardPage />
    </>
  );
}

export default App;

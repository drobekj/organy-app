import { resolveApplicationExperience } from "../../src/config/application-experience";
import DemoCongregationPreferencesPage from "./demo-page";
import StandardCongregationPreferencesPage from "./standard-page";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CongregationPreferencesPage(props: PageProps) {
  if (resolveApplicationExperience() === "demo") {
    return DemoCongregationPreferencesPage(props);
  }
  return StandardCongregationPreferencesPage(props);
}

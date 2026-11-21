import Link from "next/link";
import { optionalPageUser } from "@/server/auth";
import { Card, CenterCard, Dashboard, DashboardMain, EmptyNote, Page } from "./components/blocks";

// Signed in, the navigation stays, so the way on is the usual one (MORE-11). Signed out, a card on its own, like sign-in.
export default async function NotFound() {
  const user = await optionalPageUser();
  if (user) {
    return (
      <Page userName={user.name}>
        <Dashboard>
          <DashboardMain>
            <Card id="not-found-title" title="Page not found">
              <EmptyNote>This page does not exist.</EmptyNote>
            </Card>
          </DashboardMain>
        </Dashboard>
      </Page>
    );
  }
  return (
    <CenterCard id="not-found-title" title="Page not found">
      <p className="muted">This page does not exist.</p>
      <div className="signin-form">
        <Link href="/">Go to the start page</Link>
      </div>
    </CenterCard>
  );
}

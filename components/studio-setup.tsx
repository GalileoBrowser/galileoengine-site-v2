import Link from "next/link";

export function StudioSetup({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;

  return (
    <div className="studio-setup">
      <div>
        <p className="studio-kicker">Backend required</p>
        <Heading>Studio is ready for a real Supabase project.</Heading>
        <p>
          Authentication and publishing stay disabled until the database migration and public
          project keys are connected. No local button pretends to save or publish content.
        </p>
      </div>
      <ol>
        <li>Create the GalileoEngine Supabase project.</li>
        <li>Apply the checked-in database migration.</li>
        <li>Add the project URL and anonymous key to the environment.</li>
        <li>Invite the editorial team and verify access roles.</li>
      </ol>
      <Link className="secondary-button" href="/journal">
        Review Journal preview
      </Link>
    </div>
  );
}

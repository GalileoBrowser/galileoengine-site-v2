export default function JournalLoading() {
  return (
    <main className="journal-main" id="main-content" aria-busy="true">
      <section className="journal-hero">
        <div className="journal-hero__inner">
          <div>
            <p className="journal-eyebrow">Galileo Journal</p>
            <h1>Loading field notes.</h1>
            <p className="journal-hero__lead">Retrieving the latest published work.</p>
          </div>
          <aside className="journal-hero__index" aria-hidden="true">
            <span>Loading</span>
            <strong>Journal.</strong>
            <p>Published entries only.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}

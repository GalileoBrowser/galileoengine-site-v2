"use client";

export default function JournalError({ reset }: { reset: () => void }) {
  return (
    <main className="journal-main" id="main-content">
      <section className="journal-list-section">
        <div className="section-shell journal-empty" role="alert">
          <h1>The journal could not be rendered.</h1>
          <p>Your session is safe. Retry the request or return to the presentation site.</p>
          <button className="primary-button" type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}

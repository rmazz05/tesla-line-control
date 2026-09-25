"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="app-loading">
      <div className="loading-wordmark">T E S L A</div>
      <h1>The line view could not start.</h1>
      <p>Your incident data is safe. Reload the local scene and try again.</p>
      <button className="primary-button" onClick={retry}>
        Reload line view
      </button>
    </main>
  );
}

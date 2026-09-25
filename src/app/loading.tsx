export default function Loading() {
  return (
    <main className="app-loading" aria-label="Loading line control">
      <div className="loading-wordmark">T E S L A</div>
      <div className="loading-track" aria-hidden="true">
        <span />
      </div>
      <p>Loading production line</p>
    </main>
  );
}
